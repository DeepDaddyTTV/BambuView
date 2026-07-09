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
const rendererFailureTitle = "BambuView Companion could not finish loading";

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
let quitting = false;

app.disableHardwareAcceleration();

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

function rendererFailureMarkup(detail: string) {
  const escaped = detail
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${rendererFailureTitle}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background: #101315;
        color: #f5f7fa;
        display: grid;
        place-items: center;
      }
      main {
        width: min(640px, calc(100vw - 48px));
        border: 1px solid #2a3137;
        background: #171c20;
        padding: 32px;
        box-sizing: border-box;
      }
      h1 {
        margin: 0 0 14px;
        font-size: 32px;
        line-height: 1.1;
      }
      p {
        margin: 0 0 18px;
        color: #b9c0c8;
        font-size: 16px;
        line-height: 1.65;
      }
      code {
        display: block;
        white-space: pre-wrap;
        word-break: break-word;
        border: 1px solid #303840;
        background: #0f1316;
        color: #9ee86d;
        padding: 16px;
        font-size: 13px;
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${rendererFailureTitle}</h1>
      <p>Companion started, but the window could not finish booting. Quit it from the tray and reopen after the update finishes installing.</p>
      <code>${escaped}</code>
    </main>
  </body>
</html>`;
}

function showRendererFailure(detail: string) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  logger.error(`Renderer failure: ${detail}`);
  void mainWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(rendererFailureMarkup(detail))}`,
  );
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function attachWindowRecovery(window: BrowserWindow) {
  let finishedInitialLoad = false;
  const showFallbackTimer = setTimeout(() => {
    if (!window.isDestroyed() && !window.isVisible()) {
      logger.warn(
        "Companion window did not reach ready-to-show quickly. Forcing it visible so it does not appear stuck in the tray.",
      );
      window.show();
      window.focus();
    }
  }, 2200);

  const clearShowFallback = () => {
    clearTimeout(showFallbackTimer);
  };

  window.once("ready-to-show", () => {
    finishedInitialLoad = true;
    clearShowFallback();
    window.show();
  });

  window.on("unresponsive", () => {
    logger.error("Companion window became unresponsive.");
    showRendererFailure(
      "The renderer stopped responding after the window opened. Hardware acceleration has been disabled for recovery, but Companion should be restarted.",
    );
  });

  window.webContents.on("did-finish-load", () => {
    finishedInitialLoad = true;
    clearShowFallback();
    logger.info("Companion renderer finished loading.");
  });

  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame) {
        return;
      }
      clearShowFallback();
      showRendererFailure(
        `Load error ${errorCode}: ${errorDescription}\nURL: ${validatedUrl || "unknown"}`,
      );
    },
  );

  window.webContents.on("render-process-gone", (_event, details) => {
    clearShowFallback();
    showRendererFailure(
      `Renderer process exited (${details.reason}). Exit code: ${details.exitCode}.`,
    );
  });

  window.webContents.on(
    "console-message",
    (_event, level, message, line, sourceId) => {
      if (level >= 2) {
        logger.warn(
          `Renderer console (${level}) ${sourceId || "renderer"}:${line} ${message}`,
        );
      }
    },
  );

  window.on("closed", () => {
    clearShowFallback();
    if (!quitting && !finishedInitialLoad) {
      logger.warn(
        "Companion window closed before the first load completed. Reopening it so it does not stay stranded in the tray.",
      );
      queueMicrotask(() => {
        if (!mainWindow && !quitting) {
          createWindow();
        }
      });
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
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

  attachWindowRecovery(mainWindow);
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
  ipcMain.handle(companionChannels.getSnapshot, (_event, forceRefresh) =>
    runtime.getSnapshot(Boolean(forceRefresh)),
  );
  ipcMain.handle(companionChannels.saveSettings, (_event, input) =>
    runtime.saveSettings(input),
  );
  ipcMain.handle(companionChannels.pair, (_event, input) =>
    runtime.pair(input),
  );
  ipcMain.handle(companionChannels.resetPairing, (_event, options) =>
    runtime.resetPairing(options),
  );
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
  ipcMain.handle(companionChannels.discoverPrinters, () =>
    runtime.getDiscoveryResult(),
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
  if (mainWindow.webContents.isCrashed()) {
    logger.warn(
      "Companion window renderer was crashed when reopen was requested. Recreating the window.",
    );
    mainWindow.destroy();
    mainWindow = null;
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
  quitting = true;
  if (bridgeApp) {
    await bridgeApp.close();
  }
  tray?.destroy();
});

app.on("window-all-closed", () => {
  // Companion stays available from the tray until the user chooses Quit.
});
