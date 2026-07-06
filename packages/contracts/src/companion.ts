export const COMPANION_APP_NAME = "BambuView Companion";
export const COMPANION_BRIDGE_USERNAME = "companion";
export const COMPANION_DEFAULT_HOST = "localhost";
export const COMPANION_DEFAULT_PORT = 41738;

export type CompanionBridgeBindMode = "localhost" | "lan";

export type CompanionStatusTone =
  | "not-paired"
  | "paired"
  | "streaming"
  | "warning"
  | "error";

export type CompanionCapabilityState =
  | "available"
  | "unavailable"
  | "requires_setup"
  | "requires_restream"
  | "requires_developer_mode"
  | "future"
  | "unsupported";

export interface CompanionCapabilityFlags {
  discovery: CompanionCapabilityState;
  telemetry: CompanionCapabilityState;
  camera: CompanionCapabilityState;
  controls: CompanionCapabilityState;
  fileUpload: CompanionCapabilityState;
  ams: CompanionCapabilityState;
  slicingAssist: CompanionCapabilityState;
}

export interface CompanionCapabilityNotes {
  discovery?: string;
  telemetry?: string;
  camera?: string;
  controls?: string;
  fileUpload?: string;
  ams?: string;
  slicingAssist?: string;
}

export interface CompanionBridgeSettings {
  bindMode: CompanionBridgeBindMode;
  host: string;
  port: number;
  suggestedPort: number | null;
  baseUrl: string;
}

export interface CompanionPairingState {
  paired: boolean;
  companionId: string | null;
  companionName: string;
  pairedAt: string | null;
  serverUrl: string | null;
}

export interface CompanionHealthResponse {
  appName: string;
  appVersion: string;
  bridge: CompanionBridgeSettings;
  pairing: CompanionPairingState;
  status: CompanionStatusTone;
  capabilities: CompanionCapabilityFlags;
  capabilityNotes: CompanionCapabilityNotes;
  warnings: string[];
}

export type CompanionPrinterProvider = "bambu-lab";

export type CompanionPrinterConnectionMode =
  | "cloud"
  | "bambu-connect"
  | "lan"
  | "developer";

export interface CompanionPrinterInput {
  accessCode?: string;
  connectionMode: CompanionPrinterConnectionMode;
  hostname: string;
  model: string;
  name: string;
  notes?: string;
  provider: CompanionPrinterProvider;
  serial: string;
  streamId?: string | null;
}

export interface CompanionPrinter {
  id: string;
  name: string;
  provider: CompanionPrinterProvider;
  model: string;
  hostname: string;
  serial: string;
  connectionMode: CompanionPrinterConnectionMode;
  notes: string;
  streamId: string | null;
  accessCodeSet: boolean;
  capabilities: CompanionCapabilityFlags;
  capabilityNotes: CompanionCapabilityNotes;
  lastSeenAt: string | null;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanionPrinterDiscoveryResult {
  attemptedAt: string;
  instructions: string[];
  detail: string;
  printers: CompanionPrinter[];
  supported: boolean;
}

export interface CompanionPrinterTelemetrySlot {
  slot: string;
  material: string;
  color: string | null;
  colorName: string | null;
  active: boolean;
}

export interface CompanionPrinterTelemetry {
  available: boolean;
  checkedAt: string;
  elapsedMinutes: number | null;
  eta: string | null;
  fanState: string | null;
  fileName: string | null;
  firmwareVersion: string | null;
  layerCurrent: number | null;
  layerTotal: number | null;
  message: string;
  nozzleTemperature: number | null;
  nozzleTargetTemperature: number | null;
  bedTemperature: number | null;
  bedTargetTemperature: number | null;
  chamberTemperature: number | null;
  chamberTargetTemperature: number | null;
  printStatus: "printing" | "paused" | "idle" | "offline";
  progress: number | null;
  readiness: "ready" | "busy" | "offline" | "unknown";
  remainingMinutes: number | null;
  state: string;
  warnings: string[];
  amsState: string | null;
  slots: CompanionPrinterTelemetrySlot[];
}

export interface CompanionPrinterTestResult {
  checkedAt: string;
  capabilities: CompanionCapabilityFlags;
  capabilityNotes: CompanionCapabilityNotes;
  message: string;
  reachable: boolean;
}

export type CompanionCommandAction =
  | "pause"
  | "resume"
  | "cancel"
  | "home"
  | "move"
  | "temperature"
  | "fan"
  | "lamp"
  | "ams";

export interface CompanionPrinterCommandRequest {
  action: CompanionCommandAction;
  args?: Record<string, string | number | boolean | null>;
}

export interface CompanionPrinterCommandResponse {
  accepted: boolean;
  detail: string;
}

export interface CompanionFileHandoffInput {
  action?: "open" | "reveal" | "stage";
  path: string;
}

export interface CompanionFileHandoffResult {
  accepted: boolean;
  detail: string;
  fileName: string | null;
  sizeBytes: number | null;
}

export type CompanionStreamSourceKind =
  | "mjpeg"
  | "snapshot"
  | "hls"
  | "rtsp"
  | "bambu-native";

export type CompanionStreamOutputKind =
  | "mjpeg"
  | "snapshot"
  | "hls"
  | "unavailable";

export interface CompanionStreamInput {
  linkedPrinterId?: string | null;
  name: string;
  password?: string;
  sourceKind: CompanionStreamSourceKind;
  upstreamUrl: string;
  username?: string;
}

export interface CompanionStream {
  id: string;
  name: string;
  sourceKind: CompanionStreamSourceKind;
  outputKind: CompanionStreamOutputKind;
  upstreamUrl: string;
  linkedPrinterId: string | null;
  status: "online" | "degraded" | "offline";
  details: string;
  snapshotPath: string | null;
  mjpegPath: string | null;
  hlsPath: string | null;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanionLogEntry {
  id: string;
  level: "info" | "warn" | "error";
  message: string;
  createdAt: string;
}

export interface CompanionSettings {
  accentColor: string;
  bindMode: CompanionBridgeBindMode;
  checkForUpdatesOnLaunch: boolean;
  friendlyName: string;
  host: string;
  port: number;
  themeMode: "dark" | "light";
  updateCheckIntervalMinutes: number;
}

export interface CompanionUpdateState {
  assetName: string | null;
  assetUrl: string | null;
  available: boolean;
  downloadedAt: string | null;
  downloadedFileName: string | null;
  downloadedFilePath: string | null;
  lastCheckedAt: string | null;
  latestVersion: string | null;
  message: string | null;
  releaseName: string | null;
  releaseUrl: string | null;
  status:
    | "idle"
    | "checking"
    | "downloading"
    | "available"
    | "current"
    | "error";
}

export interface CompanionSnapshot {
  health: CompanionHealthResponse;
  logs: CompanionLogEntry[];
  pairing: CompanionPairingState;
  printers: CompanionPrinter[];
  settings: CompanionSettings;
  streams: CompanionStream[];
  update: CompanionUpdateState;
}

export interface CompanionPairingCode {
  code: string;
  createdAt: string;
  expiresAt: string;
  id: string;
}

export interface CompanionPairingRequest {
  baseUrl: string;
  bridgeToken: string;
  capabilities: CompanionCapabilityFlags;
  capabilityNotes: CompanionCapabilityNotes;
  companionName: string;
  pairingToken: string;
}

export interface CompanionRegistration {
  id: string;
  name: string;
  baseUrl: string;
  bridgeUsername: string;
  tokenSet: boolean;
  status: "online" | "degraded" | "offline";
  lastHealthAt: string | null;
  lastError: string | null;
  capabilities: CompanionCapabilityFlags;
  capabilityNotes: CompanionCapabilityNotes;
  pairedAt: string;
  createdAt: string;
  updatedAt: string;
  printerCount: number;
  streamCount: number;
}

export interface CompanionConnectionSnapshot {
  companion: CompanionRegistration;
  health: CompanionHealthResponse | null;
  printers: CompanionPrinter[];
  streams: CompanionStream[];
}
