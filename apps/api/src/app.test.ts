import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

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

    const create = await app.inject({
      method: "POST",
      url: "/api/printers/bambu",
      headers: {
        cookie,
      },
      payload: {
        accessCode: "test-access-code",
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
    expect(JSON.stringify(createdPayload)).not.toContain("test-access-code");

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
    expect(fleet.json().printers[0].name).toBe("Office X1 Carbon");

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/printers/bambu",
      headers: {
        cookie,
      },
      payload: {
        accessCode: "test-access-code",
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
