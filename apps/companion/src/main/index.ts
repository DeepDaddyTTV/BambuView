import path from "node:path";

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  safeStorage,
  shell,
} from "electron";

import type { CompanionDiagnosticEventInput } from "@common/electron-api";
import { companionChannels } from "@common/ipc";

import { createBridgeServer } from "./bridge.js";
import { CompanionLogger } from "./logger.js";
import { CompanionRuntime } from "./runtime.js";
import { createCompanionTray } from "./tray.js";

const appVersion = app.getVersion();
const stateFile = path.join(app.getPath("userData"), "companion-state.json");
const logger = new CompanionLogger(120, {
  candidateFilePaths: [
    path.join(path.dirname(process.execPath), "BambuView-Companion.log"),
    path.join(path.dirname(stateFile), "BambuView-Companion.log"),
  ],
});
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

function reportDiagnosticEvent(input: CompanionDiagnosticEventInput) {
  const message = input.source
    ? `[${input.source}] ${input.message}`
    : input.message;

  if (input.level === "error") {
    logger.error(message, input.context);
    return;
  }

  if (input.level === "warn") {
    logger.warn(message, input.context);
    return;
  }

  logger.info(message, input.context);
}

function extractErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    return error.stack?.trim() || `${error.name}: ${error.message}`;
  }

  return String(error ?? "Unknown error");
}

async function restartBridge() {
  if (bridgeRestart) {
    return bridgeRestart;
  }

  bridgeRestart = (async () => {
    if (bridgeApp) {
      await bridgeApp.close();
      bridgeApp = null;
    }

    bridgeApp = await createBridgeServer(runtime, logger);
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
        logger.error("Companion bridge failed to start.", {
          bridgeHost: health.bridge.host,
          bridgePort: health.bridge.port,
          code,
          error,
        });
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
        logger.error(
          `Renderer console (${level}) ${sourceId || "renderer"}:${line} ${message}`,
        );
      } else if (level === 1) {
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
  const registerHandler = (
    channel: string,
    handler: (...args: unknown[]) => Promise<unknown> | unknown,
  ) => {
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return await handler(...args);
      } catch (error) {
        logger.error(`IPC ${channel} failed.`, {
          args,
          error,
        });
        throw error;
      }
    });
  };

  ipcMain.on(companionChannels.rendererLog, (_event, input) => {
    reportDiagnosticEvent(input as CompanionDiagnosticEventInput);
  });

  registerHandler(companionChannels.checkForUpdates, () =>
    runtime.checkForUpdates(),
  );
  registerHandler(companionChannels.getSnapshot, (forceRefresh) =>
    runtime.getSnapshot(Boolean(forceRefresh)),
  );
  registerHandler(companionChannels.saveSettings, (input) =>
    runtime.saveSettings(
      input as Parameters<typeof runtime.saveSettings>[0],
    ),
  );
  registerHandler(companionChannels.pair, (input) =>
    runtime.pair(input as Parameters<typeof runtime.pair>[0]),
  );
  registerHandler(companionChannels.resetPairing, (options) =>
    runtime.resetPairing(
      options as Parameters<typeof runtime.resetPairing>[0],
    ),
  );
  registerHandler(companionChannels.regenerateBridgeToken, async () => {
    const token = await runtime.regenerateBridgeToken();
    return {
      snapshot: runtime.getSnapshot(),
      token,
    };
  });
  registerHandler(companionChannels.createPrinter, (input) =>
    runtime.createPrinter(
      input as Parameters<typeof runtime.createPrinter>[0],
    ),
  );
  registerHandler(companionChannels.updatePrinter, (printerId, input) =>
    runtime.updatePrinter(
      String(printerId),
      input as Parameters<typeof runtime.updatePrinter>[1],
    ),
  );
  registerHandler(companionChannels.deletePrinter, (printerId) =>
    runtime.deletePrinter(String(printerId)),
  );
  registerHandler(companionChannels.testPrinter, (printerId) =>
    runtime.testPrinter(String(printerId)),
  );
  registerHandler(companionChannels.readTelemetry, (printerId) =>
    runtime.readTelemetry(String(printerId)),
  );
  registerHandler(companionChannels.createStream, (input) =>
    runtime.createStream(
      input as Parameters<typeof runtime.createStream>[0],
    ),
  );
  registerHandler(companionChannels.updateStream, (streamId, input) =>
    runtime.updateStream(
      String(streamId),
      input as Parameters<typeof runtime.updateStream>[1],
    ),
  );
  registerHandler(companionChannels.deleteStream, (streamId) =>
    runtime.deleteStream(String(streamId)),
  );
  registerHandler(companionChannels.discoverPrinters, () =>
    runtime.getDiscoveryResult(),
  );
  registerHandler(companionChannels.exportDiagnostics, async () => {
    const suggestedPath = path.join(
      app.getPath("desktop"),
      `BVCompanion-diagnostics-${new Date().toISOString().replaceAll(":", "-")}.json`,
    );
    const result = await dialog.showSaveDialog({
      defaultPath: suggestedPath,
      filters: [
        { extensions: ["json"], name: "JSON Diagnostics Bundle" },
      ],
      properties: ["createDirectory", "showOverwriteConfirmation"],
      title: "Export BambuView Companion Diagnostics",
    });

    if (result.canceled || !result.filePath) {
      return {
        canceled: true,
        filePath: null,
      };
    }

    const filePath = await runtime.exportDiagnostics(result.filePath);
    return {
      canceled: false,
      filePath,
    };
  });
  registerHandler(companionChannels.fileHandoff, (printerId, input) =>
    runtime.handleFileHandoff(
      String(printerId),
      input as Parameters<typeof runtime.handleFileHandoff>[1],
    ),
  );
  registerHandler(companionChannels.openLogFolder, async () => {
    const filePath = runtime.getLogFilePath();
    if (filePath) {
      shell.showItemInFolder(filePath);
      logger.info("Opened Companion log folder.", {
        filePath,
      });
      return {
        directoryPath: path.dirname(filePath),
        filePath,
      };
    }

    const fallbackDirectory = path.dirname(stateFile);
    await shell.openPath(fallbackDirectory);
    logger.info("Opened Companion data folder because no log file was active.", {
      fallbackDirectory,
    });
    return {
      directoryPath: fallbackDirectory,
      filePath: null,
    };
  });
  registerHandler(companionChannels.openExternal, (url) =>
    runtime.openExternal(String(url)),
  );
  registerHandler(companionChannels.openUpdateDownload, () =>
    runtime.openUpdateDownload(),
  );
  registerHandler(companionChannels.copyBridgeUrl, async () => {
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

process.on("uncaughtException", (error) => {
  logger.error("Main process uncaught exception.", { error });
  showRendererFailure(extractErrorDetail(error));
});

process.on("unhandledRejection", (reason) => {
  logger.error("Main process unhandled rejection.", { reason });
});

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

app.on("child-process-gone", (_event, details) => {
  logger.error("Electron child process exited unexpectedly.", details);
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
