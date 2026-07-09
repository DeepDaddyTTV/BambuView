import { randomBytes, randomUUID } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  cpus as osCpus,
  freemem as osFreeMem,
  hostname as osHostname,
  loadavg as osLoadAverage,
  release as osRelease,
  totalmem as osTotalMem,
  type as osType,
  uptime as osUptime,
} from "node:os";
import { basename, dirname, join } from "node:path";
import { EventEmitter } from "node:events";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

import type {
  CompanionCapabilityFlags,
  CompanionCapabilityNotes,
  CompanionFileHandoffInput,
  CompanionFileHandoffResult,
  CompanionHealthResponse,
  CompanionPairingRequest,
  CompanionPairingState,
  CompanionPrinter,
  CompanionPrinterDiscoveryResult,
  CompanionPrinterInput,
  CompanionPrinterCommandRequest,
  CompanionPrinterCommandResponse,
  CompanionPrinterTelemetry,
  CompanionPrinterTestResult,
  CompanionRegistration,
  CompanionSettings,
  CompanionSnapshot,
  CompanionStream,
  CompanionStreamInput,
  CompanionStreamOutputKind,
  CompanionStreamSourceKind,
  CompanionStatusTone,
  CompanionUpdateState,
} from "@bambuview/contracts";
import {
  COMPANION_APP_NAME,
  COMPANION_BRIDGE_USERNAME,
  COMPANION_DEFAULT_HOST,
  COMPANION_DEFAULT_PORT,
} from "@bambuview/contracts";

import {
  cameraBridgeReady,
  nativeBambuBridgeSupport,
  probeCameraBridgeSource,
  resolvePrinterCameraBridgeSource,
  resolveStreamCameraBridgeSource,
  type CameraBridgeSource,
} from "./camera-bridge.js";
import {
  desktopBridgeHandoffLabel,
  desktopBridgeHandoffReady,
  discoverBambuCloudPrinters,
  inspectBambuCloudBridgeEnvironment,
  readBambuCloudTelemetry,
  resolveBambuCloudCameraSource,
  testBambuCloudPrinter,
  type BambuCloudBridgeEnvironment,
} from "./bambu-cloud.js";
import {
  inspectLocalBridgeInventory,
  type LocalBridgeInventory,
} from "./bridge-surfaces.js";
import {
  describeLocalControlsSetup,
  describeLocalTelemetrySetup,
  discoverBambuPrinters,
  hasLocalAccess,
  runBambuPrinterCommand,
  sendBambuPrinterFile,
  readBambuTelemetry,
  testBambuPrinter,
} from "./bambu.js";
import { CompanionLogger } from "./logger.js";
import { findAvailablePort } from "./ports.js";

interface PersistedSecret {
  mode: "plain" | "safe-storage";
  value: string;
}

interface StoredPrinter {
  accessCode: PersistedSecret;
  connectionMode: CompanionPrinterInput["connectionMode"];
  createdAt: string;
  hostname: string;
  id: string;
  lastSeenAt: string | null;
  lastTestedAt: string | null;
  model: string;
  name: string;
  notes: string;
  provider: CompanionPrinterInput["provider"];
  serial: string;
  streamId: string | null;
  updatedAt: string;
}

interface StoredStream {
  createdAt: string;
  details: string;
  id: string;
  lastTestedAt: string | null;
  linkedPrinterId: string | null;
  name: string;
  outputKind: CompanionStreamOutputKind;
  password: PersistedSecret;
  sourceKind: CompanionStreamSourceKind;
  status: CompanionStream["status"];
  updatedAt: string;
  upstreamUrl: string;
  username: string;
}

interface PersistedState {
  bridgeToken: PersistedSecret;
  pairing: CompanionPairingState;
  printers: StoredPrinter[];
  settings: CompanionSettings;
  streams: StoredStream[];
}

interface SecretCodec {
  available: boolean;
  decrypt(value: string): string;
  encrypt(value: string): string;
}

interface ShellActions {
  openExternal(url: string): Promise<void>;
  openPath(path: string): Promise<string>;
  showItemInFolder(path: string): void;
}

export type CompanionProxyTarget =
  | {
      headers: Headers;
      kind: "http";
      target: string;
    }
  | {
      kind: "bridge";
      source: CameraBridgeSource;
    };

interface BridgeLifecycle {
  restart(): Promise<void>;
}

interface BridgeState {
  baseUrl: string;
  errorMessage: string | null;
  listening: boolean;
  suggestedPort: number | null;
}

interface BridgeCacheRecord<TValue> {
  fetchedAt: number;
  value: TValue;
}

interface RuntimeOptions {
  appVersion: string;
  bridgeLifecycle?: BridgeLifecycle;
  codec?: SecretCodec;
  logger?: CompanionLogger;
  shellActions?: ShellActions;
  stateFile: string;
  updateChecksEnabled?: boolean;
}

const defaultSettings: CompanionSettings = {
  accentColor: "#7ed321",
  bindMode: "localhost",
  checkForUpdatesOnLaunch: true,
  friendlyName: "BambuView Companion",
  host: COMPANION_DEFAULT_HOST,
  port: COMPANION_DEFAULT_PORT,
  themeMode: "dark",
  updateCheckIntervalMinutes: 30,
};

const defaultPairing: CompanionPairingState = {
  paired: false,
  companionId: null,
  companionName: "BambuView Companion",
  pairedAt: null,
  serverUrl: null,
};

const BRIDGE_CACHE_TTL_MS = 10_000;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeHost(
  bindMode: CompanionSettings["bindMode"],
  host: string,
): string {
  if (bindMode === "lan") {
    return host.trim() || "0.0.0.0";
  }
  return COMPANION_DEFAULT_HOST;
}

function joinUrl(baseUrl: string, pathname: string): string {
  return new URL(
    pathname,
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  ).toString();
}

function isLocalhostAddress(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

function isWildcardAddress(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "0.0.0.0" || normalized === "::" || normalized === "[::]"
  );
}

function normalizeServerUrlInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(
      "Enter the BambuView server URL before pairing. Use localhost only when BambuView and Companion are on the same computer.",
    );
  }

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(
      "Enter a full BambuView server URL like http://192.168.1.50:4173 or http://localhost:4173.",
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      "Use an http:// or https:// BambuView server URL before pairing.",
    );
  }

  return url.toString().replace(/\/+$/, "");
}

function validatePairingRoute(
  serverUrl: string,
  bridgeBaseUrl: string,
): string | null {
  try {
    const server = new URL(serverUrl);
    const bridge = new URL(bridgeBaseUrl);
    if (server.origin === bridge.origin) {
      return `That address matches the Companion bridge (${bridge.origin}), not the BambuView server. Enter the BambuView web app URL here instead.`;
    }

    if (isLocalhostAddress(server.hostname)) {
      return null;
    }

    if (isLocalhostAddress(bridge.hostname)) {
      return `BambuView is not running on this computer, but Companion is still using ${bridgeBaseUrl}. Open Settings, switch Bind Mode to LAN, set Bind Host to this computer's LAN IP or hostname, save, then pair again.`;
    }

    if (isWildcardAddress(bridge.hostname)) {
      return `Companion is listening on every interface, but BambuView cannot call back to ${bridgeBaseUrl}. Open Settings and replace the Bind Host with this computer's LAN IP or hostname, save, then pair again.`;
    }
  } catch {
    return null;
  }

  return null;
}

async function validateBambuViewServerTarget(
  serverUrl: string,
): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(joinUrl(serverUrl, "/api/health"), {
      headers: {
        accept: "application/json",
      },
      method: "GET",
      signal: timeoutSignal(4000),
    });
  } catch (error) {
    return formatPairingFetchError(serverUrl, error);
  }

  const data = (await response.json().catch(() => null)) as {
    message?: string;
    ok?: boolean;
  } | null;
  if (response.ok && data?.ok === true) {
    return null;
  }

  if (
    response.status === 401 &&
    data?.message === "Companion auth token required."
  ) {
    return `That address is answering like the Companion bridge, not the BambuView server. Enter the BambuView web app URL here instead.`;
  }

  if (data?.message) {
    return `BambuView pairing could not start because ${serverUrl} answered with: ${data.message}`;
  }

  return `BambuView pairing could not start because ${serverUrl} did not respond like a BambuView server. Confirm the URL and port, then try again.`;
}

function formatPairingFetchError(serverUrl: string, error: unknown): string {
  const errorName =
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof (error as { name?: unknown }).name === "string"
      ? (error as { name: string }).name
      : "";

  const prefix =
    errorName === "TimeoutError"
      ? `BambuView did not answer at ${serverUrl} before the pairing request timed out.`
      : `BambuView could not be reached at ${serverUrl}.`;

  try {
    const url = new URL(serverUrl);
    if (isLocalhostAddress(url.hostname)) {
      return `${prefix} localhost only works when BambuView and Companion are running on the same computer. If your BambuView server is running in Docker or on another device, enter that machine's LAN URL instead.`;
    }
  } catch {
    return prefix;
  }

  return `${prefix} Confirm the URL, port, and that the BambuView server is online.`;
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

function discoveryPrinterIdentityKey(printer: CompanionPrinter): string {
  const serial = printer.serial.trim().toUpperCase();
  if (serial) {
    return serial;
  }

  return [
    printer.name.trim().toLowerCase(),
    printer.model.trim().toLowerCase(),
  ].join(":");
}

function discoveryPrinterPriority(printer: CompanionPrinter): number {
  switch (printer.connectionMode) {
    case "bambu-connect":
      return 4;
    case "cloud":
      return 3;
    case "developer":
      return 2;
    case "lan":
      return 1;
    default:
      return 0;
  }
}

function mergeDiscoveryPrinterRecord(
  current: CompanionPrinter | undefined,
  incoming: CompanionPrinter,
): CompanionPrinter {
  if (!current) {
    return incoming;
  }

  const preferred =
    discoveryPrinterPriority(incoming) > discoveryPrinterPriority(current)
      ? incoming
      : current;
  const fallback = preferred === incoming ? current : incoming;

  return {
    ...preferred,
    accessCodeSet: preferred.accessCodeSet || fallback.accessCodeSet,
    capabilityNotes: {
      ...fallback.capabilityNotes,
      ...preferred.capabilityNotes,
    },
    createdAt:
      preferred.createdAt < fallback.createdAt
        ? preferred.createdAt
        : fallback.createdAt,
    hostname: preferred.hostname.trim() || fallback.hostname.trim(),
    lastSeenAt: preferred.lastSeenAt ?? fallback.lastSeenAt,
    lastTestedAt: preferred.lastTestedAt ?? fallback.lastTestedAt,
    notes: preferred.notes.trim() || fallback.notes.trim(),
    streamId: preferred.streamId ?? fallback.streamId,
    updatedAt:
      preferred.updatedAt > fallback.updatedAt
        ? preferred.updatedAt
        : fallback.updatedAt,
  };
}

function mergeDiscoveryResults(
  lan: CompanionPrinterDiscoveryResult,
  cloud: CompanionPrinterDiscoveryResult,
  bridgeInventory: LocalBridgeInventory,
): CompanionPrinterDiscoveryResult {
  const printers = new Map<string, CompanionPrinter>();

  for (const printer of [
    ...cloud.printers,
    ...bridgeInventory.printers,
    ...lan.printers,
  ]) {
    const key = discoveryPrinterIdentityKey(printer);
    printers.set(
      key,
      mergeDiscoveryPrinterRecord(printers.get(key), printer),
    );
  }

  const bridgeSources = new Map(
    [...cloud.bridgeSources, ...bridgeInventory.surfaces].map((surface) => [
      surface.id,
      surface,
    ]),
  );
  const instructions = [
    ...new Set([...lan.instructions, ...cloud.instructions]),
  ];
  const totalPrinters = printers.size;
  const sawLanPrinters = lan.printers.length > 0;
  const sawCloudPrinters = cloud.printers.length > 0;
  const sawDesktopSurface = bridgeInventory.surfaces.some(
    (surface) =>
      surface.kind !== "camera-bridge" && surface.status !== "missing",
  );

  let detail = "";
  if (sawLanPrinters && sawCloudPrinters) {
    detail =
      "Companion found Bambu printers from both the local LAN broadcast and the signed-in desktop bridge on this machine.";
  } else if (sawCloudPrinters) {
    detail = cloud.detail;
  } else if (sawLanPrinters) {
    detail = lan.detail;
  } else if (sawDesktopSurface) {
    detail =
      "Companion detected local Bambu desktop bridge files on this machine, but no signed-in cloud printers or LAN-broadcasting printers answered this pass.";
  } else if (!cloud.printers.length && cloud.detail) {
    detail = `${cloud.detail} ${lan.detail}`.trim();
  } else {
    detail = lan.detail;
  }

  return {
    attemptedAt:
      cloud.attemptedAt > lan.attemptedAt ? cloud.attemptedAt : lan.attemptedAt,
    bridgeSources: [...bridgeSources.values()],
    detail,
    instructions,
    printers: [...printers.values()].sort((left, right) => {
      const nameCompare = left.name.localeCompare(right.name);
      if (nameCompare !== 0) {
        return nameCompare;
      }

      return left.connectionMode.localeCompare(right.connectionMode);
    }),
    supported:
      lan.supported ||
      cloud.supported ||
      totalPrinters > 0 ||
      bridgeSources.size > 0,
  };
}

function basicAuth(username: string, password: string): string | null {
  if (!username && !password) {
    return null;
  }
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return value;
  }
}

interface GitHubReleaseAsset {
  browser_download_url: string;
  name: string;
}

interface GitHubReleaseRecord {
  assets?: GitHubReleaseAsset[];
  html_url?: string;
  name?: string;
  prerelease?: boolean;
  tag_name?: string;
}

function normalizeReleaseVersion(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/v?(\d+\.\d+\.\d+)/i);
  return match?.[1] ?? null;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => Number(part));
  const rightParts = right.split(".").map((part) => Number(part));

  for (
    let index = 0;
    index < Math.max(leftParts.length, rightParts.length);
    index += 1
  ) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return 0;
}

function companionOsLabel() {
  if (process.platform === "darwin") {
    return "MACOS";
  }

  if (process.platform === "win32") {
    return "WIN";
  }

  return "LINUX";
}

function companionArchLabel() {
  switch (process.arch) {
    case "arm64":
      return "ARM64";
    case "ia32":
      return "X86";
    default:
      return "X64";
  }
}

function normalizeUpdateIntervalMinutes(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return 30;
  }

  return Math.min(1440, Math.max(5, Math.round(value ?? 30)));
}

function createBambuConnectImportUrl(input: { name: string; path: string }) {
  const name = input.name.trim();
  const filePath = input.path.trim();
  return `bambu-connect://import-file?path=${encodeURIComponent(filePath)}&name=${encodeURIComponent(name)}`;
}

function openWithDesktopBridgeDetail(label: string) {
  return `Opened the selected job on this machine for ${label} handoff.`;
}

function selectCompanionReleaseAsset(release: GitHubReleaseRecord) {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const version = normalizeReleaseVersion(release.tag_name ?? release.name);
  const osName = companionOsLabel();
  const arch = companionArchLabel();
  const primaryExtension =
    process.platform === "darwin"
      ? "dmg"
      : process.platform === "win32"
        ? "exe"
        : "deb";
  const fallbackExtension = process.platform === "linux" ? "rpm" : null;
  const preferredPatterns = [
    new RegExp(
      `^BVCompanion-${version}-${osName}-Installer-${arch}\\.${primaryExtension}$`,
      "i",
    ),
    fallbackExtension
      ? new RegExp(
          `^BVCompanion-${version}-${osName}-Installer-${arch}\\.${fallbackExtension}$`,
          "i",
        )
      : null,
    new RegExp(`^BVCompanion-${version}-${osName}-Installer-`, "i"),
  ].filter(Boolean) as RegExp[];

  for (const pattern of preferredPatterns) {
    const match = assets.find((asset) => pattern.test(asset.name));
    if (match) {
      return match;
    }
  }

  return assets.find((asset) => asset.name.startsWith("BVCompanion-")) ?? null;
}

function encryptSecret(codec: SecretCodec, value: string): PersistedSecret {
  if (!value) {
    return { mode: "plain", value: "" };
  }
  if (codec.available) {
    return { mode: "safe-storage", value: codec.encrypt(value) };
  }
  return { mode: "plain", value };
}

function decryptSecret(
  codec: SecretCodec,
  value: PersistedSecret | undefined,
): string {
  if (!value?.value) {
    return "";
  }
  if (value.mode === "safe-storage") {
    return codec.decrypt(value.value);
  }
  return value.value;
}

async function fetchWithUpstreamAuth(
  url: string,
  input: { password?: string; username?: string } = {},
): Promise<Response> {
  const headers = new Headers();
  const authorization = basicAuth(input.username ?? "", input.password ?? "");
  if (authorization) {
    headers.set("authorization", authorization);
  }
  return fetch(url, {
    headers,
    signal: timeoutSignal(3500),
  });
}

function inferOutputKind(
  input: CompanionStreamInput,
): CompanionStreamOutputKind {
  if (input.sourceKind === "mjpeg") return "mjpeg";
  if (input.sourceKind === "snapshot") return "snapshot";
  if (input.sourceKind === "hls") return "hls";
  if (resolveStreamCameraBridgeSource(input)) return "mjpeg";
  return "unavailable";
}

function contentTypeMatches(
  sourceKind: CompanionStreamSourceKind,
  contentType: string | null,
): boolean {
  const normalized = contentType?.toLowerCase() ?? "";
  if (sourceKind === "mjpeg") {
    return (
      normalized.includes("multipart") ||
      normalized.includes("image/") ||
      normalized.includes("octet-stream")
    );
  }
  if (sourceKind === "snapshot") {
    return normalized.includes("image/");
  }
  if (sourceKind === "hls") {
    return (
      normalized.includes("mpegurl") ||
      normalized.includes("application/vnd.apple")
    );
  }
  return false;
}

async function downloadFile(url: string, destinationPath: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "BambuView-Companion",
    },
    signal: timeoutSignal(300000),
  });

  if (!response.ok) {
    throw new Error(`Download failed with HTTP ${response.status}.`);
  }

  if (!response.body) {
    throw new Error("GitHub did not return a downloadable file stream.");
  }

  mkdirSync(dirname(destinationPath), { recursive: true });
  const tempPath = `${destinationPath}.download`;
  const fileStream = createWriteStream(tempPath);

  try {
    await pipeline(
      Readable.fromWeb(
        response.body as unknown as import("node:stream/web").ReadableStream,
      ),
      fileStream,
    );
    rmSync(destinationPath, { force: true });
    renameSync(tempPath, destinationPath);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}

async function inspectStreamInput(input: CompanionStreamInput): Promise<{
  details: string;
  lastTestedAt: string | null;
  outputKind: CompanionStreamOutputKind;
  status: CompanionStream["status"];
}> {
  const checkedAt = nowIso();
  const outputKind = inferOutputKind(input);

  if (input.sourceKind === "rtsp") {
    const bridgeSource = resolveStreamCameraBridgeSource(input);
    const reachable = bridgeSource
      ? await probeCameraBridgeSource(bridgeSource)
      : false;
    return {
      details: !cameraBridgeReady()
        ? "The bundled camera bridge is not available on this machine yet."
        : !bridgeSource
          ? "Use a valid rtsp:// or rtsps:// address so Companion can restream this feed for browser playback."
          : reachable
            ? "The RTSP source is reachable and Companion can restream it for browser playback."
            : "The RTSP source did not accept a connection.",
      lastTestedAt: checkedAt,
      outputKind,
      status: reachable ? "online" : bridgeSource ? "offline" : "degraded",
    };
  }

  if (input.sourceKind === "bambu-native") {
    const bridgeSource = resolveStreamCameraBridgeSource(input);
    const reachable = bridgeSource
      ? await probeCameraBridgeSource(bridgeSource)
      : false;
    return {
      details: !cameraBridgeReady()
        ? "The bundled camera bridge is not available on this machine yet."
        : !bridgeSource
          ? "Save the printer host or a full rtsps:// camera URL plus the LAN access code so Companion can restream this native Bambu feed."
          : reachable
            ? "The native Bambu camera is reachable and Companion can restream it for browser playback."
            : "The native Bambu camera endpoint did not accept a connection.",
      lastTestedAt: checkedAt,
      outputKind,
      status: reachable ? "online" : bridgeSource ? "offline" : "degraded",
    };
  }

  try {
    const response = await fetchWithUpstreamAuth(input.upstreamUrl, input);
    const contentType = response.headers.get("content-type");
    const renderable =
      response.ok && contentTypeMatches(input.sourceKind, contentType);
    return {
      details: renderable
        ? "The stream responded with browser-renderable media."
        : response.ok
          ? `The endpoint responded, but ${contentType ?? "its content type"} does not look browser-renderable.`
          : `The endpoint responded with HTTP ${response.status}.`,
      lastTestedAt: checkedAt,
      outputKind,
      status: renderable ? "online" : response.ok ? "degraded" : "offline",
    };
  } catch {
    return {
      details: "The stream endpoint could not be reached from this machine.",
      lastTestedAt: checkedAt,
      outputKind,
      status: "offline",
    };
  }
}

function maskCompanionName(name: string): string {
  return name.trim().length > 0 ? name.trim() : defaultSettings.friendlyName;
}

function maskEmailAddress(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const [localPart, domain = ""] = value.split("@");
  if (!localPart) {
    return "[redacted]";
  }

  const visibleLocal =
    localPart.length <= 2
      ? `${localPart[0] ?? ""}*`
      : `${localPart.slice(0, 2)}***`;
  return domain ? `${visibleLocal}@${domain}` : visibleLocal;
}

function maskUserId(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value.length <= 4 ? "[redacted]" : `***${value.slice(-4)}`;
}

function safeFileMetadata(filePath: string | null) {
  if (!filePath) {
    return {
      exists: false,
      modifiedAt: null,
      path: null,
      sizeBytes: 0,
    };
  }

  try {
    const stats = statSync(filePath);
    return {
      exists: true,
      modifiedAt: stats.mtime.toISOString(),
      path: filePath,
      sizeBytes: stats.size,
    };
  } catch {
    return {
      exists: false,
      modifiedAt: null,
      path: filePath,
      sizeBytes: 0,
    };
  }
}

export class CompanionRuntime extends EventEmitter {
  private bridgeState: BridgeState = {
    baseUrl: `http://${COMPANION_DEFAULT_HOST}:${COMPANION_DEFAULT_PORT}`,
    errorMessage: null,
    listening: false,
    suggestedPort: null,
  };

  private readonly codec: SecretCodec;

  private readonly logger: CompanionLogger;

  private localBridgeInventory: LocalBridgeInventory = {
    printers: [],
    surfaces: [],
  };

  private localBridgeInventoryCache: BridgeCacheRecord<LocalBridgeInventory> = {
    fetchedAt: 0,
    value: {
      printers: [],
      surfaces: [],
    },
  };

  private cloudBridgeEnvironmentCache: BridgeCacheRecord<BambuCloudBridgeEnvironment> =
    {
      fetchedAt: 0,
      value: {
        connectInstalled: false,
        networkPluginInstalled: false,
        sessionCount: 0,
        sessions: [],
        studioInstalled: false,
      },
    };

  private readonly shellActions?: ShellActions;

  private state: PersistedState;

  private updateState: CompanionUpdateState = {
    assetName: null,
    assetUrl: null,
    available: false,
    downloadedAt: null,
    downloadedFileName: null,
    downloadedFilePath: null,
    lastCheckedAt: null,
    latestVersion: null,
    message: null,
    releaseName: null,
    releaseUrl: null,
    status: "idle",
  };

  private updateTimer: NodeJS.Timeout | null = null;

  constructor(private readonly options: RuntimeOptions) {
    super();
    this.codec =
      options.codec ??
      ({
        available: false,
        decrypt: (value) => value,
        encrypt: (value) => value,
      } satisfies SecretCodec);
    this.logger = options.logger ?? new CompanionLogger();
    this.shellActions = options.shellActions;
    this.state = this.loadState();
    this.localBridgeInventory = inspectLocalBridgeInventory();
    this.localBridgeInventoryCache = {
      fetchedAt: Date.now(),
      value: this.localBridgeInventory,
    };
    this.cloudBridgeEnvironmentCache = {
      fetchedAt: Date.now(),
      value: inspectBambuCloudBridgeEnvironment({
        inventory: this.localBridgeInventory,
      }),
    };
    this.migrateSavedPrintersToCloudBridge();
    if (this.options.updateChecksEnabled !== false) {
      this.armUpdateChecks();
    }
    if (
      this.options.updateChecksEnabled !== false &&
      this.state.settings.checkForUpdatesOnLaunch
    ) {
      void this.checkForUpdates();
    }
    this.logger.info("Companion runtime initialized.", {
      appVersion: this.options.appVersion,
      bridgeBaseUrl: this.bridgeState.baseUrl,
      bridgeSurfaceCount: this.localBridgeInventory.surfaces.length,
      logFilePath: this.logger.filePath(),
      paired: this.state.pairing.paired,
      sessionCount: this.cloudBridgeEnvironmentCache.value.sessionCount,
      stateFile: this.options.stateFile,
    });
  }

  async applyBridgeListening(listening: boolean, errorMessage: string | null) {
    this.bridgeState = {
      ...this.bridgeState,
      baseUrl: `http://${normalizeHost(this.state.settings.bindMode, this.state.settings.host)}:${this.state.settings.port}`,
      errorMessage,
      listening,
      suggestedPort: listening ? null : this.bridgeState.suggestedPort,
    };
    this.emitSnapshot();
  }

  async applyPortConflict(): Promise<void> {
    const host = normalizeHost(
      this.state.settings.bindMode,
      this.state.settings.host,
    );
    this.bridgeState = {
      baseUrl: `http://${host}:${this.state.settings.port}`,
      errorMessage: `Port ${this.state.settings.port} is already in use on ${host}.`,
      listening: false,
      suggestedPort: await findAvailablePort(host, this.state.settings.port),
    };
    this.logger.warn(
      `Bridge port ${this.state.settings.port} is busy. Suggested port ${this.bridgeState.suggestedPort}.`,
    );
    this.emitSnapshot();
  }

  async copyBridgeUrl(): Promise<string> {
    return this.bridgeState.baseUrl;
  }

  private preferredCloudConnectionMode(): CompanionPrinterInput["connectionMode"] {
    const cloudBridge = this.readCloudBridgeEnvironment();
    return cloudBridge.connectInstalled ? "bambu-connect" : "cloud";
  }

  private migrateSavedPrintersToCloudBridge() {
    const cloudBridge = this.readCloudBridgeEnvironment();
    if (
      cloudBridge.sessionCount === 0 &&
      !desktopBridgeHandoffReady(cloudBridge)
    ) {
      return;
    }

    let changed = false;
    const preferredMode = this.preferredCloudConnectionMode();
    this.state.printers = this.state.printers.map((printer) => {
      if (
        printer.connectionMode === "cloud" ||
        printer.connectionMode === "bambu-connect"
      ) {
        return printer;
      }

      changed = true;
      return {
        ...printer,
        connectionMode: preferredMode,
        notes:
          printer.notes.trim() ||
          "Migrated to the Companion desktop bridge workflow.",
        updatedAt: nowIso(),
      };
    });

    if (changed) {
      mkdirSync(dirname(this.options.stateFile), { recursive: true });
      writeFileSync(this.options.stateFile, JSON.stringify(this.state, null, 2));
      this.logger.info(
        "Migrated saved Companion printers to the desktop bridge workflow.",
      );
    }
  }

  private invalidateBridgeCaches() {
    this.localBridgeInventoryCache.fetchedAt = 0;
    this.cloudBridgeEnvironmentCache.fetchedAt = 0;
  }

  async createPrinter(
    input: CompanionPrinterInput,
  ): Promise<CompanionSnapshot> {
    const normalizedInput = await this.hydrateCloudPrinterInput(input);
    const timestamp = nowIso();
    const printerId = randomUUID();
    this.state.printers.push({
      accessCode: encryptSecret(
        this.codec,
        normalizedInput.accessCode?.trim() ?? "",
      ),
      connectionMode: normalizedInput.connectionMode,
      createdAt: timestamp,
      hostname: normalizedInput.hostname.trim(),
      id: printerId,
      lastSeenAt: null,
      lastTestedAt: null,
      model: normalizedInput.model.trim(),
      name: normalizedInput.name.trim(),
      notes: normalizedInput.notes?.trim() ?? "",
      provider: normalizedInput.provider,
      serial: normalizedInput.serial.trim(),
      streamId: normalizedInput.streamId?.trim() || null,
      updatedAt: timestamp,
    });
    this.setPrinterLinkedStream(
      printerId,
      normalizedInput.streamId?.trim() || null,
    );
    this.invalidateBridgeCaches();
    this.persistState();
    this.logger.info(
      `Saved printer ${normalizedInput.name.trim()} for Companion.`,
      {
        connectionMode: normalizedInput.connectionMode,
        hostname: normalizedInput.hostname,
        model: normalizedInput.model,
        serial: normalizedInput.serial,
      },
    );
    return this.getSnapshot(true);
  }

  async createStream(input: CompanionStreamInput): Promise<CompanionSnapshot> {
    const timestamp = nowIso();
    const inspected = await inspectStreamInput(input);
    const streamId = randomUUID();
    this.state.streams.push({
      createdAt: timestamp,
      details: inspected.details,
      id: streamId,
      lastTestedAt: inspected.lastTestedAt,
      linkedPrinterId: input.linkedPrinterId?.trim() || null,
      name: input.name.trim(),
      outputKind: inspected.outputKind,
      password: encryptSecret(this.codec, input.password?.trim() ?? ""),
      sourceKind: input.sourceKind,
      status: inspected.status,
      updatedAt: timestamp,
      upstreamUrl: input.upstreamUrl.trim(),
      username: input.username?.trim() ?? "",
    });
    this.setStreamLinkedPrinter(
      streamId,
      input.linkedPrinterId?.trim() || null,
    );
    this.persistState();
    this.logger.info(`Saved stream ${input.name.trim()} for Companion.`, {
      linkedPrinterId: input.linkedPrinterId?.trim() || null,
      sourceKind: input.sourceKind,
      upstreamUrl: input.upstreamUrl,
    });
    return this.getSnapshot();
  }

  deletePrinter(printerId: string): CompanionSnapshot {
    this.state.printers = this.state.printers.filter(
      (printer) => printer.id !== printerId,
    );
    this.state.streams = this.state.streams.map((stream) =>
      stream.linkedPrinterId === printerId
        ? { ...stream, linkedPrinterId: null, updatedAt: nowIso() }
        : stream,
    );
    this.persistState();
    this.logger.warn("Removed a saved printer from Companion.", { printerId });
    return this.getSnapshot();
  }

  deleteStream(streamId: string): CompanionSnapshot {
    this.state.streams = this.state.streams.filter(
      (stream) => stream.id !== streamId,
    );
    this.state.printers = this.state.printers.map((printer) =>
      printer.streamId === streamId
        ? { ...printer, streamId: null, updatedAt: nowIso() }
        : printer,
    );
    this.persistState();
    this.logger.warn("Removed a saved stream from Companion.", { streamId });
    return this.getSnapshot();
  }

  getBridgeAuth() {
    return {
      token: decryptSecret(this.codec, this.state.bridgeToken),
      username: COMPANION_BRIDGE_USERNAME,
    };
  }

  getCapabilitySummary(input?: {
    bridgeInventory?: LocalBridgeInventory;
    cloudBridge?: BambuCloudBridgeEnvironment;
    printers?: CompanionPrinter[];
    streams?: CompanionStream[];
  }): {
    capabilities: CompanionCapabilityFlags;
    capabilityNotes: CompanionCapabilityNotes;
  } {
    const bridgeInventory = input?.bridgeInventory ?? this.readLocalBridgeInventory();
    const cloudBridge =
      input?.cloudBridge ??
      this.readCloudBridgeEnvironment(false, bridgeInventory);
    const printers = input?.printers ?? this.listPrinters(cloudBridge);
    const streams = input?.streams ?? this.listStreams();
    const telemetryReady = printers.some(
      (printer) => printer.capabilities.telemetry === "available",
    );
    const amsReady = printers.some(
      (printer) => printer.capabilities.ams === "available",
    );
    const cameraReady =
      printers.some((printer) => printer.capabilities.camera === "available") ||
      streams.some(
        (stream) => Boolean(stream.mjpegPath) || Boolean(stream.snapshotPath),
      );
    const needsRestream =
      printers.some(
        (printer) => printer.capabilities.camera === "requires_restream",
      ) ||
      this.state.streams.some(
        (stream) =>
          (stream.sourceKind === "rtsp" || stream.sourceKind === "bambu-native") &&
          !this.resolveStoredStreamCameraSource(stream),
      );
    const controlsReady = printers.some(
      (printer) => printer.capabilities.controls === "available",
    );
    const cloudBridgePrinter = printers.some((printer) =>
      ["cloud", "bambu-connect"].includes(printer.connectionMode),
    );
    const desktopHandoffPrinter =
      desktopBridgeHandoffReady(cloudBridge) &&
      printers.some((printer) =>
        ["cloud", "bambu-connect"].includes(printer.connectionMode),
      );
    const fileUploadReady = printers.some(
      (printer) => printer.capabilities.fileUpload === "available",
    );
    const sliceBridgeReady = printers.some(
      (printer) => printer.capabilities.slicingAssist === "available",
    );
    const detectedDesktopSurfaces = bridgeInventory.surfaces.filter(
      (surface) => surface.status !== "missing",
    );
    const discoveredDesktopPrinters = bridgeInventory.printers.length;
    const hasPrinters = printers.length > 0;

    return {
      capabilities: {
        ams: amsReady
          ? "available"
          : hasPrinters
              ? "requires_setup"
              : "unavailable",
        camera: cameraReady
          ? "available"
          : needsRestream
              ? "requires_restream"
              : hasPrinters
                ? "requires_setup"
                : "unavailable",
        controls: controlsReady
          ? "available"
          : cloudBridgePrinter
            ? "unsupported"
            : "unavailable",
        discovery: "available",
        fileUpload: fileUploadReady
          ? "available"
          : hasPrinters
            ? "requires_setup"
            : "unavailable",
        slicingAssist: sliceBridgeReady
          ? "available"
          : hasPrinters
            ? "requires_setup"
            : "unavailable",
        telemetry: telemetryReady
          ? "available"
          : hasPrinters
              ? "requires_setup"
              : "unavailable",
      },
      capabilityNotes: {
        ams:
          cloudBridgePrinter && cloudBridge.sessionCount > 0
            ? "AMS status is pulled automatically from the signed-in Bambu desktop bridge for saved printers on this machine."
            : "Save or import a printer, then sign into Bambu Connect or Bambu Studio on this machine so Companion can read AMS status automatically.",
        camera: cameraReady
          ? "Companion can already expose at least one live browser-safe camera feed through an automatic native bridge or an advanced source."
          : cloudBridgePrinter && cloudBridge.sessionCount > 0
            ? "Companion will auto-bridge native Bambu camera feeds for saved printers whenever the signed-in desktop bridge and local camera reachability are both available."
            : "Save a printer first, then Companion will prefer the automatic native Bambu path. Use Advanced Sources only for Frigate, RTSP, snapshot, or HLS overrides.",
        controls: controlsReady
          ? "A saved local printer profile is still available for direct Companion-side controls."
          : "Companion is focused on desktop bridge telemetry, camera, and file handoff. Direct machine controls remain server-managed in BambuView.",
        discovery:
          detectedDesktopSurfaces.length > 0
            ? `Companion can inspect ${detectedDesktopSurfaces.length} local bridge surface${detectedDesktopSurfaces.length === 1 ? "" : "s"} and surface ${discoveredDesktopPrinters} desktop printer profile${discoveredDesktopPrinters === 1 ? "" : "s"} when they are available.`
            : "Companion can inspect supported local Bambu desktop surfaces and still supports manual cloud printer profiles.",
        fileUpload: fileUploadReady && !cloudBridgePrinter
          ? "At least one saved local printer profile can already accept direct upload from Companion."
          : desktopHandoffPrinter
            ? `Saved cloud-mode printers can use ${desktopBridgeHandoffLabel(cloudBridge)} on this machine for desktop file handoff.`
            : cloudBridgePrinter
              ? "Install or sign into Bambu Connect or Bambu Studio on this machine to unlock one-click desktop handoff for the saved cloud-mode printers."
              : "Add a cloud printer to unlock desktop bridge send workflows.",
        slicingAssist: sliceBridgeReady && !cloudBridgePrinter
          ? "Prepared jobs can already route through at least one saved local printer profile."
          : sliceBridgeReady
          ? "Companion can already receive prepared jobs from BambuView and route them through direct upload or desktop bridge handoff."
          : "Add a cloud printer to unlock Companion-assisted desktop handoff workflows.",
        telemetry:
          cloudBridgePrinter && cloudBridge.sessionCount > 0
            ? "Live telemetry is available for saved cloud-mode printers through the signed-in Bambu desktop bridge on this machine."
            : "Save or import a printer, then sign into Bambu Connect or Bambu Studio on this machine so Companion can read live telemetry automatically.",
      },
    };
  }

  async getDiscoveryResult() {
    const inventory = this.readLocalBridgeInventory(true);
    const cloudBridge = this.readCloudBridgeEnvironment(true, inventory);
    const [lan, cloud] = await Promise.all([
      discoverBambuPrinters().catch(
        (error): CompanionPrinterDiscoveryResult => ({
          attemptedAt: nowIso(),
          bridgeSources: [],
          detail:
            error instanceof Error
              ? `Bambu LAN discovery failed: ${error.message}`
              : "Bambu LAN discovery failed.",
          instructions: [
            "Make sure the printer and Companion are on the same local network before retrying LAN discovery.",
          ],
          printers: [],
          supported: false,
        }),
      ),
      discoverBambuCloudPrinters().catch(
        (error): CompanionPrinterDiscoveryResult => ({
          attemptedAt: nowIso(),
          bridgeSources: [],
          detail:
            error instanceof Error
              ? `Desktop bridge discovery failed: ${error.message}`
              : "Desktop bridge discovery failed.",
          instructions: [
            "Install and sign into Bambu Connect or Bambu Studio on this machine before retrying desktop bridge discovery.",
          ],
          printers: [],
          supported: false,
        }),
      ),
    ]);

    const merged = mergeDiscoveryResults(lan, cloud, inventory);
    this.logger.info("Printer discovery completed.", {
      cloudDetail: cloud.detail,
      cloudPrinterCount: cloud.printers.length,
      desktopSessionCount: cloudBridge.sessionCount,
      lanDetail: lan.detail,
      lanPrinterCount: lan.printers.length,
      mergedPrinterCount: merged.printers.length,
      savedPrinterCount: this.state.printers.length,
      surfaceStates: inventory.surfaces.map((surface) => ({
        kind: surface.kind,
        location: surface.location,
        status: surface.status,
      })),
    });
    return merged;
  }

  getHealth(input?: {
    bridgeInventory?: LocalBridgeInventory;
    cloudBridge?: BambuCloudBridgeEnvironment;
    printers?: CompanionPrinter[];
    streams?: CompanionStream[];
  }): CompanionHealthResponse {
    const bridgeInventory = input?.bridgeInventory ?? this.readLocalBridgeInventory();
    const cloudBridge =
      input?.cloudBridge ??
      this.readCloudBridgeEnvironment(false, bridgeInventory);
    const printers = input?.printers ?? this.listPrinters(cloudBridge);
    const streams = input?.streams ?? this.listStreams();
    const { capabilities, capabilityNotes } = this.getCapabilitySummary({
      bridgeInventory,
      cloudBridge,
      printers,
      streams,
    });
    const warnings = [
      this.bridgeState.errorMessage,
      !this.state.pairing.paired
        ? "Companion is not paired with a BambuView server yet."
        : null,
    ].filter((value): value is string => Boolean(value));

    return {
      appName: COMPANION_APP_NAME,
      appVersion: this.options.appVersion,
      bridge: {
        baseUrl: this.bridgeState.baseUrl,
        bindMode: this.state.settings.bindMode,
        host: normalizeHost(
          this.state.settings.bindMode,
          this.state.settings.host,
        ),
        port: this.state.settings.port,
        suggestedPort: this.bridgeState.suggestedPort,
      },
      bridgeSources: bridgeInventory.surfaces,
      capabilities,
      capabilityNotes,
      pairing: { ...this.state.pairing },
      status: this.statusTone(),
      warnings,
    };
  }

  getSnapshot(forceRefresh = false): CompanionSnapshot {
    const bridgeInventory = this.readLocalBridgeInventory(forceRefresh);
    const cloudBridge = this.readCloudBridgeEnvironment(
      forceRefresh,
      bridgeInventory,
    );
    const printers = this.listPrinters(cloudBridge);
    const streams = this.listStreams();

    return {
      health: this.getHealth({
        bridgeInventory,
        cloudBridge,
        printers,
        streams,
      }),
      logs: this.logger.list(),
      pairing: { ...this.state.pairing },
      printers,
      settings: { ...this.state.settings },
      streams,
      update: { ...this.updateState },
    };
  }

  getStreamBridgePaths(stream: StoredStream) {
    const bridgeSource = this.resolveStoredStreamCameraSource(stream);
    return {
      hlsPath: null,
      mjpegPath:
        stream.outputKind === "mjpeg" || bridgeSource
          ? `/streams/${stream.id}/mjpeg`
          : null,
      snapshotPath:
        stream.outputKind === "snapshot" || bridgeSource
          ? `/streams/${stream.id}/snapshot`
          : null,
    };
  }

  getStoredPrinter(printerId: string): StoredPrinter | undefined {
    return this.state.printers.find((printer) => printer.id === printerId);
  }

  getStoredStream(streamId: string): StoredStream | undefined {
    return this.state.streams.find((stream) => stream.id === streamId);
  }

  private getLinkedStreamForPrinter(
    printer: StoredPrinter,
  ): StoredStream | null {
    if (printer.streamId) {
      const linkedByPrinter = this.getStoredStream(printer.streamId);
      if (linkedByPrinter) {
        return linkedByPrinter;
      }
    }

    return (
      this.state.streams.find(
        (stream) => stream.linkedPrinterId === printer.id,
      ) ?? null
    );
  }

  private setStreamLinkedPrinter(
    streamId: string,
    linkedPrinterId: string | null,
  ) {
    const timestamp = nowIso();

    this.state.printers.forEach((printer) => {
      if (linkedPrinterId && printer.id === linkedPrinterId) {
        if (printer.streamId !== streamId) {
          printer.streamId = streamId;
          printer.updatedAt = timestamp;
        }
        return;
      }

      if (printer.streamId === streamId) {
        printer.streamId = null;
        printer.updatedAt = timestamp;
      }
    });

    this.state.streams.forEach((stream) => {
      if (stream.id === streamId) {
        if (stream.linkedPrinterId !== linkedPrinterId) {
          stream.linkedPrinterId = linkedPrinterId;
          stream.updatedAt = timestamp;
        }
        return;
      }

      if (linkedPrinterId && stream.linkedPrinterId === linkedPrinterId) {
        stream.linkedPrinterId = null;
        stream.updatedAt = timestamp;
      }
    });
  }

  private setPrinterLinkedStream(printerId: string, streamId: string | null) {
    const timestamp = nowIso();

    this.state.printers.forEach((printer) => {
      if (printer.id === printerId) {
        if (printer.streamId !== streamId) {
          printer.streamId = streamId;
          printer.updatedAt = timestamp;
        }
        return;
      }

      if (streamId && printer.streamId === streamId) {
        printer.streamId = null;
        printer.updatedAt = timestamp;
      }
    });

    this.state.streams.forEach((stream) => {
      if (stream.id === streamId) {
        if (stream.linkedPrinterId !== printerId) {
          stream.linkedPrinterId = printerId;
          stream.updatedAt = timestamp;
        }
        return;
      }

      if (stream.linkedPrinterId === printerId) {
        stream.linkedPrinterId = null;
        stream.updatedAt = timestamp;
      }
    });
  }

  async getPrinterCameraProxyTarget(
    printerId: string,
    mode: "mjpeg" | "snapshot",
  ): Promise<CompanionProxyTarget | null> {
    const printer = this.getStoredPrinter(printerId);
    if (!printer) {
      return null;
    }

    const linkedStream = this.getLinkedStreamForPrinter(printer);
    if (linkedStream) {
      const linkedTarget = this.getStreamProxyTarget(linkedStream.id, mode);
      if (linkedTarget) {
        return linkedTarget;
      }
    }

    const source = await this.resolveStoredPrinterCameraSource(printer);
    if (!source) {
      return null;
    }

    return {
      kind: "bridge",
      source,
    };
  }

  getStreamProxyTarget(
    streamId: string,
    mode: "mjpeg" | "snapshot",
  ): CompanionProxyTarget | null {
    const stream = this.getStoredStream(streamId);
    if (!stream) {
      return null;
    }

    const bridgeSource = this.resolveStoredStreamCameraSource(stream);
    if (bridgeSource) {
      return {
        kind: "bridge",
        source: bridgeSource,
      };
    }

    if (mode === "mjpeg" && stream.outputKind === "mjpeg") {
      const headers = new Headers();
      const authorization = basicAuth(
        stream.username,
        decryptSecret(this.codec, stream.password),
      );
      if (authorization) {
        headers.set("authorization", authorization);
      }

      return {
        headers,
        kind: "http",
        target: stream.upstreamUrl,
      };
    }

    if (mode === "snapshot" && stream.outputKind === "snapshot") {
      const headers = new Headers();
      const authorization = basicAuth(
        stream.username,
        decryptSecret(this.codec, stream.password),
      );
      if (authorization) {
        headers.set("authorization", authorization);
      }

      return {
        headers,
        kind: "http",
        target: stream.upstreamUrl,
      };
    }

    return null;
  }

  async handleFileHandoff(
    printerId: string,
    input: CompanionFileHandoffInput,
  ): Promise<CompanionFileHandoffResult> {
    const printer = this.getStoredPrinter(printerId);
    if (!printer) {
      return {
        accepted: false,
        detail: "Printer not found.",
        fileName: null,
        sizeBytes: null,
      };
    }

    const nextPath = input.path.trim();
    if (!nextPath || !existsSync(nextPath)) {
      return {
        accepted: false,
        detail: "The file path does not exist on this machine.",
        fileName: null,
        sizeBytes: null,
      };
    }

    if (input.action === "open" && this.shellActions) {
      await this.shellActions.openPath(nextPath);
    }
    if (input.action === "reveal" && this.shellActions) {
      this.shellActions.showItemInFolder(nextPath);
    }

    const stats = statSync(nextPath);
    const printerInput = this.toPrinterInput(printer);
    const requestedAction = input.action ?? "stage";

    if (requestedAction === "upload" || requestedAction === "send") {
      if (
        printer.connectionMode === "developer" ||
        printer.connectionMode === "lan"
      ) {
        const result = await sendBambuPrinterFile(printerInput, input);
        this.logger.info(
          `${requestedAction === "send" ? "Sent" : "Uploaded"} a local job to ${printer.name} through the direct printer path.`,
        );
        return result;
      }

      if (
        printer.connectionMode === "cloud" ||
        printer.connectionMode === "bambu-connect"
      ) {
        const cloudBridge = inspectBambuCloudBridgeEnvironment();
        if (!desktopBridgeHandoffReady(cloudBridge)) {
          return {
            accepted: false,
            detail:
              "Bambu Connect or Bambu Studio was not detected on this machine. Install or sign into a supported Bambu desktop app before using cloud-mode file handoff from Companion.",
            fileName: nextPath.split("/").pop() ?? null,
            sizeBytes: stats.size,
          };
        }

        const fileName =
          input.fileName?.trim() ||
          nextPath.split("/").pop() ||
          "BambuView job";
        const handoffLabel = desktopBridgeHandoffLabel(cloudBridge);

        if (cloudBridge.connectInstalled) {
          const importUrl = createBambuConnectImportUrl({
            name: fileName.replace(/\.(gcode\.3mf|3mf|gcode)$/i, ""),
            path: nextPath,
          });

          if (this.shellActions) {
            await this.shellActions.openExternal(importUrl);
          }

          this.logger.info(
            `Opened Bambu Connect import handoff for ${printer.name}.`,
            {
              fileName,
              hostname: printer.hostname,
              model: printer.model,
              serial: printer.serial,
            },
          );
          return {
            accepted: true,
            detail:
              "Opened the local Bambu Connect import handoff on this machine for the selected job.",
            fileName,
            sizeBytes: stats.size,
          };
        }

        if (this.shellActions) {
          await this.shellActions.openPath(nextPath);
        }

        this.logger.info(
          `Opened desktop bridge file handoff for ${printer.name}.`,
          {
            fileName,
            handoffLabel,
            hostname: printer.hostname,
            model: printer.model,
            serial: printer.serial,
          },
        );
        return {
          accepted: true,
          detail: openWithDesktopBridgeDetail(handoffLabel),
          fileName,
          sizeBytes: stats.size,
        };
      }

      return {
        accepted: false,
        detail:
          "This printer needs LAN-only Developer Mode for direct upload, or a Bambu Connect profile on the same machine for local handoff.",
        fileName: nextPath.split("/").pop() ?? null,
        sizeBytes: stats.size,
      };
    }

    this.logger.info(`Staged local file handoff for printer ${printer.name}.`);
    return {
      accepted: true,
      detail:
        "The file exists on this machine and is ready for a local handoff workflow.",
      fileName: nextPath.split("/").pop() ?? null,
      sizeBytes: stats.size,
    };
  }

  async openExternal(url: string) {
    if (this.shellActions) {
      await this.shellActions.openExternal(url);
    }
  }

  async checkForUpdates(): Promise<CompanionSnapshot> {
    const checkedAt = nowIso();
    this.updateState = {
      ...this.updateState,
      lastCheckedAt: checkedAt,
      message: "Checking GitHub Releases for a newer Companion build…",
      status: "checking",
    };
    this.emitSnapshot();

    try {
      const response = await fetch(
        "https://api.github.com/repos/DeepDaddyTTV/BambuView/releases?per_page=20",
        {
          headers: {
            accept: "application/vnd.github+json",
            "user-agent": "BambuView-Companion",
          },
          signal: timeoutSignal(7000),
        },
      );

      if (!response.ok) {
        throw new Error(`GitHub returned HTTP ${response.status}.`);
      }

      const releases = (await response.json()) as GitHubReleaseRecord[];
      const currentVersion = normalizeReleaseVersion(this.options.appVersion);

      if (!currentVersion) {
        throw new Error("The current Companion version could not be parsed.");
      }

      const candidates = releases
        .map((release) => {
          const version = normalizeReleaseVersion(
            release.tag_name ?? release.name,
          );
          const asset = version ? selectCompanionReleaseAsset(release) : null;
          return {
            asset,
            release,
            version,
          };
        })
        .filter(
          (
            candidate,
          ): candidate is {
            asset: GitHubReleaseAsset;
            release: GitHubReleaseRecord;
            version: string;
          } => Boolean(candidate.asset && candidate.version),
        )
        .sort((left, right) => compareVersions(right.version, left.version));

      const latest = candidates[0] ?? null;

      if (!latest) {
        this.updateState = {
          assetName: null,
          assetUrl: null,
          available: false,
          downloadedAt: null,
          downloadedFileName: null,
          downloadedFilePath: null,
          lastCheckedAt: checkedAt,
          latestVersion: null,
          message: "No Companion release assets were found yet.",
          releaseName: null,
          releaseUrl: null,
          status: "error",
        };
        this.emitSnapshot();
        return this.getSnapshot();
      }

      const available = compareVersions(latest.version, currentVersion) > 0;
      this.updateState = {
        assetName: latest.asset.name,
        assetUrl: latest.asset.browser_download_url,
        available,
        downloadedAt:
          this.updateState.assetName === latest.asset.name
            ? this.updateState.downloadedAt
            : null,
        downloadedFileName:
          this.updateState.assetName === latest.asset.name
            ? this.updateState.downloadedFileName
            : null,
        downloadedFilePath:
          this.updateState.assetName === latest.asset.name
            ? this.updateState.downloadedFilePath
            : null,
        lastCheckedAt: checkedAt,
        latestVersion: latest.version,
        message: available
          ? `BVCompanion v${latest.version} is ready to install.`
          : "You're already on the latest Companion alpha.",
        releaseName: latest.release.name ?? `BVCompanion v${latest.version}`,
        releaseUrl: latest.release.html_url ?? null,
        status: available ? "available" : "current",
      };
      this.logger.info(
        available
          ? `Companion update available: v${latest.version}.`
          : `Companion is current at v${currentVersion}.`,
        {
          available,
          currentVersion,
          latestVersion: latest.version,
        },
      );
    } catch (error) {
      this.updateState = {
        ...this.updateState,
        available: false,
        lastCheckedAt: checkedAt,
        message:
          error instanceof Error
            ? error.message
            : "BambuView Companion could not check for updates.",
        status: "error",
      };
      this.logger.warn(
        `Companion update check failed: ${this.updateState.message}`,
      );
    }

    this.emitSnapshot();
    return this.getSnapshot();
  }

  private getUpdateDownloadPath(assetName: string) {
    return join(
      dirname(this.options.stateFile),
      "updates",
      basename(assetName),
    );
  }

  async openUpdateDownload(): Promise<CompanionSnapshot> {
    if (!this.updateState.assetUrl || !this.updateState.assetName) {
      if (this.updateState.releaseUrl) {
        await this.openExternal(this.updateState.releaseUrl);
        this.logger.info(
          `Opened Companion release page: ${this.updateState.releaseUrl}`,
        );
        return this.getSnapshot();
      }

      throw new Error("No Companion update download is available yet.");
    }

    const startedAt = nowIso();
    const assetName = this.updateState.assetName;
    const assetUrl = this.updateState.assetUrl;
    const filePath = this.getUpdateDownloadPath(assetName);
    const shouldDownload =
      !existsSync(filePath) ||
      this.updateState.downloadedFilePath !== filePath ||
      this.updateState.downloadedFileName !== assetName;

    this.updateState = {
      ...this.updateState,
      downloadedFileName: assetName,
      downloadedFilePath: filePath,
      message: shouldDownload
        ? `Downloading ${assetName}…`
        : `Opening ${assetName}…`,
      status: "downloading",
    };
    this.emitSnapshot();

    if (shouldDownload) {
      await downloadFile(assetUrl, filePath);
      this.updateState = {
        ...this.updateState,
        downloadedAt: startedAt,
        downloadedFileName: assetName,
        downloadedFilePath: filePath,
        message: `${assetName} downloaded. Opening installer…`,
        status: "available",
      };
      this.emitSnapshot();
    }

    if (this.shellActions) {
      const result = await this.shellActions.openPath(filePath);
      if (result) {
        throw new Error(result);
      }
    } else {
      await this.openExternal(assetUrl);
    }

    this.updateState = {
      ...this.updateState,
      downloadedAt: this.updateState.downloadedAt ?? startedAt,
      downloadedFileName: assetName,
      downloadedFilePath: filePath,
      message:
        "Installer opened. Follow the platform prompt to finish updating Companion.",
      status: "available",
    };
    this.emitSnapshot();
    this.logger.info(`Opened Companion installer from ${filePath}`, {
      filePath,
    });
    return this.getSnapshot();
  }

  async pair(input: {
    companionName: string;
    pairingToken: string;
    serverUrl: string;
  }): Promise<CompanionSnapshot> {
    if (!this.bridgeState.listening) {
      throw new Error(
        this.bridgeState.errorMessage ??
          "The local bridge is not listening yet. Fix the bind host or port first.",
      );
    }

    const serverUrl = normalizeServerUrlInput(input.serverUrl);
    const pairingToken = input.pairingToken.trim();
    if (pairingToken.length < 16) {
      throw new Error(
        "Paste the full one-time pairing token from BambuView before pairing.",
      );
    }

    const pairingRouteError = validatePairingRoute(
      serverUrl,
      this.bridgeState.baseUrl,
    );
    if (pairingRouteError) {
      throw new Error(pairingRouteError);
    }

    const targetValidationError =
      await validateBambuViewServerTarget(serverUrl);
    if (targetValidationError) {
      throw new Error(targetValidationError);
    }

    const payload: CompanionPairingRequest = {
      baseUrl: this.bridgeState.baseUrl,
      bridgeToken: this.getBridgeAuth().token,
      capabilities: this.getCapabilitySummary().capabilities,
      capabilityNotes: this.getCapabilitySummary().capabilityNotes,
      companionName: maskCompanionName(input.companionName),
      pairingToken,
    };

    let response: Response;
    try {
      response = await fetch(joinUrl(serverUrl, "/api/companions/pair"), {
        body: JSON.stringify(payload),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
        signal: timeoutSignal(7000),
      });
    } catch (error) {
      throw new Error(formatPairingFetchError(serverUrl, error));
    }

    const data = (await response.json().catch(() => null)) as {
      companion?: CompanionRegistration;
      message?: string;
    } | null;
    if (!response.ok || !data?.companion) {
      throw new Error(
        data?.message ?? "BambuView rejected the pairing request.",
      );
    }

    this.state.pairing = {
      paired: true,
      companionId: data.companion.id,
      companionName: data.companion.name,
      pairedAt: data.companion.pairedAt,
      serverUrl,
    };
    this.persistState();
    this.logger.info(`Paired Companion with ${serverUrl}.`, {
      companionName: this.state.pairing.companionName,
      serverUrl,
    });
    return this.getSnapshot();
  }

  async readTelemetry(printerId: string): Promise<CompanionPrinterTelemetry> {
    const printer = this.getStoredPrinter(printerId);
    if (!printer) {
      throw new Error("Printer not found.");
    }
    const printerInput = this.toPrinterInput(printer);
    let telemetry: CompanionPrinterTelemetry;
    try {
      telemetry =
        printer.connectionMode === "cloud" ||
        printer.connectionMode === "bambu-connect"
          ? await readBambuCloudTelemetry(printerInput)
          : await readBambuTelemetry(printerInput);
    } catch (error) {
      this.logger.error("Telemetry request failed.", {
        connectionMode: printer.connectionMode,
        error,
        hostname: printer.hostname,
        model: printer.model,
        name: printer.name,
        serial: printer.serial,
      });
      throw error;
    }
    if (telemetry.available) {
      printer.lastSeenAt = telemetry.checkedAt;
      printer.lastTestedAt = telemetry.checkedAt;
      printer.updatedAt = telemetry.checkedAt;
      this.persistState();
    }
    this.logger.info("Telemetry request completed.", {
      available: telemetry.available,
      checkedAt: telemetry.checkedAt,
      connectionMode: printer.connectionMode,
      message: telemetry.message,
      name: printer.name,
      state: telemetry.state,
    });
    return telemetry;
  }

  async runPrinterCommand(
    printerId: string,
    input: CompanionPrinterCommandRequest,
  ): Promise<CompanionPrinterCommandResponse> {
    const printer = this.getStoredPrinter(printerId);
    if (!printer) {
      throw new Error("Printer not found.");
    }

    if (
      printer.connectionMode === "cloud" ||
      printer.connectionMode === "bambu-connect"
    ) {
      return {
        accepted: false,
        detail:
          "This printer is currently using the Companion cloud bridge for telemetry, camera, and file handoff. Direct machine controls still belong to the server-side LAN and Developer workflows.",
      };
    }

    const result = await runBambuPrinterCommand(
      this.toPrinterInput(printer),
      input,
    );
    this.logger.info(
      result.accepted
        ? `Sent ${input.action} to ${printer.name}.`
        : `Command ${input.action} was rejected for ${printer.name}: ${result.detail}`,
    );
    return result;
  }

  async regenerateBridgeToken(): Promise<string> {
    const token = randomBytes(24).toString("hex");
    this.state.bridgeToken = encryptSecret(this.codec, token);
    this.state.pairing = {
      ...defaultPairing,
      companionName: this.state.settings.friendlyName,
    };
    this.persistState();
    this.logger.warn("Regenerated the local bridge token and cleared pairing.");
    this.emitSnapshot();
    return token;
  }

  async resetPairing(options?: {
    resetBridgeSettings?: boolean;
  }): Promise<CompanionPairingState> {
    const resetBridgeSettings = options?.resetBridgeSettings ?? false;
    this.state.pairing = {
      ...defaultPairing,
      companionName: this.state.settings.friendlyName,
    };
    if (resetBridgeSettings) {
      this.state.settings = {
        ...this.state.settings,
        bindMode: "localhost",
        host: COMPANION_DEFAULT_HOST,
        port: COMPANION_DEFAULT_PORT,
      };
      this.bridgeState = {
        baseUrl: `http://${COMPANION_DEFAULT_HOST}:${COMPANION_DEFAULT_PORT}`,
        errorMessage: null,
        listening: this.bridgeState.listening,
        suggestedPort: null,
      };
    }
    this.persistState();
    if (this.options.bridgeLifecycle) {
      await this.options.bridgeLifecycle.restart();
    }
    this.logger.warn(
      resetBridgeSettings
        ? "Cleared the current BambuView pairing and restored localhost bridge defaults."
        : "Cleared the current BambuView pairing.",
    );
    return { ...this.state.pairing };
  }

  async saveSettings(
    input: Partial<CompanionSettings>,
  ): Promise<CompanionSnapshot> {
    this.state.settings = {
      ...this.state.settings,
      ...input,
      friendlyName: maskCompanionName(
        input.friendlyName ?? this.state.settings.friendlyName,
      ),
      host: input.host?.trim() || this.state.settings.host,
      port: input.port ?? this.state.settings.port,
      updateCheckIntervalMinutes: normalizeUpdateIntervalMinutes(
        input.updateCheckIntervalMinutes ??
          this.state.settings.updateCheckIntervalMinutes,
      ),
    };
    if (this.state.settings.bindMode === "localhost") {
      this.state.settings.host = COMPANION_DEFAULT_HOST;
    }
    if (!this.state.pairing.paired) {
      this.state.pairing.companionName = this.state.settings.friendlyName;
    }
    this.persistState();
    this.armUpdateChecks();
    if (this.options.bridgeLifecycle) {
      await this.options.bridgeLifecycle.restart();
    }
    this.logger.info("Companion settings saved.", {
      bindMode: this.state.settings.bindMode,
      host: this.state.settings.host,
      port: this.state.settings.port,
      themeMode: this.state.settings.themeMode,
      updateCheckIntervalMinutes:
        this.state.settings.updateCheckIntervalMinutes,
    });
    return this.getSnapshot();
  }

  statusTone(): CompanionStatusTone {
    if (!this.bridgeState.listening) {
      return "error";
    }
    if (!this.state.pairing.paired) {
      return "not-paired";
    }
    if (this.listStreams().some((stream) => stream.status === "online")) {
      return "streaming";
    }
    if (
      this.bridgeState.errorMessage ||
      this.listStreams().some((stream) => stream.status === "degraded")
    ) {
      return "warning";
    }
    return "paired";
  }

  async testPrinter(printerId: string): Promise<CompanionPrinterTestResult> {
    const printer = this.getStoredPrinter(printerId);
    if (!printer) {
      throw new Error("Printer not found.");
    }
    const printerInput = this.toPrinterInput(printer);
    let result: CompanionPrinterTestResult;
    try {
      result =
        printer.connectionMode === "cloud" ||
        printer.connectionMode === "bambu-connect"
          ? await testBambuCloudPrinter(printerInput)
          : await testBambuPrinter(printerInput);
    } catch (error) {
      this.logger.error("Printer test failed.", {
        connectionMode: printer.connectionMode,
        error,
        hostname: printer.hostname,
        model: printer.model,
        name: printer.name,
        serial: printer.serial,
      });
      throw error;
    }
    printer.lastTestedAt = result.checkedAt;
    if (result.reachable) {
      printer.lastSeenAt = result.checkedAt;
    }
    printer.updatedAt = result.checkedAt;
    this.persistState();
    this.emitSnapshot();
    this.logger.info("Printer test completed.", {
      checkedAt: result.checkedAt,
      connectionMode: printer.connectionMode,
      message: result.message,
      name: printer.name,
      reachable: result.reachable,
    });
    return result;
  }

  async updatePrinter(
    printerId: string,
    input: CompanionPrinterInput,
  ): Promise<CompanionSnapshot> {
    const printer = this.getStoredPrinter(printerId);
    if (!printer) {
      throw new Error("Printer not found.");
    }
    const normalizedInput = await this.hydrateCloudPrinterInput(input);
    if (normalizedInput.accessCode !== undefined) {
      printer.accessCode = encryptSecret(
        this.codec,
        normalizedInput.accessCode.trim(),
      );
    }
    printer.connectionMode = normalizedInput.connectionMode;
    printer.hostname = normalizedInput.hostname.trim();
    printer.model = normalizedInput.model.trim();
    printer.name = normalizedInput.name.trim();
    printer.notes = normalizedInput.notes?.trim() ?? "";
    printer.provider = normalizedInput.provider;
    printer.serial = normalizedInput.serial.trim();
    printer.updatedAt = nowIso();
    this.setPrinterLinkedStream(
      printerId,
      normalizedInput.streamId?.trim() || null,
    );
    this.invalidateBridgeCaches();
    this.persistState();
    return this.getSnapshot(true);
  }

  async updateStream(
    streamId: string,
    input: CompanionStreamInput,
  ): Promise<CompanionSnapshot> {
    const stream = this.getStoredStream(streamId);
    if (!stream) {
      throw new Error("Stream not found.");
    }
    const inspected = await inspectStreamInput(input);
    stream.details = inspected.details;
    stream.lastTestedAt = inspected.lastTestedAt;
    stream.name = input.name.trim();
    stream.outputKind = inspected.outputKind;
    stream.password = encryptSecret(this.codec, input.password?.trim() ?? "");
    stream.sourceKind = input.sourceKind;
    stream.status = inspected.status;
    stream.updatedAt = nowIso();
    stream.upstreamUrl = input.upstreamUrl.trim();
    stream.username = input.username?.trim() ?? "";
    this.setStreamLinkedPrinter(
      streamId,
      input.linkedPrinterId?.trim() || null,
    );
    this.persistState();
    return this.getSnapshot();
  }

  private emitSnapshot(forceRefresh = false) {
    this.emit("snapshot", this.getSnapshot(forceRefresh));
  }

  private readLocalBridgeInventory(force = false): LocalBridgeInventory {
    if (
      force ||
      this.localBridgeInventoryCache.value.surfaces.length === 0 ||
      Date.now() - this.localBridgeInventoryCache.fetchedAt > BRIDGE_CACHE_TTL_MS
    ) {
      this.localBridgeInventory = inspectLocalBridgeInventory();
      this.localBridgeInventoryCache = {
        fetchedAt: Date.now(),
        value: this.localBridgeInventory,
      };
    }

    return this.localBridgeInventoryCache.value;
  }

  private readCloudBridgeEnvironment(
    force = false,
    bridgeInventory = this.readLocalBridgeInventory(force),
  ): BambuCloudBridgeEnvironment {
    if (
      force ||
      Date.now() - this.cloudBridgeEnvironmentCache.fetchedAt >
        BRIDGE_CACHE_TTL_MS
    ) {
      this.cloudBridgeEnvironmentCache = {
        fetchedAt: Date.now(),
        value: inspectBambuCloudBridgeEnvironment({
          inventory: bridgeInventory,
        }),
      };
    }

    return this.cloudBridgeEnvironmentCache.value;
  }

  getLogFilePath(): string | null {
    return this.logger.filePath();
  }

  private buildCloudBridgeDiagnosticSummary(
    environment: BambuCloudBridgeEnvironment,
  ) {
    return {
      connectInstalled: environment.connectInstalled,
      networkPluginInstalled: environment.networkPluginInstalled,
      sessionCount: environment.sessionCount,
      sessions: environment.sessions.map((session) => ({
        accessExpiresAt: session.accessExpiresAt,
        accessTokenPresent: Boolean(session.accessToken),
        location: session.location,
        refreshExpiresAt: session.refreshExpiresAt,
        refreshTokenPresent: Boolean(session.refreshToken),
        region: session.region,
        sourceKind: session.sourceKind,
        sourceLabel: session.sourceLabel,
        updatedAt: session.updatedAt,
        userEmail: maskEmailAddress(session.userEmail),
        userId: maskUserId(session.userId),
      })),
      studioInstalled: environment.studioInstalled,
    };
  }

  private diagnosticPrinterSummary(printer: CompanionPrinter) {
    return {
      accessCodeSet: printer.accessCodeSet,
      capabilityStates: printer.capabilities,
      connectionMode: printer.connectionMode,
      hostname: printer.hostname,
      id: printer.id,
      model: printer.model,
      name: printer.name,
      serial: printer.serial,
      streamId: printer.streamId,
    };
  }

  async buildDiagnostics() {
    const inventory = this.readLocalBridgeInventory(true);
    const cloudBridge = this.readCloudBridgeEnvironment(true, inventory);
    const discovery = await this.getDiscoveryResult();
    const snapshot = this.getSnapshot(true);
    const logFiles = this.logger.filePaths().map((filePath) =>
      safeFileMetadata(filePath),
    );
    const stateFileMetadata = safeFileMetadata(this.options.stateFile);

    return {
      app: {
        name: COMPANION_APP_NAME,
        version: this.options.appVersion,
      },
      bridge: this.bridgeState,
      diagnostics: {
        cloudBridge: this.buildCloudBridgeDiagnosticSummary(cloudBridge),
        discovery,
        localBridgeInventory: inventory,
      },
      generatedAt: nowIso(),
      health: snapshot.health,
      logs: {
        filePath: this.logger.filePath(),
        files: logFiles,
        recentEntries: snapshot.logs,
        text: this.logger.readText(),
      },
      pairing: snapshot.pairing,
      paths: {
        logFile: this.logger.filePath(),
        logFiles,
        stateFile: this.options.stateFile,
        stateFileMetadata,
      },
      process: {
        argv: process.argv,
        cwd: process.cwd(),
        execPath: process.execPath,
        memoryUsage: process.memoryUsage(),
        pid: process.pid,
        resourceUsage:
          typeof process.resourceUsage === "function"
            ? process.resourceUsage()
            : null,
        uptimeSeconds: process.uptime(),
      },
      printers: snapshot.printers.map((printer) =>
        this.diagnosticPrinterSummary(printer),
      ),
      runtime: {
        arch: process.arch,
        platform: process.platform,
        versions: process.versions,
      },
      settings: snapshot.settings,
      snapshot,
      streams: snapshot.streams,
      system: {
        cpuCount: osCpus().length,
        freeMemoryBytes: osFreeMem(),
        hostname: osHostname(),
        loadAverage: osLoadAverage(),
        release: osRelease(),
        totalMemoryBytes: osTotalMem(),
        type: osType(),
        uptimeSeconds: osUptime(),
      },
      update: snapshot.update,
    };
  }

  async exportDiagnostics(destinationPath: string): Promise<string> {
    const diagnostics = await this.buildDiagnostics();
    mkdirSync(dirname(destinationPath), { recursive: true });
    writeFileSync(destinationPath, JSON.stringify(diagnostics, null, 2), "utf8");
    this.logger.info("Exported Companion diagnostics bundle.", {
      destinationPath,
    });
    return destinationPath;
  }

  private async resolveStoredPrinterCameraSource(
    printer: StoredPrinter,
  ): Promise<CameraBridgeSource | null> {
    const printerInput = this.toPrinterInput(printer);
    if (
      printer.connectionMode === "cloud" ||
      printer.connectionMode === "bambu-connect"
    ) {
      return resolveBambuCloudCameraSource(printerInput);
    }

    return resolvePrinterCameraBridgeSource(printerInput);
  }

  private resolveStoredStreamCameraSource(
    stream: StoredStream,
  ): CameraBridgeSource | null {
    return resolveStreamCameraBridgeSource({
      name: stream.name,
      password: decryptSecret(this.codec, stream.password),
      sourceKind: stream.sourceKind,
      upstreamUrl: stream.upstreamUrl,
      username: stream.username,
    });
  }

  private listPrinters(
    cloudBridge = this.readCloudBridgeEnvironment(),
  ): CompanionPrinter[] {

    return this.state.printers.map((printer) => {
      const linkedStream = this.getLinkedStreamForPrinter(printer);
      const printerInput = this.toPrinterInput(printer);
      const nativeBridge = resolvePrinterCameraBridgeSource(printerInput);
      const nativeBridgeSupport = nativeBambuBridgeSupport(printer.model);
      const usingCloudBridge =
        printer.connectionMode === "cloud" ||
        printer.connectionMode === "bambu-connect";
      const localTelemetryReady = hasLocalAccess(printerInput);
      const linkedStreamBridge = linkedStream
        ? this.resolveStoredStreamCameraSource(linkedStream)
        : null;
      const localCameraState = linkedStream
        ? linkedStream.outputKind === "unavailable"
          ? linkedStreamBridge
            ? "available"
            : "requires_restream"
          : "available"
        : nativeBridge
          ? "available"
          : localTelemetryReady && nativeBridgeSupport.supported
            ? "requires_setup"
            : localTelemetryReady
              ? "requires_restream"
              : "requires_setup";
      const cloudCameraState = usingCloudBridge
        ? cameraBridgeReady() &&
          cloudBridge.sessionCount > 0 &&
          nativeBridgeSupport.supported
          ? "available"
          : nativeBridgeSupport.supported
            ? "unavailable"
            : "requires_restream"
        : localCameraState;
      const controlsState =
        printer.connectionMode === "developer" || localTelemetryReady
          ? "available"
          : usingCloudBridge
            ? "unavailable"
            : "requires_setup";
      const fileUploadState =
        printer.connectionMode === "developer" ||
        printer.connectionMode === "lan" ||
        ((printer.connectionMode === "cloud" ||
          printer.connectionMode === "bambu-connect") &&
          desktopBridgeHandoffReady(cloudBridge))
          ? "available"
          : "requires_setup";
      const slicingAssistState =
        fileUploadState === "available" ? "available" : "requires_setup";
      const telemetryState = usingCloudBridge
        ? cloudBridge.sessionCount > 0
          ? "available"
          : "requires_setup"
        : localTelemetryReady
          ? "available"
          : "requires_setup";
      const amsState = telemetryState;

      return {
        accessCodeSet: Boolean(decryptSecret(this.codec, printer.accessCode)),
        capabilities: {
          ams: amsState,
          camera: usingCloudBridge ? cloudCameraState : localCameraState,
          controls: controlsState,
          discovery: "available",
          fileUpload: fileUploadState,
          slicingAssist: slicingAssistState,
          telemetry: telemetryState,
        },
        capabilityNotes: {
          ams: usingCloudBridge
            ? "AMS status follows the signed-in Bambu desktop report stream for this cloud-mode printer."
            : "AMS status follows the same local printer report used for telemetry when the printer answers.",
          camera: linkedStream
            ? linkedStream.outputKind === "unavailable"
              ? linkedStreamBridge
                ? "Companion can restream this linked RTSP or native feed directly for browser playback."
                : "This linked stream still needs a browser-compatible restream."
              : "This printer already has a browser-compatible stream linked."
            : usingCloudBridge
              ? cloudCameraState === "available"
                ? "Companion can auto-bridge this printer's native Bambu camera from the signed-in desktop session without asking you for LAN fields."
                : nativeBridgeSupport.supported
                  ? "Companion matched this printer for cloud telemetry and will open the native camera feed automatically once this machine can also reach the printer on the same local network."
                  : nativeBridgeSupport.detail
              : nativeBridge
                ? "Companion can expose this printer's native camera directly for browser playback."
                : localTelemetryReady && nativeBridgeSupport.supported
                  ? "Add the matching LAN access code and host details, then Companion can expose this printer's native camera directly."
                  : localTelemetryReady
                    ? nativeBridgeSupport.detail
                    : "Link a browser-compatible MJPEG or snapshot stream to preview this printer in BambuView.",
          controls:
            printer.connectionMode === "developer"
              ? "Developer Mode direct machine controls are available through Companion."
              : usingCloudBridge
                ? "This printer is using the Companion cloud bridge for telemetry, camera, and job handoff. Direct machine controls still belong to the BambuView server's LAN and Developer workflows."
                : localTelemetryReady
                  ? "Companion can attempt local pause, resume, stop, and lamp actions with this saved printer profile. Full motion and extrusion controls still work best in Developer Mode."
                  : describeLocalControlsSetup(printerInput),
          discovery: usingCloudBridge
            ? "BambuView Companion can import this printer from the signed-in Bambu desktop bridge and still enrich camera reachability automatically."
            : "BambuView Companion can scan the LAN, inspect local desktop bridge data, and still lets you save printers manually.",
          fileUpload:
            printer.connectionMode === "developer" ||
            printer.connectionMode === "lan"
              ? "Companion can upload files directly over the local printer FTPS path and optionally start the print from the same machine."
              : printer.connectionMode === "cloud" ||
                  printer.connectionMode === "bambu-connect"
                ? desktopBridgeHandoffReady(cloudBridge)
                  ? cloudBridge.connectInstalled
                    ? "Companion can open the local Bambu Connect import-file handoff for send workflows on this machine."
                    : `Companion can hand the selected job to ${desktopBridgeHandoffLabel(cloudBridge)} on this machine.`
                  : "Install or sign into Bambu Connect or Bambu Studio on this machine to unlock one-click job handoff for this printer."
                : "Save the printer host and access code to unlock direct local upload.",
          slicingAssist:
            slicingAssistState === "available"
              ? "Prepared jobs can already route through this printer profile using direct upload or desktop bridge handoff."
              : "Finish the required upload path for this printer before using it as a send target from BambuView.",
          telemetry: usingCloudBridge
            ? cloudBridge.sessionCount > 0
              ? "Companion can request live telemetry for this printer through the signed-in Bambu desktop bridge on this machine."
              : "Sign into Bambu Connect or Bambu Studio on this machine before requesting telemetry for this printer."
            : describeLocalTelemetrySetup(printerInput),
        },
        connectionMode: printer.connectionMode,
        createdAt: printer.createdAt,
        hostname: printer.hostname,
        id: printer.id,
        lastSeenAt: printer.lastSeenAt,
        lastTestedAt: printer.lastTestedAt,
        model: printer.model,
        name: printer.name,
        notes: printer.notes,
        provider: printer.provider,
        serial: printer.serial,
        streamId: linkedStream?.id ?? null,
        updatedAt: printer.updatedAt,
      };
    });
  }

  private listStreams(): CompanionStream[] {
    return this.state.streams.map((stream) => ({
      createdAt: stream.createdAt,
      details: stream.details,
      hlsPath: null,
      id: stream.id,
      lastTestedAt: stream.lastTestedAt,
      linkedPrinterId: stream.linkedPrinterId,
      mjpegPath: this.getStreamBridgePaths(stream).mjpegPath,
      name: stream.name,
      outputKind: stream.outputKind,
      snapshotPath: this.getStreamBridgePaths(stream).snapshotPath,
      sourceKind: stream.sourceKind,
      status: stream.status,
      updatedAt: stream.updatedAt,
      upstreamUrl: redactUrl(stream.upstreamUrl),
    }));
  }

  private loadState(): PersistedState {
    if (!existsSync(this.options.stateFile)) {
      return this.createDefaultState();
    }

    try {
      const raw = JSON.parse(readFileSync(this.options.stateFile, "utf8")) as
        | Partial<PersistedState>
        | undefined;
      return {
        bridgeToken:
          raw?.bridgeToken && typeof raw.bridgeToken === "object"
            ? raw.bridgeToken
            : encryptSecret(this.codec, randomBytes(24).toString("hex")),
        pairing: { ...defaultPairing, ...raw?.pairing },
        printers: Array.isArray(raw?.printers) ? raw.printers : [],
        settings: { ...defaultSettings, ...raw?.settings },
        streams: Array.isArray(raw?.streams) ? raw.streams : [],
      };
    } catch {
      this.logger.warn(
        "Companion state file could not be read. Falling back to defaults.",
      );
      return this.createDefaultState();
    }
  }

  private createDefaultState(): PersistedState {
    return {
      bridgeToken: encryptSecret(this.codec, randomBytes(24).toString("hex")),
      pairing: { ...defaultPairing },
      printers: [],
      settings: { ...defaultSettings },
      streams: [],
    };
  }

  private persistState() {
    mkdirSync(dirname(this.options.stateFile), { recursive: true });
    writeFileSync(this.options.stateFile, JSON.stringify(this.state, null, 2));
    this.emitSnapshot();
  }

  private armUpdateChecks() {
    if (this.options.updateChecksEnabled === false) {
      return;
    }

    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    const intervalMinutes = normalizeUpdateIntervalMinutes(
      this.state.settings.updateCheckIntervalMinutes,
    );
    this.state.settings.updateCheckIntervalMinutes = intervalMinutes;
    this.updateTimer = setInterval(
      () => {
        void this.checkForUpdates();
      },
      intervalMinutes * 60 * 1000,
    );
    this.updateTimer.unref?.();
  }

  private async hydrateCloudPrinterInput(
    input: CompanionPrinterInput,
  ): Promise<CompanionPrinterInput> {
    const preferredMode = this.preferredCloudConnectionMode();
    const normalizedInput: CompanionPrinterInput = {
      ...input,
      connectionMode:
        input.connectionMode === "bambu-connect" ? "bambu-connect" : preferredMode,
    };

    try {
      const discovery = await discoverBambuCloudPrinters({
        includeLanReachability: false,
      });
      const normalizedName = input.name.trim().toLowerCase();
      const normalizedModel = input.model.trim().toLowerCase();
      const normalizedSerial = input.serial.trim().toUpperCase();
      const match = discovery.printers.find((printer) => {
        if (
          normalizedSerial &&
          printer.serial.trim().toUpperCase() === normalizedSerial
        ) {
          return true;
        }

        return (
          printer.name.trim().toLowerCase() === normalizedName &&
          printer.model.trim().toLowerCase() === normalizedModel
        );
      });

      if (!match) {
        return normalizedInput;
      }

      return {
        ...normalizedInput,
        connectionMode: match.connectionMode,
        hostname: normalizedInput.hostname.trim() || match.hostname,
        serial: normalizedInput.serial.trim() || match.serial,
      };
    } catch {
      return normalizedInput;
    }
  }

  private toPrinterInput(printer: StoredPrinter): CompanionPrinterInput {
    return {
      accessCode: decryptSecret(this.codec, printer.accessCode),
      connectionMode: printer.connectionMode,
      hostname: printer.hostname,
      model: printer.model,
      name: printer.name,
      notes: printer.notes,
      provider: printer.provider,
      serial: printer.serial,
      streamId: printer.streamId,
    };
  }
}
