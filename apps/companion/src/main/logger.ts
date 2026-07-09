import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname } from "node:path";

import type { CompanionLogEntry } from "@bambuview/contracts";

const REDACTION_PATTERNS: Array<[RegExp, string]> = [
  [/(access[_\s-]*code["=: ]+)([^\s",]+)/gi, "$1[redacted]"],
  [/(password["=: ]+)([^\s",]+)/gi, "$1[redacted]"],
  [/(pairing[_\s-]*token["=: ]+)([^\s",]+)/gi, "$1[redacted]"],
  [/(bridge[_\s-]*token["=: ]+)([^\s",]+)/gi, "$1[redacted]"],
  [/(serial["=: ]+)([A-Za-z0-9-]+)/gi, "$1[redacted]"],
];

const REDACTED_KEYS = new Set([
  "accesscode",
  "accesstoken",
  "authorization",
  "bridgeauth",
  "bridgetoken",
  "pairingtoken",
  "password",
  "refreshtoken",
  "serial",
  "token",
]);

const MAX_LOG_FILE_BYTES = 5 * 1024 * 1024;

function redactMessage(message: string): string {
  return REDACTION_PATTERNS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    message,
  );
}

function normalizeRedactionKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function redactValue(value: unknown, parentKey?: string): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    if (
      parentKey &&
      REDACTED_KEYS.has(normalizeRedactionKey(parentKey)) &&
      value.trim().length > 0
    ) {
      return "[redacted]";
    }
    return redactMessage(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, parentKey));
  }

  if (value instanceof Error) {
    return {
      message: redactMessage(value.message),
      name: value.name,
      stack: value.stack ? redactMessage(value.stack) : null,
    };
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        REDACTED_KEYS.has(normalizeRedactionKey(key))
          ? "[redacted]"
          : redactValue(entry, key),
      ]),
    );
  }

  return String(value);
}

interface PersistentLogRecord {
  context?: unknown;
  createdAt: string;
  level: CompanionLogEntry["level"];
  message: string;
}

interface CompanionLoggerOptions {
  candidateFilePaths?: string[];
}

export class CompanionLogger {
  private readonly entries: CompanionLogEntry[] = [];
  private readonly candidateFilePaths: string[];
  private persistentFilePath: string | null = null;

  constructor(
    private readonly limit = 120,
    options: CompanionLoggerOptions = {},
  ) {
    this.candidateFilePaths = options.candidateFilePaths ?? [];
  }

  error(message: string, context?: unknown) {
    this.push("error", message, context);
  }

  info(message: string, context?: unknown) {
    this.push("info", message, context);
  }

  list(): CompanionLogEntry[] {
    return [...this.entries].reverse();
  }

  warn(message: string, context?: unknown) {
    this.push("warn", message, context);
  }

  filePath(): string | null {
    return this.resolvePersistentFilePath();
  }

  readText(): string {
    const snapshots = this.readFileSnapshots();
    if (!snapshots.length) {
      return "";
    }

    if (snapshots.length === 1) {
      return snapshots[0]?.text ?? "";
    }

    return snapshots
      .map((snapshot) => `===== ${basename(snapshot.path)} =====\n${snapshot.text}`)
      .join("\n\n");
  }

  filePaths(): string[] {
    return this.readFileSnapshots().map((snapshot) => snapshot.path);
  }

  readFileSnapshots(): Array<{ path: string; text: string }> {
    const filePath = this.resolvePersistentFilePath();
    if (!filePath) {
      return [];
    }

    const paths = [`${filePath}.1`, filePath];
    const snapshots: Array<{ path: string; text: string }> = [];
    for (const currentPath of paths) {
      if (!existsSync(currentPath)) {
        continue;
      }

      try {
        snapshots.push({
          path: currentPath,
          text: readFileSync(currentPath, "utf8"),
        });
      } catch {
        continue;
      }
    }

    return snapshots;
  }

  private push(
    level: CompanionLogEntry["level"],
    message: string,
    context?: unknown,
  ) {
    const createdAt = new Date().toISOString();
    const redactedMessage = redactMessage(message);
    this.entries.push({
      createdAt,
      id: randomUUID(),
      level,
      message: redactedMessage,
    });
    if (this.entries.length > this.limit) {
      this.entries.splice(0, this.entries.length - this.limit);
    }

    this.appendPersistentRecord({
      context: context === undefined ? undefined : redactValue(context),
      createdAt,
      level,
      message: redactedMessage,
    });
  }

  private appendPersistentRecord(record: PersistentLogRecord) {
    const filePath = this.resolvePersistentFilePath();
    if (!filePath) {
      return;
    }

    try {
      this.rotateIfNeeded(filePath);
      appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
    } catch {
      // Best-effort diagnostics should never crash the app.
    }
  }

  private rotateIfNeeded(filePath: string) {
    try {
      if (!existsSync(filePath)) {
        return;
      }

      if (statSync(filePath).size < MAX_LOG_FILE_BYTES) {
        return;
      }

      renameSync(filePath, `${filePath}.1`);
      writeFileSync(filePath, "", "utf8");
    } catch {
      // Ignore rotation failures and keep app logging alive.
    }
  }

  private resolvePersistentFilePath(): string | null {
    if (this.persistentFilePath) {
      return this.persistentFilePath;
    }

    for (const candidate of this.candidateFilePaths) {
      try {
        mkdirSync(dirname(candidate), { recursive: true });
        writeFileSync(candidate, "", { encoding: "utf8", flag: "a" });
        this.persistentFilePath = candidate;
        return candidate;
      } catch {
        continue;
      }
    }

    return null;
  }
}
