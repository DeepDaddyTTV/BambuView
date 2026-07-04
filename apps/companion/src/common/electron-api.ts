import type {
  CompanionFileHandoffResult,
  CompanionFileHandoffInput,
  CompanionPairingState,
  CompanionPrinterInput,
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

export interface CompanionDesktopApi {
  copyBridgeUrl(): Promise<string>;
  createPrinter(input: CompanionPrinterInput): Promise<CompanionSnapshot>;
  createStream(input: CompanionStreamInput): Promise<CompanionSnapshot>;
  deletePrinter(printerId: string): Promise<CompanionSnapshot>;
  deleteStream(streamId: string): Promise<CompanionSnapshot>;
  getSnapshot(): Promise<CompanionSnapshot>;
  handleFileHandoff(
    printerId: string,
    input: CompanionFileHandoffInput,
  ): Promise<CompanionFileHandoffResult>;
  openExternal(url: string): Promise<void>;
  pair(input: PairCompanionInput): Promise<CompanionSnapshot>;
  readTelemetry(printerId: string): Promise<CompanionPrinterTelemetry>;
  regenerateBridgeToken(): Promise<RegenerateBridgeTokenResult>;
  resetPairing(): Promise<CompanionPairingState>;
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
