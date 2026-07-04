import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

import { app, BrowserWindow, dialog, shell } from "electron";

let mainWindow: BrowserWindow | null = null;
let apiProcess: ChildProcessWithoutNullStreams | null = null;
let quitting = false;

function resolveRuntimePaths() {
  if (app.isPackaged) {
    const nodeBinary = process.platform === "win32" ? "node.exe" : "node";

    return {
      apiServer: path.join(process.resourcesPath, "api/server.cjs"),
      nodeRuntime: path.join(process.resourcesPath, "node-runtime", nodeBinary),
      webDist: path.join(process.resourcesPath, "web"),
    };
  }

  const repoRoot = path.resolve(__dirname, "../../../..");

  return {
    apiServer: path.join(repoRoot, "apps/api/dist/server.cjs"),
    nodeRuntime: process.execPath,
    webDist: path.join(repoRoot, "apps/web/dist"),
  };
}

function findOpenPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;

      server.close(() => {
        if (!port) {
          reject(
            new Error("Unable to reserve a local BambuView desktop port."),
          );
          return;
        }

        resolve(port);
      });
    });
  });
}

function waitForHealth(origin: string, timeoutMs = 30000): Promise<void> {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(`${origin}/api/health`, (response) => {
        response.resume();

        if (
          response.statusCode &&
          response.statusCode >= 200 &&
          response.statusCode < 300
        ) {
          resolve();
          return;
        }

        retry();
      });

      request.once("error", retry);
      request.setTimeout(1200, () => {
        request.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(
          new Error("BambuView desktop server did not become ready in time."),
        );
        return;
      }

      setTimeout(check, 350);
    };

    check();
  });
}

async function startApiServer() {
  const runtimePaths = resolveRuntimePaths();

  if (!fs.existsSync(runtimePaths.apiServer)) {
    throw new Error(
      `BambuView API bundle was not found at ${runtimePaths.apiServer}.`,
    );
  }

  if (!fs.existsSync(path.join(runtimePaths.webDist, "index.html"))) {
    throw new Error(
      `BambuView web bundle was not found at ${runtimePaths.webDist}.`,
    );
  }

  if (!fs.existsSync(runtimePaths.nodeRuntime)) {
    throw new Error(
      `BambuView Node runtime was not found at ${runtimePaths.nodeRuntime}.`,
    );
  }

  const port = await findOpenPort();
  const origin = `http://localhost:${port}`;
  const dataDir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dataDir, { recursive: true });

  apiProcess = spawn(runtimePaths.nodeRuntime, [runtimePaths.apiServer], {
    env: {
      ...process.env,
      APP_ORIGIN: origin,
      COOKIE_SECURE: "false",
      DATABASE_FILE: path.join(dataDir, "bambuview.db"),
      HOST: "127.0.0.1",
      NODE_ENV: "production",
      PORT: String(port),
      WEB_DIST_PATH: runtimePaths.webDist,
    },
    stdio: "pipe",
  });

  apiProcess.stdout.on("data", (chunk) => {
    console.log(`[bambuview-api] ${chunk.toString().trim()}`);
  });
  apiProcess.stderr.on("data", (chunk) => {
    console.error(`[bambuview-api] ${chunk.toString().trim()}`);
  });
  apiProcess.once("exit", (code) => {
    if (!quitting) {
      console.error(`[bambuview-api] exited with code ${code ?? "unknown"}`);
    }
  });

  await waitForHealth(origin);

  return origin;
}

function stopApiServer() {
  if (!apiProcess || apiProcess.killed) {
    return;
  }

  apiProcess.kill();
  apiProcess = null;
}

async function createWindow(origin: string) {
  mainWindow = new BrowserWindow({
    backgroundColor: "#15181b",
    height: 920,
    minHeight: 720,
    minWidth: 1180,
    show: false,
    title: "BambuView",
    width: 1500,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(`${origin}/fleet`);
}

async function boot() {
  try {
    const origin = await startApiServer();
    await createWindow(origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await dialog.showMessageBox({
      buttons: ["Quit"],
      message: "BambuView could not start.",
      detail: message,
      type: "error",
    });
    app.quit();
  }
}

app.on("before-quit", () => {
  quitting = true;
  stopApiServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (!mainWindow) {
    void boot();
  }
});

void app.whenReady().then(boot);
