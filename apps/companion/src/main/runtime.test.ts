import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { COMPANION_APP_NAME } from "@bambuview/contracts";

import { createBridgeServer } from "./bridge";
import { CompanionLogger } from "./logger";
import { findAvailablePort } from "./ports";
import { CompanionRuntime } from "./runtime";

const tempDirs: string[] = [];
const originalFetch = globalThis.fetch;
const originalHome = process.env.HOME;

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { force: true, recursive: true });
  }

  globalThis.fetch = originalFetch;
  process.env.HOME = originalHome;
});

function createRuntime(
  overrides: Partial<ConstructorParameters<typeof CompanionRuntime>[0]> = {},
) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "bambuview-companion-"));
  tempDirs.push(dir);
  return new CompanionRuntime({
    appVersion: "0.0.40",
    codec: {
      available: false,
      decrypt: (value) => value,
      encrypt: (value) => value,
    },
    logger: new CompanionLogger(),
    stateFile: path.join(dir, "companion-state.json"),
    updateChecksEnabled: false,
    ...overrides,
  });
}

function createDesktopSession(
  homeDir: string,
  appFolder: "Bambu Connect" | "BambuStudio",
  payload: Record<string, unknown>,
) {
  const configDir = path.join(
    homeDir,
    "Library/Application Support",
    appFolder,
  );
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    path.join(configDir, "session.json"),
    JSON.stringify(payload, null, 2),
  );
}

function companionAuthHeader(runtime: CompanionRuntime) {
  const auth = runtime.getBridgeAuth();
  return {
    authorization: `Basic ${Buffer.from(`${auth.username}:${auth.token}`).toString("base64")}`,
  };
}

async function listen(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Server address unavailable.");
  }
  return address.port;
}

async function closeServer(server: ReturnType<typeof createServer>) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function closeNetServer(server: net.Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

describe("companion runtime", () => {
  it("requires auth for bridge endpoints and reports health", async () => {
    const runtime = createRuntime();
    await runtime.applyBridgeListening(true, null);
    const bridge = await createBridgeServer(runtime);

    const unauthenticated = await bridge.inject({
      method: "GET",
      url: "/health",
    });
    expect(unauthenticated.statusCode).toBe(401);

    const authenticated = await bridge.inject({
      method: "GET",
      url: "/health",
      headers: companionAuthHeader(runtime),
    });
    expect(authenticated.statusCode).toBe(200);
    expect(authenticated.json().appName).toBe(COMPANION_APP_NAME);

    const streams = await bridge.inject({
      method: "GET",
      url: "/streams",
      headers: companionAuthHeader(runtime),
    });
    expect(streams.statusCode).toBe(200);
    await bridge.close();
  });

  it("pairs with BambuView and persists pairing state", async () => {
    const runtime = createRuntime();
    await runtime.applyBridgeListening(true, null);

    const mockServer = createServer((request, response) => {
      if (request.method === "GET" && request.url === "/api/health") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ ok: true }));
        return;
      }

      if (request.method !== "POST" || request.url !== "/api/companions/pair") {
        response.statusCode = 404;
        response.end();
        return;
      }

      let body = "";
      request.on("data", (chunk) => {
        body += chunk.toString();
      });
      request.on("end", () => {
        const payload = JSON.parse(body);
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            companion: {
              id: "companion-1",
              name: payload.companionName,
              baseUrl: payload.baseUrl,
              tokenSet: true,
              status: "online",
              lastHealthAt: new Date().toISOString(),
              lastError: null,
              capabilities: payload.capabilities,
              pairedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              printerCount: 0,
              streamCount: 0,
            },
          }),
        );
      });
    });

    const port = await listen(mockServer);
    const snapshot = await runtime.pair({
      companionName: "Studio Bridge",
      pairingToken: "pairing-token-1234567890",
      serverUrl: `127.0.0.1:${port}`,
    });

    expect(snapshot.pairing.paired).toBe(true);
    expect(snapshot.pairing.companionName).toBe("Studio Bridge");
    await closeServer(mockServer);
  });

  it("resets pairing back to localhost bridge defaults when requested", async () => {
    const runtime = createRuntime();

    await runtime.saveSettings({
      bindMode: "lan",
      host: "192.168.50.163",
      port: 42000,
    });
    await runtime.applyPortConflict();

    await runtime.resetPairing({
      resetBridgeSettings: true,
    });

    const snapshot = runtime.getSnapshot();
    expect(snapshot.pairing.paired).toBe(false);
    expect(snapshot.pairing.serverUrl).toBeNull();
    expect(snapshot.settings.bindMode).toBe("localhost");
    expect(snapshot.settings.host).toBe("localhost");
    expect(snapshot.settings.port).toBe(41738);
    expect(snapshot.health.bridge.baseUrl).toBe("http://localhost:41738");
    expect(snapshot.health.bridge.suggestedPort).toBeNull();
  });

  it("explains localhost pairing failures more clearly", async () => {
    const runtime = createRuntime();
    await runtime.applyBridgeListening(true, null);

    globalThis.fetch = (async () => {
      throw new Error("fetch failed");
    }) as typeof fetch;

    await expect(
      runtime.pair({
        companionName: "Studio Bridge",
        pairingToken: "pairing-token-1234567890",
        serverUrl: "http://localhost:4173",
      }),
    ).rejects.toThrow(
      /localhost only works when BambuView and Companion are running on the same computer/i,
    );
  });

  it("blocks remote pairing while the bridge is still localhost-only", async () => {
    const runtime = createRuntime();
    await runtime.applyBridgeListening(true, null);

    await expect(
      runtime.pair({
        companionName: "Studio Bridge",
        pairingToken: "pairing-token-1234567890",
        serverUrl: "http://192.168.50.163:4173",
      }),
    ).rejects.toThrow(
      /switch Bind Mode to LAN, set Bind Host to this computer's LAN IP or hostname/i,
    );
  });

  it("explains when the server URL is actually the companion bridge", async () => {
    const runtime = createRuntime();
    await runtime.saveSettings({
      bindMode: "lan",
      host: "192.168.50.200",
    });
    await runtime.applyBridgeListening(true, null);

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ message: "Companion auth token required." }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 401,
        },
      )) as typeof fetch;

    await expect(
      runtime.pair({
        companionName: "Studio Bridge",
        pairingToken: "pairing-token-1234567890",
        serverUrl: "http://192.168.50.163:4173",
      }),
    ).rejects.toThrow(/Companion bridge, not the BambuView server/i);
  });

  it("accepts authenticated bridge pairing resets", async () => {
    const runtime = createRuntime();
    await runtime.saveSettings({
      bindMode: "lan",
      host: "192.168.50.163",
      port: 42000,
    });
    await runtime.applyBridgeListening(true, null);

    const bridge = await createBridgeServer(runtime);
    const response = await bridge.inject({
      method: "POST",
      url: "/pairing/reset",
      headers: companionAuthHeader(runtime),
      payload: {
        resetBridgeSettings: true,
      },
    });

    expect(response.statusCode).toBe(204);
    expect(runtime.getSnapshot().settings.bindMode).toBe("localhost");
    expect(runtime.getSnapshot().settings.host).toBe("localhost");
    expect(runtime.getSnapshot().settings.port).toBe(41738);

    await bridge.close();
  });

  it("creates, updates, and deletes printers and streams", async () => {
    const runtime = createRuntime();

    const mediaServer = createServer((_request, response) => {
      response.setHeader("content-type", "image/jpeg");
      response.end("jpeg");
    });
    const port = await listen(mediaServer);

    const afterPrinter = await runtime.createPrinter({
      accessCode: "ABCD1234",
      connectionMode: "lan",
      hostname: "printer.local",
      model: "P1S",
      name: "P1S Lab",
      notes: "",
      provider: "bambu-lab",
      serial: "SERIAL-1234",
      streamId: null,
    });
    expect(afterPrinter.printers).toHaveLength(1);

    const afterStream = await runtime.createStream({
      linkedPrinterId: afterPrinter.printers[0].id,
      name: "Bench Cam",
      password: "",
      sourceKind: "snapshot",
      upstreamUrl: `http://127.0.0.1:${port}/latest.jpg`,
      username: "",
    });
    expect(afterStream.streams).toHaveLength(1);
    expect(afterStream.streams[0].status).toBe("online");
    expect(afterStream.streams[0].linkedPrinterId).toBe(
      afterPrinter.printers[0].id,
    );
    expect(afterStream.printers[0].streamId).toBe(afterStream.streams[0].id);

    const updated = await runtime.updatePrinter(afterPrinter.printers[0].id, {
      accessCode: "ABCD1234",
      connectionMode: "developer",
      hostname: "printer.local",
      model: "P1S",
      name: "P1S Lab Updated",
      notes: "Developer mode enabled",
      provider: "bambu-lab",
      serial: "SERIAL-1234",
      streamId: afterStream.streams[0].id,
    });
    expect(updated.printers[0].name).toBe("P1S Lab Updated");

    const afterDeleteStream = runtime.deleteStream(afterStream.streams[0].id);
    expect(afterDeleteStream.streams).toHaveLength(0);
    expect(afterDeleteStream.printers[0].streamId).toBeNull();

    const afterDeletePrinter = runtime.deletePrinter(
      afterPrinter.printers[0].id,
    );
    expect(afterDeletePrinter.printers).toHaveLength(0);
    await closeServer(mediaServer);
  });

  it("allows a printer profile to be saved before local bridge details are known", async () => {
    const runtime = createRuntime();
    await runtime.applyBridgeListening(true, null);
    const bridge = await createBridgeServer(runtime);

    const response = await bridge.inject({
      method: "POST",
      url: "/printers",
      headers: companionAuthHeader(runtime),
      payload: {
        connectionMode: "bambu-connect",
        hostname: "",
        model: "P1S",
        name: "Skip Setup Printer",
        notes: "",
        provider: "bambu-lab",
        serial: "",
        streamId: null,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().printer.hostname).toBe("");
    expect(response.json().printer.serial).toBe("");
    await bridge.close();
  });

  it("hydrates a cloud printer from the signed-in desktop bridge without LAN fields", async () => {
    const runtime = createRuntime();
    const homeDir = mkdtempSync(path.join(os.tmpdir(), "bambuview-home-"));
    tempDirs.push(homeDir);
    process.env.HOME = homeDir;

    createDesktopSession(homeDir, "Bambu Connect", {
      accessToken: "desktop-access-token",
      refreshToken: "desktop-refresh-token",
      userId: "desktop-user-1",
    });

    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.includes("/v1/iot-service/api/user/print")) {
        return new Response(
          JSON.stringify({
            devices: [
              {
                dev_access_code: "ABCD1234",
                dev_id: "SERIAL-CLOUD-001",
                dev_name: "The Forge",
                dev_online: 1,
                dev_product_name: "P1S",
              },
            ],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const snapshot = await runtime.createPrinter({
      accessCode: "",
      connectionMode: "cloud",
      hostname: "",
      model: "P1S",
      name: "The Forge",
      notes: "",
      provider: "bambu-lab",
      serial: "",
      streamId: null,
    });

    expect(snapshot.printers).toHaveLength(1);
    expect(snapshot.printers[0].serial).toBe("SERIAL-CLOUD-001");
    expect(snapshot.printers[0].hostname).toBe("");
    expect(snapshot.printers[0].capabilities.telemetry).toBe("available");
    expect(snapshot.printers[0].capabilities.fileUpload).toBe("available");
  });

  it("uses the detected desktop bridge for cloud file handoff when Bambu Connect is absent", async () => {
    const shellActions = {
      openExternal: vi.fn(async () => {}),
      openPath: vi.fn(async () => ""),
      showItemInFolder: vi.fn(() => {}),
    };
    const runtime = createRuntime({
      shellActions,
    });
    const homeDir = mkdtempSync(path.join(os.tmpdir(), "bambuview-home-"));
    tempDirs.push(homeDir);
    process.env.HOME = homeDir;

    createDesktopSession(homeDir, "BambuStudio", {
      accessToken: "studio-access-token",
      refreshToken: "studio-refresh-token",
      userId: "desktop-user-2",
    });

    const jobPath = path.join(homeDir, "benchy.3mf");
    writeFileSync(jobPath, "fake-3mf");

    const snapshot = await runtime.createPrinter({
      accessCode: "",
      connectionMode: "cloud",
      hostname: "",
      model: "P1S",
      name: "Studio Bridge Printer",
      notes: "",
      provider: "bambu-lab",
      serial: "SERIAL-STUDIO-001",
      streamId: null,
    });

    const result = await runtime.handleFileHandoff(snapshot.printers[0].id, {
      action: "send",
      path: jobPath,
    });

    expect(result.accepted).toBe(true);
    expect(result.detail).toContain("Bambu Studio");
    expect(shellActions.openPath).toHaveBeenCalledWith(jobPath);
    expect(shellActions.openExternal).not.toHaveBeenCalled();
  });

  it("finds a new port when the preferred one is busy", async () => {
    const occupied = net.createServer();
    await new Promise<void>((resolve) =>
      occupied.listen(0, "127.0.0.1", resolve),
    );
    const address = occupied.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected address info.");
    }

    const suggestion = await findAvailablePort("127.0.0.1", address.port);
    expect(suggestion).not.toBe(address.port);
    await closeNetServer(occupied);
  });

  it("checks GitHub releases for a newer Companion build", async () => {
    const runtime = createRuntime();
    const osName =
      process.platform === "darwin"
        ? "MACOS"
        : process.platform === "win32"
          ? "WIN"
          : "LINUX";
    const arch = process.arch === "arm64" ? "ARM64" : "X64";
    const extension =
      process.platform === "darwin"
        ? "dmg"
        : process.platform === "win32"
          ? "exe"
          : "deb";
    const assetName = `BVCompanion-0.0.47-${osName}-Installer-${arch}.${extension}`;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify([
          {
            assets: [
              {
                browser_download_url: `https://example.com/${assetName}`,
                name: assetName,
              },
            ],
            html_url:
              "https://github.com/DeepDaddyTTV/BambuView/releases/tag/bvcompanion-v0.0.47",
            name: "BVCompanion v0.0.47 Alpha",
            prerelease: true,
            tag_name: "bvcompanion-v0.0.47",
          },
        ]),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      )) as typeof fetch;

    const snapshot = await runtime.checkForUpdates();

    expect(snapshot.update.available).toBe(true);
    expect(snapshot.update.latestVersion).toBe("0.0.47");
    expect(snapshot.update.assetName).toContain("BVCompanion-0.0.47");
  });

  it("downloads and opens the latest Companion installer", async () => {
    let openedPath: string | null = null;
    const dir = mkdtempSync(path.join(os.tmpdir(), "bambuview-companion-"));
    tempDirs.push(dir);
    const runtime = new CompanionRuntime({
      appVersion: "0.0.40",
      codec: {
        available: false,
        decrypt: (value) => value,
        encrypt: (value) => value,
      },
      logger: new CompanionLogger(),
      shellActions: {
        openExternal: async () => undefined,
        openPath: async (filePath) => {
          openedPath = filePath;
          return "";
        },
        showItemInFolder: () => undefined,
      },
      stateFile: path.join(dir, "companion-state.json"),
      updateChecksEnabled: false,
    });
    const osName =
      process.platform === "darwin"
        ? "MACOS"
        : process.platform === "win32"
          ? "WIN"
          : "LINUX";
    const arch = process.arch === "arm64" ? "ARM64" : "X64";
    const extension =
      process.platform === "darwin"
        ? "dmg"
        : process.platform === "win32"
          ? "exe"
          : "deb";
    const assetName = `BVCompanion-0.0.47-${osName}-Installer-${arch}.${extension}`;
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.includes("/releases?per_page=20")) {
        return new Response(
          JSON.stringify([
            {
              assets: [
                {
                  browser_download_url: `https://example.com/${assetName}`,
                  name: assetName,
                },
              ],
              html_url:
                "https://github.com/DeepDaddyTTV/BambuView/releases/tag/bvcompanion-v0.0.47",
              name: "BVCompanion v0.0.47 Alpha",
              prerelease: true,
              tag_name: "bvcompanion-v0.0.47",
            },
          ]),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        );
      }

      return new Response("installer-binary", {
        headers: {
          "content-type": "application/octet-stream",
        },
        status: 200,
      });
    }) as typeof fetch;

    await runtime.checkForUpdates();
    const snapshot = await runtime.openUpdateDownload();

    expect(openedPath).not.toBeNull();
    expect(openedPath).toContain(assetName);
    expect(existsSync(openedPath!)).toBe(true);
    expect(readFileSync(openedPath!, "utf8")).toBe("installer-binary");
    expect(snapshot.update.downloadedFileName).toBe(assetName);
    expect(snapshot.update.message).toContain("Installer opened");
  });
});
