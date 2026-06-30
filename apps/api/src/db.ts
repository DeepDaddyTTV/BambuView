import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

import {
  type AppearanceSettings,
  type BambuConnectionMode,
  type BambuPrinterConnectionInput,
  type CameraAssignment,
  type CameraAssignmentInput,
  type CameraAssignmentTargetType,
  type CameraProviderType,
  type CameraSource,
  type CameraSourceInput,
  type CameraStreamKind,
  DEFAULT_APPEARANCE,
  type InviteRecord,
  type PrinterConnectionProvider,
  type PrinterConnectionRecord,
  type PrinterConnectionStatus,
  type UserProfile,
  type UserRole,
} from "@bambuview/contracts";

const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<UserRole>().notNull(),
  status: text("status").$type<"active" | "invited">().notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
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
  usedAt: text("used_at"),
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
  updatedAt: text("updated_at").notNull(),
});

const printerConnections = sqliteTable("printer_connections", {
  id: text("id").primaryKey(),
  provider: text("provider").$type<PrinterConnectionProvider>().notNull(),
  connectionMode: text("connection_mode")
    .$type<BambuConnectionMode>()
    .notNull(),
  name: text("name").notNull(),
  model: text("model").notNull(),
  host: text("host").notNull(),
  serial: text("serial").notNull().unique(),
  accessCode: text("access_code").notNull(),
  connectionStatus: text("connection_status")
    .$type<PrinterConnectionStatus>()
    .notNull(),
  lastTestedAt: text("last_tested_at"),
  lastSeenAt: text("last_seen_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const cameraSources = sqliteTable("camera_sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").$type<CameraProviderType>().notNull(),
  streamUrl: text("stream_url").notNull(),
  streamKind: text("stream_kind").$type<CameraStreamKind>().notNull(),
  frigateBaseUrl: text("frigate_base_url"),
  frigateCamera: text("frigate_camera"),
  username: text("username"),
  password: text("password"),
  status: text("status").$type<CameraSource["status"]>().notNull(),
  details: text("details").notNull(),
  lastTestedAt: text("last_tested_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

const cameraAssignments = sqliteTable("camera_assignments", {
  id: text("id").primaryKey(),
  targetType: text("target_type").$type<CameraAssignmentTargetType>().notNull(),
  printerId: text("printer_id").notNull(),
  sourceId: text("source_id")
    .notNull()
    .references(() => cameraSources.id, { onDelete: "cascade" }),
  feedLabel: text("feed_label").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const schema = {
  cameraAssignments,
  cameraSources,
  invites,
  printerConnections,
  sessions,
  userPreferences,
  users,
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

export interface CreatePrinterConnectionInput extends BambuPrinterConnectionInput {
  connectionStatus: PrinterConnectionStatus;
  lastTestedAt: string | null;
}

export interface CreateCameraSourceInput extends CameraSourceInput {
  details: string;
  lastTestedAt: string | null;
  status: CameraSource["status"];
  streamKind: CameraStreamKind;
  streamUrl: string;
}

export interface CameraSourceSecretRecord extends CameraSource {
  frigateBaseUrl: string | null;
  frigateCamera: string | null;
  password: string;
  rawStreamUrl: string;
  username: string;
}

export interface PrinterConnectionSecretRecord extends PrinterConnectionRecord {
  accessCode: string;
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
    CREATE TABLE IF NOT EXISTS printer_connections (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      connection_mode TEXT NOT NULL DEFAULT 'lan',
      name TEXT NOT NULL,
      model TEXT NOT NULL,
      host TEXT NOT NULL,
      serial TEXT NOT NULL UNIQUE,
      access_code TEXT NOT NULL,
      connection_status TEXT NOT NULL,
      last_tested_at TEXT,
      last_seen_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS camera_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      stream_url TEXT NOT NULL,
      stream_kind TEXT NOT NULL,
      frigate_base_url TEXT,
      frigate_camera TEXT,
      username TEXT,
      password TEXT,
      status TEXT NOT NULL,
      details TEXT NOT NULL,
      last_tested_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS camera_assignments (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL DEFAULT 'printer',
      printer_id TEXT NOT NULL,
      source_id TEXT NOT NULL REFERENCES camera_sources(id) ON DELETE CASCADE,
      feed_label TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(target_type, printer_id, source_id, feed_label)
    );
  `);

  const printerConnectionColumns = sqlite
    .prepare("PRAGMA table_info(printer_connections)")
    .all() as Array<{ name: string }>;
  if (
    !printerConnectionColumns.some(
      (column) => column.name === "connection_mode",
    )
  ) {
    sqlite.exec(
      "ALTER TABLE printer_connections ADD COLUMN connection_mode TEXT NOT NULL DEFAULT 'lan';",
    );
  }

  const cameraAssignmentColumns = sqlite
    .prepare("PRAGMA table_info(camera_assignments)")
    .all() as Array<{ name: string }>;
  if (
    !cameraAssignmentColumns.some((column) => column.name === "target_type")
  ) {
    sqlite.exec(
      "ALTER TABLE camera_assignments ADD COLUMN target_type TEXT NOT NULL DEFAULT 'printer';",
    );
  }

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
    createdAt: row.createdAt,
  };
}

function mapAppearance(
  row: typeof userPreferences.$inferSelect | undefined,
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
    backgroundStyle: row.backgroundStyle,
  };
}

function mapPrinterConnection(
  row: typeof printerConnections.$inferSelect,
): PrinterConnectionRecord {
  return {
    id: row.id,
    provider: row.provider,
    connectionMode: row.connectionMode,
    name: row.name,
    model: row.model,
    host: row.host,
    serial: row.serial,
    accessCodeSet: row.accessCode.length > 0,
    connectionStatus: row.connectionStatus,
    lastTestedAt: row.lastTestedAt,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function redactUrl(value: string): string {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return value.replace(/\/\/([^/@]+)@/, "//");
  }
}

function parseFrigateRestreamReference(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.hash) {
      return false;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    const apiIndex = parts.findIndex((part) => part === "api");
    return apiIndex >= 0 && Boolean(parts[apiIndex + 1]);
  } catch {
    return false;
  }
}

function cameraSourcePlaybackIssue(
  row: typeof cameraSources.$inferSelect,
): string | null {
  if (
    row.provider === "frigate" &&
    !row.frigateBaseUrl &&
    !row.frigateCamera &&
    !parseFrigateRestreamReference(row.streamUrl)
  ) {
    return "This Frigate source is not a restream endpoint. Use a Frigate/go2rtc camera URL such as http://frigate:5000/api/workbench_left instead of a dashboard page, web UI URL, or link with a # fragment.";
  }

  return null;
}

function cameraProxyUrls(
  row: typeof cameraSources.$inferSelect,
): Pick<CameraSource, "snapshotUrl" | "streamUrl"> {
  const playbackIssue = cameraSourcePlaybackIssue(row);
  const canProxy =
    !playbackIssue &&
    (row.streamKind === "mjpeg" ||
      row.streamKind === "snapshot" ||
      row.streamKind === "hls");

  return {
    snapshotUrl:
      row.streamKind === "snapshot" ||
      (row.provider === "frigate" && row.frigateBaseUrl && row.frigateCamera)
        ? `/api/cameras/sources/${row.id}/snapshot`
        : null,
    streamUrl: canProxy ? `/api/cameras/sources/${row.id}/stream` : "",
  };
}

function mapCameraSource(
  row: typeof cameraSources.$inferSelect,
  assignedTo: string[] = [],
): CameraSource {
  const proxyUrls = cameraProxyUrls(row);
  const playbackIssue = cameraSourcePlaybackIssue(row);

  return {
    displayUrl: redactUrl(row.streamUrl),
    id: row.id,
    name: row.name,
    provider: row.provider,
    snapshotUrl: proxyUrls.snapshotUrl,
    streamUrl: proxyUrls.streamUrl,
    streamKind: playbackIssue ? "unknown" : row.streamKind,
    status: playbackIssue ? "degraded" : row.status,
    assignedTo,
    details: playbackIssue ?? row.details,
    lastTestedAt: row.lastTestedAt,
  };
}

function mapCameraSourceSecret(
  row: typeof cameraSources.$inferSelect,
  assignedTo: string[] = [],
): CameraSourceSecretRecord {
  return {
    ...mapCameraSource(row, assignedTo),
    frigateBaseUrl: row.frigateBaseUrl ?? null,
    frigateCamera: row.frigateCamera ?? null,
    password: row.password ?? "",
    rawStreamUrl: row.streamUrl,
    username: row.username ?? "",
  };
}

export async function countUsers(db: AppDatabase): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users);

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
  input: CreateUserInput,
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
    updatedAt: timestamp,
  };

  await db.insert(users).values(row);
  await upsertAppearance(db, row.id, DEFAULT_APPEARANCE);

  return mapUser(row as typeof users.$inferSelect);
}

export async function getUserByEmail(
  db: AppDatabase,
  email: string,
): Promise<typeof users.$inferSelect | undefined> {
  return db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });
}

export async function getUserById(
  db: AppDatabase,
  userId: string,
): Promise<typeof users.$inferSelect | undefined> {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
  });
}

export async function listUsers(db: AppDatabase): Promise<UserProfile[]> {
  const rows = await db.select().from(users).orderBy(users.createdAt);

  return rows.map(mapUser);
}

export async function updateUserRole(
  db: AppDatabase,
  userId: string,
  role: UserRole,
): Promise<UserProfile | undefined> {
  const updatedAt = nowIso();
  await db.update(users).set({ role, updatedAt }).where(eq(users.id, userId));

  const row = await getUserById(db, userId);

  return row ? mapUser(row) : undefined;
}

export async function listPrinterConnections(
  db: AppDatabase,
): Promise<PrinterConnectionRecord[]> {
  const rows = await db
    .select()
    .from(printerConnections)
    .orderBy(printerConnections.createdAt);

  return rows.map(mapPrinterConnection);
}

function mapPrinterConnectionSecret(
  row: typeof printerConnections.$inferSelect,
): PrinterConnectionSecretRecord {
  return {
    ...mapPrinterConnection(row),
    accessCode: row.accessCode,
  };
}

export async function listPrinterConnectionSecrets(
  db: AppDatabase,
): Promise<PrinterConnectionSecretRecord[]> {
  const rows = await db
    .select()
    .from(printerConnections)
    .orderBy(printerConnections.createdAt);

  return rows.map(mapPrinterConnectionSecret);
}

export async function getPrinterConnectionById(
  db: AppDatabase,
  connectionId: string,
): Promise<PrinterConnectionRecord | undefined> {
  const row = await db.query.printerConnections.findFirst({
    where: eq(printerConnections.id, connectionId),
  });

  return row ? mapPrinterConnection(row) : undefined;
}

export async function getPrinterConnectionSecretById(
  db: AppDatabase,
  connectionId: string,
): Promise<PrinterConnectionSecretRecord | undefined> {
  const row = await db.query.printerConnections.findFirst({
    where: eq(printerConnections.id, connectionId),
  });

  return row ? mapPrinterConnectionSecret(row) : undefined;
}

export async function getPrinterConnectionBySerial(
  db: AppDatabase,
  serial: string,
): Promise<PrinterConnectionRecord | undefined> {
  const row = await db.query.printerConnections.findFirst({
    where: eq(printerConnections.serial, serial.trim().toUpperCase()),
  });

  return row ? mapPrinterConnection(row) : undefined;
}

export async function createPrinterConnection(
  db: AppDatabase,
  input: CreatePrinterConnectionInput,
): Promise<PrinterConnectionRecord> {
  const timestamp = nowIso();
  const row: typeof printerConnections.$inferInsert = {
    id: randomUUID(),
    provider: "bambu-lan",
    connectionMode: input.connectionMode,
    name: input.name.trim(),
    model: input.model.trim(),
    host: input.host.trim(),
    serial: input.serial.trim().toUpperCase(),
    accessCode: input.accessCode?.trim() ?? "",
    connectionStatus: input.connectionStatus,
    lastTestedAt: input.lastTestedAt,
    lastSeenAt: input.connectionStatus === "online" ? input.lastTestedAt : null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.insert(printerConnections).values(row);

  return mapPrinterConnection(row as typeof printerConnections.$inferSelect);
}

export async function updatePrinterConnection(
  db: AppDatabase,
  connectionId: string,
  input: CreatePrinterConnectionInput,
): Promise<PrinterConnectionRecord | null> {
  const existing = await db.query.printerConnections.findFirst({
    where: eq(printerConnections.id, connectionId),
  });
  if (!existing) {
    return null;
  }

  const accessCode = input.accessCode?.trim() || existing.accessCode;
  const row: typeof printerConnections.$inferInsert = {
    id: connectionId,
    provider: "bambu-lan",
    connectionMode: input.connectionMode,
    name: input.name.trim(),
    model: input.model.trim(),
    host: input.host.trim(),
    serial: input.serial.trim().toUpperCase(),
    accessCode,
    connectionStatus: input.connectionStatus,
    lastTestedAt: input.lastTestedAt,
    lastSeenAt:
      input.connectionStatus === "online"
        ? input.lastTestedAt
        : existing.lastSeenAt,
    createdAt: existing.createdAt,
    updatedAt: nowIso(),
  };

  await db
    .update(printerConnections)
    .set({
      accessCode: row.accessCode,
      connectionMode: row.connectionMode,
      connectionStatus: row.connectionStatus,
      host: row.host,
      lastSeenAt: row.lastSeenAt,
      lastTestedAt: row.lastTestedAt,
      model: row.model,
      name: row.name,
      serial: row.serial,
      updatedAt: row.updatedAt,
    })
    .where(eq(printerConnections.id, connectionId));

  return mapPrinterConnection(row as typeof printerConnections.$inferSelect);
}

export async function deletePrinterConnection(
  db: AppDatabase,
  connectionId: string,
): Promise<boolean> {
  await db
    .delete(cameraAssignments)
    .where(
      and(
        eq(cameraAssignments.targetType, "printer"),
        eq(cameraAssignments.printerId, connectionId),
      ),
    );

  const result = await db
    .delete(printerConnections)
    .where(eq(printerConnections.id, connectionId));

  return result.changes > 0;
}

export async function updatePrinterConnectionStatus(
  db: AppDatabase,
  connectionId: string,
  connectionStatus: PrinterConnectionStatus,
  seenAt: string | null,
): Promise<void> {
  await db
    .update(printerConnections)
    .set({
      connectionStatus,
      lastSeenAt: seenAt,
      lastTestedAt: seenAt ?? nowIso(),
      updatedAt: nowIso(),
    })
    .where(eq(printerConnections.id, connectionId));
}

export async function listCameraSources(
  db: AppDatabase,
): Promise<CameraSource[]> {
  const rows = await db
    .select()
    .from(cameraSources)
    .orderBy(cameraSources.createdAt);
  const assignments = await listCameraAssignments(db);
  const assignedBySource = new Map<string, string[]>();
  for (const assignment of assignments) {
    const existing = assignedBySource.get(assignment.sourceId) ?? [];
    existing.push(assignment.targetId);
    assignedBySource.set(assignment.sourceId, existing);
  }

  return rows.map((row) => mapCameraSource(row, assignedBySource.get(row.id)));
}

export async function listCameraSourceSecrets(
  db: AppDatabase,
): Promise<CameraSourceSecretRecord[]> {
  const rows = await db
    .select()
    .from(cameraSources)
    .orderBy(cameraSources.createdAt);
  const assignments = await listCameraAssignments(db);
  const assignedBySource = new Map<string, string[]>();
  for (const assignment of assignments) {
    const existing = assignedBySource.get(assignment.sourceId) ?? [];
    existing.push(assignment.targetId);
    assignedBySource.set(assignment.sourceId, existing);
  }

  return rows.map((row) =>
    mapCameraSourceSecret(row, assignedBySource.get(row.id)),
  );
}

export async function getCameraSourceSecretById(
  db: AppDatabase,
  sourceId: string,
): Promise<CameraSourceSecretRecord | undefined> {
  const row = await db.query.cameraSources.findFirst({
    where: eq(cameraSources.id, sourceId),
  });

  return row ? mapCameraSourceSecret(row) : undefined;
}

export async function createCameraSource(
  db: AppDatabase,
  input: CreateCameraSourceInput,
): Promise<CameraSource> {
  const timestamp = nowIso();
  const row: typeof cameraSources.$inferInsert = {
    id: randomUUID(),
    name: input.name.trim(),
    provider: input.provider,
    streamUrl: input.streamUrl.trim(),
    streamKind: input.streamKind,
    frigateBaseUrl: input.frigateBaseUrl?.trim() || null,
    frigateCamera: input.frigateCamera?.trim() || null,
    username: input.username?.trim() || null,
    password: input.password?.trim() || null,
    status: input.status,
    details: input.details,
    lastTestedAt: input.lastTestedAt,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.insert(cameraSources).values(row);

  return mapCameraSource(row as typeof cameraSources.$inferSelect);
}

export async function updateCameraSource(
  db: AppDatabase,
  sourceId: string,
  input: CreateCameraSourceInput,
): Promise<CameraSource | null> {
  const existing = await db.query.cameraSources.findFirst({
    where: eq(cameraSources.id, sourceId),
  });
  if (!existing) {
    return null;
  }

  const row: typeof cameraSources.$inferInsert = {
    id: sourceId,
    name: input.name.trim(),
    provider: input.provider,
    streamUrl: input.streamUrl.trim(),
    streamKind: input.streamKind,
    frigateBaseUrl: input.frigateBaseUrl?.trim() || null,
    frigateCamera: input.frigateCamera?.trim() || null,
    username: input.username?.trim() || existing.username,
    password: input.password?.trim() || existing.password,
    status: input.status,
    details: input.details,
    lastTestedAt: input.lastTestedAt,
    createdAt: existing.createdAt,
    updatedAt: nowIso(),
  };

  await db
    .update(cameraSources)
    .set({
      name: row.name,
      provider: row.provider,
      streamUrl: row.streamUrl,
      streamKind: row.streamKind,
      frigateBaseUrl: row.frigateBaseUrl,
      frigateCamera: row.frigateCamera,
      username: row.username,
      password: row.password,
      status: row.status,
      details: row.details,
      lastTestedAt: row.lastTestedAt,
      updatedAt: row.updatedAt,
    })
    .where(eq(cameraSources.id, sourceId));

  return mapCameraSource(row as typeof cameraSources.$inferSelect);
}

export async function deleteCameraSource(
  db: AppDatabase,
  sourceId: string,
): Promise<boolean> {
  const result = await db
    .delete(cameraSources)
    .where(eq(cameraSources.id, sourceId));

  return result.changes > 0;
}

export async function updateCameraSourceStatus(
  db: AppDatabase,
  sourceId: string,
  input: Pick<CreateCameraSourceInput, "details" | "lastTestedAt" | "status">,
): Promise<void> {
  await db
    .update(cameraSources)
    .set({
      details: input.details,
      lastTestedAt: input.lastTestedAt,
      status: input.status,
      updatedAt: nowIso(),
    })
    .where(eq(cameraSources.id, sourceId));
}

export async function listCameraAssignments(
  db: AppDatabase,
): Promise<CameraAssignment[]> {
  const rows = await db
    .select({
      feedId: cameraAssignments.id,
      feedLabel: cameraAssignments.feedLabel,
      printerId: cameraAssignments.printerId,
      sourceId: cameraAssignments.sourceId,
      sourceName: cameraSources.name,
      targetType: cameraAssignments.targetType,
    })
    .from(cameraAssignments)
    .leftJoin(cameraSources, eq(cameraAssignments.sourceId, cameraSources.id))
    .orderBy(cameraAssignments.createdAt);
  const printers = await listPrinterConnections(db);
  const printerById = new Map(printers.map((printer) => [printer.id, printer]));

  return rows.map((row) => ({
    feedId: row.feedId,
    feedLabel: row.feedLabel,
    printerId: row.printerId,
    printerName:
      row.targetType === "fleet"
        ? "Fleet Overview"
        : (printerById.get(row.printerId)?.name ?? row.printerId),
    sourceId: row.sourceId,
    sourceName: row.sourceName ?? row.sourceId,
    targetId: row.printerId,
    targetName:
      row.targetType === "fleet"
        ? "Fleet Overview"
        : (printerById.get(row.printerId)?.name ?? row.printerId),
    targetType: row.targetType,
  }));
}

export async function upsertCameraAssignment(
  db: AppDatabase,
  input: CameraAssignmentInput,
): Promise<CameraAssignment> {
  const timestamp = nowIso();
  const targetType = input.targetType ?? "printer";
  const existing = await db.query.cameraAssignments.findFirst({
    where: and(
      eq(cameraAssignments.targetType, targetType),
      eq(cameraAssignments.printerId, input.printerId),
      eq(cameraAssignments.sourceId, input.sourceId),
      eq(cameraAssignments.feedLabel, input.feedLabel.trim()),
    ),
  });

  const row: typeof cameraAssignments.$inferInsert = {
    id: existing?.id ?? randomUUID(),
    targetType,
    printerId: input.printerId,
    sourceId: input.sourceId,
    feedLabel: input.feedLabel.trim(),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  if (existing) {
    await db
      .update(cameraAssignments)
      .set({
        feedLabel: row.feedLabel,
        updatedAt: timestamp,
      })
      .where(eq(cameraAssignments.id, existing.id));
  } else {
    await db.insert(cameraAssignments).values(row);
  }

  const [assignment] = (await listCameraAssignments(db)).filter(
    (item) => item.feedId === row.id,
  );

  return (
    assignment ?? {
      feedId: row.id,
      feedLabel: row.feedLabel,
      printerId: row.printerId,
      printerName:
        row.targetType === "fleet" ? "Fleet Overview" : row.printerId,
      sourceId: row.sourceId,
      sourceName: row.sourceId,
      targetId: row.printerId,
      targetName: row.targetType === "fleet" ? "Fleet Overview" : row.printerId,
      targetType: row.targetType,
    }
  );
}

export async function deleteCameraAssignment(
  db: AppDatabase,
  assignmentId: string,
): Promise<boolean> {
  const result = await db
    .delete(cameraAssignments)
    .where(eq(cameraAssignments.id, assignmentId));

  return result.changes > 0;
}

export async function getAppearance(
  db: AppDatabase,
  userId: string,
): Promise<AppearanceSettings> {
  const row = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
  });

  return mapAppearance(row);
}

export async function upsertAppearance(
  db: AppDatabase,
  userId: string,
  appearance: AppearanceSettings,
): Promise<AppearanceSettings> {
  const updatedAt = nowIso();
  await db
    .insert(userPreferences)
    .values({
      userId,
      ...appearance,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        ...appearance,
        updatedAt,
      },
    });

  return appearance;
}

export async function createInvite(
  db: AppDatabase,
  baseUrl: string,
  input: CreateInviteInput,
): Promise<InviteRecord> {
  const row: typeof invites.$inferInsert = {
    id: randomUUID(),
    email: input.email.toLowerCase(),
    role: input.role,
    tokenHash: input.tokenHash,
    createdByUserId: input.createdByUserId,
    createdAt: nowIso(),
    expiresAt: input.expiresAt,
    usedAt: null,
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
    inviteUrl: `${baseUrl.replace(/\/$/, "")}/auth/invite/${row.id}`,
  };
}

export async function listInvites(
  db: AppDatabase,
  baseUrl: string,
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
    inviteUrl: `${baseUrl.replace(/\/$/, "")}/auth/invite/${row.id}`,
  }));
}

export async function findInviteById(
  db: AppDatabase,
  inviteId: string,
): Promise<typeof invites.$inferSelect | undefined> {
  return db.query.invites.findFirst({
    where: eq(invites.id, inviteId),
  });
}

export async function findActiveInviteByTokenHash(
  db: AppDatabase,
  tokenHash: string,
): Promise<typeof invites.$inferSelect | undefined> {
  const now = nowIso();

  return db.query.invites.findFirst({
    where: and(eq(invites.tokenHash, tokenHash), gt(invites.expiresAt, now)),
  });
}

export async function markInviteUsed(
  db: AppDatabase,
  inviteId: string,
): Promise<void> {
  await db
    .update(invites)
    .set({ usedAt: nowIso() })
    .where(eq(invites.id, inviteId));
}

export async function createSession(
  db: AppDatabase,
  input: CreateSessionInput,
): Promise<void> {
  const timestamp = nowIso();
  await db.insert(sessions).values({
    id: randomUUID(),
    userId: input.userId,
    tokenHash: input.tokenHash,
    createdAt: timestamp,
    expiresAt: input.expiresAt,
    lastSeenAt: timestamp,
  });
}

export async function getSessionByTokenHash(
  db: AppDatabase,
  tokenHash: string,
): Promise<typeof sessions.$inferSelect | undefined> {
  const now = nowIso();

  return db.query.sessions.findFirst({
    where: and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)),
  });
}

export async function touchSession(
  db: AppDatabase,
  sessionId: string,
): Promise<void> {
  await db
    .update(sessions)
    .set({ lastSeenAt: nowIso() })
    .where(eq(sessions.id, sessionId));
}

export async function deleteSessionByTokenHash(
  db: AppDatabase,
  tokenHash: string,
): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}
