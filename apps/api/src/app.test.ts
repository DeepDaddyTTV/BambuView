import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FLEET_CAMERA_TARGET_ID } from "@bambuview/contracts";

import { buildApp } from "./app.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { force: true, recursive: true });
  }
});

function createTestDbPath(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "bambuview-api-"));
  tempDirs.push(dir);
  return path.join(dir, "test.db");
}

describe("auth and settings flows", () => {
  it("allows bootstrap only once", async () => {
    const app = await buildApp({
      appOrigin: "http://localhost:4173",
      databaseFile: createTestDbPath(),
    });

    const first = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: {
        email: "admin@example.com",
        name: "Admin User",
        password: "supersecure",
      },
    });

    expect(first.statusCode).toBe(200);
    expect(first.json().authenticated).toBe(true);

    const second = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: {
        email: "other@example.com",
        name: "Other User",
        password: "supersecure",
      },
    });

    expect(second.statusCode).toBe(409);
    await app.close();
  });

  it("supports invite-only registration and rejects invite reuse", async () => {
    const app = await buildApp({
      appOrigin: "http://localhost:4173",
      databaseFile: createTestDbPath(),
    });

    const bootstrap = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: {
        email: "admin@example.com",
        name: "Admin User",
        password: "supersecure",
      },
    });

    const invite = await app.inject({
      method: "POST",
      url: "/api/users/invites",
      headers: {
        cookie: bootstrap.headers["set-cookie"],
      },
      payload: {
        email: "operator@example.com",
        role: "operator",
      },
    });

    expect(invite.statusCode).toBe(201);
    const invitePayload = invite.json();

    const register = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        inviteId: invitePayload.invite.id,
        inviteToken: invitePayload.inviteToken,
        name: "Operator User",
        password: "supersecure",
      },
    });

    expect(register.statusCode).toBe(200);
    expect(register.json().user.role).toBe("operator");

    const reuse = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        inviteId: invitePayload.invite.id,
        inviteToken: invitePayload.inviteToken,
        name: "Operator User",
        password: "supersecure",
      },
    });

    expect(reuse.statusCode).toBe(409);
    await app.close();
  });

  it("creates a session on login and clears it on logout", async () => {
    const app = await buildApp({
      appOrigin: "http://localhost:4173",
      databaseFile: createTestDbPath(),
    });

    await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: {
        email: "admin@example.com",
        name: "Admin User",
        password: "supersecure",
      },
    });

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "admin@example.com",
        password: "supersecure",
      },
    });

    expect(login.statusCode).toBe(200);
    const cookie = login.headers["set-cookie"];
    expect(cookie).toBeTruthy();

    const session = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: {
        cookie,
      },
    });

    expect(session.json().authenticated).toBe(true);

    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        cookie,
      },
    });

    expect(logout.statusCode).toBe(200);

    const afterLogout = await app.inject({
      method: "GET",
      url: "/api/auth/session",
    });

    expect(afterLogout.json().authenticated).toBe(false);
    await app.close();
  });

  it("supports explicit secure-cookie overrides for direct and proxied deploys", async () => {
    const insecureApp = await buildApp({
      appOrigin: "http://localhost:4173",
      databaseFile: createTestDbPath(),
      secureCookies: false,
    });

    const insecureBootstrap = await insecureApp.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: {
        email: "admin@example.com",
        name: "Admin User",
        password: "supersecure",
      },
    });

    expect(insecureBootstrap.statusCode).toBe(200);
    expect(insecureBootstrap.headers["set-cookie"]).not.toContain("Secure");
    await insecureApp.close();

    const secureApp = await buildApp({
      appOrigin: "https://bambuview.example.com",
      databaseFile: createTestDbPath(),
      secureCookies: true,
    });

    const secureBootstrap = await secureApp.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: {
        email: "admin@example.com",
        name: "Admin User",
        password: "supersecure",
      },
    });

    expect(secureBootstrap.statusCode).toBe(200);
    expect(secureBootstrap.headers["set-cookie"]).toContain("Secure");
    await secureApp.close();
  });

  it("persists appearance settings", async () => {
    const app = await buildApp({
      appOrigin: "http://localhost:4173",
      databaseFile: createTestDbPath(),
    });

    const bootstrap = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: {
        email: "admin@example.com",
        name: "Admin User",
        password: "supersecure",
      },
    });

    const cookie = bootstrap.headers["set-cookie"];

    const save = await app.inject({
      method: "PUT",
      url: "/api/settings/appearance",
      headers: {
        cookie,
      },
      payload: {
        mode: "light",
        darkHighlight: "#7ed321",
        darkBackground: "#101317",
        lightHighlight: "#7ed321",
        lightBackground: "#f7f8fa",
        backgroundStyle: "blueprint",
      },
    });

    expect(save.statusCode).toBe(200);

    const fetch = await app.inject({
      method: "GET",
      url: "/api/settings/appearance",
      headers: {
        cookie,
      },
    });

    expect(fetch.json().appearance.backgroundStyle).toBe("blueprint");
    expect(fetch.json().appearance.mode).toBe("light");
    await app.close();
  });

  it("stores Bambu LAN printer connections without returning the access code", async () => {
    const app = await buildApp({
      appOrigin: "http://localhost:4173",
      databaseFile: createTestDbPath(),
    });

    const bootstrap = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: {
        email: "admin@example.com",
        name: "Admin User",
        password: "supersecure",
      },
    });
    const cookie = bootstrap.headers["set-cookie"];

    const emptyLiveFleet = await app.inject({
      method: "GET",
      url: "/api/fleet/overview?mode=live",
      headers: {
        cookie,
      },
    });

    expect(emptyLiveFleet.statusCode).toBe(200);
    expect(emptyLiveFleet.json().printers).toHaveLength(0);
    expect(emptyLiveFleet.json().selectedPrinterId).toBeNull();
    expect(emptyLiveFleet.json().selectedPrinter).toBeNull();

    const create = await app.inject({
      method: "POST",
      url: "/api/printers/bambu",
      headers: {
        cookie,
      },
      payload: {
        accessCode: "test-access-code",
        connectionMode: "developer",
        host: "127.0.0.1",
        model: "X1 Carbon",
        name: "Office X1 Carbon",
        serial: "00M09A000000001",
      },
    });

    expect(create.statusCode).toBe(201);
    const createdPayload = create.json();
    expect(createdPayload.printer.name).toBe("Office X1 Carbon");
    expect(createdPayload.printer.accessCodeSet).toBe(true);
    expect(createdPayload.printer.connectionMode).toBe("developer");
    expect(createdPayload.test.connectionMode).toBe("developer");
    expect(createdPayload.test.checks.developerMode.status).toBe("available");
    expect(JSON.stringify(createdPayload)).not.toContain("test-access-code");

    const updateWithoutNewAccessCode = await app.inject({
      method: "PUT",
      url: `/api/printers/bambu/${createdPayload.printer.id}`,
      headers: {
        cookie,
      },
      payload: {
        accessCode: "",
        connectionMode: "developer",
        host: "127.0.0.1",
        model: "X1 Carbon",
        name: "Office X1 Carbon Updated",
        serial: "00M09A000000001",
      },
    });

    expect(updateWithoutNewAccessCode.statusCode).toBe(200);
    expect(updateWithoutNewAccessCode.json().printer.name).toBe(
      "Office X1 Carbon Updated",
    );
    expect(updateWithoutNewAccessCode.json().printer.accessCodeSet).toBe(true);
    expect(JSON.stringify(updateWithoutNewAccessCode.json())).not.toContain(
      "test-access-code",
    );

    const connections = await app.inject({
      method: "GET",
      url: "/api/printers/connections",
      headers: {
        cookie,
      },
    });

    expect(connections.statusCode).toBe(200);
    expect(connections.json().printers).toHaveLength(1);
    expect(JSON.stringify(connections.json())).not.toContain(
      "test-access-code",
    );

    const fleet = await app.inject({
      method: "GET",
      url: "/api/fleet/overview",
      headers: {
        cookie,
      },
    });

    expect(fleet.statusCode).toBe(200);
    expect(fleet.json().printers[0].name).toBe("Office X1 Carbon Updated");

    const liveFleet = await app.inject({
      method: "GET",
      url: "/api/fleet/overview?mode=live",
      headers: {
        cookie,
      },
    });

    expect(liveFleet.statusCode).toBe(200);
    expect(liveFleet.json().printers).toHaveLength(1);
    expect(liveFleet.json().stats.printers).toBe(1);
    expect(liveFleet.json().stats.completedToday).toBe(0);

    const cloudModeCreate = await app.inject({
      method: "POST",
      url: "/api/printers/bambu",
      headers: {
        cookie,
      },
      payload: {
        connectionMode: "cloud",
        model: "P1S",
        name: "Studio P1S",
        serial: "00M09A000000002",
      },
    });

    expect(cloudModeCreate.statusCode).toBe(201);
    expect(cloudModeCreate.json().printer.connectionMode).toBe("cloud");
    expect(cloudModeCreate.json().printer.connectionStatus).toBe("unverified");
    expect(cloudModeCreate.json().test.checks.lanControl.status).toBe(
      "not-supported",
    );
    expect(cloudModeCreate.json().test.checks.printJobHandoff.status).toBe(
      "available",
    );

    const bambuConnectCreate = await app.inject({
      method: "POST",
      url: "/api/printers/bambu",
      headers: {
        cookie,
      },
      payload: {
        connectionMode: "bambu-connect",
        model: "A1 Mini",
        name: "Workshop A1 Mini",
        serial: "00M09A000000003",
      },
    });

    expect(bambuConnectCreate.statusCode).toBe(201);
    expect(bambuConnectCreate.json().printer.connectionMode).toBe(
      "bambu-connect",
    );
    expect(bambuConnectCreate.json().printer.connectionStatus).toBe(
      "unverified",
    );
    expect(
      bambuConnectCreate.json().test.checks.bambuConnectBridge.status,
    ).toBe("available");

    const deleteBambuConnect = await app.inject({
      method: "DELETE",
      url: `/api/printers/bambu/${bambuConnectCreate.json().printer.id}`,
      headers: {
        cookie,
      },
    });

    expect(deleteBambuConnect.statusCode).toBe(204);

    const models = await app.inject({
      method: "GET",
      url: "/api/printers/bambu/models",
      headers: {
        cookie,
      },
    });

    expect(models.statusCode).toBe(200);
    expect(
      models.json().models.map((model: { value: string }) => model.value),
    ).toEqual(
      expect.arrayContaining(["H2D", "H2S", "H2C", "P2S", "X2D", "A2L"]),
    );

    const connectImport = await app.inject({
      method: "POST",
      url: "/api/bambu-connect/import-url",
      headers: {
        cookie,
      },
      payload: {
        name: "Flexi Dino",
        path: "/tmp/flexi dino.gcode.3mf",
      },
    });

    expect(connectImport.statusCode).toBe(200);
    expect(connectImport.json().importUrl.url).toBe(
      "bambu-connect://import-file?path=%2Ftmp%2Fflexi%20dino.gcode.3mf&name=Flexi%20Dino",
    );

    const cameraTest = await app.inject({
      method: "POST",
      url: "/api/cameras/sources/test",
      headers: {
        cookie,
      },
      payload: {
        name: "Workbench MJPEG",
        provider: "direct-mjpeg",
        streamUrl: "http://127.0.0.1:1/video.mjpg",
      },
    });

    expect(cameraTest.statusCode).toBe(200);
    expect(cameraTest.json().test.kind).toBe("mjpeg");

    const invalidFrigateTest = await app.inject({
      method: "POST",
      url: "/api/cameras/sources/test",
      headers: {
        cookie,
      },
      payload: {
        name: "Frigate Dashboard Link",
        provider: "frigate",
        streamUrl: "https://frigate.example/#the-forge",
      },
    });

    expect(invalidFrigateTest.statusCode).toBe(200);
    expect(invalidFrigateTest.json().test.status).toBe("degraded");
    expect(invalidFrigateTest.json().test.kind).toBe("unknown");
    expect(invalidFrigateTest.json().test.detail).toContain(
      "Frigate restream URL",
    );

    const cameraCreate = await app.inject({
      method: "POST",
      url: "/api/cameras/sources",
      headers: {
        cookie,
      },
      payload: {
        name: "Workbench MJPEG",
        password: "camera-secret",
        provider: "direct-mjpeg",
        streamUrl: "http://camera-user:camera-secret@127.0.0.1:1/video.mjpg",
        username: "camera-user",
      },
    });

    expect(cameraCreate.statusCode).toBe(201);
    expect(cameraCreate.json().source.name).toBe("Workbench MJPEG");
    expect(JSON.stringify(cameraCreate.json())).not.toContain("camera-secret");
    expect(cameraCreate.json().source.displayUrl).not.toContain(
      "camera-secret",
    );

    const cameraSourceId = cameraCreate.json().source.id;
    const assignCamera = await app.inject({
      method: "POST",
      url: "/api/cameras/assignments",
      headers: {
        cookie,
      },
      payload: {
        feedLabel: "Printer Cam",
        printerId: createdPayload.printer.id,
        sourceId: cameraSourceId,
      },
    });

    expect(assignCamera.statusCode).toBe(200);
    expect(assignCamera.json().assignment.sourceId).toBe(cameraSourceId);

    const cameras = await app.inject({
      method: "GET",
      url: "/api/cameras",
      headers: {
        cookie,
      },
    });

    expect(cameras.statusCode).toBe(200);
    expect(JSON.stringify(cameras.json())).not.toContain("camera-secret");
    expect(
      cameras.json().sources.map((source: { id: string }) => source.id),
    ).toContain(cameraSourceId);
    expect(
      cameras.json().sources.map((source: { id: string }) => source.id),
    ).not.toContain(`${createdPayload.printer.id}-bambu-printer`);
    expect(
      cameras
        .json()
        .assignments.map((item: { sourceId: string }) => item.sourceId),
    ).toContain(cameraSourceId);
    expect(
      cameras
        .json()
        .assignments.some(
          (item: { sourceId: string; targetType: string }) =>
            item.sourceId === cameraSourceId && item.targetType === "printer",
        ),
    ).toBe(true);

    const fleetCamera = await app.inject({
      method: "POST",
      url: "/api/cameras/assignments",
      headers: {
        cookie,
      },
      payload: {
        feedLabel: "Fleet Overview",
        printerId: FLEET_CAMERA_TARGET_ID,
        sourceId: cameraSourceId,
        targetType: "fleet",
      },
    });

    expect(fleetCamera.statusCode).toBe(200);
    expect(fleetCamera.json().assignment.targetName).toBe("Fleet Overview");
    expect(fleetCamera.json().assignment.targetType).toBe("fleet");

    const cameraUpdate = await app.inject({
      method: "PUT",
      url: `/api/cameras/sources/${cameraSourceId}`,
      headers: {
        cookie,
      },
      payload: {
        name: "Workbench Network Bridge",
        provider: "network-plugin",
        streamUrl: "http://127.0.0.1:1/network-plugin.mjpg",
      },
    });

    expect(cameraUpdate.statusCode).toBe(200);
    expect(cameraUpdate.json().source.name).toBe("Workbench Network Bridge");
    expect(cameraUpdate.json().source.provider).toBe("network-plugin");

    const deleteFleetAssignment = await app.inject({
      method: "DELETE",
      url: `/api/cameras/assignments/${fleetCamera.json().assignment.feedId}`,
      headers: {
        cookie,
      },
    });

    expect(deleteFleetAssignment.statusCode).toBe(204);

    const deleteCameraSource = await app.inject({
      method: "DELETE",
      url: `/api/cameras/sources/${cameraSourceId}`,
      headers: {
        cookie,
      },
    });

    expect(deleteCameraSource.statusCode).toBe(204);

    const camerasAfterDelete = await app.inject({
      method: "GET",
      url: "/api/cameras",
      headers: {
        cookie,
      },
    });

    expect(
      camerasAfterDelete
        .json()
        .sources.map((source: { id: string }) => source.id),
    ).not.toContain(cameraSourceId);
    expect(
      camerasAfterDelete
        .json()
        .assignments.some(
          (item: { sourceId: string }) => item.sourceId === cameraSourceId,
        ),
    ).toBe(false);

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/printers/bambu",
      headers: {
        cookie,
      },
      payload: {
        accessCode: "test-access-code",
        connectionMode: "developer",
        host: "127.0.0.1",
        model: "X1 Carbon",
        name: "Office X1 Carbon",
        serial: "00M09A000000001",
      },
    });

    expect(duplicate.statusCode).toBe(409);
    await app.close();
  });
});

describe("companion integration", () => {
  it("merges paired companion discovery into printer discovery results", async () => {
    const app = await buildApp({
      appOrigin: "http://localhost:4173",
      databaseFile: createTestDbPath(),
    });

    const bootstrap = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: {
        email: "admin@example.com",
        name: "Admin User",
        password: "supersecure",
      },
    });
    const cookie = bootstrap.headers["set-cookie"];

    const pairingCodeResponse = await app.inject({
      method: "POST",
      url: "/api/companions/pairing-codes",
      headers: {
        cookie,
      },
      payload: {},
    });
    expect(pairingCodeResponse.statusCode).toBe(201);
    const pairingCode = pairingCodeResponse.json().pairingCode.code as string;

    const bridgeToken = "bridge-token-discovery-123456";
    const companionServer = createServer((request, response) => {
      if (
        request.headers.authorization !==
        `Basic ${Buffer.from(`companion:${bridgeToken}`).toString("base64")}`
      ) {
        response.statusCode = 401;
        response.end(JSON.stringify({ message: "Unauthorized" }));
        return;
      }

      response.setHeader("content-type", "application/json");
      if (request.url === "/health") {
        response.end(
          JSON.stringify({
            appName: "BambuView Companion",
            appVersion: "0.0.41",
            bridge: {
              baseUrl: "http://127.0.0.1:41738",
              bindMode: "localhost",
              host: "localhost",
              port: 41738,
              suggestedPort: null,
            },
            bridgeSources: [
              {
                detail: "Bambu Connect is installed locally.",
                id: "bambu-connect",
                kind: "bambu-connect",
                label: "Bambu Connect",
                location: "/Applications/Bambu Connect.app",
                status: "configured",
              },
            ],
            pairing: {
              paired: true,
              companionId: "companion-discovery",
              companionName: "Discovery Bridge",
              pairedAt: new Date().toISOString(),
              serverUrl: "http://localhost:4173",
            },
            status: "paired",
            capabilities: {
              discovery: "available",
              telemetry: "available",
              camera: "available",
              controls: "available",
              fileUpload: "available",
              ams: "available",
              slicingAssist: "available",
            },
            capabilityNotes: {},
            warnings: [],
          }),
        );
        return;
      }

      if (request.url === "/capabilities") {
        response.end(
          JSON.stringify({
            capabilities: {
              discovery: "available",
              telemetry: "available",
              camera: "available",
              controls: "available",
              fileUpload: "available",
              ams: "available",
              slicingAssist: "available",
            },
            capabilityNotes: {
              discovery: "Desktop bridge discovery is available.",
            },
          }),
        );
        return;
      }

      if (request.url === "/printers") {
        response.end(
          JSON.stringify({
            printers: [],
          }),
        );
        return;
      }

      if (request.url === "/streams") {
        response.end(
          JSON.stringify({
            streams: [],
          }),
        );
        return;
      }

      if (request.url === "/printers/discover") {
        response.end(
          JSON.stringify({
            attemptedAt: new Date().toISOString(),
            bridgeSources: [
              {
                detail: "Bambu Connect is installed locally.",
                id: "bambu-connect",
                kind: "bambu-connect",
                label: "Bambu Connect",
                location: "/Applications/Bambu Connect.app",
                status: "configured",
              },
            ],
            detail: "Companion found one cached desktop printer profile.",
            instructions: ["Desktop bridge discovery is available."],
            printers: [
              {
                id: "desktop-printer-1",
                name: "Desktop P1S",
                provider: "bambu-lab",
                model: "P1S",
                hostname: "desktop-p1s.local",
                serial: "P1S-DESKTOP-001",
                connectionMode: "bambu-connect",
                notes: "Imported from detected bambu connect desktop data.",
                streamId: null,
                accessCodeSet: false,
                capabilities: {
                  discovery: "available",
                  telemetry: "requires_setup",
                  camera: "requires_setup",
                  controls: "requires_setup",
                  fileUpload: "available",
                  ams: "requires_setup",
                  slicingAssist: "available",
                },
                capabilityNotes: {
                  discovery: "Desktop bridge discovery is available.",
                },
                lastSeenAt: new Date().toISOString(),
                lastTestedAt: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
            supported: true,
          }),
        );
        return;
      }

      response.statusCode = 404;
      response.end(JSON.stringify({ message: "Not found" }));
    });

    await new Promise<void>((resolve) =>
      companionServer.listen(0, "127.0.0.1", resolve),
    );
    const address = companionServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected companion server address.");
    }

    const pair = await app.inject({
      method: "POST",
      url: "/api/companions/pair",
      payload: {
        baseUrl: `http://127.0.0.1:${address.port}`,
        bridgeToken,
        capabilities: {
          discovery: "available",
          telemetry: "available",
          camera: "available",
          controls: "available",
          fileUpload: "available",
          ams: "available",
          slicingAssist: "available",
        },
        capabilityNotes: {},
        companionName: "Discovery Bridge",
        pairingToken: pairingCode,
      },
    });

    expect(pair.statusCode).toBe(201);

    const discovery = await app.inject({
      method: "GET",
      url: "/api/printers/discover",
      headers: {
        cookie,
      },
    });

    expect(discovery.statusCode).toBe(200);
    expect(discovery.json().supported).toBe(true);
    expect(discovery.json().printers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          host: "desktop-p1s.local",
          model: "P1S",
          name: "Desktop P1S",
          serial: "P1S-DESKTOP-001",
          source: "companion",
        }),
      ]),
    );
    expect(discovery.json().instructions).toContain(
      "Companion-discovered printers can be imported even when they rely on Bambu Connect or another local bridge surface.",
    );

    companionServer.close();
    await app.close();
  });

  it("pairs a companion, tests the connection, and imports a stream as a camera source", async () => {
    const app = await buildApp({
      appOrigin: "http://localhost:4173",
      databaseFile: createTestDbPath(),
    });

    const bootstrap = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: {
        email: "admin@example.com",
        name: "Admin User",
        password: "supersecure",
      },
    });
    const cookie = bootstrap.headers["set-cookie"];

    const pairingCodeResponse = await app.inject({
      method: "POST",
      url: "/api/companions/pairing-codes",
      headers: {
        cookie,
      },
    });
    expect(pairingCodeResponse.statusCode).toBe(201);
    const pairingCode = pairingCodeResponse.json().pairingCode.code as string;

    const bridgeToken = "bridge-token-1234567890";
    const companionServer = createServer((request, response) => {
      if (
        request.headers.authorization !==
        `Basic ${Buffer.from(`companion:${bridgeToken}`).toString("base64")}`
      ) {
        response.statusCode = 401;
        response.end(JSON.stringify({ message: "Unauthorized" }));
        return;
      }

      response.setHeader("content-type", "application/json");
      if (request.url === "/health") {
        response.end(
          JSON.stringify({
            appName: "BambuView Companion",
            appVersion: "0.0.41",
            bridge: {
              baseUrl: "http://127.0.0.1:41738",
              bindMode: "localhost",
              host: "localhost",
              port: 41738,
              suggestedPort: null,
            },
            bridgeSources: [],
            pairing: {
              paired: true,
              companionId: "companion-1",
              companionName: "Studio Bridge",
              pairedAt: new Date().toISOString(),
              serverUrl: "http://localhost:4173",
            },
            status: "paired",
            capabilities: {
              discovery: "unavailable",
              telemetry: "available",
              camera: "available",
              controls: "unavailable",
              fileUpload: "unavailable",
              ams: "available",
              slicingAssist: "future",
            },
            capabilityNotes: {},
            warnings: [],
          }),
        );
        return;
      }

      if (request.url === "/capabilities") {
        response.end(
          JSON.stringify({
            capabilities: {
              discovery: "unavailable",
              telemetry: "available",
              camera: "available",
              controls: "unavailable",
              fileUpload: "unavailable",
              ams: "available",
              slicingAssist: "future",
            },
            capabilityNotes: {
              telemetry: "Local telemetry is available.",
            },
          }),
        );
        return;
      }

      if (request.url === "/printers") {
        response.end(
          JSON.stringify({
            printers: [],
          }),
        );
        return;
      }

      if (request.url === "/streams") {
        response.end(
          JSON.stringify({
            streams: [
              {
                id: "stream-1",
                name: "Printer Cam",
                sourceKind: "mjpeg",
                outputKind: "mjpeg",
                upstreamUrl: "http://camera.local/live.mjpg",
                linkedPrinterId: null,
                status: "online",
                details: "Browser-compatible stream ready.",
                snapshotPath: null,
                mjpegPath: "/streams/stream-1/mjpeg",
                hlsPath: null,
                lastTestedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          }),
        );
        return;
      }

      response.statusCode = 404;
      response.end(JSON.stringify({ message: "Not found" }));
    });

    await new Promise<void>((resolve) =>
      companionServer.listen(0, "127.0.0.1", resolve),
    );
    const address = companionServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected companion server address.");
    }

    const pair = await app.inject({
      method: "POST",
      url: "/api/companions/pair",
      payload: {
        baseUrl: `http://127.0.0.1:${address.port}`,
        bridgeToken,
        capabilities: {
          discovery: "unavailable",
          telemetry: "available",
          camera: "available",
          controls: "unavailable",
          fileUpload: "unavailable",
          ams: "available",
          slicingAssist: "future",
        },
        capabilityNotes: {},
        companionName: "Studio Bridge",
        pairingToken: pairingCode,
      },
    });

    expect(pair.statusCode).toBe(201);
    const pairedCompanionId = pair.json().companion.id as string;

    const test = await app.inject({
      method: "POST",
      url: `/api/companions/${pairedCompanionId}/test`,
      headers: {
        cookie,
      },
    });
    expect(test.statusCode).toBe(200);
    expect(test.json().snapshot.streams).toHaveLength(1);

    const imported = await app.inject({
      method: "POST",
      url: `/api/companions/${pairedCompanionId}/import-streams/stream-1`,
      headers: {
        cookie,
      },
      payload: {},
    });
    expect(imported.statusCode).toBe(201);

    const cameras = await app.inject({
      method: "GET",
      url: "/api/cameras",
      headers: {
        cookie,
      },
    });
    expect(cameras.statusCode).toBe(200);
    expect(cameras.json().sources[0].provider).toBe("bambuview-companion");

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/companions/${pairedCompanionId}`,
      headers: {
        cookie,
      },
    });
    expect(removed.statusCode).toBe(204);

    const companionsAfterDelete = await app.inject({
      method: "GET",
      url: "/api/companions",
      headers: {
        cookie,
      },
    });
    expect(companionsAfterDelete.statusCode).toBe(200);
    expect(companionsAfterDelete.json().companions).toHaveLength(0);

    const camerasAfterDelete = await app.inject({
      method: "GET",
      url: "/api/cameras",
      headers: {
        cookie,
      },
    });
    expect(camerasAfterDelete.statusCode).toBe(200);
    expect(camerasAfterDelete.json().sources).toHaveLength(0);
    expect(camerasAfterDelete.json().assignments).toHaveLength(0);

    companionServer.close();
    await app.close();
  });

  it("uses paired companion telemetry and camera feeds in live fleet responses", async () => {
    const app = await buildApp({
      appOrigin: "http://localhost:4173",
      databaseFile: createTestDbPath(),
    });

    const bootstrap = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: {
        email: "admin@example.com",
        name: "Admin User",
        password: "supersecure",
      },
    });
    const cookie = bootstrap.headers["set-cookie"];

    const pairingCodeResponse = await app.inject({
      method: "POST",
      url: "/api/companions/pairing-codes",
      headers: {
        cookie,
      },
    });
    const pairingCode = pairingCodeResponse.json().pairingCode.code as string;
    const bridgeToken = "bridge-token-telemetry-123456";
    const snapshotBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

    const companionServer = createServer((request, response) => {
      if (
        request.headers.authorization !==
        `Basic ${Buffer.from(`companion:${bridgeToken}`).toString("base64")}`
      ) {
        response.statusCode = 401;
        response.end(JSON.stringify({ message: "Unauthorized" }));
        return;
      }

      if (request.url === "/printers/companion-printer-1/camera/snapshot") {
        response.statusCode = 200;
        response.setHeader("content-type", "image/jpeg");
        response.end(snapshotBytes);
        return;
      }

      if (request.url === "/printers/companion-printer-1/camera/mjpeg") {
        response.statusCode = 200;
        response.setHeader("content-type", "multipart/x-mixed-replace");
        response.end("--frame\r\n");
        return;
      }

      response.setHeader("content-type", "application/json");
      if (request.url === "/health") {
        response.end(
          JSON.stringify({
            appName: "BambuView Companion",
            appVersion: "0.0.41",
            bridge: {
              baseUrl: "http://127.0.0.1:41738",
              bindMode: "localhost",
              host: "localhost",
              port: 41738,
              suggestedPort: null,
            },
            bridgeSources: [],
            pairing: {
              paired: true,
              companionId: "companion-telemetry",
              companionName: "Telemetry Bridge",
              pairedAt: new Date().toISOString(),
              serverUrl: "http://localhost:4173",
            },
            status: "streaming",
            capabilities: {
              discovery: "unavailable",
              telemetry: "available",
              camera: "available",
              controls: "unavailable",
              fileUpload: "unavailable",
              ams: "available",
              slicingAssist: "future",
            },
            capabilityNotes: {},
            warnings: [],
          }),
        );
        return;
      }

      if (request.url === "/capabilities") {
        response.end(
          JSON.stringify({
            capabilities: {
              discovery: "unavailable",
              telemetry: "available",
              camera: "available",
              controls: "unavailable",
              fileUpload: "unavailable",
              ams: "available",
              slicingAssist: "future",
            },
            capabilityNotes: {
              telemetry: "Local telemetry is available.",
              camera: "Local companion camera is available.",
            },
          }),
        );
        return;
      }

      if (request.url === "/printers") {
        response.end(
          JSON.stringify({
            printers: [
              {
                id: "companion-printer-1",
                name: "The Forge",
                provider: "bambu-lab",
                model: "P1S",
                hostname: "p1s.local",
                serial: "P1S-TEST-001",
                connectionMode: "lan",
                notes: "",
                streamId: null,
                accessCodeSet: true,
                capabilities: {
                  discovery: "unavailable",
                  telemetry: "available",
                  camera: "available",
                  controls: "unavailable",
                  fileUpload: "unavailable",
                  ams: "available",
                  slicingAssist: "future",
                },
                capabilityNotes: {},
                lastSeenAt: new Date().toISOString(),
                lastTestedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          }),
        );
        return;
      }

      if (request.url === "/streams") {
        response.end(
          JSON.stringify({
            streams: [],
          }),
        );
        return;
      }

      if (request.url === "/printers/companion-printer-1/telemetry") {
        response.end(
          JSON.stringify({
            telemetry: {
              available: true,
              checkedAt: new Date().toISOString(),
              elapsedMinutes: 97,
              eta: new Date(Date.now() + 43 * 60 * 1000).toISOString(),
              fanState: null,
              fileName: "Forge_Test_Part.3mf",
              firmwareVersion: "01.09.00.00",
              layerCurrent: 87,
              layerTotal: 240,
              message: "Printing over companion telemetry.",
              nozzleTemperature: 219.7,
              nozzleTargetTemperature: 220,
              bedTemperature: 59.8,
              bedTargetTemperature: 60,
              chamberTemperature: 34.9,
              chamberTargetTemperature: 35,
              printStatus: "printing",
              progress: 47,
              readiness: "busy",
              remainingMinutes: 43,
              state: "Printing",
              warnings: [],
              amsState: "loaded",
              slots: [
                {
                  slot: "A1",
                  material: "PLA",
                  color: "#66d139",
                  colorName: "Matte Green",
                  active: true,
                },
                {
                  slot: "B2",
                  material: "PLA",
                  color: "#b8babd",
                  colorName: "Gray",
                  active: false,
                },
              ],
            },
          }),
        );
        return;
      }

      response.statusCode = 404;
      response.end(JSON.stringify({ message: "Not found" }));
    });

    await new Promise<void>((resolve) =>
      companionServer.listen(0, "127.0.0.1", resolve),
    );
    const address = companionServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected companion server address.");
    }

    const pair = await app.inject({
      method: "POST",
      url: "/api/companions/pair",
      payload: {
        baseUrl: `http://127.0.0.1:${address.port}`,
        bridgeToken,
        capabilities: {
          discovery: "unavailable",
          telemetry: "available",
          camera: "available",
          controls: "unavailable",
          fileUpload: "unavailable",
          ams: "available",
          slicingAssist: "future",
        },
        capabilityNotes: {},
        companionName: "Telemetry Bridge",
        pairingToken: pairingCode,
      },
    });

    expect(pair.statusCode).toBe(201);
    const companionId = pair.json().companion.id as string;

    const printerCreate = await app.inject({
      method: "POST",
      url: "/api/printers/bambu",
      headers: {
        cookie,
      },
      payload: {
        connectionMode: "bambu-connect",
        host: "",
        model: "P1S",
        name: "The Forge",
        serial: "P1S-TEST-001",
      },
    });
    expect(printerCreate.statusCode).toBe(201);
    const printerId = printerCreate.json().printer.id as string;

    const fleet = await app.inject({
      method: "GET",
      url: "/api/fleet/overview?mode=live",
      headers: {
        cookie,
      },
    });
    expect(fleet.statusCode).toBe(200);
    const fleetPrinter = fleet
      .json()
      .printers.find((printer: { id: string }) => printer.id === printerId);
    expect(fleetPrinter).toMatchObject({
      fileName: "Forge_Test_Part.3mf",
      progress: 47,
      status: "printing",
      telemetryState: "live",
    });
    expect(fleetPrinter.telemetryMessage).toContain("BambuView Companion");

    const detail = await app.inject({
      method: "GET",
      url: `/api/printers/${printerId}?mode=live`,
      headers: {
        cookie,
      },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().cameraFeeds[0]).toMatchObject({
      label: "Printer Cam",
      snapshotUrl: `/api/companions/${companionId}/printers/companion-printer-1/camera/snapshot`,
      streamUrl: `/api/companions/${companionId}/printers/companion-printer-1/camera/stream`,
      streamKind: "mjpeg",
    });

    const snapshot = await app.inject({
      method: "GET",
      url: `/api/companions/${companionId}/printers/companion-printer-1/camera/snapshot`,
      headers: {
        cookie,
      },
    });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.headers["content-type"]).toContain("image/jpeg");
    expect(snapshot.rawPayload).toEqual(snapshotBytes);

    companionServer.close();
    await app.close();
  });
});

describe("prepare workbench", () => {
  it("persists, updates, marks, and deletes saved prepare projects", async () => {
    const app = await buildApp({
      appOrigin: "http://localhost:4173",
      databaseFile: createTestDbPath(),
    });

    const bootstrap = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap",
      payload: {
        email: "admin@example.com",
        name: "Admin User",
        password: "supersecure",
      },
    });
    const cookie = bootstrap.headers["set-cookie"];

    const workspaceDir = mkdtempSync(
      path.join(os.tmpdir(), "bambuview-prepare-"),
    );
    tempDirs.push(workspaceDir);
    const sourcePath = path.join(workspaceDir, "miniature.sl1");
    const outputPath = path.join(workspaceDir, "miniature-export.sl1s");
    writeFileSync(sourcePath, "source");
    writeFileSync(outputPath, "output");

    const create = await app.inject({
      method: "POST",
      url: "/api/prepare/projects",
      headers: {
        cookie,
      },
      payload: {
        inputType: ".sl1",
        jobName: "Resin Miniature",
        layerProfile: "0.05mm Standard Resin",
        materialProfile: "Tough Resin Gray",
        notes: "First staged resin export.",
        outputPath,
        printerId: null,
        sourcePath,
        workflowId: "resin",
      },
    });

    expect(create.statusCode).toBe(201);
    const projectId = create.json().project.id as string;
    expect(create.json().workspace.projects).toHaveLength(1);

    const workspace = await app.inject({
      method: "GET",
      url: "/api/prepare/workspace",
      headers: {
        cookie,
      },
    });

    expect(workspace.statusCode).toBe(200);
    expect(workspace.json().workspace.projects[0]).toEqual(
      expect.objectContaining({
        fileName: "miniature-export.sl1s",
        jobName: "Resin Miniature",
        outputExists: true,
        sourceExists: true,
        state: "sliced",
        workflowId: "resin",
      }),
    );

    const update = await app.inject({
      method: "PUT",
      url: `/api/prepare/projects/${projectId}`,
      headers: {
        cookie,
      },
      payload: {
        inputType: ".sl1",
        jobName: "Resin Miniature Rev A",
        layerProfile: "0.03mm Fine Resin",
        materialProfile: "Model Resin Ivory",
        notes: "Updated for a finer resin pass.",
        outputPath,
        printerId: null,
        sourcePath,
        workflowId: "resin",
      },
    });

    expect(update.statusCode).toBe(200);
    expect(update.json().project.jobName).toBe("Resin Miniature Rev A");

    const markAction = await app.inject({
      method: "POST",
      url: `/api/prepare/projects/${projectId}/actions`,
      headers: {
        cookie,
      },
      payload: {
        label: "Project sent",
      },
    });

    expect(markAction.statusCode).toBe(200);

    const status = await app.inject({
      method: "GET",
      url: "/api/prepare/status",
      headers: {
        cookie,
      },
    });

    expect(status.statusCode).toBe(200);
    expect(status.json().workspace.projects[0]).toEqual(
      expect.objectContaining({
        jobName: "Resin Miniature Rev A",
        lastActionLabel: "Project sent",
        state: "sent",
      }),
    );

    const remove = await app.inject({
      method: "DELETE",
      url: `/api/prepare/projects/${projectId}`,
      headers: {
        cookie,
      },
    });

    expect(remove.statusCode).toBe(204);

    const emptyWorkspace = await app.inject({
      method: "GET",
      url: "/api/prepare/workspace",
      headers: {
        cookie,
      },
    });

    expect(emptyWorkspace.statusCode).toBe(200);
    expect(emptyWorkspace.json().workspace.projects).toHaveLength(0);
    await app.close();
  });
});
