import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  type Dirent,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";

import type {
  CompanionCapabilityFlags,
  CompanionCapabilityNotes,
  CompanionPrinter,
  CompanionPrinterDiscoveryResult,
  CompanionPrinterInput,
  CompanionPrinterTelemetry,
  CompanionPrinterTestResult,
} from "@bambuview/contracts";

import {
  cameraBridgeReady,
  nativeBambuBridgeSupport,
  resolvePrinterCameraBridgeSource,
  type CameraBridgeSource,
} from "./camera-bridge.js";
import {
  buildMqttTopic,
  createConnectPacket,
  createPublishPacket,
  createSubscribePacket,
  discoverBambuPrinters,
  getPublishPayload,
  mapTelemetry,
  parseTelemetry,
  shiftMqttPacket,
} from "./bambu.js";
import { inspectLocalBridgeInventory } from "./bridge-surfaces.js";

const CLOUD_API_TIMEOUT_MS = 7_000;
const CLOUD_MQTT_PORT = 8883;
const CLOUD_REPORT_TIMEOUT_MS = 8_000;
const LOCAL_DISCOVERY_CACHE_MS = 30_000;
const MAX_SCAN_BYTES = 2_000_000;
const MAX_SCAN_DEPTH = 4;
const MAX_SCAN_FILES = 200;
const SESSION_REFRESH_SLACK_SECONDS = 300;

type BridgeSessionSurfaceKind =
  | "bambu-connect"
  | "bambu-studio"
  | "network-plugin";

interface SessionSurfaceDefinition {
  configLocations: string[];
  kind: BridgeSessionSurfaceKind;
  label: string;
}

interface BambuCloudSessionCandidate {
  accessExpiresAt: number | null;
  accessToken: string;
  location: string;
  refreshExpiresAt: number | null;
  refreshToken: string;
  region: string;
  sourceKind: BridgeSessionSurfaceKind;
  sourceLabel: string;
  updatedAt: number;
  userEmail: string | null;
  userId: string | null;
}

export interface BambuCloudBridgeEnvironment {
  connectInstalled: boolean;
  networkPluginInstalled: boolean;
  sessionCount: number;
  sessions: BambuCloudSessionCandidate[];
  studioInstalled: boolean;
}

export function desktopBridgeHandoffReady(
  environment: Pick<
    BambuCloudBridgeEnvironment,
    "connectInstalled" | "networkPluginInstalled" | "studioInstalled"
  >,
): boolean {
  return Boolean(
    environment.connectInstalled ||
      environment.networkPluginInstalled ||
      environment.studioInstalled,
  );
}

export function desktopBridgeHandoffLabel(
  environment: Pick<
    BambuCloudBridgeEnvironment,
    "connectInstalled" | "networkPluginInstalled" | "studioInstalled"
  >,
): string {
  if (environment.connectInstalled) {
    return "Bambu Connect";
  }

  if (environment.studioInstalled || environment.networkPluginInstalled) {
    return "Bambu Studio";
  }

  return "the Bambu desktop bridge";
}

interface ResolvedBambuCloudSession extends BambuCloudSessionCandidate {
  userId: string;
}

interface BambuCloudDeviceRecord {
  accessCode: string | null;
  label: string;
  model: string;
  online: boolean;
  raw: Record<string, unknown>;
  serial: string;
  statusLabel: string;
}

interface ResolvedBambuCloudPrinter {
  device: BambuCloudDeviceRecord;
  environment: BambuCloudBridgeEnvironment;
  host: string | null;
  session: ResolvedBambuCloudSession;
}

const cloudDeviceCache = new Map<
  string,
  { devices: BambuCloudDeviceRecord[]; expiresAt: number; session: ResolvedBambuCloudSession }
>();

let lanDiscoveryCache:
  | {
      expiresAt: number;
      printers: CompanionPrinterDiscoveryResult["printers"];
    }
  | null = null;

function timeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

function expandHome(inputPath: string): string {
  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  return inputPath;
}

function dedupePaths(paths: string[]): string[] {
  return [...new Set(paths.map((candidate) => expandHome(candidate)))];
}

function sessionSurfaceDefinitions(): SessionSurfaceDefinition[] {
  const home = os.homedir();

  return [
    {
      configLocations: [
        path.join(home, "Library/Application Support/Bambu Connect"),
        path.join(home, "AppData/Roaming/Bambu Connect"),
        path.join(home, ".config/Bambu Connect"),
      ],
      kind: "bambu-connect",
      label: "Bambu Connect",
    },
    {
      configLocations: [
        path.join(home, "Library/Application Support/BambuStudio"),
        path.join(home, "AppData/Roaming/BambuStudio"),
        path.join(home, ".config/BambuStudio"),
      ],
      kind: "bambu-studio",
      label: "Bambu Studio",
    },
    {
      configLocations: [
        path.join(home, "Library/Application Support/BambuStudio"),
        path.join(home, "AppData/Roaming/BambuStudio"),
        path.join(home, ".config/BambuStudio"),
        path.join(home, "Library/Application Support/OrcaSlicer"),
        path.join(home, "AppData/Roaming/OrcaSlicer"),
        path.join(home, ".config/OrcaSlicer"),
      ],
      kind: "network-plugin",
      label: "Bambu Network Plugin",
    },
  ];
}

function collectJsonFiles(root: string): string[] {
  const results: string[] = [];
  const queue: Array<{ depth: number; location: string }> = [
    { depth: 0, location: root },
  ];

  while (queue.length > 0 && results.length < MAX_SCAN_FILES) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    let entries: Dirent<string>[];
    try {
      entries = readdirSync(current.location, {
        encoding: "utf8",
        withFileTypes: true,
      });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const nextLocation = path.join(current.location, entry.name);
      if (entry.isDirectory()) {
        if (current.depth < MAX_SCAN_DEPTH) {
          queue.push({
            depth: current.depth + 1,
            location: nextLocation,
          });
        }
        continue;
      }

      if (
        entry.name.toLowerCase().endsWith(".json") ||
        entry.name.toLowerCase().endsWith(".conf")
      ) {
        results.push(nextLocation);
      }

      if (results.length >= MAX_SCAN_FILES) {
        break;
      }
    }
  }

  return results;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function readString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function readNumber(
  record: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function normalizeRegion(value: string | null): string {
  const normalized = value?.trim().toUpperCase() ?? "";
  if (!normalized) {
    return "GLOBAL";
  }

  if (normalized === "US" || normalized === "GLOBAL") {
    return "GLOBAL";
  }

  if (normalized === "CN" || normalized === "CHINA") {
    return "CN";
  }

  return normalized;
}

function normalizeUserId(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function epochFromMaybeSeconds(value: number | null): number | null {
  if (!Number.isFinite(value) || value === null || value <= 0) {
    return null;
  }

  return value > 10_000_000_000 ? Math.round(value / 1000) : Math.round(value);
}

function maybeSessionCandidate(
  record: Record<string, unknown>,
  meta: {
    filePath: string;
    sourceKind: BridgeSessionSurfaceKind;
    sourceLabel: string;
    updatedAt: number;
  },
): BambuCloudSessionCandidate | null {
  const accessToken = readString(record, ["access_token", "accessToken"]);
  const refreshToken = readString(record, ["refresh_token", "refreshToken"]);
  if (!accessToken || !refreshToken) {
    return null;
  }

  const accessExpiresAt = epochFromMaybeSeconds(
    readNumber(record, [
      "access_expires_at",
      "accessExpiresAt",
      "accessTokenExpiresAt",
    ]),
  );
  const refreshExpiresAt = epochFromMaybeSeconds(
    readNumber(record, [
      "refresh_expires_at",
      "refreshExpiresAt",
      "refreshTokenExpiresAt",
    ]),
  );

  return {
    accessExpiresAt,
    accessToken,
    location: meta.filePath,
    refreshExpiresAt,
    refreshToken,
    region: normalizeRegion(
      readString(record, ["region", "region_code", "country", "countryCode"]),
    ),
    sourceKind: meta.sourceKind,
    sourceLabel: meta.sourceLabel,
    updatedAt: meta.updatedAt,
    userEmail: readString(record, ["user_email", "userEmail", "account"]),
    userId: normalizeUserId(
      readString(record, ["user_id", "userId", "uidStr", "uid", "account_id"]),
    ),
  };
}

function visitSessionCandidates(
  value: unknown,
  meta: {
    filePath: string;
    sourceKind: BridgeSessionSurfaceKind;
    sourceLabel: string;
    updatedAt: number;
  },
  output: BambuCloudSessionCandidate[],
) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      visitSessionCandidates(entry, meta, output);
    }
    return;
  }

  const record = value as Record<string, unknown>;
  const candidate = maybeSessionCandidate(record, meta);
  if (candidate) {
    output.push(candidate);
  }

  for (const nested of Object.values(record)) {
    if (nested && typeof nested === "object") {
      visitSessionCandidates(nested, meta, output);
    }
  }
}

function sessionCacheKey(candidate: BambuCloudSessionCandidate): string {
  return [
    candidate.sourceKind,
    candidate.userId ?? "unknown-user",
    candidate.location,
  ].join(":");
}

function sessionIsAccessValid(session: BambuCloudSessionCandidate): boolean {
  if (!session.accessToken) {
    return false;
  }
  if (!session.accessExpiresAt) {
    return true;
  }

  return session.accessExpiresAt - Math.floor(Date.now() / 1000) >
    SESSION_REFRESH_SLACK_SECONDS;
}

function sessionIsRefreshValid(session: BambuCloudSessionCandidate): boolean {
  if (!session.refreshToken) {
    return false;
  }
  if (!session.refreshExpiresAt) {
    return true;
  }

  return session.refreshExpiresAt - Math.floor(Date.now() / 1000) >
    SESSION_REFRESH_SLACK_SECONDS;
}

function cloudApiHost(region: string): string {
  return normalizeRegion(region) === "CN"
    ? "https://api.bambulab.cn"
    : "https://api.bambulab.com";
}

function cloudMqttHost(region: string): string {
  return normalizeRegion(region) === "CN"
    ? "cn.mqtt.bambulab.com"
    : "us.mqtt.bambulab.com";
}

function normalizeModel(value: string | null): string {
  if (!value) {
    return "Bambu Printer";
  }

  return value.trim().replace(/^3dprinter[-_\s]*/i, "").replace(/-ams\d*$/i, "");
}

function normalizeSerial(value: string | null): string {
  return value?.trim().toUpperCase() ?? "";
}

function capabilityEnvelope(input: {
  cameraReady: boolean;
  handoffLabel: string;
  handoffReady: boolean;
  name: string;
}): Pick<CompanionPrinter, "capabilities" | "capabilityNotes"> {
  const cameraDetail = input.cameraReady
    ? "Companion can auto-bridge this printer's native camera feed from the signed-in desktop session."
    : "Companion will auto-bridge the native camera feed as soon as this machine can also reach the printer on the same local network.";

  return {
    capabilities: {
      ams: "available",
      camera: input.cameraReady ? "available" : "unavailable",
      controls: "unavailable",
      discovery: "available",
      fileUpload: input.handoffReady ? "available" : "unavailable",
      slicingAssist: input.handoffReady ? "available" : "unavailable",
      telemetry: "available",
    },
    capabilityNotes: {
      ams: "AMS and filament status ride on the same Bambu cloud report stream as telemetry.",
      camera: cameraDetail,
      controls:
        "This printer is currently using the Companion cloud bridge for telemetry, camera, and job handoff. Direct machine controls stay on the BambuView server's LAN and Developer workflows.",
      discovery:
        "This printer came from the signed-in Bambu desktop bridge on this machine, not a manual LAN-only profile.",
      fileUpload: input.handoffReady
        ? `Companion can hand sliced jobs to ${input.handoffLabel} on this machine.`
        : "Install or sign into Bambu Connect or Bambu Studio on this machine to unlock one-click job handoff from BambuView.",
      slicingAssist: input.handoffReady
        ? `Prepared jobs can already route through ${input.handoffLabel} from this Companion install.`
        : "Install or sign into Bambu Connect or Bambu Studio on this machine before using this printer as a send target from BambuView.",
      telemetry: `${input.name} can use the signed-in Bambu desktop session for live cloud telemetry without storing LAN credentials in Companion.`,
    },
  };
}

function matchCloudDevice(
  printer: Pick<CompanionPrinterInput, "hostname" | "model" | "name" | "serial">,
  devices: BambuCloudDeviceRecord[],
): BambuCloudDeviceRecord | null {
  const serial = normalizeSerial(printer.serial);
  if (serial) {
    return devices.find((device) => device.serial === serial) ?? null;
  }

  const exactName = printer.name.trim().toLowerCase();
  if (exactName) {
    const byName = devices.filter(
      (device) => device.label.trim().toLowerCase() === exactName,
    );
    if (byName.length === 1) {
      return byName[0];
    }
  }

  const model = printer.model.trim().toLowerCase();
  if (exactName && model) {
    const byNameAndModel = devices.filter(
      (device) =>
        device.label.trim().toLowerCase() === exactName &&
        device.model.trim().toLowerCase() === model,
    );
    if (byNameAndModel.length === 1) {
      return byNameAndModel[0];
    }
  }

  if (devices.length === 1) {
    return devices[0];
  }

  return null;
}

function sessionRoots(): SessionSurfaceDefinition[] {
  return sessionSurfaceDefinitions();
}

function scanDesktopSessions(): BambuCloudSessionCandidate[] {
  const sessions = new Map<string, BambuCloudSessionCandidate>();

  for (const definition of sessionRoots()) {
    for (const root of dedupePaths(definition.configLocations)) {
      if (!existsSync(root)) {
        continue;
      }

      const files = collectJsonFiles(root);
      for (const file of files) {
        let size = 0;
        try {
          size = statSync(file).size;
        } catch {
          continue;
        }

        if (size <= 0 || size > MAX_SCAN_BYTES) {
          continue;
        }

        let contents = "";
        try {
          contents = readFileSync(file, "utf8");
        } catch {
          continue;
        }

        if (!contents.includes("accessToken") && !contents.includes("access_token")) {
          continue;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(contents);
        } catch {
          continue;
        }

        const found: BambuCloudSessionCandidate[] = [];
        visitSessionCandidates(
          parsed,
          {
            filePath: file,
            sourceKind: definition.kind,
            sourceLabel: definition.label,
            updatedAt: statSync(file).mtimeMs,
          },
          found,
        );

        for (const session of found) {
          const key = sessionCacheKey(session);
          const existing = sessions.get(key);
          if (!existing || existing.updatedAt < session.updatedAt) {
            sessions.set(key, session);
          }
        }
      }
    }
  }

  return [...sessions.values()].sort((left, right) => right.updatedAt - left.updatedAt);
}

export function inspectBambuCloudBridgeEnvironment(): BambuCloudBridgeEnvironment {
  const inventory = inspectLocalBridgeInventory();
  const connectInstalled = inventory.surfaces.some(
    (surface) => surface.kind === "bambu-connect" && surface.status !== "missing",
  );
  const studioInstalled = inventory.surfaces.some(
    (surface) => surface.kind === "bambu-studio" && surface.status !== "missing",
  );
  const networkPluginInstalled = inventory.surfaces.some(
    (surface) => surface.kind === "network-plugin" && surface.status !== "missing",
  );
  const sessions = scanDesktopSessions();

  return {
    connectInstalled,
    networkPluginInstalled,
    sessionCount: sessions.length,
    sessions,
    studioInstalled,
  };
}

async function ensureSessionUserId(
  session: BambuCloudSessionCandidate,
): Promise<ResolvedBambuCloudSession> {
  if (session.userId) {
    return session as ResolvedBambuCloudSession;
  }

  const response = await fetch(`${cloudApiHost(session.region)}/v1/user-service/my/profile`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${session.accessToken}`,
    },
    method: "GET",
    signal: timeoutSignal(CLOUD_API_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Bambu profile lookup returned HTTP ${response.status}.`,
    );
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const userId =
    normalizeUserId(
      typeof payload.uidStr === "string"
        ? payload.uidStr
        : typeof payload.uid === "number"
          ? String(payload.uid)
          : typeof payload.uid === "string"
            ? payload.uid
            : null,
    ) ?? null;

  if (!userId) {
    throw new Error("The Bambu desktop session did not include a usable user id.");
  }

  return {
    ...session,
    userEmail: session.userEmail ?? (typeof payload.account === "string" ? payload.account : null),
    userId,
  };
}

async function refreshSessionIfNeeded(
  session: BambuCloudSessionCandidate,
): Promise<BambuCloudSessionCandidate> {
  if (sessionIsAccessValid(session)) {
    return session;
  }

  if (!sessionIsRefreshValid(session)) {
    return session;
  }

  const response = await fetch(
    `${cloudApiHost(session.region)}/v1/user-service/user/refreshtoken`,
    {
      body: JSON.stringify({
        refreshToken: session.refreshToken,
      }),
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      method: "POST",
      signal: timeoutSignal(CLOUD_API_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    return session;
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const accessToken =
    typeof payload.accessToken === "string" && payload.accessToken.trim().length > 0
      ? payload.accessToken.trim()
      : session.accessToken;
  const refreshToken =
    typeof payload.refreshToken === "string" && payload.refreshToken.trim().length > 0
      ? payload.refreshToken.trim()
      : session.refreshToken;
  const nowEpoch = Math.floor(Date.now() / 1000);
  const expiresIn =
    typeof payload.expiresIn === "number"
      ? payload.expiresIn
      : typeof payload.expiresIn === "string"
        ? Number(payload.expiresIn)
        : null;
  const refreshExpiresIn =
    typeof payload.refreshExpiresIn === "number"
      ? payload.refreshExpiresIn
      : typeof payload.refreshExpiresIn === "string"
        ? Number(payload.refreshExpiresIn)
        : null;

  return {
    ...session,
    accessExpiresAt:
      expiresIn && Number.isFinite(expiresIn) ? nowEpoch + expiresIn : session.accessExpiresAt,
    accessToken,
    refreshExpiresAt:
      refreshExpiresIn && Number.isFinite(refreshExpiresIn)
        ? nowEpoch + refreshExpiresIn
        : session.refreshExpiresAt,
    refreshToken,
  };
}

function parseCloudDevices(payload: unknown): BambuCloudDeviceRecord[] {
  const root = asRecord(payload);
  const maybeDevices = Array.isArray(root.devices)
    ? root.devices
    : Array.isArray(asRecord(root.data).devices)
      ? (asRecord(root.data).devices as unknown[])
      : [];

  const devices: BambuCloudDeviceRecord[] = [];
  for (const entry of maybeDevices) {
    const record = asRecord(entry);
    const serial = normalizeSerial(
      readString(record, ["dev_id", "devId", "serial", "sn", "device_id"]),
    );
    if (!serial) {
      continue;
    }

    const model = normalizeModel(
      readString(record, [
        "dev_product_name",
        "dev_model_name",
        "model",
        "machine_model",
      ]),
    );
    const label =
      readString(record, ["dev_name", "name", "nickname", "alias"]) ??
      `${model} ${serial.slice(-4)}`;
    const onlineValue = record.dev_online ?? record.online;
    const online =
      onlineValue === true ||
      onlineValue === 1 ||
      onlineValue === "1" ||
      onlineValue === "true";
    const statusLabel =
      readString(record, ["task_status", "print_status"]) ??
      (online ? "Connected" : "Offline");

    devices.push({
      accessCode:
        readString(record, ["dev_access_code", "accessCode", "access_code"]) ??
        null,
      label,
      model,
      online,
      raw: record,
      serial,
      statusLabel,
    });
  }

  return devices;
}

async function fetchCloudDevices(
  session: ResolvedBambuCloudSession,
): Promise<{ devices: BambuCloudDeviceRecord[]; session: ResolvedBambuCloudSession }> {
  const cacheKey = `${session.sourceKind}:${session.userId}:${session.location}`;
  const cached = cloudDeviceCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { devices: cached.devices, session: cached.session };
  }

  let working = await refreshSessionIfNeeded(session);
  let resolved = await ensureSessionUserId(working);

  const endpoints = [
    "/v1/iot-service/api/user/print?force=true",
    "/v1/iot-service/api/user/bind",
  ];

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${cloudApiHost(resolved.region)}${endpoint}`, {
          headers: {
            accept: "application/json",
            authorization: `Bearer ${resolved.accessToken}`,
          },
          method: "GET",
          signal: timeoutSignal(CLOUD_API_TIMEOUT_MS),
        });

        if (response.status === 401 && attempt === 0) {
          working = await refreshSessionIfNeeded(resolved);
          resolved = await ensureSessionUserId(working);
          break;
        }

        if (!response.ok) {
          lastError = new Error(
            `Bambu cloud device lookup returned HTTP ${response.status}.`,
          );
          continue;
        }

        const devices = parseCloudDevices(await response.json());
        cloudDeviceCache.set(cacheKey, {
          devices,
          expiresAt: Date.now() + 15_000,
          session: resolved,
        });
        return { devices, session: resolved };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Device lookup failed.");
      }
    }
  }

  throw lastError ?? new Error("Bambu cloud device lookup failed.");
}

async function getLanDiscoveryPrinters(): Promise<
  CompanionPrinterDiscoveryResult["printers"]
> {
  if (lanDiscoveryCache && lanDiscoveryCache.expiresAt > Date.now()) {
    return lanDiscoveryCache.printers;
  }

  const discovery = await discoverBambuPrinters();
  lanDiscoveryCache = {
    expiresAt: Date.now() + LOCAL_DISCOVERY_CACHE_MS,
    printers: discovery.printers,
  };
  return discovery.printers;
}

async function resolveCloudPrinter(
  printer: Pick<
    CompanionPrinterInput,
    "connectionMode" | "hostname" | "model" | "name" | "serial"
  >,
): Promise<ResolvedBambuCloudPrinter> {
  const environment = inspectBambuCloudBridgeEnvironment();
  if (environment.sessions.length === 0) {
    throw new Error(
      "Sign into Bambu Connect or Bambu Studio on this machine before using the Companion cloud bridge.",
    );
  }

  let matched:
    | {
        device: BambuCloudDeviceRecord;
        session: ResolvedBambuCloudSession;
      }
    | null = null;

  for (const candidate of environment.sessions) {
    const preferred =
      printer.connectionMode === "bambu-connect"
        ? candidate.sourceKind === "bambu-connect"
        : true;
    if (!preferred && environment.sessions.some((session) => session.sourceKind === "bambu-connect")) {
      continue;
    }

    const { devices, session } = await fetchCloudDevices(
      (await ensureSessionUserId(candidate)) as ResolvedBambuCloudSession,
    );
    const device = matchCloudDevice(printer, devices);
    if (device) {
      matched = { device, session };
      break;
    }
  }

  if (!matched) {
    throw new Error(
      "Companion could not match this saved printer to the signed-in Bambu desktop account. Add it from discovery or use the exact printer name shown in the desktop Bambu app.",
    );
  }

  let host = printer.hostname.trim() || null;
  if (!host) {
    const discovered = await getLanDiscoveryPrinters();
    const match = discovered.find(
      (candidate) =>
        candidate.serial.trim().toUpperCase() === matched.device.serial ||
        candidate.name.trim().toLowerCase() === matched.device.label.trim().toLowerCase(),
    );
    host = match?.hostname?.trim() || null;
  }

  return {
    device: matched.device,
    environment,
    host,
    session: matched.session,
  };
}

export async function discoverBambuCloudPrinters(
  options: {
    includeLanReachability?: boolean;
  } = {},
): Promise<CompanionPrinterDiscoveryResult> {
  const attemptedAt = new Date().toISOString();
  const environment = inspectBambuCloudBridgeEnvironment();
  const includeLanReachability = options.includeLanReachability !== false;

  if (environment.sessions.length === 0) {
    return {
      attemptedAt,
      bridgeSources: inspectLocalBridgeInventory().surfaces,
      detail:
        "Companion did not find a signed-in Bambu desktop session on this machine yet.",
      instructions: [
        "Install and sign into Bambu Connect or Bambu Studio on the same machine as Companion.",
        "After sign-in, run discovery again and Companion will import your cloud-mode printers automatically.",
        "Camera auto-bridge does not need manual LAN fields. Companion fills reachability in automatically when this machine can also see the printer.",
      ],
      printers: [],
      supported: true,
    };
  }

  const printersBySerial = new Map<string, CompanionPrinter>();
  const discoveredLan = includeLanReachability
    ? await getLanDiscoveryPrinters()
    : [];

  const handoffReady = desktopBridgeHandoffReady(environment);
  const handoffLabel = desktopBridgeHandoffLabel(environment);

  for (const candidate of environment.sessions) {
    try {
      const { devices } = await fetchCloudDevices(
        (await ensureSessionUserId(candidate)) as ResolvedBambuCloudSession,
      );

      for (const device of devices) {
        if (printersBySerial.has(device.serial)) {
          continue;
        }

        const hostMatch = discoveredLan.find(
          (printer) => printer.serial.trim().toUpperCase() === device.serial,
        );
        const cameraReady = Boolean(
          cameraBridgeReady() &&
            hostMatch?.hostname &&
            device.accessCode &&
            resolvePrinterCameraBridgeSource({
              accessCode: device.accessCode,
              connectionMode:
                candidate.sourceKind === "bambu-connect"
                  ? "bambu-connect"
                  : "cloud",
              hostname: hostMatch.hostname,
              model: device.model,
              name: device.label,
              provider: "bambu-lab",
              serial: device.serial,
              streamId: null,
            }),
        );

        printersBySerial.set(device.serial, {
          accessCodeSet: Boolean(device.accessCode),
          ...capabilityEnvelope({
            cameraReady,
            handoffLabel,
            handoffReady,
            name: device.label,
          }),
          connectionMode: "cloud",
          createdAt: attemptedAt,
          hostname: hostMatch?.hostname ?? "",
          id: `cloud:${device.serial}`,
          lastSeenAt: attemptedAt,
          lastTestedAt: null,
          model: device.model,
          name: device.label,
          notes: `Imported from the signed-in ${candidate.sourceLabel} session on this machine.`,
          provider: "bambu-lab",
          serial: device.serial,
          streamId: null,
          updatedAt: attemptedAt,
        });
      }
    } catch {
      // Ignore a single stale desktop session and continue with others.
    }
  }

  return {
    attemptedAt,
    bridgeSources: inspectLocalBridgeInventory().surfaces,
    detail:
      printersBySerial.size > 0
        ? `Companion found ${printersBySerial.size} cloud-mode Bambu printer${printersBySerial.size === 1 ? "" : "s"} from the signed-in desktop bridge on this machine.`
        : "Companion found a signed-in Bambu desktop session, but it did not return any printers for this account yet.",
    instructions: [
      "Pick a discovered printer to save it without typing a hostname, serial number, or LAN access code.",
      "Telemetry comes from the signed-in Bambu desktop session automatically.",
      "Companion also auto-fills native camera reachability whenever this machine can see the printer on the same local network.",
    ],
    printers: [...printersBySerial.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    supported: true,
  };
}

export async function resolveBambuCloudCameraSource(
  printer: CompanionPrinterInput,
): Promise<CameraBridgeSource | null> {
  try {
    const resolved = await resolveCloudPrinter(printer);
    if (!resolved.host || !resolved.device.accessCode) {
      return null;
    }

    return (
      resolvePrinterCameraBridgeSource({
        accessCode: resolved.device.accessCode,
        connectionMode: printer.connectionMode,
        hostname: resolved.host,
        model: printer.model || resolved.device.model,
        name: printer.name || resolved.device.label,
        provider: printer.provider,
        serial: printer.serial || resolved.device.serial,
        streamId: printer.streamId ?? null,
      }) ?? null
    );
  } catch {
    return null;
  }
}

export async function readBambuCloudTelemetry(
  printer: CompanionPrinterInput,
): Promise<CompanionPrinterTelemetry> {
  const checkedAt = new Date().toISOString();

  try {
    const resolved = await resolveCloudPrinter(printer);
    const payload = await fetchCloudTelemetryPayload(resolved);
    const telemetry = mapTelemetry(parseTelemetry(payload), checkedAt);

    return {
      ...telemetry,
      message: `${telemetry.state} over the Companion cloud bridge.`,
    };
  } catch (error) {
    return {
      amsState: null,
      available: false,
      bedTargetTemperature: null,
      bedTemperature: null,
      chamberTargetTemperature: null,
      chamberTemperature: null,
      checkedAt,
      elapsedMinutes: null,
      eta: null,
      fanState: null,
      fileName: null,
      firmwareVersion: null,
      layerCurrent: null,
      layerTotal: null,
      message:
        error instanceof Error
          ? error.message
          : "Companion could not read the Bambu cloud telemetry stream.",
      nozzleTargetTemperature: null,
      nozzleTemperature: null,
      printStatus: "offline",
      progress: null,
      readiness: "unknown",
      remainingMinutes: null,
      slots: [],
      state: "cloud-unavailable",
      warnings: ["The Companion cloud telemetry request failed."],
    };
  }
}

async function fetchCloudTelemetryPayload(
  resolved: ResolvedBambuCloudPrinter,
): Promise<unknown> {
  const { device, session } = resolved;
  const reportTopic = buildMqttTopic(device.serial, "report");
  const requestTopic = buildMqttTopic(device.serial, "request");

  return new Promise((resolve, reject) => {
    let settled = false;
    let connected = false;
    let buffered = Buffer.alloc(0);
    const mqttHost = cloudMqttHost(session.region);
    const socket = tls.connect({
      host: mqttHost,
      port: CLOUD_MQTT_PORT,
      rejectUnauthorized: true,
      servername: mqttHost,
    });

    const finish = (payload: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      socket.removeAllListeners();
      socket.destroy();
      resolve(payload);
    };

    const fail = (message: string) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      socket.removeAllListeners();
      socket.destroy();
      reject(new Error(message));
    };

    const timeout = setTimeout(() => {
      fail(
        connected
          ? "The Bambu cloud bridge did not publish a telemetry report before the timeout."
          : "The Bambu cloud bridge did not accept the desktop session before the timeout.",
      );
    }, CLOUD_REPORT_TIMEOUT_MS);

    socket.once("secureConnect", () => {
      socket.write(
        createConnectPacket({
          clientId: `u_${session.userId}_${Math.random().toString(16).slice(2, 10)}`,
          password: session.accessToken,
          username: `u_${session.userId}`,
        }),
      );
    });

    socket.on("data", (chunk) => {
      const packetChunk =
        typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      buffered = Buffer.concat([buffered, packetChunk]);

      while (buffered.length > 0) {
        const parsed = shiftMqttPacket(buffered);
        if (!parsed) {
          return;
        }

        buffered = parsed.remaining;
        if (parsed.type === 2) {
          const returnCode = parsed.packet[1];
          if (returnCode !== 0) {
            fail("The Bambu cloud broker rejected the signed-in desktop session.");
            return;
          }

          connected = true;
          socket.write(createSubscribePacket(reportTopic));
          socket.write(
            createPublishPacket(
              requestTopic,
              JSON.stringify({
                pushing: {
                  command: "pushall",
                  sequence_id: String(Date.now()),
                  version: 1,
                },
              }),
            ),
          );
          continue;
        }

        if (parsed.type === 3) {
          const payload = getPublishPayload(parsed.packet, parsed.flags);
          if (!payload) {
            continue;
          }

          try {
            const decoded = JSON.parse(payload) as Record<string, unknown>;
            const printRoot = asRecord(decoded.print ?? decoded);
            const serial =
              normalizeSerial(
                readString(printRoot, ["dev_id", "serial", "sn", "device_id"]),
              ) || device.serial;

            if (serial !== device.serial) {
              continue;
            }

            finish(decoded);
          } catch {
            // Ignore malformed packets and keep waiting for the next report.
          }
        }
      }
    });

    socket.once("timeout", () => {
      fail("The Bambu cloud broker timed out before returning telemetry.");
    });
    socket.once("error", () => {
      fail("Companion could not connect to the Bambu cloud telemetry broker.");
    });
  });
}

export async function testBambuCloudPrinter(
  printer: CompanionPrinterInput,
): Promise<CompanionPrinterTestResult> {
  const checkedAt = new Date().toISOString();

  try {
    const resolved = await resolveCloudPrinter(printer);
    const cameraSource = await resolveBambuCloudCameraSource(printer);
    const cameraSupport = nativeBambuBridgeSupport(printer.model || resolved.device.model);
    const handoffReady = desktopBridgeHandoffReady(resolved.environment);
    const handoffLabel = desktopBridgeHandoffLabel(resolved.environment);

    const capabilities: CompanionCapabilityFlags = {
      ams: "available",
      camera: cameraSource ? "available" : "unavailable",
      controls: "unavailable",
      discovery: "available",
      fileUpload: handoffReady ? "available" : "unavailable",
      slicingAssist: handoffReady ? "available" : "unavailable",
      telemetry: "available",
    };
    const capabilityNotes: CompanionCapabilityNotes = {
      ams: "AMS state follows the same Bambu cloud report used for live telemetry.",
      camera: cameraSource
        ? "Companion can bridge the native Bambu camera from the signed-in desktop session."
        : cameraSupport.supported
          ? "Companion matched this cloud-mode printer and will open the native camera feed automatically once this machine can also reach the printer on the same local network."
          : cameraSupport.detail,
      controls:
        "Companion focuses on cloud telemetry, camera bridging, and desktop job handoff. Direct machine controls stay on the BambuView server's LAN and Developer workflows.",
      discovery:
        "Companion matched this printer against the signed-in Bambu desktop session on this machine.",
      fileUpload: handoffReady
        ? `Companion can hand sliced jobs to ${handoffLabel} on this machine.`
        : "Install or sign into Bambu Connect or Bambu Studio on this machine to unlock one-click job handoff from BambuView.",
      slicingAssist: handoffReady
        ? `Prepared jobs can route through ${handoffLabel} from this Companion install.`
        : "Install or sign into Bambu Connect or Bambu Studio before using this printer as a send target from BambuView.",
      telemetry:
        "Live telemetry can be requested through the signed-in Bambu desktop session without saving LAN credentials in Companion.",
    };

    return {
      capabilities,
      capabilityNotes,
      checkedAt,
      message: `Matched ${resolved.device.label} through ${resolved.session.sourceLabel}.`,
      reachable: true,
    };
  } catch (error) {
    return {
      capabilities: {
        ams: "requires_setup",
        camera: "requires_setup",
        controls: "unavailable",
        discovery: "available",
        fileUpload: "requires_setup",
        slicingAssist: "requires_setup",
        telemetry: "requires_setup",
      },
      capabilityNotes: {
        camera:
          "Sign into Bambu Connect or Bambu Studio on this machine first, then Companion can auto-match cloud-mode printers.",
        controls:
          "Companion cloud mode does not expose direct machine-control commands in this revision.",
        fileUpload:
          "Install or sign into Bambu Connect or Bambu Studio on this machine before using cloud-mode job handoff.",
        slicingAssist:
          "Sign into a supported Bambu desktop bridge first, then retry the printer test.",
        telemetry:
          "Sign into Bambu Connect or Bambu Studio on this machine before requesting cloud telemetry.",
      },
      checkedAt,
      message:
        error instanceof Error
          ? error.message
          : "Companion could not validate the Bambu cloud bridge for this printer.",
      reachable: false,
    };
  }
}
