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
  CompanionPrinterInput,
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
  probeBambuCamera,
  probeTcp,
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

interface BridgeLifecycle {
  restart(): Promise<void>;
}

interface BridgeState {
  baseUrl: string;
  errorMessage: string | null;
  listening: boolean;
  suggestedPort: number | null;
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
    normalized === "0.0.0.0" ||
    normalized === "::" ||
    normalized === "[::]"
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

  const data = (await response.json().catch(() => null)) as
    | { message?: string; ok?: boolean }
    | null;
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

function normalizeReleaseVersion(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/v?(\d+\.\d+\.\d+)/i);
  return match?.[1] ?? null;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => Number(part));
  const rightParts = right.split(".").map((part) => Number(part));

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
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
  sourceKind: CompanionStreamSourceKind,
): CompanionStreamOutputKind {
  if (sourceKind === "mjpeg") return "mjpeg";
  if (sourceKind === "snapshot") return "snapshot";
  if (sourceKind === "hls") return "hls";
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

function targetFromUrl(
  value: string,
  defaultPort: number,
): { host: string; port: number } | null {
  try {
    const url = new URL(value);
    return {
      host: url.hostname,
      port: Number(url.port || defaultPort),
    };
  } catch {
    return null;
  }
}

async function inspectStreamInput(input: CompanionStreamInput): Promise<{
  details: string;
  lastTestedAt: string | null;
  outputKind: CompanionStreamOutputKind;
  status: CompanionStream["status"];
}> {
  const checkedAt = nowIso();
  const outputKind = inferOutputKind(input.sourceKind);

  if (input.sourceKind === "rtsp") {
    const target = targetFromUrl(input.upstreamUrl, 554);
    const reachable = target ? await probeTcp(target.host, target.port) : false;
    return {
      details: reachable
        ? "The RTSP source accepted a TCP connection. Add an MJPEG or snapshot restream before browser playback."
        : "The RTSP source did not accept a connection.",
      lastTestedAt: checkedAt,
      outputKind,
      status: reachable ? "degraded" : "offline",
    };
  }

  if (input.sourceKind === "bambu-native") {
    const target = targetFromUrl(input.upstreamUrl, 322);
    const reachable = target ? await probeBambuCamera(target.host) : false;
    return {
      details: reachable
        ? "The native Bambu camera endpoint is reachable, but this alpha still needs an MJPEG or snapshot bridge before browser playback."
        : "The native Bambu camera endpoint did not accept a connection.",
      lastTestedAt: checkedAt,
      outputKind,
      status: reachable ? "degraded" : "offline",
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

export class CompanionRuntime extends EventEmitter {
  private bridgeState: BridgeState = {
    baseUrl: `http://${COMPANION_DEFAULT_HOST}:${COMPANION_DEFAULT_PORT}`,
    errorMessage: null,
    listening: false,
    suggestedPort: null,
  };

  private readonly codec: SecretCodec;

  private readonly logger: CompanionLogger;

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
    if (this.options.updateChecksEnabled !== false) {
      this.armUpdateChecks();
    }
    if (
      this.options.updateChecksEnabled !== false &&
      this.state.settings.checkForUpdatesOnLaunch
    ) {
      void this.checkForUpdates();
    }
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

  async createPrinter(
    input: CompanionPrinterInput,
  ): Promise<CompanionSnapshot> {
    const timestamp = nowIso();
    this.state.printers.push({
      accessCode: encryptSecret(this.codec, input.accessCode?.trim() ?? ""),
      connectionMode: input.connectionMode,
      createdAt: timestamp,
      hostname: input.hostname.trim(),
      id: randomUUID(),
      lastSeenAt: null,
      lastTestedAt: null,
      model: input.model.trim(),
      name: input.name.trim(),
      notes: input.notes?.trim() ?? "",
      provider: input.provider,
      serial: input.serial.trim(),
      streamId: input.streamId?.trim() || null,
      updatedAt: timestamp,
    });
    this.persistState();
    this.logger.info(`Saved printer ${input.name.trim()} for Companion.`);
    return this.getSnapshot();
  }

  async createStream(input: CompanionStreamInput): Promise<CompanionSnapshot> {
    const timestamp = nowIso();
    const inspected = await inspectStreamInput(input);
    this.state.streams.push({
      createdAt: timestamp,
      details: inspected.details,
      id: randomUUID(),
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
    this.persistState();
    this.logger.info(`Saved stream ${input.name.trim()} for Companion.`);
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
    this.logger.warn("Removed a saved printer from Companion.");
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
    this.logger.warn("Removed a saved stream from Companion.");
    return this.getSnapshot();
  }

  getBridgeAuth() {
    return {
      token: decryptSecret(this.codec, this.state.bridgeToken),
      username: COMPANION_BRIDGE_USERNAME,
    };
  }

  getCapabilitySummary(): {
    capabilities: CompanionCapabilityFlags;
    capabilityNotes: CompanionCapabilityNotes;
  } {
    const printers = this.listPrinters();
    const streams = this.listStreams();
    const telemetryReady = printers.some(
      (printer) => printer.capabilities.telemetry === "available",
    );
    const streamReady = streams.some(
      (stream) => stream.outputKind !== "unavailable",
    );
    const needsRestream = streams.some(
      (stream) =>
        stream.sourceKind === "rtsp" || stream.sourceKind === "bambu-native",
    );
    const developerPrinter = printers.some(
      (printer) => printer.connectionMode === "developer",
    );

    return {
      capabilities: {
        ams: telemetryReady
          ? "available"
          : printers.length > 0
            ? "requires_setup"
            : "unavailable",
        camera: streamReady
          ? "available"
          : needsRestream
            ? "requires_restream"
            : streams.length > 0
              ? "requires_setup"
              : "unavailable",
        controls: developerPrinter ? "unavailable" : "requires_developer_mode",
        discovery: "unavailable",
        fileUpload: developerPrinter ? "unavailable" : "requires_setup",
        slicingAssist: "future",
        telemetry: telemetryReady
          ? "available"
          : printers.length > 0
            ? "requires_setup"
            : "unavailable",
      },
      capabilityNotes: {
        ams: "AMS state rides on the same local telemetry path as the printer report.",
        camera: streamReady
          ? "At least one stream already exposes browser-compatible output."
          : "Use MJPEG, snapshot, or HLS sources directly. RTSP and native Bambu feeds still need a browser bridge in this alpha.",
        controls:
          "The control boundary exists, but direct machine commands are not enabled in this alpha yet.",
        discovery:
          "Automatic Bambu discovery is not implemented in this alpha. Add printers manually with hostname, serial, and access code.",
        fileUpload:
          "Local file staging is supported, but direct printer upload is not enabled in this alpha.",
        slicingAssist:
          "Companion reserves a local slicing-assist boundary for a future revision.",
        telemetry:
          "Live telemetry is available for LAN and Developer profiles with hostname, serial number, and access code.",
      },
    };
  }

  getDiscoveryResult() {
    return {
      attemptedAt: nowIso(),
      detail:
        "BambuView Companion does not auto-discover Bambu printers in this alpha yet.",
      instructions: [
        "Open the printer's network settings on the touchscreen.",
        "Enable LAN Mode or LAN-only Developer Mode when you want local telemetry.",
        "Add the printer manually with hostname, serial number, and access code.",
      ],
      printers: [],
      supported: false,
    };
  }

  getHealth(): CompanionHealthResponse {
    const { capabilities, capabilityNotes } = this.getCapabilitySummary();
    const warnings = [
      this.bridgeState.errorMessage,
      !this.state.pairing.paired
        ? "Companion is not paired with a BambuView server yet."
        : null,
      this.listStreams().length === 0 ? "No streams are configured yet." : null,
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
      capabilities,
      capabilityNotes,
      pairing: { ...this.state.pairing },
      status: this.statusTone(),
      warnings,
    };
  }

  getSnapshot(): CompanionSnapshot {
    return {
      health: this.getHealth(),
      logs: this.logger.list(),
      pairing: { ...this.state.pairing },
      printers: this.listPrinters(),
      settings: { ...this.state.settings },
      streams: this.listStreams(),
      update: { ...this.updateState },
    };
  }

  getStreamBridgePaths(stream: StoredStream) {
    return {
      hlsPath: null,
      mjpegPath:
        stream.outputKind === "mjpeg" ? `/streams/${stream.id}/mjpeg` : null,
      snapshotPath:
        stream.outputKind === "snapshot"
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

  getStreamProxyTarget(
    streamId: string,
    mode: "mjpeg" | "snapshot",
  ): { headers: Headers; target: string } | null {
    const stream = this.getStoredStream(streamId);
    if (!stream) {
      return null;
    }

    if (mode === "mjpeg" && stream.outputKind !== "mjpeg") {
      return null;
    }
    if (mode === "snapshot" && stream.outputKind !== "snapshot") {
      return null;
    }

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
      target: stream.upstreamUrl,
    };
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
    return join(dirname(this.options.stateFile), "updates", basename(assetName));
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
    this.logger.info(`Opened Companion installer from ${filePath}`);
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
    this.logger.info(`Paired Companion with ${serverUrl}.`);
    return this.getSnapshot();
  }

  async readTelemetry(printerId: string): Promise<CompanionPrinterTelemetry> {
    const printer = this.getStoredPrinter(printerId);
    if (!printer) {
      throw new Error("Printer not found.");
    }
    const telemetry = await readBambuTelemetry(this.toPrinterInput(printer));
    if (telemetry.available) {
      printer.lastSeenAt = telemetry.checkedAt;
      printer.lastTestedAt = telemetry.checkedAt;
      printer.updatedAt = telemetry.checkedAt;
      this.persistState();
    }
    return telemetry;
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

  resetPairing(): CompanionPairingState {
    this.state.pairing = {
      ...defaultPairing,
      companionName: this.state.settings.friendlyName,
    };
    this.persistState();
    this.logger.warn("Cleared the current BambuView pairing.");
    this.emitSnapshot();
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
    const result = await testBambuPrinter(this.toPrinterInput(printer));
    printer.lastTestedAt = result.checkedAt;
    if (result.reachable) {
      printer.lastSeenAt = result.checkedAt;
    }
    printer.updatedAt = result.checkedAt;
    this.persistState();
    this.emitSnapshot();
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
    printer.accessCode = encryptSecret(
      this.codec,
      input.accessCode?.trim() ?? "",
    );
    printer.connectionMode = input.connectionMode;
    printer.hostname = input.hostname.trim();
    printer.model = input.model.trim();
    printer.name = input.name.trim();
    printer.notes = input.notes?.trim() ?? "";
    printer.provider = input.provider;
    printer.serial = input.serial.trim();
    printer.streamId = input.streamId?.trim() || null;
    printer.updatedAt = nowIso();
    this.persistState();
    return this.getSnapshot();
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
    stream.linkedPrinterId = input.linkedPrinterId?.trim() || null;
    stream.name = input.name.trim();
    stream.outputKind = inspected.outputKind;
    stream.password = encryptSecret(this.codec, input.password?.trim() ?? "");
    stream.sourceKind = input.sourceKind;
    stream.status = inspected.status;
    stream.updatedAt = nowIso();
    stream.upstreamUrl = input.upstreamUrl.trim();
    stream.username = input.username?.trim() ?? "";
    this.persistState();
    return this.getSnapshot();
  }

  private emitSnapshot() {
    this.emit("snapshot", this.getSnapshot());
  }

  private listPrinters(): CompanionPrinter[] {
    return this.state.printers.map((printer) => {
      const linkedStream = printer.streamId
        ? this.state.streams.find((stream) => stream.id === printer.streamId)
        : null;
      const telemetryConfigured =
        Boolean(printer.hostname.trim()) &&
        Boolean(decryptSecret(this.codec, printer.accessCode)) &&
        (printer.connectionMode === "lan" ||
          printer.connectionMode === "developer");
      const cameraState = linkedStream
        ? linkedStream.outputKind === "unavailable"
          ? "requires_restream"
          : "available"
        : printer.connectionMode === "developer"
          ? "requires_restream"
          : "requires_setup";
      const controlsState =
        printer.connectionMode === "developer"
          ? "unavailable"
          : "requires_developer_mode";

      return {
        accessCodeSet: Boolean(decryptSecret(this.codec, printer.accessCode)),
        capabilities: {
          ams: telemetryConfigured ? "available" : "requires_setup",
          camera: cameraState,
          controls: controlsState,
          discovery: "unavailable",
          fileUpload:
            printer.connectionMode === "developer"
              ? "unavailable"
              : "requires_developer_mode",
          slicingAssist: "future",
          telemetry: telemetryConfigured ? "available" : "requires_setup",
        },
        capabilityNotes: {
          ams: "AMS status follows the same local printer report used for telemetry when the printer answers.",
          camera: linkedStream
            ? linkedStream.outputKind === "unavailable"
              ? "This linked stream still needs a browser-compatible restream."
              : "This printer already has a browser-compatible stream linked."
            : "Link a browser-compatible MJPEG or snapshot stream to preview this printer in BambuView.",
          controls:
            printer.connectionMode === "developer"
              ? "The control boundary is wired, but direct commands stay disabled in this alpha."
              : "Switch the printer to LAN-only Developer Mode to prepare for direct commands.",
          discovery:
            "Auto-discovery is not implemented in this alpha. Save the printer manually from its touchscreen details.",
          fileUpload:
            "Companion can stage local files now, but direct printer upload is still disabled in this alpha.",
          slicingAssist:
            "Slice-assist hooks are reserved for a future revision.",
          telemetry: telemetryConfigured
            ? "Companion can request live telemetry over the printer's local MQTT report channel."
            : "Add hostname, serial number, and LAN access code to request telemetry.",
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
    this.updateTimer = setInterval(() => {
      void this.checkForUpdates();
    }, intervalMinutes * 60 * 1000);
    this.updateTimer.unref?.();
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
