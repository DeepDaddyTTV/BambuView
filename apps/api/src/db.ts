import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";

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
  type CompanionCapabilityFlags,
  type CompanionCapabilityNotes,
  type CompanionHealthResponse,
  type CompanionPrinter,
  type CompanionRegistration,
  type CompanionStream,
  DEFAULT_APPEARANCE,
  type InviteRecord,
  type PrinterConnectionProvider,
  type PrinterConnectionRecord,
  type PrinterConnectionStatus,
  type UserProfile,
  type UserRole,
} from "@bambuview/contracts";

const sourceDirFromCwd =
  path.basename(process.cwd()) === "api"
    ? path.resolve(process.cwd(), "src")
    : path.resolve(process.cwd(), "apps/api/src");
const moduleDir =
  typeof __dirname === "string" ? __dirname : sourceDirFromCwd;
const moduleFilename =
  typeof __filename === "string"
    ? __filename
    : path.join(moduleDir, "db.ts");
const require = createRequire(moduleFilename);
const Database = require(
  path.join(moduleDir, "../node_modules/better-sqlite3/lib/index.js"),
) as typeof import("better-sqlite3");

type UserStatus = "active" | "invited";

interface UserRow {
  createdAt: string;
  email: string;
  id: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  updatedAt: string;
}

interface SessionRow {
  createdAt: string;
  expiresAt: string;
  id: string;
  lastSeenAt: string;
  tokenHash: string;
  userId: string;
}

interface InviteRow {
  createdAt: string;
  createdByUserId: string;
  email: string;
  expiresAt: string;
  id: string;
  role: UserRole;
  tokenHash: string;
  usedAt: string | null;
}

interface UserPreferenceRow {
  backgroundStyle: AppearanceSettings["backgroundStyle"];
  darkBackground: string;
  darkHighlight: string;
  lightBackground: string;
  lightHighlight: string;
  mode: "dark" | "light";
  updatedAt: string;
  userId: string;
}

interface PrinterConnectionRow {
  accessCode: string;
  connectionMode: BambuConnectionMode;
  connectionStatus: PrinterConnectionStatus;
  createdAt: string;
  host: string;
  id: string;
  lastSeenAt: string | null;
  lastTestedAt: string | null;
  model: string;
  name: string;
  provider: PrinterConnectionProvider;
  serial: string;
  updatedAt: string;
}

interface CameraSourceRow {
  createdAt: string;
  details: string;
  frigateBaseUrl: string | null;
  frigateCamera: string | null;
  id: string;
  lastTestedAt: string | null;
  name: string;
  password: string | null;
  provider: CameraProviderType;
  status: CameraSource["status"];
  streamKind: CameraStreamKind;
  streamUrl: string;
  updatedAt: string;
  username: string | null;
}

interface CameraAssignmentRow {
  createdAt: string;
  feedLabel: string;
  id: string;
  printerId: string;
  sourceId: string;
  targetType: CameraAssignmentTargetType;
  updatedAt: string;
}

interface CompanionPairingCodeRow {
  createdAt: string;
  createdByUserId: string;
  expiresAt: string;
  id: string;
  tokenHash: string;
  usedAt: string | null;
}

interface CompanionRow {
  baseUrl: string;
  bridgeToken: string;
  bridgeUsername: string;
  capabilitiesJson: string;
  capabilityNotesJson: string;
  createdAt: string;
  healthJson: string | null;
  id: string;
  lastError: string | null;
  lastHealthAt: string | null;
  name: string;
  pairedAt: string;
  printersJson: string | null;
  status: CompanionRegistration["status"];
  streamsJson: string | null;
  updatedAt: string;
}

export const schema = {
  cameraAssignments: "camera_assignments",
  cameraSources: "camera_sources",
  companionPairingCodes: "companion_pairing_codes",
  companions: "companions",
  invites: "invites",
  printerConnections: "printer_connections",
  sessions: "sessions",
  userPreferences: "user_preferences",
  users: "users",
} as const;

export type AppDatabase = Database.Database;

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
  createdByUserId: string;
  email: string;
  expiresAt: string;
  role: UserRole;
  tokenHash: string;
}

export interface CreateSessionInput {
  expiresAt: string;
  tokenHash: string;
  userId: string;
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

export interface CreateCompanionPairingCodeInput {
  createdByUserId: string;
  expiresAt: string;
  tokenHash: string;
}

export interface CreateCompanionRegistrationInput {
  baseUrl: string;
  bridgeToken: string;
  bridgeUsername: string;
  capabilities: CompanionCapabilityFlags;
  capabilityNotes: CompanionCapabilityNotes;
  health: CompanionHealthResponse | null;
  name: string;
  pairedAt: string;
  printers: CompanionPrinter[];
  status: CompanionRegistration["status"];
  streams: CompanionStream[];
}

export interface CompanionSecretRecord extends CompanionRegistration {
  bridgeToken: string;
  bridgeUsername: string;
  capabilityNotes: CompanionCapabilityNotes;
  health: CompanionHealthResponse | null;
  printers: CompanionPrinter[];
  streams: CompanionStream[];
}

const USER_SELECT = `
  SELECT
    id,
    email,
    name,
    password_hash AS passwordHash,
    role,
    status,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM users
`;

const SESSION_SELECT = `
  SELECT
    id,
    user_id AS userId,
    token_hash AS tokenHash,
    created_at AS createdAt,
    expires_at AS expiresAt,
    last_seen_at AS lastSeenAt
  FROM sessions
`;

const INVITE_SELECT = `
  SELECT
    id,
    email,
    role,
    token_hash AS tokenHash,
    created_by_user_id AS createdByUserId,
    created_at AS createdAt,
    expires_at AS expiresAt,
    used_at AS usedAt
  FROM invites
`;

const USER_PREFERENCE_SELECT = `
  SELECT
    user_id AS userId,
    mode,
    dark_highlight AS darkHighlight,
    dark_background AS darkBackground,
    light_highlight AS lightHighlight,
    light_background AS lightBackground,
    background_style AS backgroundStyle,
    updated_at AS updatedAt
  FROM user_preferences
`;

const PRINTER_CONNECTION_SELECT = `
  SELECT
    id,
    provider,
    connection_mode AS connectionMode,
    name,
    model,
    host,
    serial,
    access_code AS accessCode,
    connection_status AS connectionStatus,
    last_tested_at AS lastTestedAt,
    last_seen_at AS lastSeenAt,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM printer_connections
`;

const CAMERA_SOURCE_SELECT = `
  SELECT
    id,
    name,
    provider,
    stream_url AS streamUrl,
    stream_kind AS streamKind,
    frigate_base_url AS frigateBaseUrl,
    frigate_camera AS frigateCamera,
    username,
    password,
    status,
    details,
    last_tested_at AS lastTestedAt,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM camera_sources
`;

const CAMERA_ASSIGNMENT_SELECT = `
  SELECT
    id,
    target_type AS targetType,
    printer_id AS printerId,
    source_id AS sourceId,
    feed_label AS feedLabel,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM camera_assignments
`;

const COMPANION_PAIRING_SELECT = `
  SELECT
    id,
    token_hash AS tokenHash,
    created_by_user_id AS createdByUserId,
    created_at AS createdAt,
    expires_at AS expiresAt,
    used_at AS usedAt
  FROM companion_pairing_codes
`;

const COMPANION_SELECT = `
  SELECT
    id,
    name,
    base_url AS baseUrl,
    bridge_username AS bridgeUsername,
    bridge_token AS bridgeToken,
    status,
    last_health_at AS lastHealthAt,
    last_error AS lastError,
    capabilities_json AS capabilitiesJson,
    capability_notes_json AS capabilityNotesJson,
    health_json AS healthJson,
    printers_json AS printersJson,
    streams_json AS streamsJson,
    paired_at AS pairedAt,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM companions
`;

function nowIso(): string {
  return new Date().toISOString();
}

function getRow<T>(db: AppDatabase, statement: string, params: unknown[] = []): T | undefined {
  return db.prepare(statement).get(...params) as T | undefined;
}

function allRows<T>(db: AppDatabase, statement: string, params: unknown[] = []): T[] {
  return db.prepare(statement).all(...params) as T[];
}

function runStatement(
  db: AppDatabase,
  statement: string,
  params: unknown[] = [],
): Database.RunResult {
  return db.prepare(statement).run(...params);
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
    CREATE TABLE IF NOT EXISTS companion_pairing_codes (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );
    CREATE TABLE IF NOT EXISTS companions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL UNIQUE,
      bridge_username TEXT NOT NULL,
      bridge_token TEXT NOT NULL,
      status TEXT NOT NULL,
      last_health_at TEXT,
      last_error TEXT,
      capabilities_json TEXT NOT NULL,
      capability_notes_json TEXT NOT NULL,
      health_json TEXT,
      printers_json TEXT,
      streams_json TEXT,
      paired_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const printerConnectionColumns = sqlite
    .prepare("PRAGMA table_info(printer_connections)")
    .all() as Array<{ name: string }>;
  if (!printerConnectionColumns.some((column) => column.name === "connection_mode")) {
    sqlite.exec(
      "ALTER TABLE printer_connections ADD COLUMN connection_mode TEXT NOT NULL DEFAULT 'lan';",
    );
  }

  const cameraAssignmentColumns = sqlite
    .prepare("PRAGMA table_info(camera_assignments)")
    .all() as Array<{ name: string }>;
  if (!cameraAssignmentColumns.some((column) => column.name === "target_type")) {
    sqlite.exec(
      "ALTER TABLE camera_assignments ADD COLUMN target_type TEXT NOT NULL DEFAULT 'printer';",
    );
  }

  return { db: sqlite, sqlite };
}

export function closeDatabase(client: DatabaseClient): void {
  client.sqlite.close();
}

function mapUser(row: UserRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt,
  };
}

function mapAppearance(row: UserPreferenceRow | undefined): AppearanceSettings {
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

function mapPrinterConnection(row: PrinterConnectionRow): PrinterConnectionRecord {
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

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapCompanion(row: CompanionRow): CompanionSecretRecord {
  const printers = parseJson<CompanionPrinter[]>(row.printersJson, []);
  const streams = parseJson<CompanionStream[]>(row.streamsJson, []);

  return {
    baseUrl: row.baseUrl,
    bridgeToken: row.bridgeToken,
    bridgeUsername: row.bridgeUsername,
    capabilities: parseJson<CompanionCapabilityFlags>(row.capabilitiesJson, {
      ams: "unavailable",
      camera: "unavailable",
      controls: "unavailable",
      discovery: "unavailable",
      fileUpload: "unavailable",
      slicingAssist: "future",
      telemetry: "unavailable",
    }),
    capabilityNotes: parseJson<CompanionCapabilityNotes>(row.capabilityNotesJson, {}),
    createdAt: row.createdAt,
    health: parseJson<CompanionHealthResponse | null>(row.healthJson, null),
    id: row.id,
    lastError: row.lastError ?? null,
    lastHealthAt: row.lastHealthAt ?? null,
    name: row.name,
    pairedAt: row.pairedAt,
    printerCount: printers.length,
    printers,
    status: row.status,
    streamCount: streams.length,
    streams,
    tokenSet: row.bridgeToken.length > 0,
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

function cameraSourcePlaybackIssue(row: CameraSourceRow): string | null {
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

function cameraProxyUrls(row: CameraSourceRow): Pick<CameraSource, "snapshotUrl" | "streamUrl"> {
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

function mapCameraSource(row: CameraSourceRow, assignedTo: string[] = []): CameraSource {
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
  row: CameraSourceRow,
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

function mapPrinterConnectionSecret(row: PrinterConnectionRow): PrinterConnectionSecretRecord {
  return {
    ...mapPrinterConnection(row),
    accessCode: row.accessCode,
  };
}

function mapInviteRecord(baseUrl: string, row: InviteRow): InviteRecord {
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

function mapCompanionPublic(companion: CompanionSecretRecord): CompanionRegistration {
  return {
    baseUrl: companion.baseUrl,
    bridgeUsername: companion.bridgeUsername,
    capabilities: companion.capabilities,
    capabilityNotes: companion.capabilityNotes,
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
  };
}

export async function countUsers(db: AppDatabase): Promise<number> {
  const row = getRow<{ count: number }>(db, "SELECT count(*) AS count FROM users");
  return Number(row?.count ?? 0);
}

export async function countAdmins(db: AppDatabase): Promise<number> {
  const row = getRow<{ count: number }>(
    db,
    "SELECT count(*) AS count FROM users WHERE role = ?",
    ["admin"],
  );
  return Number(row?.count ?? 0);
}

export async function createUser(
  db: AppDatabase,
  input: CreateUserInput,
): Promise<UserProfile> {
  const timestamp = nowIso();
  const row: UserRow = {
    id: randomUUID(),
    email: input.email.toLowerCase(),
    name: input.name,
    passwordHash: input.passwordHash,
    role: input.role,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  runStatement(
    db,
    `
      INSERT INTO users (
        id, email, name, password_hash, role, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      row.id,
      row.email,
      row.name,
      row.passwordHash,
      row.role,
      row.status,
      row.createdAt,
      row.updatedAt,
    ],
  );
  await upsertAppearance(db, row.id, DEFAULT_APPEARANCE);

  return mapUser(row);
}

export async function getUserByEmail(
  db: AppDatabase,
  email: string,
): Promise<UserRow | undefined> {
  return getRow<UserRow>(db, `${USER_SELECT} WHERE email = ? LIMIT 1`, [
    email.toLowerCase(),
  ]);
}

export async function getUserById(
  db: AppDatabase,
  userId: string,
): Promise<UserRow | undefined> {
  return getRow<UserRow>(db, `${USER_SELECT} WHERE id = ? LIMIT 1`, [userId]);
}

export async function listUsers(db: AppDatabase): Promise<UserProfile[]> {
  const rows = allRows<UserRow>(db, `${USER_SELECT} ORDER BY created_at ASC`);
  return rows.map(mapUser);
}

export async function updateUserRole(
  db: AppDatabase,
  userId: string,
  role: UserRole,
): Promise<UserProfile | undefined> {
  runStatement(db, "UPDATE users SET role = ?, updated_at = ? WHERE id = ?", [
    role,
    nowIso(),
    userId,
  ]);

  const row = await getUserById(db, userId);
  return row ? mapUser(row) : undefined;
}

export async function listPrinterConnections(
  db: AppDatabase,
): Promise<PrinterConnectionRecord[]> {
  const rows = allRows<PrinterConnectionRow>(
    db,
    `${PRINTER_CONNECTION_SELECT} ORDER BY created_at ASC`,
  );
  return rows.map(mapPrinterConnection);
}

export async function listPrinterConnectionSecrets(
  db: AppDatabase,
): Promise<PrinterConnectionSecretRecord[]> {
  const rows = allRows<PrinterConnectionRow>(
    db,
    `${PRINTER_CONNECTION_SELECT} ORDER BY created_at ASC`,
  );
  return rows.map(mapPrinterConnectionSecret);
}

export async function getPrinterConnectionById(
  db: AppDatabase,
  connectionId: string,
): Promise<PrinterConnectionRecord | undefined> {
  const row = getRow<PrinterConnectionRow>(
    db,
    `${PRINTER_CONNECTION_SELECT} WHERE id = ? LIMIT 1`,
    [connectionId],
  );
  return row ? mapPrinterConnection(row) : undefined;
}

export async function getPrinterConnectionSecretById(
  db: AppDatabase,
  connectionId: string,
): Promise<PrinterConnectionSecretRecord | undefined> {
  const row = getRow<PrinterConnectionRow>(
    db,
    `${PRINTER_CONNECTION_SELECT} WHERE id = ? LIMIT 1`,
    [connectionId],
  );
  return row ? mapPrinterConnectionSecret(row) : undefined;
}

export async function getPrinterConnectionBySerial(
  db: AppDatabase,
  serial: string,
): Promise<PrinterConnectionRecord | undefined> {
  const row = getRow<PrinterConnectionRow>(
    db,
    `${PRINTER_CONNECTION_SELECT} WHERE serial = ? LIMIT 1`,
    [serial.trim().toUpperCase()],
  );
  return row ? mapPrinterConnection(row) : undefined;
}

export async function createPrinterConnection(
  db: AppDatabase,
  input: CreatePrinterConnectionInput,
): Promise<PrinterConnectionRecord> {
  const timestamp = nowIso();
  const row: PrinterConnectionRow = {
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

  runStatement(
    db,
    `
      INSERT INTO printer_connections (
        id, provider, connection_mode, name, model, host, serial, access_code,
        connection_status, last_tested_at, last_seen_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      row.id,
      row.provider,
      row.connectionMode,
      row.name,
      row.model,
      row.host,
      row.serial,
      row.accessCode,
      row.connectionStatus,
      row.lastTestedAt,
      row.lastSeenAt,
      row.createdAt,
      row.updatedAt,
    ],
  );

  return mapPrinterConnection(row);
}

export async function updatePrinterConnection(
  db: AppDatabase,
  connectionId: string,
  input: CreatePrinterConnectionInput,
): Promise<PrinterConnectionRecord | null> {
  const existing = getRow<PrinterConnectionRow>(
    db,
    `${PRINTER_CONNECTION_SELECT} WHERE id = ? LIMIT 1`,
    [connectionId],
  );
  if (!existing) {
    return null;
  }

  const accessCode = input.accessCode?.trim() || existing.accessCode;
  const row: PrinterConnectionRow = {
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
      input.connectionStatus === "online" ? input.lastTestedAt : existing.lastSeenAt,
    createdAt: existing.createdAt,
    updatedAt: nowIso(),
  };

  runStatement(
    db,
    `
      UPDATE printer_connections
      SET
        access_code = ?,
        connection_mode = ?,
        connection_status = ?,
        host = ?,
        last_seen_at = ?,
        last_tested_at = ?,
        model = ?,
        name = ?,
        serial = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      row.accessCode,
      row.connectionMode,
      row.connectionStatus,
      row.host,
      row.lastSeenAt,
      row.lastTestedAt,
      row.model,
      row.name,
      row.serial,
      row.updatedAt,
      connectionId,
    ],
  );

  return mapPrinterConnection(row);
}

export async function deletePrinterConnection(
  db: AppDatabase,
  connectionId: string,
): Promise<boolean> {
  runStatement(
    db,
    "DELETE FROM camera_assignments WHERE target_type = ? AND printer_id = ?",
    ["printer", connectionId],
  );
  const result = runStatement(db, "DELETE FROM printer_connections WHERE id = ?", [
    connectionId,
  ]);
  return result.changes > 0;
}

export async function updatePrinterConnectionStatus(
  db: AppDatabase,
  connectionId: string,
  connectionStatus: PrinterConnectionStatus,
  seenAt: string | null,
): Promise<void> {
  runStatement(
    db,
    `
      UPDATE printer_connections
      SET
        connection_status = ?,
        last_seen_at = ?,
        last_tested_at = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [connectionStatus, seenAt, seenAt ?? nowIso(), nowIso(), connectionId],
  );
}

export async function listCameraSources(db: AppDatabase): Promise<CameraSource[]> {
  const rows = allRows<CameraSourceRow>(db, `${CAMERA_SOURCE_SELECT} ORDER BY created_at ASC`);
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
  const rows = allRows<CameraSourceRow>(db, `${CAMERA_SOURCE_SELECT} ORDER BY created_at ASC`);
  const assignments = await listCameraAssignments(db);
  const assignedBySource = new Map<string, string[]>();
  for (const assignment of assignments) {
    const existing = assignedBySource.get(assignment.sourceId) ?? [];
    existing.push(assignment.targetId);
    assignedBySource.set(assignment.sourceId, existing);
  }

  return rows.map((row) => mapCameraSourceSecret(row, assignedBySource.get(row.id)));
}

export async function getCameraSourceSecretById(
  db: AppDatabase,
  sourceId: string,
): Promise<CameraSourceSecretRecord | undefined> {
  const row = getRow<CameraSourceRow>(
    db,
    `${CAMERA_SOURCE_SELECT} WHERE id = ? LIMIT 1`,
    [sourceId],
  );
  return row ? mapCameraSourceSecret(row) : undefined;
}

export async function createCameraSource(
  db: AppDatabase,
  input: CreateCameraSourceInput,
): Promise<CameraSource> {
  const timestamp = nowIso();
  const row: CameraSourceRow = {
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

  runStatement(
    db,
    `
      INSERT INTO camera_sources (
        id, name, provider, stream_url, stream_kind, frigate_base_url, frigate_camera,
        username, password, status, details, last_tested_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      row.id,
      row.name,
      row.provider,
      row.streamUrl,
      row.streamKind,
      row.frigateBaseUrl,
      row.frigateCamera,
      row.username,
      row.password,
      row.status,
      row.details,
      row.lastTestedAt,
      row.createdAt,
      row.updatedAt,
    ],
  );

  return mapCameraSource(row);
}

export async function updateCameraSource(
  db: AppDatabase,
  sourceId: string,
  input: CreateCameraSourceInput,
): Promise<CameraSource | null> {
  const existing = getRow<CameraSourceRow>(
    db,
    `${CAMERA_SOURCE_SELECT} WHERE id = ? LIMIT 1`,
    [sourceId],
  );
  if (!existing) {
    return null;
  }

  const row: CameraSourceRow = {
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

  runStatement(
    db,
    `
      UPDATE camera_sources
      SET
        name = ?,
        provider = ?,
        stream_url = ?,
        stream_kind = ?,
        frigate_base_url = ?,
        frigate_camera = ?,
        username = ?,
        password = ?,
        status = ?,
        details = ?,
        last_tested_at = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      row.name,
      row.provider,
      row.streamUrl,
      row.streamKind,
      row.frigateBaseUrl,
      row.frigateCamera,
      row.username,
      row.password,
      row.status,
      row.details,
      row.lastTestedAt,
      row.updatedAt,
      sourceId,
    ],
  );

  return mapCameraSource(row);
}

export async function deleteCameraSource(
  db: AppDatabase,
  sourceId: string,
): Promise<boolean> {
  const result = runStatement(db, "DELETE FROM camera_sources WHERE id = ?", [sourceId]);
  return result.changes > 0;
}

export async function updateCameraSourceStatus(
  db: AppDatabase,
  sourceId: string,
  input: Pick<CreateCameraSourceInput, "details" | "lastTestedAt" | "status">,
): Promise<void> {
  runStatement(
    db,
    `
      UPDATE camera_sources
      SET
        details = ?,
        last_tested_at = ?,
        status = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [input.details, input.lastTestedAt, input.status, nowIso(), sourceId],
  );
}

export async function listCameraAssignments(
  db: AppDatabase,
): Promise<CameraAssignment[]> {
  const rows = allRows<{
    feedId: string;
    feedLabel: string;
    printerId: string;
    sourceId: string;
    sourceName: string | null;
    targetType: CameraAssignmentTargetType;
  }>(
    db,
    `
      SELECT
        ca.id AS feedId,
        ca.feed_label AS feedLabel,
        ca.printer_id AS printerId,
        ca.source_id AS sourceId,
        cs.name AS sourceName,
        ca.target_type AS targetType
      FROM camera_assignments ca
      LEFT JOIN camera_sources cs ON ca.source_id = cs.id
      ORDER BY ca.created_at ASC
    `,
  );
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
  const feedLabel = input.feedLabel.trim();
  const existing = getRow<CameraAssignmentRow>(
    db,
    `
      ${CAMERA_ASSIGNMENT_SELECT}
      WHERE target_type = ? AND printer_id = ? AND source_id = ? AND feed_label = ?
      LIMIT 1
    `,
    [targetType, input.printerId, input.sourceId, feedLabel],
  );

  const row: CameraAssignmentRow = {
    id: existing?.id ?? randomUUID(),
    targetType,
    printerId: input.printerId,
    sourceId: input.sourceId,
    feedLabel,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  if (existing) {
    runStatement(
      db,
      "UPDATE camera_assignments SET feed_label = ?, updated_at = ? WHERE id = ?",
      [row.feedLabel, row.updatedAt, existing.id],
    );
  } else {
    runStatement(
      db,
      `
        INSERT INTO camera_assignments (
          id, target_type, printer_id, source_id, feed_label, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        row.id,
        row.targetType,
        row.printerId,
        row.sourceId,
        row.feedLabel,
        row.createdAt,
        row.updatedAt,
      ],
    );
  }

  const assignment = (await listCameraAssignments(db)).find((item) => item.feedId === row.id);
  return (
    assignment ?? {
      feedId: row.id,
      feedLabel: row.feedLabel,
      printerId: row.printerId,
      printerName: row.targetType === "fleet" ? "Fleet Overview" : row.printerId,
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
  const result = runStatement(db, "DELETE FROM camera_assignments WHERE id = ?", [
    assignmentId,
  ]);
  return result.changes > 0;
}

export async function getAppearance(
  db: AppDatabase,
  userId: string,
): Promise<AppearanceSettings> {
  const row = getRow<UserPreferenceRow>(
    db,
    `${USER_PREFERENCE_SELECT} WHERE user_id = ? LIMIT 1`,
    [userId],
  );
  return mapAppearance(row);
}

export async function upsertAppearance(
  db: AppDatabase,
  userId: string,
  appearance: AppearanceSettings,
): Promise<AppearanceSettings> {
  const updatedAt = nowIso();
  runStatement(
    db,
    `
      INSERT INTO user_preferences (
        user_id, mode, dark_highlight, dark_background, light_highlight,
        light_background, background_style, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        mode = excluded.mode,
        dark_highlight = excluded.dark_highlight,
        dark_background = excluded.dark_background,
        light_highlight = excluded.light_highlight,
        light_background = excluded.light_background,
        background_style = excluded.background_style,
        updated_at = excluded.updated_at
    `,
    [
      userId,
      appearance.mode,
      appearance.darkHighlight,
      appearance.darkBackground,
      appearance.lightHighlight,
      appearance.lightBackground,
      appearance.backgroundStyle,
      updatedAt,
    ],
  );

  return appearance;
}

export async function createInvite(
  db: AppDatabase,
  baseUrl: string,
  input: CreateInviteInput,
): Promise<InviteRecord> {
  const row: InviteRow = {
    id: randomUUID(),
    email: input.email.toLowerCase(),
    role: input.role,
    tokenHash: input.tokenHash,
    createdByUserId: input.createdByUserId,
    createdAt: nowIso(),
    expiresAt: input.expiresAt,
    usedAt: null,
  };

  runStatement(
    db,
    `
      INSERT INTO invites (
        id, email, role, token_hash, created_by_user_id, created_at, expires_at, used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      row.id,
      row.email,
      row.role,
      row.tokenHash,
      row.createdByUserId,
      row.createdAt,
      row.expiresAt,
      row.usedAt,
    ],
  );

  return mapInviteRecord(baseUrl, row);
}

export async function listInvites(
  db: AppDatabase,
  baseUrl: string,
): Promise<InviteRecord[]> {
  const rows = allRows<InviteRow>(db, `${INVITE_SELECT} ORDER BY created_at DESC`);
  return rows.map((row) => mapInviteRecord(baseUrl, row));
}

export async function findInviteById(
  db: AppDatabase,
  inviteId: string,
): Promise<InviteRow | undefined> {
  return getRow<InviteRow>(db, `${INVITE_SELECT} WHERE id = ? LIMIT 1`, [inviteId]);
}

export async function findActiveInviteByTokenHash(
  db: AppDatabase,
  tokenHash: string,
): Promise<InviteRow | undefined> {
  return getRow<InviteRow>(
    db,
    `${INVITE_SELECT} WHERE token_hash = ? AND expires_at > ? LIMIT 1`,
    [tokenHash, nowIso()],
  );
}

export async function markInviteUsed(db: AppDatabase, inviteId: string): Promise<void> {
  runStatement(db, "UPDATE invites SET used_at = ? WHERE id = ?", [nowIso(), inviteId]);
}

export async function createSession(
  db: AppDatabase,
  input: CreateSessionInput,
): Promise<void> {
  const timestamp = nowIso();
  runStatement(
    db,
    `
      INSERT INTO sessions (
        id, user_id, token_hash, created_at, expires_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    [randomUUID(), input.userId, input.tokenHash, timestamp, input.expiresAt, timestamp],
  );
}

export async function getSessionByTokenHash(
  db: AppDatabase,
  tokenHash: string,
): Promise<SessionRow | undefined> {
  return getRow<SessionRow>(
    db,
    `${SESSION_SELECT} WHERE token_hash = ? AND expires_at > ? LIMIT 1`,
    [tokenHash, nowIso()],
  );
}

export async function touchSession(
  db: AppDatabase,
  sessionId: string,
): Promise<void> {
  runStatement(db, "UPDATE sessions SET last_seen_at = ? WHERE id = ?", [
    nowIso(),
    sessionId,
  ]);
}

export async function deleteSessionByTokenHash(
  db: AppDatabase,
  tokenHash: string,
): Promise<void> {
  runStatement(db, "DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
}

export async function createCompanionPairingCode(
  db: AppDatabase,
  input: CreateCompanionPairingCodeInput,
): Promise<CompanionPairingCodeRow> {
  const row: CompanionPairingCodeRow = {
    id: randomUUID(),
    tokenHash: input.tokenHash,
    createdByUserId: input.createdByUserId,
    createdAt: nowIso(),
    expiresAt: input.expiresAt,
    usedAt: null,
  };

  runStatement(
    db,
    `
      INSERT INTO companion_pairing_codes (
        id, token_hash, created_by_user_id, created_at, expires_at, used_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      row.id,
      row.tokenHash,
      row.createdByUserId,
      row.createdAt,
      row.expiresAt,
      row.usedAt,
    ],
  );

  return row;
}

export async function findActiveCompanionPairingCodeByTokenHash(
  db: AppDatabase,
  tokenHash: string,
): Promise<CompanionPairingCodeRow | undefined> {
  return getRow<CompanionPairingCodeRow>(
    db,
    `${COMPANION_PAIRING_SELECT} WHERE token_hash = ? AND expires_at > ? LIMIT 1`,
    [tokenHash, nowIso()],
  );
}

export async function markCompanionPairingCodeUsed(
  db: AppDatabase,
  pairingCodeId: string,
): Promise<void> {
  runStatement(db, "UPDATE companion_pairing_codes SET used_at = ? WHERE id = ?", [
    nowIso(),
    pairingCodeId,
  ]);
}

export async function listCompanions(
  db: AppDatabase,
): Promise<CompanionRegistration[]> {
  const rows = allRows<CompanionRow>(db, `${COMPANION_SELECT} ORDER BY updated_at DESC`);
  return rows.map((row) => mapCompanionPublic(mapCompanion(row)));
}

export async function getCompanionSecretById(
  db: AppDatabase,
  companionId: string,
): Promise<CompanionSecretRecord | undefined> {
  const row = getRow<CompanionRow>(
    db,
    `${COMPANION_SELECT} WHERE id = ? LIMIT 1`,
    [companionId],
  );
  return row ? mapCompanion(row) : undefined;
}

export async function findCompanionByBaseUrl(
  db: AppDatabase,
  baseUrl: string,
): Promise<CompanionSecretRecord | undefined> {
  const row = getRow<CompanionRow>(
    db,
    `${COMPANION_SELECT} WHERE base_url = ? LIMIT 1`,
    [baseUrl],
  );
  return row ? mapCompanion(row) : undefined;
}

export async function upsertCompanionRegistration(
  db: AppDatabase,
  input: CreateCompanionRegistrationInput,
): Promise<CompanionRegistration> {
  const timestamp = nowIso();
  const existing = getRow<CompanionRow>(
    db,
    `${COMPANION_SELECT} WHERE base_url = ? LIMIT 1`,
    [input.baseUrl],
  );
  const row: CompanionRow = {
    id: existing?.id ?? randomUUID(),
    name: input.name,
    baseUrl: input.baseUrl,
    bridgeUsername: input.bridgeUsername,
    bridgeToken: input.bridgeToken,
    status: input.status,
    lastHealthAt: input.health?.bridge.baseUrl ? timestamp : null,
    lastError: null,
    capabilitiesJson: JSON.stringify(input.capabilities),
    capabilityNotesJson: JSON.stringify(input.capabilityNotes),
    healthJson: JSON.stringify(input.health),
    printersJson: JSON.stringify(input.printers),
    streamsJson: JSON.stringify(input.streams),
    pairedAt: input.pairedAt,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  if (existing) {
    runStatement(
      db,
      `
        UPDATE companions
        SET
          name = ?,
          bridge_username = ?,
          bridge_token = ?,
          status = ?,
          last_health_at = ?,
          last_error = ?,
          capabilities_json = ?,
          capability_notes_json = ?,
          health_json = ?,
          printers_json = ?,
          streams_json = ?,
          paired_at = ?,
          updated_at = ?
        WHERE id = ?
      `,
      [
        row.name,
        row.bridgeUsername,
        row.bridgeToken,
        row.status,
        row.lastHealthAt,
        row.lastError,
        row.capabilitiesJson,
        row.capabilityNotesJson,
        row.healthJson,
        row.printersJson,
        row.streamsJson,
        row.pairedAt,
        row.updatedAt,
        existing.id,
      ],
    );
  } else {
    runStatement(
      db,
      `
        INSERT INTO companions (
          id, name, base_url, bridge_username, bridge_token, status,
          last_health_at, last_error, capabilities_json, capability_notes_json,
          health_json, printers_json, streams_json, paired_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        row.id,
        row.name,
        row.baseUrl,
        row.bridgeUsername,
        row.bridgeToken,
        row.status,
        row.lastHealthAt,
        row.lastError,
        row.capabilitiesJson,
        row.capabilityNotesJson,
        row.healthJson,
        row.printersJson,
        row.streamsJson,
        row.pairedAt,
        row.createdAt,
        row.updatedAt,
      ],
    );
  }

  return mapCompanionPublic(mapCompanion(row));
}

export async function updateCompanionSnapshot(
  db: AppDatabase,
  companionId: string,
  input: Omit<
    CreateCompanionRegistrationInput,
    "baseUrl" | "bridgeToken" | "bridgeUsername" | "name" | "pairedAt"
  > & {
    lastError: string | null;
  },
): Promise<CompanionRegistration | null> {
  const existing = getRow<CompanionRow>(
    db,
    `${COMPANION_SELECT} WHERE id = ? LIMIT 1`,
    [companionId],
  );
  if (!existing) {
    return null;
  }

  const updatedAt = nowIso();
  runStatement(
    db,
    `
      UPDATE companions
      SET
        capabilities_json = ?,
        capability_notes_json = ?,
        health_json = ?,
        last_error = ?,
        last_health_at = ?,
        printers_json = ?,
        status = ?,
        streams_json = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      JSON.stringify(input.capabilities),
      JSON.stringify(input.capabilityNotes),
      JSON.stringify(input.health),
      input.lastError,
      updatedAt,
      JSON.stringify(input.printers),
      input.status,
      JSON.stringify(input.streams),
      updatedAt,
      companionId,
    ],
  );

  const next = await getCompanionSecretById(db, companionId);
  return next ? mapCompanionPublic(next) : null;
}

export async function deleteCompanion(
  db: AppDatabase,
  companionId: string,
): Promise<boolean> {
  const result = runStatement(db, "DELETE FROM companions WHERE id = ?", [companionId]);
  return result.changes > 0;
}
