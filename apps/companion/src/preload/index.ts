import { contextBridge, ipcRenderer } from "electron";

import type { CompanionDesktopApi } from "@common/electron-api";
import { companionChannels } from "@common/ipc";

const api: CompanionDesktopApi = {
  copyBridgeUrl: () => ipcRenderer.invoke(companionChannels.copyBridgeUrl),
  createPrinter: (input) =>
    ipcRenderer.invoke(companionChannels.createPrinter, input),
  createStream: (input) =>
    ipcRenderer.invoke(companionChannels.createStream, input),
  deletePrinter: (printerId) =>
    ipcRenderer.invoke(companionChannels.deletePrinter, printerId),
  deleteStream: (streamId) =>
    ipcRenderer.invoke(companionChannels.deleteStream, streamId),
  getSnapshot: () => ipcRenderer.invoke(companionChannels.getSnapshot),
  handleFileHandoff: (printerId, input) =>
    ipcRenderer.invoke(companionChannels.fileHandoff, printerId, input),
  openExternal: (url) =>
    ipcRenderer.invoke(companionChannels.openExternal, url),
  pair: (input) => ipcRenderer.invoke(companionChannels.pair, input),
  readTelemetry: (printerId) =>
    ipcRenderer.invoke(companionChannels.readTelemetry, printerId),
  regenerateBridgeToken: () =>
    ipcRenderer.invoke(companionChannels.regenerateBridgeToken),
  resetPairing: () => ipcRenderer.invoke(companionChannels.resetPairing),
  saveSettings: (input) =>
    ipcRenderer.invoke(companionChannels.saveSettings, input),
  testPrinter: (printerId) =>
    ipcRenderer.invoke(companionChannels.testPrinter, printerId),
  updatePrinter: (printerId, input) =>
    ipcRenderer.invoke(companionChannels.updatePrinter, printerId, input),
  updateStream: (streamId, input) =>
    ipcRenderer.invoke(companionChannels.updateStream, streamId, input),
};

contextBridge.exposeInMainWorld("companion", api);
