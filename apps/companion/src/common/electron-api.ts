import type {
  CompanionFileHandoffResult,
  CompanionFileHandoffInput,
  CompanionPairingState,
  CompanionPrinterInput,
  CompanionPrinterDiscoveryResult,
  CompanionPrinterTelemetry,
  CompanionPrinterTestResult,
  CompanionSettings,
  CompanionSnapshot,
  CompanionStreamInput,
} from "@bambuview/contracts";

export interface PairCompanionInput {
  companionName: string;
  pairingToken: string;
  serverUrl: string;
}

export interface RegenerateBridgeTokenResult {
  snapshot: CompanionSnapshot;
  token: string;
}

export interface ResetPairingOptions {
  resetBridgeSettings?: boolean;
}

export interface ExportDiagnosticsResult {
  canceled: boolean;
  filePath: string | null;
}

export interface OpenCompanionLogFolderResult {
  directoryPath: string | null;
  filePath: string | null;
}

export interface CompanionDiagnosticEventInput {
  context?: unknown;
  level: "info" | "warn" | "error";
  message: string;
  source?: "renderer" | "renderer-boundary" | "renderer-startup";
}

export interface CompanionDesktopApi {
  checkForUpdates(): Promise<CompanionSnapshot>;
  copyBridgeUrl(): Promise<string>;
  createPrinter(input: CompanionPrinterInput): Promise<CompanionSnapshot>;
  createStream(input: CompanionStreamInput): Promise<CompanionSnapshot>;
  deletePrinter(printerId: string): Promise<CompanionSnapshot>;
  deleteStream(streamId: string): Promise<CompanionSnapshot>;
  discoverPrinters(): Promise<CompanionPrinterDiscoveryResult>;
  exportDiagnostics(): Promise<ExportDiagnosticsResult>;
  getSnapshot(forceRefresh?: boolean): Promise<CompanionSnapshot>;
  handleFileHandoff(
    printerId: string,
    input: CompanionFileHandoffInput,
  ): Promise<CompanionFileHandoffResult>;
  logRendererEvent(input: CompanionDiagnosticEventInput): void;
  openLogFolder(): Promise<OpenCompanionLogFolderResult>;
  openExternal(url: string): Promise<void>;
  openUpdateDownload(): Promise<CompanionSnapshot>;
  pair(input: PairCompanionInput): Promise<CompanionSnapshot>;
  readTelemetry(printerId: string): Promise<CompanionPrinterTelemetry>;
  regenerateBridgeToken(): Promise<RegenerateBridgeTokenResult>;
  resetPairing(options?: ResetPairingOptions): Promise<CompanionPairingState>;
  saveSettings(input: Partial<CompanionSettings>): Promise<CompanionSnapshot>;
  testPrinter(printerId: string): Promise<CompanionPrinterTestResult>;
  updatePrinter(
    printerId: string,
    input: CompanionPrinterInput,
  ): Promise<CompanionSnapshot>;
  updateStream(
    streamId: string,
    input: CompanionStreamInput,
  ): Promise<CompanionSnapshot>;
}
