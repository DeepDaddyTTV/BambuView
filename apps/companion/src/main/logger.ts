import { randomUUID } from "node:crypto";

import type { CompanionLogEntry } from "@bambuview/contracts";

const REDACTION_PATTERNS: Array<[RegExp, string]> = [
  [/(access[_\s-]*code["=: ]+)([^\s",]+)/gi, "$1[redacted]"],
  [/(password["=: ]+)([^\s",]+)/gi, "$1[redacted]"],
  [/(pairing[_\s-]*token["=: ]+)([^\s",]+)/gi, "$1[redacted]"],
  [/(bridge[_\s-]*token["=: ]+)([^\s",]+)/gi, "$1[redacted]"],
  [/(serial["=: ]+)([A-Za-z0-9-]+)/gi, "$1[redacted]"],
];

function redactMessage(message: string): string {
  return REDACTION_PATTERNS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    message,
  );
}

export class CompanionLogger {
  private readonly entries: CompanionLogEntry[] = [];

  constructor(private readonly limit = 120) {}

  error(message: string) {
    this.push("error", message);
  }

  info(message: string) {
    this.push("info", message);
  }

  list(): CompanionLogEntry[] {
    return [...this.entries].reverse();
  }

  warn(message: string) {
    this.push("warn", message);
  }

  private push(level: CompanionLogEntry["level"], message: string) {
    this.entries.push({
      createdAt: new Date().toISOString(),
      id: randomUUID(),
      level,
      message: redactMessage(message),
    });
    if (this.entries.length > this.limit) {
      this.entries.splice(0, this.entries.length - this.limit);
    }
  }
}
