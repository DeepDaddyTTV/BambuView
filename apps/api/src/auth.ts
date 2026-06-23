import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import type { FastifyReply, FastifyRequest } from "fastify";

import type { AppConfig } from "./config.js";
import {
  createSession,
  deleteSessionByTokenHash,
  getAppearance,
  getSessionByTokenHash,
  getUserById,
  touchSession,
  type AppDatabase
} from "./db.js";

const PASSWORD_KEY_LENGTH = 64;

export interface SessionContext {
  appearance: Awaited<ReturnType<typeof getAppearance>>;
  user: NonNullable<Awaited<ReturnType<typeof getUserById>>>;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString("hex");

  return `${salt}:${digest}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, expectedDigest] = storedHash.split(":");
  if (!salt || !expectedDigest) {
    return false;
  }

  const actualDigest = scryptSync(password, salt, PASSWORD_KEY_LENGTH);
  const expected = Buffer.from(expectedDigest, "hex");

  if (expected.length !== actualDigest.length) {
    return false;
  }

  return timingSafeEqual(expected, actualDigest);
}

export function createRawToken(): string {
  return randomBytes(24).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function getExpiry(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function setSessionCookie(
  reply: FastifyReply,
  config: AppConfig,
  rawToken: string
): void {
  reply.setCookie(config.cookieName, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/",
    maxAge: config.sessionTtlDays * 24 * 60 * 60
  });
}

export function clearSessionCookie(reply: FastifyReply, config: AppConfig): void {
  reply.clearCookie(config.cookieName, {
    path: "/"
  });
}

export async function createAuthenticatedSession(
  db: AppDatabase,
  config: AppConfig,
  reply: FastifyReply,
  userId: string
): Promise<void> {
  const rawToken = createRawToken();
  const tokenHash = hashToken(rawToken);
  await createSession(db, {
    userId,
    tokenHash,
    expiresAt: getExpiry(config.sessionTtlDays)
  });
  setSessionCookie(reply, config, rawToken);
}

export async function destroySession(
  db: AppDatabase,
  config: AppConfig,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const rawToken = request.cookies[config.cookieName];
  if (rawToken) {
    await deleteSessionByTokenHash(db, hashToken(rawToken));
  }

  clearSessionCookie(reply, config);
}

export async function getSessionContext(
  db: AppDatabase,
  config: AppConfig,
  request: FastifyRequest
): Promise<SessionContext | null> {
  const rawToken = request.cookies[config.cookieName];
  if (!rawToken) {
    return null;
  }

  const session = await getSessionByTokenHash(db, hashToken(rawToken));
  if (!session) {
    return null;
  }

  const user = await getUserById(db, session.userId);
  if (!user) {
    return null;
  }

  await touchSession(db, session.id);

  return {
    user,
    appearance: await getAppearance(db, user.id)
  };
}
