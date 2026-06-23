import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AppearanceSettings, AuthSession, UserProfile } from "@bambuview/contracts";

import {
  clearSessionCookie,
  createAuthenticatedSession,
  destroySession,
  getExpiry,
  getSessionContext,
  hashPassword,
  hashToken,
  verifyPassword
} from "./auth.js";
import type { AppConfig } from "./config.js";
import {
  countAdmins,
  countUsers,
  createInvite,
  createUser,
  findActiveInviteByTokenHash,
  findInviteById,
  getAppearance,
  getUserByEmail,
  getUserById,
  listInvites,
  listUsers,
  markInviteUsed,
  type AppDatabase,
  upsertAppearance,
  updateUserRole
} from "./db.js";
import type { CameraProvider, PrinterProvider, SliceProvider } from "./providers.js";

const bootstrapSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(2),
  password: z.string().min(8)
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8)
});

const registerSchema = z.object({
  inviteId: z.uuid(),
  inviteToken: z.string().min(24),
  name: z.string().trim().min(2),
  password: z.string().min(8)
});

const inviteSchema = z.object({
  email: z.email(),
  role: z.enum(["admin", "operator", "viewer"])
});

const roleSchema = z.object({
  role: z.enum(["admin", "operator", "viewer"])
});

const appearanceSchema = z.object({
  mode: z.enum(["dark", "light"]),
  darkHighlight: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  darkBackground: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  lightHighlight: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  lightBackground: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  backgroundStyle: z.enum(["topo", "two-tone", "blueprint", "sweep", "plain"])
});

interface RouteDependencies {
  cameraProvider: CameraProvider;
  config: AppConfig;
  db: AppDatabase;
  printerProvider: PrinterProvider;
  sliceProvider: SliceProvider;
}

type SessionLike =
  | {
      appearance: AppearanceSettings;
      user: Pick<UserProfile, "createdAt" | "email" | "id" | "name" | "role" | "status">;
    }
  | null;

function buildSessionResponse(
  session: SessionLike,
  bootstrapRequired: boolean
): AuthSession {
  if (!session) {
    return {
      authenticated: false,
      bootstrapRequired,
      user: null,
      appearance: null
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
      createdAt: session.user.createdAt
    },
    appearance: session.appearance
  };
}

async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: RouteDependencies
) {
  const session = await getSessionContext(dependencies.db, dependencies.config, request);
  if (!session) {
    clearSessionCookie(reply, dependencies.config);
    return reply.code(401).send({ message: "Authentication required." });
  }

  return session;
}

async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: RouteDependencies
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
  dependencies: RouteDependencies
): Promise<void> {
  app.get("/api/health", async () => ({
    ok: true
  }));

  app.get("/api/auth/session", async (request, reply) => {
    const bootstrapRequired = (await countUsers(dependencies.db)) === 0;
    const session = await getSessionContext(dependencies.db, dependencies.config, request);
    if (!session) {
      clearSessionCookie(reply, dependencies.config);
    }

    return buildSessionResponse(session, bootstrapRequired);
  });

  app.post("/api/auth/bootstrap", async (request, reply) => {
    if ((await countUsers(dependencies.db)) > 0) {
      return reply.code(409).send({ message: "Bootstrap has already been completed." });
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
      role: "admin"
    });

    await createAuthenticatedSession(
      dependencies.db,
      dependencies.config,
      reply,
      user.id
    );

    const appearance = await getAppearance(dependencies.db, user.id);
    return buildSessionResponse(
      {
        user,
        appearance
      },
      false
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
      user.id
    );

    return buildSessionResponse(
      {
        user,
        appearance: await getAppearance(dependencies.db, user.id)
      },
      false
    );
  });

  app.post("/api/auth/register", async (request, reply) => {
    if ((await countUsers(dependencies.db)) === 0) {
      return reply.code(409).send({ message: "Complete bootstrap before registering invited users." });
    }

    const body = registerSchema.parse(request.body);
    const invite = await findInviteById(dependencies.db, body.inviteId);
    if (!invite) {
      return reply.code(404).send({ message: "Invite not found." });
    }

    if (invite.usedAt) {
      return reply.code(409).send({ message: "That invite has already been used." });
    }

    if (new Date(invite.expiresAt).getTime() <= Date.now()) {
      return reply.code(410).send({ message: "That invite has expired." });
    }

    const activeInvite = await findActiveInviteByTokenHash(
      dependencies.db,
      hashToken(body.inviteToken)
    );
    if (!activeInvite || activeInvite.id !== invite.id) {
      return reply.code(401).send({ message: "Invite token is invalid." });
    }

    const existing = await getUserByEmail(dependencies.db, invite.email);
    if (existing) {
      return reply.code(409).send({ message: "That invited email is already registered." });
    }

    const user = await createUser(dependencies.db, {
      email: invite.email,
      name: body.name,
      passwordHash: hashPassword(body.password),
      role: invite.role
    });

    await markInviteUsed(dependencies.db, invite.id);
    await createAuthenticatedSession(
      dependencies.db,
      dependencies.config,
      reply,
      user.id
    );

    return buildSessionResponse(
      {
        user,
        appearance: await getAppearance(dependencies.db, user.id)
      },
      false
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
      users: await listUsers(dependencies.db)
    };
  });

  app.get("/api/users/invites", async (request, reply) => {
    const session = await requireAdmin(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    return {
      invites: await listInvites(dependencies.db, dependencies.config.appOrigin)
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
      return reply.code(409).send({ message: "That email already belongs to a user." });
    }

    const token = hashPassword(`${body.email}:${Date.now()}`).replace(/:/g, "").slice(0, 32);
    const invite = await createInvite(dependencies.db, dependencies.config.appOrigin, {
      email: body.email,
      role: body.role,
      tokenHash: hashToken(token),
      expiresAt: getExpiry(7),
      createdByUserId: session.user.id
    });

    return reply.code(201).send({
      invite,
      inviteToken: token
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
        return reply.code(409).send({ message: "You must keep at least one admin account." });
      }
    }

    const updated = await updateUserRole(dependencies.db, target.id, body.role);
    return {
      user: updated
    };
  });

  app.get("/api/settings/appearance", async (request, reply) => {
    const session = await requireSession(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    return {
      appearance: await getAppearance(dependencies.db, session.user.id)
    };
  });

  app.put("/api/settings/appearance", async (request, reply) => {
    const session = await requireSession(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const body: AppearanceSettings = appearanceSchema.parse(request.body);
    const appearance = await upsertAppearance(dependencies.db, session.user.id, body);

    return {
      appearance
    };
  });

  app.get("/api/fleet/overview", async (request, reply) => {
    const session = await requireSession(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    return dependencies.printerProvider.getFleetOverview();
  });

  app.get("/api/printers/:id", async (request, reply) => {
    const session = await requireSession(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const printer = await dependencies.printerProvider.getPrinterDetail(params.id);
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

  app.get("/api/prepare/status", async (request, reply) => {
    const session = await requireSession(request, reply, dependencies);
    if (!session || "statusCode" in session) {
      return session;
    }

    return dependencies.sliceProvider.getStatus();
  });
}
