import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { COMPANION_APP_NAME } from "@bambuview/contracts";

import { createBridgeServer } from "./bridge";
import { CompanionLogger } from "./logger";
import { findAvailablePort } from "./ports";
import { CompanionRuntime } from "./runtime";

const tempDirs: string[] = [];
const originalFetch = globalThis.fetch;

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { force: true, recursive: true });
  }

  globalThis.fetch = originalFetch;
});

function createRuntime() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "bambuview-companion-"));
  tempDirs.push(dir);
  return new CompanionRuntime({
    appVersion: "0.0.35",
    codec: {
      available: false,
      decrypt: (value) => value,
      encrypt: (value) => value,
    },
    logger: new CompanionLogger(),
    stateFile: path.join(dir, "companion-state.json"),
  });
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
      serverUrl: `http://127.0.0.1:${port}`,
    });

    expect(snapshot.pairing.paired).toBe(true);
    expect(snapshot.pairing.companionName).toBe("Studio Bridge");
    mockServer.close();
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

    const afterDeletePrinter = runtime.deletePrinter(
      afterPrinter.printers[0].id,
    );
    expect(afterDeletePrinter.printers).toHaveLength(0);
    mediaServer.close();
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
    occupied.close();
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
    const assetName = `BVCompanion-0.0.36-${osName}-Installer-${arch}.${extension}`;
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
                "https://github.com/DeepDaddyTTV/BambuView/releases/tag/bvcompanion-v0.0.36",
              name: "BVCompanion v0.0.36 Alpha",
              prerelease: true,
              tag_name: "bvcompanion-v0.0.36",
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
    expect(snapshot.update.latestVersion).toBe("0.0.36");
    expect(snapshot.update.assetName).toContain("BVCompanion-0.0.36");
  });

  it("downloads and opens the latest Companion installer", async () => {
    let openedPath: string | null = null;
    const dir = mkdtempSync(path.join(os.tmpdir(), "bambuview-companion-"));
    tempDirs.push(dir);
    const runtime = new CompanionRuntime({
      appVersion: "0.0.35",
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
    const assetName = `BVCompanion-0.0.35-${osName}-Installer-${arch}.${extension}`;
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
                "https://github.com/DeepDaddyTTV/BambuView/releases/tag/bvcompanion-v0.0.35",
              name: "BVCompanion v0.0.35 Alpha",
              prerelease: true,
              tag_name: "bvcompanion-v0.0.35",
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
