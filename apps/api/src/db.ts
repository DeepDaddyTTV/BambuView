import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

import {
  type AppearanceSettings,
  DEFAULT_APPEARANCE,
  type InviteRecord,
  type UserProfile,
  type UserRole
} from "@bambuview/contracts";

const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<UserRole>().notNull(),
  status: text("status").$type<"active" | "invited">().notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull()
});

const invites = sqliteTable("invites", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  role: text("role").$type<UserRole>().notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at")
});

const userPreferences = sqliteTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  mode: text("mode").$type<"dark" | "light">().notNull(),
  darkHighlight: text("dark_highlight").notNull(),
  darkBackground: text("dark_background").notNull(),
  lightHighlight: text("light_highlight").notNull(),
  lightBackground: text("light_background").notNull(),
  backgroundStyle: text("background_style")
    .$type<AppearanceSettings["backgroundStyle"]>()
    .notNull(),
  updatedAt: text("updated_at").notNull()
});

export const schema = {
  invites,
  sessions,
  userPreferences,
  users
};

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export interface DatabaseClient {
  db: AppDatabase;
  sqlite: Database.Database;
}

export interface CreateUserInput {
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
}

export interface CreateInviteInput {
  email: string;
  role: UserRole;
  tokenHash: string;
  expiresAt: string;
  createdByUserId: string;
}

export interface CreateSessionInput {
  userId: string;
  tokenHash: string;
  expiresAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createDatabase(databaseFile: string): DatabaseClient {
  const sqlite = new Database(databaseFile);

  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      mode TEXT NOT NULL,
      dark_highlight TEXT NOT NULL,
      dark_background TEXT NOT NULL,
      light_highlight TEXT NOT NULL,
      light_background TEXT NOT NULL,
      background_style TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const db = drizzle(sqlite, { schema });

  return { db, sqlite };
}

export function closeDatabase(client: DatabaseClient): void {
  client.sqlite.close();
}

function mapUser(row: typeof users.$inferSelect): UserProfile {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt
  };
}

function mapAppearance(
  row: typeof userPreferences.$inferSelect | undefined
): AppearanceSettings {
  if (!row) {
    return DEFAULT_APPEARANCE;
  }

  return {
    mode: row.mode,
    darkHighlight: row.darkHighlight,
    darkBackground: row.darkBackground,
    lightHighlight: row.lightHighlight,
    lightBackground: row.lightBackground,
    backgroundStyle: row.backgroundStyle
  };
}

export async function countUsers(db: AppDatabase): Promise<number> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(users);

  return Number(count);
}

export async function countAdmins(db: AppDatabase): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.role, "admin"));

  return Number(count);
}

export async function createUser(
  db: AppDatabase,
  input: CreateUserInput
): Promise<UserProfile> {
  const timestamp = nowIso();
  const row: typeof users.$inferInsert = {
    id: randomUUID(),
    email: input.email.toLowerCase(),
    name: input.name,
    passwordHash: input.passwordHash,
    role: input.role,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await db.insert(users).values(row);
  await upsertAppearance(db, row.id, DEFAULT_APPEARANCE);

  return mapUser(row as typeof users.$inferSelect);
}

export async function getUserByEmail(
  db: AppDatabase,
  email: string
): Promise<(typeof users.$inferSelect) | undefined> {
  return db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase())
  });
}

export async function getUserById(
  db: AppDatabase,
  userId: string
): Promise<(typeof users.$inferSelect) | undefined> {
  return db.query.users.findFirst({
    where: eq(users.id, userId)
  });
}

export async function listUsers(db: AppDatabase): Promise<UserProfile[]> {
  const rows = await db.select().from(users).orderBy(users.createdAt);

  return rows.map(mapUser);
}

export async function updateUserRole(
  db: AppDatabase,
  userId: string,
  role: UserRole
): Promise<UserProfile | undefined> {
  const updatedAt = nowIso();
  await db.update(users).set({ role, updatedAt }).where(eq(users.id, userId));

  const row = await getUserById(db, userId);

  return row ? mapUser(row) : undefined;
}

export async function getAppearance(
  db: AppDatabase,
  userId: string
): Promise<AppearanceSettings> {
  const row = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId)
  });

  return mapAppearance(row);
}

export async function upsertAppearance(
  db: AppDatabase,
  userId: string,
  appearance: AppearanceSettings
): Promise<AppearanceSettings> {
  const updatedAt = nowIso();
  await db
    .insert(userPreferences)
    .values({
      userId,
      ...appearance,
      updatedAt
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        ...appearance,
        updatedAt
      }
    });

  return appearance;
}

export async function createInvite(
  db: AppDatabase,
  baseUrl: string,
  input: CreateInviteInput
): Promise<InviteRecord> {
  const row: typeof invites.$inferInsert = {
    id: randomUUID(),
    email: input.email.toLowerCase(),
    role: input.role,
    tokenHash: input.tokenHash,
    createdByUserId: input.createdByUserId,
    createdAt: nowIso(),
    expiresAt: input.expiresAt,
    usedAt: null
  };

  await db.insert(invites).values(row);

  return {
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt ?? null,
    createdBy: row.createdByUserId,
    inviteUrl: `${baseUrl.replace(/\/$/, "")}/auth/invite/${row.id}`
  };
}

export async function listInvites(
  db: AppDatabase,
  baseUrl: string
): Promise<InviteRecord[]> {
  const rows = await db.select().from(invites).orderBy(desc(invites.createdAt));

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt ?? null,
    createdBy: row.createdByUserId,
    inviteUrl: `${baseUrl.replace(/\/$/, "")}/auth/invite/${row.id}`
  }));
}

export async function findInviteById(
  db: AppDatabase,
  inviteId: string
): Promise<(typeof invites.$inferSelect) | undefined> {
  return db.query.invites.findFirst({
    where: eq(invites.id, inviteId)
  });
}

export async function findActiveInviteByTokenHash(
  db: AppDatabase,
  tokenHash: string
): Promise<(typeof invites.$inferSelect) | undefined> {
  const now = nowIso();

  return db.query.invites.findFirst({
    where: and(
      eq(invites.tokenHash, tokenHash),
      gt(invites.expiresAt, now)
    )
  });
}

export async function markInviteUsed(
  db: AppDatabase,
  inviteId: string
): Promise<void> {
  await db
    .update(invites)
    .set({ usedAt: nowIso() })
    .where(eq(invites.id, inviteId));
}

export async function createSession(
  db: AppDatabase,
  input: CreateSessionInput
): Promise<void> {
  const timestamp = nowIso();
  await db.insert(sessions).values({
    id: randomUUID(),
    userId: input.userId,
    tokenHash: input.tokenHash,
    createdAt: timestamp,
    expiresAt: input.expiresAt,
    lastSeenAt: timestamp
  });
}

export async function getSessionByTokenHash(
  db: AppDatabase,
  tokenHash: string
): Promise<(typeof sessions.$inferSelect) | undefined> {
  const now = nowIso();

  return db.query.sessions.findFirst({
    where: and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now))
  });
}

export async function touchSession(
  db: AppDatabase,
  sessionId: string
): Promise<void> {
  await db
    .update(sessions)
    .set({ lastSeenAt: nowIso() })
    .where(eq(sessions.id, sessionId));
}

export async function deleteSessionByTokenHash(
  db: AppDatabase,
  tokenHash: string
): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}
