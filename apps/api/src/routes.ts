import { Readable } from "node:stream";

import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  BAMBU_PRINTER_MODELS,
  COMPANION_BRIDGE_USERNAME,
  FLEET_CAMERA_TARGET_ID,
  type AppearanceSettings,
  type AuthSession,
  type CameraAssignmentInput,
  type CameraSourceInput,
  type BambuConnectImportRequest,
  type BambuPrinterConnectionInput,
  type CompanionConnectionSnapshot,
  type CompanionPairingRequest,
  type UserProfile,
} from "@bambuview/contracts";

import { buildBambuConnectImportUrl, testBambuLanConnection } from "./bambu.js";
import {
  cameraProxyTarget,
  cameraRequestHeaders,
  normalizeCameraSourceInput,
  testCameraSource,
} from "./cameras.js";
import { fetchCompanionSnapshot } from "./companion.js";
import {
  clearSessionCookie,
  createRawToken,
  createAuthenticatedSession,
  destroySession,
  getExpiry,
  getSessionContext,
  hashPassword,
  hashToken,
  verifyPassword,
} from "./auth.js";
import type { AppConfig } from "./config.js";
import {
  countAdmins,
  countUsers,
  createCameraSource,
  createCompanionPairingCode,
  createInvite,
  createPrinterConnection,
  deleteCompanion,
  createUser,
  deleteCameraAssignment,
  deleteCameraSource,
  deletePrinterConnection,
  findActiveCompanionPairingCodeByTokenHash,
  findActiveInviteByTokenHash,
  getCompanionSecretById,
  findInviteById,
  getCameraSourceSecretById,
  getAppearance,
  getPrinterConnectionById,
  getPrinterConnectionBySerial,
  getPrinterConnectionSecretById,
  getUserByEmail,
  getUserById,
  listInvites,
  listCompanions,
  listPrinterConnections,
  listUsers,
  markCompanionPairingCodeUsed,
  markInviteUsed,
  upsertCompanionRegistration,
  updateCompanionSnapshot,
  updateCameraSource,
  updatePrinterConnection,
  upsertCameraAssignment,
  type AppDatabase,
  upsertAppearance,
  updateUserRole,
} from "./db.js";
import type {
  CameraProvider,
  PrinterProvider,
  SliceProvider,
} from "./providers.js";

const bootstrapSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(2),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

const registerSchema = z.object({
  inviteId: z.uuid(),
  inviteToken: z.string().min(24),
  name: z.string().trim().min(2),
  password: z.string().min(8),
});

const inviteSchema = z.object({
  email: z.email(),
  role: z.enum(["admin", "operator", "viewer"]),
});

const roleSchema = z.object({
  role: z.enum(["admin", "operator", "viewer"]),
});

const appearanceSchema = z.object({
  mode: z.enum(["dark", "light"]),
  darkHighlight: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  darkBackground: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  lightHighlight: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  lightBackground: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  backgroundStyle: z.enum(["topo", "two-tone", "blueprint", "sweep", "plain"]),
});

const bambuPrinterSchema = z
  .object({
    accessCode: z.string().trim().max(128).optional(),
    connectionMode: z
      .enum(["cloud", "bambu-connect", "lan", "developer"])
      .default("cloud"),
    host: z
      .string()
      .trim()
      .max(255)
      .default("")
      .refine((value) => !value.includes("://") && !/\s/.test(value), {
        message: "Enter a hostname or IP address without a protocol.",
      }),
    model: z.string().trim().min(2).max(80),
    name: z.string().trim().min(2).max(80),
    serial: z.string().trim().min(4).max(80),
  })
  .superRefine((value, context) => {
    const isRawLanMode =
      value.connectionMode === "lan" || value.connectionMode === "developer";
    if (isRawLanMode && value.host.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Hostname or IP is required for LAN and Developer Mode.",
        path: ["host"],
      });
    }

    if (value.accessCode && value.accessCode.length > 0) {
      if (value.accessCode.length < 4) {
        context.addIssue({
          code: "custom",
          message: "Access code must be at least 4 characters.",
          path: ["accessCode"],
        });
      }
      return;
    }

    if (isRawLanMode) {
      context.addIssue({
        code: "custom",
        message: "LAN access code is required for LAN and Developer Mode.",
        path: ["accessCode"],
      });
    }
  });

const bambuConnectImportSchema = z.object({
  name: z.string().trim().min(1).max(120),
  path: z.string().trim().min(1).max(2048),
});

const cameraSourceSchema = z
  .object({
    frigateBaseUrl: z.string().trim().max(2048).optional(),
    frigateCamera: z.string().trim().max(160).optional(),
    name: z.string().trim().min(2).max(120),
    password: z.string().trim().max(512).optional(),
    provider: z.enum([
      "frigate",
      "direct-rtsp",
      "direct-http",
      "direct-mjpeg",
      "bambu",
      "bambu-connect",
      "bambuview-companion",
      "farm-overview",
      "network-plugin",
    ]),
    streamUrl: z.string().trim().max(2048).optional(),
    username: z.string().trim().max(160).optional(),
  })
  .superRefine((value, context) => {
    if (value.provider === "frigate") {
      const hasRestreamUrl = Boolean(value.streamUrl);
      const hasStructuredTarget = Boolean(
        value.frigateBaseUrl && value.frigateCamera,
      );

      if (!hasRestreamUrl && !hasStructuredTarget) {
        context.addIssue({
          code: "custom",
          message:
            "Frigate restream URL is required, for example http://frigate:5000/api/workbench_left.",
          path: ["streamUrl"],
        });
      }
      return;
    }

    if (!value.streamUrl) {
      context.addIssue({
        code: "custom",
        message: "A camera stream URL is required.",
        path: ["streamUrl"],
      });
    }
  });

const cameraAssignmentSchema = z.object({
  feedLabel: z.string().trim().min(2).max(80),
  printerId: z.string().trim().min(1).max(160),
  sourceId: z.uuid(),
  targetType: z.enum(["printer", "fleet"]).optional().default("printer"),
});

const fleetModeSchema = z.object({
  mode: z.enum(["live", "placeholder"]).default("placeholder"),
});

const companionCapabilityStateSchema = z.enum([
  "available",
  "unavailable",
  "requires_setup",
  "requires_restream",
  "requires_developer_mode",
  "future",
  "unsupported",
]);

const companionCapabilitiesSchema = z.object({
  discovery: companionCapabilityStateSchema,
  telemetry: companionCapabilityStateSchema,
  camera: companionCapabilityStateSchema,
  controls: companionCapabilityStateSchema,
  fileUpload: companionCapabilityStateSchema,
  ams: companionCapabilityStateSchema,
  slicingAssist: companionCapabilityStateSchema,
});

const companionCapabilityNotesSchema = z.object({
  discovery: z.string().optional(),
  telemetry: z.string().optional(),
  camera: z.string().optional(),
  controls: z.string().optional(),
  fileUpload: z.string().optional(),
  ams: z.string().optional(),
  slicingAssist: z.string().optional(),
});

const companionPairSchema = z.object({
  baseUrl: z.url(),
  bridgeToken: z.string().trim().min(16).max(256),
  capabilities: companionCapabilitiesSchema,
  capabilityNotes: companionCapabilityNotesSchema.default({}),
  companionName: z.string().trim().min(2).max(120),
  pairingToken: z.string().trim().min(16),
});

const companionImportSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
});

interface RouteDependencies {
  cameraProvider: CameraProvider;
  config: AppConfig;
  db: AppDatabase;
  printerProvider: PrinterProvider;
  sliceProvider: SliceProvider;
}

type SessionLike = {
  appearance: AppearanceSettings;
  user: Pick<
    UserProfile,
    "createdAt" | "email" | "id" | "name" | "role" | "status"
  >;
} | null;

function buildSessionResponse(
  session: SessionLike,
  bootstrapRequired: boolean,
): AuthSession {
  if (!session) {
    return {
      authenticated: false,
      bootstrapRequired,
      user: null,
      appearance: null,
    };
  }

  return {
    authenticated: true,
    bootstrapRequired: false,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      status: session.user.status,
      createdAt: session.user.createdAt,
    },
    appearance: session.appearance,
  };
}

async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: RouteDependencies,
) {
  const session = await getSessionContext(
    dependencies.db,
    dependencies.config,
    request,
  );
  if (!session) {
    clearSessionCookie(reply, dependencies.config);
    return reply.code(401).send({ message: "Authentication required." });
  }

  return session;
}

async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: RouteDependencies,
) {
  const session = await requireSession(request, reply, dependencies);
  if (!session || "statusCode" in session) {
    return session;
  }

  if (session.user.role !== "admin") {
    return reply.code(403).send({ message: "Admin access is required." });
  }

  return session;
}

export async function registerRoutes(
  app: FastifyInstance,
  dependencies: RouteDependencies,
): Promise<void> {
  app.get("/api/health", async () => ({
    ok: true,
  }));

  app.get("/api/auth/session", async (request, reply) => {
    const bootstrapRequired = (await countUsers(dependencies.db)) === 0;
    const session = await getSessionContext(
      dependencies.db,
      dependencies.config,
      request,
    );
    if (!session) {
      clearSessionCookie(reply, dependencies.config);
    }

    return buildSessionResponse(session, bootstrapRequired);
  });

  app.post("/api/auth/bootstrap", async (request, reply) => {
    if ((await countUsers(dependencies.db)) > 0) {
      return reply
        .code(409)
        .send({ message: "Bootstrap has already been completed." });
    }

    const body = bootstrapSchema.parse(request.body);
    const existing = await getUserByEmail(dependencies.db, body.email);
    if (existing) {
      return reply.code(409).send({ message: "That email is already in use." });
    }

    const user = await createUser(dependencies.db, {
      email: body.email,
      name: body.name,
      passwordHash: hashPassword(body.password),
      role: "admin",
    });

    await createAuthenticatedSession(
      dependencies.db,
      dependencies.config,
      reply,
      user.id,
    );

    const appearance = await getAppearance(dependencies.db, user.id);
    return buildSessionResponse(
      {
        user,
        appearance,
      },
      false,
    );
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await getUserByEmail(dependencies.db, body.email);

    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      return reply.code(401).send({ message: "Invalid email or password." });
    }

    await createAuthenticatedSession(
      dependencies.db,
      dependencies.config,
      reply,
      user.id,
    );

    return buildSessionResponse(
      {
        user,
        appearance: await getAppearance(dependencies.db, user.id),
      },
      false,
    );
  });

  app.post("/api/auth/register", async (request, reply) => {
    if ((await countUsers(dependencies.db)) === 0) {
      return reply.code(409).send({
        message: "Complete bootstrap before registering invited users.",
      });
    }

    const body = registerSchema.parse(request.body);
    const invite = await findInviteById(dependencies.db, body.inviteId);
    if (!invite) {
      return reply.code(404).send({ message: "Invite not found." });
    }

    if (invite.usedAt) {
      return reply
        .code(409)
        .send({ message: "That invite has already been used." });
    }

    if (new Date(invite.expiresAt).getTime() <= Date.now()) {
      return reply.code(410).send({ message: "That invite has expired." });
    }

    const activeInvite = await findActiveInviteByTokenHash(
      dependencies.db,
      hashToken(body.inviteToken),
    );
    if (!activeInvite || activeInvite.id !== invite.id) {
      return reply.code(401).send({ message: "Invite token is invalid." });
    }

    const existing = await getUserByEmail(dependencies.db, invite.email);
    if (existing) {
      return reply
        .code(409)
        .send({ message: "That invited email is already registered." });
    }

    const user = await createUser(dependencies.db, {
      email: invite.email,
      name: body.name,
      passwordHash: hashPassword(body.password),
      role: invite.role,
    });

    await markInviteUsed(dependencies.db, invite.id);
    await createAuthenticatedSession(
      dependencies.db,
      dependencies.config,
      reply,
      user.id,
    );

    return buildSessionResponse(
      {
        user,
        appearance: await getAppearance(dependencies.db, user.id),
      },
      false,
    );
  });

  app.post("/api/auth/logout", async (request, reply) => {
    await destroySession(dependencies.db, dependencies.config, request, reply);

    return { ok: true };
  });

  app.get("/api/users", async (request, reply) => {
    const session = await requireAdmin(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    return {
      currentUserId: session.user.id,
      users: await listUsers(dependencies.db),
    };
  });

  app.get("/api/users/invites", async (request, reply) => {
    const session = await requireAdmin(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    return {
      invites: await listInvites(
        dependencies.db,
        dependencies.config.appOrigin,
      ),
    };
  });

  app.post("/api/users/invites", async (request, reply) => {
    const session = await requireAdmin(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const body = inviteSchema.parse(request.body);
    const existing = await getUserByEmail(dependencies.db, body.email);
    if (existing) {
      return reply
        .code(409)
        .send({ message: "That email already belongs to a user." });
    }

    const token = hashPassword(`${body.email}:${Date.now()}`)
      .replace(/:/g, "")
      .slice(0, 32);
    const invite = await createInvite(
      dependencies.db,
      dependencies.config.appOrigin,
      {
        email: body.email,
        role: body.role,
        tokenHash: hashToken(token),
        expiresAt: getExpiry(7),
        createdByUserId: session.user.id,
      },
    );

    return reply.code(201).send({
      invite,
      inviteToken: token,
    });
  });

  app.patch("/api/users/:id/role", async (request, reply) => {
    const session = await requireAdmin(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const params = z.object({ id: z.uuid() }).parse(request.params);
    const body = roleSchema.parse(request.body);
    const target = await getUserById(dependencies.db, params.id);

    if (!target) {
      return reply.code(404).send({ message: "User not found." });
    }

    if (target.role === "admin" && body.role !== "admin") {
      const adminCount = await countAdmins(dependencies.db);
      if (adminCount <= 1) {
        return reply
          .code(409)
          .send({ message: "You must keep at least one admin account." });
      }
    }

    const updated = await updateUserRole(dependencies.db, target.id, body.role);
    return {
      user: updated,
    };
  });

  app.get("/api/settings/appearance", async (request, reply) => {
    const session = await requireSession(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    return {
      appearance: await getAppearance(dependencies.db, session.user.id),
    };
  });

  app.put("/api/settings/appearance", async (request, reply) => {
    const session = await requireSession(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const body: AppearanceSettings = appearanceSchema.parse(request.body);
    const appearance = await upsertAppearance(
      dependencies.db,
      session.user.id,
      body,
    );

    return {
      appearance,
    };
  });

  app.get("/api/printers/connections", async (request, reply) => {
    const session = await requireSession(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    return {
      printers: await listPrinterConnections(dependencies.db),
    };
  });

  app.get("/api/printers/bambu/models", async (request, reply) => {
    const session = await requireSession(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    return {
      models: BAMBU_PRINTER_MODELS,
    };
  });

  app.post("/api/bambu-connect/import-url", async (request, reply) => {
    const session = await requireSession(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const body: BambuConnectImportRequest = bambuConnectImportSchema.parse(
      request.body,
    );

    return {
      importUrl: buildBambuConnectImportUrl(body),
    };
  });

  app.post("/api/printers/bambu/test", async (request, reply) => {
    const session = await requireAdmin(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const body: BambuPrinterConnectionInput = bambuPrinterSchema.parse(
      request.body,
    );

    return {
      test: await testBambuLanConnection(body),
    };
  });

  app.post("/api/printers/bambu", async (request, reply) => {
    const session = await requireAdmin(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const body: BambuPrinterConnectionInput = bambuPrinterSchema.parse(
      request.body,
    );
    const existing = await getPrinterConnectionBySerial(
      dependencies.db,
      body.serial,
    );
    if (existing) {
      return reply
        .code(409)
        .send({ message: "That printer serial is already connected." });
    }

    const test = await testBambuLanConnection(body);
    const printer = await createPrinterConnection(dependencies.db, {
      ...body,
      connectionStatus:
        body.connectionMode === "cloud" ||
        body.connectionMode === "bambu-connect"
          ? "unverified"
          : test.reachable
            ? "online"
            : "offline",
      lastTestedAt: test.checkedAt,
    });

    return reply.code(201).send({
      printer,
      test,
    });
  });

  app.put("/api/printers/bambu/:id", async (request, reply) => {
    const session = await requireAdmin(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const params = z.object({ id: z.uuid() }).parse(request.params);
    const existingById = await getPrinterConnectionSecretById(
      dependencies.db,
      params.id,
    );
    if (!existingById) {
      return reply.code(404).send({ message: "Printer connection not found." });
    }
    const rawBody =
      typeof request.body === "object" && request.body !== null
        ? (request.body as Partial<BambuPrinterConnectionInput>)
        : {};
    const body: BambuPrinterConnectionInput = bambuPrinterSchema.parse({
      ...rawBody,
      accessCode:
        rawBody.accessCode?.trim() || existingById.accessCode || undefined,
    });

    const existingBySerial = await getPrinterConnectionBySerial(
      dependencies.db,
      body.serial,
    );
    if (existingBySerial && existingBySerial.id !== params.id) {
      return reply
        .code(409)
        .send({ message: "That printer serial is already connected." });
    }

    const test = await testBambuLanConnection(body);
    const printer = await updatePrinterConnection(dependencies.db, params.id, {
      ...body,
      connectionStatus:
        body.connectionMode === "cloud" ||
        body.connectionMode === "bambu-connect"
          ? "unverified"
          : test.reachable
            ? "online"
            : "offline",
      lastTestedAt: test.checkedAt,
    });
    if (!printer) {
      return reply.code(404).send({ message: "Printer connection not found." });
    }

    return {
      printer,
      test,
    };
  });

  app.delete("/api/printers/bambu/:id", async (request, reply) => {
    const session = await requireAdmin(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const params = z.object({ id: z.uuid() }).parse(request.params);
    const deleted = await deletePrinterConnection(dependencies.db, params.id);
    if (!deleted) {
      return reply.code(404).send({ message: "Printer connection not found." });
    }

    return reply.code(204).send();
  });

  app.get("/api/companions", async (request, reply) => {
    const session = await requireAdmin(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    return {
      companions: await listCompanions(dependencies.db),
    };
  });

  app.get("/api/companions/:id", async (request, reply) => {
    const session = await requireAdmin(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const params = z.object({ id: z.uuid() }).parse(request.params);
    const companion = await getCompanionSecretById(dependencies.db, params.id);
    if (!companion) {
      return reply.code(404).send({ message: "Companion not found." });
    }

    const snapshot: CompanionConnectionSnapshot = {
      companion: {
        baseUrl: companion.baseUrl,
        capabilities: companion.capabilities,
        createdAt: companion.createdAt,
        id: companion.id,
        lastError: companion.lastError,
        lastHealthAt: companion.lastHealthAt,
        name: companion.name,
        pairedAt: companion.pairedAt,
        printerCount: companion.printerCount,
        status: companion.status,
        streamCount: companion.streamCount,
        tokenSet: companion.tokenSet,
        updatedAt: companion.updatedAt,
      },
      health: companion.health,
      printers: companion.printers,
      streams: companion.streams,
    };

    return {
      snapshot,
    };
  });

  app.post("/api/companions/pairing-codes", async (request, reply) => {
    const session = await requireAdmin(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const rawToken = createRawToken();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const pairingCode = await createCompanionPairingCode(dependencies.db, {
      createdByUserId: session.user.id,
      expiresAt,
      tokenHash: hashToken(rawToken),
    });

    return reply.code(201).send({
      pairingCode: {
        code: rawToken,
        createdAt: pairingCode.createdAt,
        expiresAt: pairingCode.expiresAt,
        id: pairingCode.id,
      },
    });
  });

  app.post("/api/companions/pair", async (request, reply) => {
    const body: CompanionPairingRequest = companionPairSchema.parse(request.body);
    const pairingCode = await findActiveCompanionPairingCodeByTokenHash(
      dependencies.db,
      hashToken(body.pairingToken),
    );
    if (!pairingCode || pairingCode.usedAt) {
      return reply.code(409).send({
        message: "That pairing token is missing, expired, or already used.",
      });
    }

    try {
      const snapshot = await fetchCompanionSnapshot({
        baseUrl: body.baseUrl.replace(/\/+$/, ""),
        bridgeToken: body.bridgeToken,
        bridgeUsername: COMPANION_BRIDGE_USERNAME,
      });
      const companion = await upsertCompanionRegistration(dependencies.db, {
        baseUrl: body.baseUrl.replace(/\/+$/, ""),
        bridgeToken: body.bridgeToken,
        bridgeUsername: COMPANION_BRIDGE_USERNAME,
        capabilities: snapshot.capabilities,
        capabilityNotes: snapshot.capabilityNotes,
        health: snapshot.health,
        name: body.companionName,
        pairedAt: new Date().toISOString(),
        printers: snapshot.printers,
        status: snapshot.streams.some((stream) => stream.status === "online")
          ? "online"
          : "degraded",
        streams: snapshot.streams,
      });
      await markCompanionPairingCodeUsed(dependencies.db, pairingCode.id);

      return reply.code(201).send({
        companion,
      });
    } catch (error) {
      return reply.code(502).send({
        message:
          error instanceof Error
            ? error.message
            : "BambuView could not reach the Companion bridge.",
      });
    }
  });

  app.post("/api/companions/:id/test", async (request, reply) => {
    const session = await requireAdmin(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const params = z.object({ id: z.uuid() }).parse(request.params);
    const companion = await getCompanionSecretById(dependencies.db, params.id);
    if (!companion) {
      return reply.code(404).send({ message: "Companion not found." });
    }

    try {
      const live = await fetchCompanionSnapshot(companion);
      const updated = await updateCompanionSnapshot(dependencies.db, params.id, {
        capabilities: live.capabilities,
        capabilityNotes: live.capabilityNotes,
        health: live.health,
        lastError: null,
        printers: live.printers,
        status: live.streams.some((stream) => stream.status === "online")
          ? "online"
          : "degraded",
        streams: live.streams,
      });
      if (!updated) {
        return reply.code(404).send({ message: "Companion not found." });
      }

      return {
        snapshot: {
          companion: updated,
          health: live.health,
          printers: live.printers,
          streams: live.streams,
        },
      };
    } catch (error) {
      await updateCompanionSnapshot(dependencies.db, params.id, {
        capabilities: companion.capabilities,
        capabilityNotes: companion.capabilityNotes,
        health: companion.health,
        lastError:
          error instanceof Error
            ? error.message
            : "Companion connection failed.",
        printers: companion.printers,
        status: "offline",
        streams: companion.streams,
      });

      return reply.code(502).send({
        message:
          error instanceof Error
            ? error.message
            : "Companion connection failed.",
      });
    }
  });

  app.post(
    "/api/companions/:id/import-streams/:streamId",
    async (request, reply) => {
      const session = await requireAdmin(request, reply, dependencies);
      if (!session || "statusCode" in session) {
        return session;
      }

      const params = z
        .object({ id: z.uuid(), streamId: z.string().trim().min(1) })
        .parse(request.params);
      const body = companionImportSchema.parse(request.body ?? {});
      const companion = await getCompanionSecretById(dependencies.db, params.id);
      if (!companion) {
        return reply.code(404).send({ message: "Companion not found." });
      }

      const stream = companion.streams.find((item) => item.id === params.streamId);
      if (!stream) {
        return reply.code(404).send({ message: "Companion stream not found." });
      }

      const streamPath =
        stream.mjpegPath ?? stream.snapshotPath ?? stream.hlsPath ?? null;
      if (!streamPath) {
        return reply.code(409).send({
          message:
            "This Companion stream does not expose a browser-compatible output yet.",
        });
      }

      const input: CameraSourceInput = {
        name: body.name ?? `${companion.name} • ${stream.name}`,
        password: companion.bridgeToken,
        provider: "bambuview-companion",
        streamUrl: `${companion.baseUrl}${streamPath}`,
        username: companion.bridgeUsername,
      };
      const normalized = normalizeCameraSourceInput(input);
      const source = await createCameraSource(dependencies.db, {
        ...input,
        details: stream.details || normalized.details,
        lastTestedAt: stream.lastTestedAt,
        password: companion.bridgeToken,
        status: stream.status,
        streamKind: normalized.streamKind,
        streamUrl: normalized.streamUrl,
        username: companion.bridgeUsername,
      });

      return reply.code(201).send({ source });
    },
  );

  app.delete("/api/companions/:id", async (request, reply) => {
    const session = await requireAdmin(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const params = z.object({ id: z.uuid() }).parse(request.params);
    const deleted = await deleteCompanion(dependencies.db, params.id);
    if (!deleted) {
      return reply.code(404).send({ message: "Companion not found." });
    }

    return reply.code(204).send();
  });

  app.get("/api/fleet/overview", async (request, reply) => {
    const session = await requireSession(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const query = fleetModeSchema.parse(request.query);

    return dependencies.printerProvider.getFleetOverview(query.mode);
  });

  app.get("/api/printers/:id", async (request, reply) => {
    const session = await requireSession(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const query = fleetModeSchema.parse(request.query);
    const printer = await dependencies.printerProvider.getPrinterDetail(
      params.id,
      query.mode,
    );
    if (!printer) {
      return reply.code(404).send({ message: "Printer not found." });
    }

    return printer;
  });

  app.get("/api/cameras", async (request, reply) => {
    const session = await requireSession(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    return dependencies.cameraProvider.getOverview();
  });

  app.post("/api/cameras/sources/test", async (request, reply) => {
    const session = await requireAdmin(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const body: CameraSourceInput = cameraSourceSchema.parse(request.body);

    return {
      test: await testCameraSource(body),
    };
  });

  app.post("/api/cameras/sources", async (request, reply) => {
    const session = await requireAdmin(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const body: CameraSourceInput = cameraSourceSchema.parse(request.body);
    const normalized = normalizeCameraSourceInput(body);
    const test = await testCameraSource(body);
    const source = await createCameraSource(dependencies.db, {
      ...body,
      details: test.detail || normalized.details,
      frigateBaseUrl: normalized.frigateBaseUrl ?? undefined,
      frigateCamera: normalized.frigateCamera ?? undefined,
      lastTestedAt: test.checkedAt,
      password: normalized.password,
      status: test.status,
      streamKind: normalized.streamKind,
      streamUrl: normalized.streamUrl,
      username: normalized.username,
    });

    return reply.code(201).send({
      source,
      test,
    });
  });

  app.put("/api/cameras/sources/:id", async (request, reply) => {
    const session = await requireAdmin(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const params = z.object({ id: z.uuid() }).parse(request.params);
    const body: CameraSourceInput = cameraSourceSchema.parse(request.body);
    const normalized = normalizeCameraSourceInput(body);
    const test = await testCameraSource(body);
    const source = await updateCameraSource(dependencies.db, params.id, {
      ...body,
      details: test.detail || normalized.details,
      frigateBaseUrl: normalized.frigateBaseUrl ?? undefined,
      frigateCamera: normalized.frigateCamera ?? undefined,
      lastTestedAt: test.checkedAt,
      password: normalized.password,
      status: test.status,
      streamKind: normalized.streamKind,
      streamUrl: normalized.streamUrl,
      username: normalized.username,
    });

    if (!source) {
      return reply.code(404).send({ message: "Camera source not found." });
    }

    return {
      source,
      test,
    };
  });

  app.delete("/api/cameras/sources/:id", async (request, reply) => {
    const session = await requireAdmin(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const params = z.object({ id: z.uuid() }).parse(request.params);
    const deleted = await deleteCameraSource(dependencies.db, params.id);
    if (!deleted) {
      return reply.code(404).send({ message: "Camera source not found." });
    }

    return reply.code(204).send();
  });

  app.post("/api/cameras/assignments", async (request, reply) => {
    const session = await requireAdmin(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const body: CameraAssignmentInput = cameraAssignmentSchema.parse(
      request.body,
    );
    const source = await getCameraSourceSecretById(
      dependencies.db,
      body.sourceId,
    );
    if (!source) {
      return reply.code(404).send({ message: "Camera source not found." });
    }

    const printer = await getPrinterConnectionById(
      dependencies.db,
      body.printerId,
    );
    if (body.targetType === "printer" && !printer) {
      return reply.code(404).send({ message: "Printer not found." });
    }
    if (
      body.targetType === "fleet" &&
      body.printerId !== FLEET_CAMERA_TARGET_ID
    ) {
      return reply.code(400).send({ message: "Unknown fleet camera target." });
    }

    return {
      assignment: await upsertCameraAssignment(dependencies.db, body),
    };
  });

  app.delete("/api/cameras/assignments/:id", async (request, reply) => {
    const session = await requireAdmin(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const params = z.object({ id: z.uuid() }).parse(request.params);
    const deleted = await deleteCameraAssignment(dependencies.db, params.id);
    if (!deleted) {
      return reply.code(404).send({ message: "Camera assignment not found." });
    }

    return reply.code(204).send();
  });

  async function proxyCamera(
    sourceId: string,
    mode: "snapshot" | "stream",
    reply: FastifyReply,
  ) {
    const source = await getCameraSourceSecretById(dependencies.db, sourceId);
    if (!source) {
      return reply.code(404).send({ message: "Camera source not found." });
    }

    const target = cameraProxyTarget(source, mode);
    if (!target) {
      return reply.code(409).send({
        message:
          "This camera source is saved but cannot be rendered directly in a browser. Use Frigate/go2rtc or an HTTP/MJPEG/HLS restream and assign that feed.",
      });
    }

    try {
      const upstream = await fetch(target, {
        headers: cameraRequestHeaders(source),
      });
      if (!upstream.ok || !upstream.body) {
        return reply.code(upstream.status || 502).send({
          message: `Camera upstream returned HTTP ${upstream.status}.`,
        });
      }

      reply.header("cache-control", "no-store");
      reply.type(
        upstream.headers.get("content-type") ??
          (mode === "snapshot" ? "image/jpeg" : "multipart/x-mixed-replace"),
      );

      return reply.send(
        Readable.from(upstream.body as AsyncIterable<Uint8Array>),
      );
    } catch {
      return reply
        .code(502)
        .send({ message: "BambuView could not reach the camera upstream." });
    }
  }

  app.get("/api/cameras/sources/:id/snapshot", async (request, reply) => {
    const session = await requireSession(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const params = z.object({ id: z.uuid() }).parse(request.params);
    return proxyCamera(params.id, "snapshot", reply);
  });

  app.get("/api/cameras/sources/:id/stream", async (request, reply) => {
    const session = await requireSession(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const params = z.object({ id: z.uuid() }).parse(request.params);
    return proxyCamera(params.id, "stream", reply);
  });

  app.get("/api/prepare/status", async (request, reply) => {
    const session = await requireSession(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    return dependencies.sliceProvider.getStatus();
  });
}
