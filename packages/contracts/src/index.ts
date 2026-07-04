export type UserRole = "admin" | "operator" | "viewer";

export type BackgroundStyle =
  | "topo"
  | "two-tone"
  | "blueprint"
  | "sweep"
  | "plain";

export type ThemeMode = "dark" | "light";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: "active" | "invited";
  createdAt: string;
}

export interface AppearanceSettings {
  mode: ThemeMode;
  darkHighlight: string;
  darkBackground: string;
  lightHighlight: string;
  lightBackground: string;
  backgroundStyle: BackgroundStyle;
}

export interface AuthSession {
  authenticated: boolean;
  bootstrapRequired: boolean;
  user: UserProfile | null;
  appearance: AppearanceSettings | null;
}

export interface InviteRecord {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  createdBy: string;
  inviteUrl: string;
}

export interface FleetStats {
  printers: number;
  activePrints: number;
  completedToday: number;
  farmGroups: number;
}

export interface PrinterMaterialSlot {
  slot: string;
  label: string;
  color: string;
  colorName?: string;
  material: string;
  active: boolean;
}

export interface PrinterSummary {
  id: string;
  shortCode: string;
  name: string;
  status: "printing" | "paused" | "idle" | "offline";
  statusLabel: string;
  telemetryMessage?: string;
  telemetryState?: "live" | "pending" | "limited" | "offline";
  progress: number;
  layer: string;
  eta: string;
  elapsed: string;
  fileName: string;
  location: string;
  material: string;
  materialColor: string;
  nozzleProfile: string;
  cameraLabel: string;
  previewKind: "bracket" | "benchy" | "dino" | "housing" | "farm";
  slots: PrinterMaterialSlot[];
}

export interface PrinterTemperature {
  label: string;
  current: string;
  target: string;
}

export interface PrinterCameraFeed {
  id: string;
  label: string;
  kind: "printer" | "ams" | "enclosure" | "overview";
  snapshotUrl: string | null;
  sourceId: string | null;
  status: "online" | "degraded" | "offline";
  streamKind:
    | "mjpeg"
    | "snapshot"
    | "hls"
    | "rtsp"
    | "bambu-native"
    | "unknown";
  streamUrl: string | null;
}

export interface PrinterDetail extends PrinterSummary {
  serial: string;
  ipAddress: string;
  firmwareVersion: string;
  temperatures: PrinterTemperature[];
  filamentRemaining: string;
  filamentUsed: string;
  printTimeRemaining: string;
  cameraFeeds: PrinterCameraFeed[];
  selectedCameraFeedId: string;
}

export type PrinterConnectionProvider = "bambu-lan";

export type BambuConnectionMode =
  | "cloud"
  | "bambu-connect"
  | "lan"
  | "developer";

export type BambuPrinterFamily = "H2" | "X2" | "P2" | "X1" | "P1" | "A2" | "A1";

export interface BambuPrinterModel {
  family: BambuPrinterFamily;
  label: string;
  value: string;
}

export const BAMBU_PRINTER_MODELS = [
  { family: "H2", label: "H2D", value: "H2D" },
  { family: "H2", label: "H2D Pro", value: "H2D Pro" },
  { family: "H2", label: "H2S", value: "H2S" },
  { family: "H2", label: "H2C", value: "H2C" },
  { family: "X2", label: "X2D", value: "X2D" },
  { family: "P2", label: "P2S", value: "P2S" },
  { family: "A2", label: "A2L", value: "A2L" },
  { family: "X1", label: "X1 Carbon", value: "X1 Carbon" },
  { family: "X1", label: "X1E", value: "X1E" },
  { family: "P1", label: "P1S", value: "P1S" },
  { family: "P1", label: "P1P", value: "P1P" },
  { family: "A1", label: "A1", value: "A1" },
  { family: "A1", label: "A1 Mini", value: "A1 Mini" },
] as const satisfies readonly BambuPrinterModel[];

export type PrinterConnectionStatus = "online" | "offline" | "unverified";

export interface PrinterConnectionRecord {
  id: string;
  provider: PrinterConnectionProvider;
  connectionMode: BambuConnectionMode;
  name: string;
  model: string;
  host: string;
  serial: string;
  accessCodeSet: boolean;
  connectionStatus: PrinterConnectionStatus;
  lastTestedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BambuPrinterConnectionInput {
  connectionMode: BambuConnectionMode;
  name: string;
  model: string;
  host: string;
  serial: string;
  accessCode?: string;
}

export interface PrinterConnectionCheck {
  detail: string;
  label: string;
  latencyMs: number | null;
  status:
    | "passed"
    | "failed"
    | "available"
    | "action-required"
    | "not-supported";
}

export interface BambuConnectionTestResult {
  checkedAt: string;
  checks: {
    bambuConnectBridge: PrinterConnectionCheck;
    cameraStream: PrinterConnectionCheck;
    developerMode: PrinterConnectionCheck;
    lanControl: PrinterConnectionCheck;
    printJobHandoff: PrinterConnectionCheck;
    printerControls: PrinterConnectionCheck;
    statusTelemetry: PrinterConnectionCheck;
  };
  connectionMode: BambuConnectionMode;
  message: string;
  reachable: boolean;
}

export interface BambuConnectImportRequest {
  name: string;
  path: string;
}

export interface BambuConnectImportResponse {
  name: string;
  path: string;
  url: string;
}

export type FleetDataMode = "live" | "placeholder";

export interface FleetOverview {
  stats: FleetStats;
  printers: PrinterSummary[];
  selectedPrinterId: string | null;
  selectedPrinter: PrinterDetail | null;
}

export type CameraProviderType =
  | "frigate"
  | "direct-rtsp"
  | "direct-http"
  | "direct-mjpeg"
  | "bambu"
  | "bambu-connect"
  | "bambuview-companion"
  | "network-plugin"
  | "farm-overview";

export type CameraStreamKind =
  | "mjpeg"
  | "snapshot"
  | "hls"
  | "rtsp"
  | "bambu-native"
  | "unknown";

export interface CameraSource {
  displayUrl: string;
  id: string;
  name: string;
  provider: CameraProviderType;
  snapshotUrl: string | null;
  streamUrl: string;
  streamKind: CameraStreamKind;
  status: "online" | "degraded" | "offline";
  assignedTo: string[];
  details: string;
  lastTestedAt: string | null;
}

export const FLEET_CAMERA_TARGET_ID = "fleet:default";

export type CameraAssignmentTargetType = "printer" | "fleet";

export interface CameraAssignment {
  printerId: string;
  printerName: string;
  targetId: string;
  targetName: string;
  targetType: CameraAssignmentTargetType;
  sourceId: string;
  sourceName: string;
  feedId: string;
  feedLabel: string;
}

export interface CameraOverview {
  sources: CameraSource[];
  assignments: CameraAssignment[];
}

export interface CameraSourceInput {
  frigateBaseUrl?: string;
  frigateCamera?: string;
  name: string;
  password?: string;
  provider: CameraProviderType;
  streamUrl?: string;
  username?: string;
}

export interface CameraAssignmentInput {
  feedLabel: string;
  printerId: string;
  sourceId: string;
  targetType?: CameraAssignmentTargetType;
}

export interface CameraTestResult {
  checkedAt: string;
  detail: string;
  kind: CameraStreamKind;
  reachable: boolean;
  status: CameraSource["status"];
}

export type PrepareWorkspaceStatus = "planned" | "scaffolded" | "available";

export type PrepareWorkflowKind = "filament" | "resin";

export type PrepareSlicerId = "orcaslicer" | "prusaslicer";

export interface PrepareWorkflow {
  id: PrepareWorkflowKind;
  label: string;
  summary: string;
  printerClass: string;
  delivery: string;
  acceptedInputs: string[];
  activeSlicerId: PrepareSlicerId;
}

export interface PrepareSlicerWorkspace {
  id: PrepareSlicerId;
  label: string;
  summary: string;
  status: PrepareWorkspaceStatus;
  upstreamName: string;
  upstreamUrl: string;
  license: string;
  workflowKinds: PrepareWorkflowKind[];
  defaultFor: PrepareWorkflowKind[];
  notes: string[];
  plannedCapabilities: string[];
}

export interface PreparePipelineStage {
  id: string;
  label: string;
  summary: string;
  status: PrepareWorkspaceStatus;
  slicerIds: PrepareSlicerId[];
}

export interface PrepareHandoffAction {
  id: string;
  label: string;
  description: string;
  availableFor: PrepareWorkflowKind[];
  requirement: string;
}

export interface PrepareStatus {
  status: PrepareWorkspaceStatus;
  headline: string;
  description: string;
  capabilities: string[];
  workflows: PrepareWorkflow[];
  slicers: PrepareSlicerWorkspace[];
  pipeline: PreparePipelineStage[];
  handoffActions: PrepareHandoffAction[];
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  mode: "dark",
  darkHighlight: "#7ed321",
  darkBackground: "#1a1d20",
  lightHighlight: "#7ed321",
  lightBackground: "#ffffff",
  backgroundStyle: "blueprint",
};

export const HIGHLIGHT_SWATCHES = [
  "#7ed321",
  "#8b5cf6",
  "#22c7d8",
  "#ff5aa9",
] as const;

export const DARK_BACKGROUND_SWATCHES = [
  "#1a1d20",
  "#15181b",
  "#202428",
] as const;

export const LIGHT_BACKGROUND_SWATCHES = [
  "#ffffff",
  "#f7f8fa",
  "#eef1f5",
] as const;

export * from "./companion.js";
