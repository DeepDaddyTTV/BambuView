import { contextBridge, ipcRenderer } from "electron";

import type { CompanionDesktopApi } from "@common/electron-api";
import { companionChannels } from "@common/ipc";

function cleanIpcErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Action failed.";
  }

  return error.message
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();
}

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, ...args)) as T;
  } catch (error) {
    throw new Error(cleanIpcErrorMessage(error));
  }
}

const api: CompanionDesktopApi = {
  checkForUpdates: () => invoke(companionChannels.checkForUpdates),
  copyBridgeUrl: () => invoke(companionChannels.copyBridgeUrl),
  createPrinter: (input) =>
    invoke(companionChannels.createPrinter, input),
  createStream: (input) =>
    invoke(companionChannels.createStream, input),
  deletePrinter: (printerId) =>
    invoke(companionChannels.deletePrinter, printerId),
  deleteStream: (streamId) =>
    invoke(companionChannels.deleteStream, streamId),
  discoverPrinters: () => invoke(companionChannels.discoverPrinters),
  getSnapshot: (forceRefresh) =>
    invoke(companionChannels.getSnapshot, forceRefresh),
  handleFileHandoff: (printerId, input) =>
    invoke(companionChannels.fileHandoff, printerId, input),
  openExternal: (url) => invoke(companionChannels.openExternal, url),
  openUpdateDownload: () =>
    invoke(companionChannels.openUpdateDownload),
  pair: (input) => invoke(companionChannels.pair, input),
  readTelemetry: (printerId) =>
    invoke(companionChannels.readTelemetry, printerId),
  regenerateBridgeToken: () =>
    invoke(companionChannels.regenerateBridgeToken),
  resetPairing: (options) => invoke(companionChannels.resetPairing, options),
  saveSettings: (input) =>
    invoke(companionChannels.saveSettings, input),
  testPrinter: (printerId) =>
    invoke(companionChannels.testPrinter, printerId),
  updatePrinter: (printerId, input) =>
    invoke(companionChannels.updatePrinter, printerId, input),
  updateStream: (streamId, input) =>
    invoke(companionChannels.updateStream, streamId, input),
};

contextBridge.exposeInMainWorld("companion", api);
