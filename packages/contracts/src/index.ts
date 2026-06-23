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
  material: string;
  active: boolean;
}

export interface PrinterSummary {
  id: string;
  shortCode: string;
  name: string;
  status: "printing" | "paused" | "idle" | "offline";
  statusLabel: string;
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

export interface FleetOverview {
  stats: FleetStats;
  printers: PrinterSummary[];
  selectedPrinterId: string;
  selectedPrinter: PrinterDetail;
}

export interface CameraSource {
  id: string;
  name: string;
  provider: "frigate" | "direct-rtsp" | "bambu" | "farm-overview";
  streamUrl: string;
  status: "online" | "degraded" | "offline";
  assignedTo: string[];
}

export interface CameraAssignment {
  printerId: string;
  printerName: string;
  feedId: string;
  feedLabel: string;
}

export interface CameraOverview {
  sources: CameraSource[];
  assignments: CameraAssignment[];
}

export interface PrepareStatus {
  status: "planned";
  headline: string;
  description: string;
  capabilities: string[];
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  mode: "dark",
  darkHighlight: "#7ed321",
  darkBackground: "#101317",
  lightHighlight: "#7ed321",
  lightBackground: "#ffffff",
  backgroundStyle: "topo"
};

export const HIGHLIGHT_SWATCHES = [
  "#7ed321",
  "#8b5cf6",
  "#22c7d8",
  "#ff5aa9"
] as const;

export const DARK_BACKGROUND_SWATCHES = [
  "#101317",
  "#1f242c",
  "#151821"
] as const;

export const LIGHT_BACKGROUND_SWATCHES = [
  "#ffffff",
  "#f7f8fa",
  "#eef1f5"
] as const;
