import { mkdtempSync, rmSync } from "node:fs";
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

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { force: true, recursive: true });
  }
});

function createRuntime() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "bambuview-companion-"));
  tempDirs.push(dir);
  return new CompanionRuntime({
    appVersion: "0.0.31",
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

    const afterDeletePrinter = runtime.deletePrinter(afterPrinter.printers[0].id);
    expect(afterDeletePrinter.printers).toHaveLength(0);
    mediaServer.close();
  });

  it("finds a new port when the preferred one is busy", async () => {
    const occupied = net.createServer();
    await new Promise<void>((resolve) => occupied.listen(0, "127.0.0.1", resolve));
    const address = occupied.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected address info.");
    }

    const suggestion = await findAvailablePort("127.0.0.1", address.port);
    expect(suggestion).not.toBe(address.port);
    occupied.close();
  });
});
