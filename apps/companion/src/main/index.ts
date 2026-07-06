import path from "node:path";

import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  safeStorage,
  shell,
} from "electron";

import { companionChannels } from "@common/ipc";

import { createBridgeServer } from "./bridge.js";
import { CompanionLogger } from "./logger.js";
import { CompanionRuntime } from "./runtime.js";
import { createCompanionTray } from "./tray.js";

const appVersion = app.getVersion();
const logger = new CompanionLogger();
const stateFile = path.join(app.getPath("userData"), "companion-state.json");

function createCodec() {
  return {
    available: safeStorage.isEncryptionAvailable(),
    decrypt(value: string) {
      return safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(value, "base64"))
        : value;
    },
    encrypt(value: string) {
      return safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(value).toString("base64")
        : value;
    },
  };
}

let mainWindow: BrowserWindow | null = null;
let tray: ReturnType<typeof createCompanionTray> | null = null;
let bridgeApp: Awaited<ReturnType<typeof createBridgeServer>> | null = null;
let bridgeRestart: Promise<void> | null = null;

const runtime = new CompanionRuntime({
  appVersion,
  bridgeLifecycle: {
    restart: async () => restartBridge(),
  },
  codec: createCodec(),
  logger,
  shellActions: {
    openExternal: shell.openExternal.bind(shell),
    openPath: shell.openPath.bind(shell),
    showItemInFolder: shell.showItemInFolder.bind(shell),
  },
  stateFile,
});

async function restartBridge() {
  if (bridgeRestart) {
    return bridgeRestart;
  }

  bridgeRestart = (async () => {
    if (bridgeApp) {
      await bridgeApp.close();
      bridgeApp = null;
    }

    bridgeApp = await createBridgeServer(runtime);
    const health = runtime.getHealth();
    try {
      await bridgeApp.listen({
        host: health.bridge.host,
        port: health.bridge.port,
      });
      await runtime.applyBridgeListening(true, null);
      logger.info(`Bridge listening on ${runtime.getHealth().bridge.baseUrl}.`);
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code)
          : "";
      if (code === "EADDRINUSE") {
        await runtime.applyPortConflict();
      } else {
        await runtime.applyBridgeListening(
          false,
          "Companion bridge failed to start.",
        );
        logger.error("Companion bridge failed to start.");
      }
    }
  })();

  try {
    await bridgeRestart;
  } finally {
    bridgeRestart = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    backgroundColor: "#101315",
    height: 980,
    minHeight: 880,
    minWidth: 1320,
    show: false,
    title: "BambuView Companion",
    width: 1440,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

function registerIpc() {
  ipcMain.handle(companionChannels.checkForUpdates, () =>
    runtime.checkForUpdates(),
  );
  ipcMain.handle(companionChannels.getSnapshot, () => runtime.getSnapshot());
  ipcMain.handle(companionChannels.saveSettings, (_event, input) =>
    runtime.saveSettings(input),
  );
  ipcMain.handle(companionChannels.pair, (_event, input) =>
    runtime.pair(input),
  );
  ipcMain.handle(companionChannels.resetPairing, () => runtime.resetPairing());
  ipcMain.handle(companionChannels.regenerateBridgeToken, async () => {
    const token = await runtime.regenerateBridgeToken();
    return {
      snapshot: runtime.getSnapshot(),
      token,
    };
  });
  ipcMain.handle(companionChannels.createPrinter, (_event, input) =>
    runtime.createPrinter(input),
  );
  ipcMain.handle(companionChannels.updatePrinter, (_event, printerId, input) =>
    runtime.updatePrinter(printerId, input),
  );
  ipcMain.handle(companionChannels.deletePrinter, (_event, printerId) =>
    runtime.deletePrinter(printerId),
  );
  ipcMain.handle(companionChannels.testPrinter, (_event, printerId) =>
    runtime.testPrinter(printerId),
  );
  ipcMain.handle(companionChannels.readTelemetry, (_event, printerId) =>
    runtime.readTelemetry(printerId),
  );
  ipcMain.handle(companionChannels.createStream, (_event, input) =>
    runtime.createStream(input),
  );
  ipcMain.handle(companionChannels.updateStream, (_event, streamId, input) =>
    runtime.updateStream(streamId, input),
  );
  ipcMain.handle(companionChannels.deleteStream, (_event, streamId) =>
    runtime.deleteStream(streamId),
  );
  ipcMain.handle(companionChannels.fileHandoff, (_event, printerId, input) =>
    runtime.handleFileHandoff(printerId, input),
  );
  ipcMain.handle(companionChannels.openExternal, (_event, url) =>
    runtime.openExternal(url),
  );
  ipcMain.handle(companionChannels.openUpdateDownload, () =>
    runtime.openUpdateDownload(),
  );
  ipcMain.handle(companionChannels.copyBridgeUrl, async () => {
    const url = await runtime.copyBridgeUrl();
    clipboard.writeText(url);
    return url;
  });
}

function showWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

app.whenReady().then(async () => {
  registerIpc();
  createWindow();
  tray = createCompanionTray(runtime, {
    onOpen: showWindow,
    onQuit: () => app.quit(),
  });
  await restartBridge();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
  showWindow();
});

app.on("before-quit", async () => {
  if (bridgeApp) {
    await bridgeApp.close();
  }
  tray?.destroy();
});

app.on("window-all-closed", () => {
  // Companion stays available from the tray until the user chooses Quit.
});
