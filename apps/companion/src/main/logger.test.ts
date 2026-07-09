import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CompanionLogger } from "./logger.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try {
      rmSync(dir, { force: true, recursive: true });
    } catch {
      // Best-effort cleanup for test temp directories.
    }
  }
});

describe("CompanionLogger", () => {
  it("redacts sensitive values before writing persistent logs", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "bambuview-logger-"));
    tempDirs.push(dir);
    const logPath = path.join(dir, "BambuView-Companion.log");
    const logger = new CompanionLogger(20, {
      candidateFilePaths: [logPath],
    });

    logger.error("Telemetry failed for serial ABC12345.", {
      accessCode: "lan-secret",
      authorization: "Bearer top-secret",
      pairingToken: "pair-token",
      password: "password123",
      serial: "ABC12345",
    });

    const logText = logger.readText();
    expect(logText).toContain("[redacted]");
    expect(logText).not.toContain("lan-secret");
    expect(logText).not.toContain("top-secret");
    expect(logText).not.toContain("pair-token");
    expect(logText).not.toContain("password123");
    expect(logText).not.toContain("ABC12345");
  });

  it("includes rotated log content in the exported text view", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "bambuview-logger-"));
    tempDirs.push(dir);
    const logPath = path.join(dir, "BambuView-Companion.log");
    writeFileSync(`${logPath}.1`, "older-entry", "utf8");
    writeFileSync(logPath, "current-entry", "utf8");

    const logger = new CompanionLogger(20, {
      candidateFilePaths: [logPath],
    });

    const logText = logger.readText();
    expect(logText).toContain("older-entry");
    expect(logText).toContain("current-entry");
    expect(logger.filePaths()).toEqual([`${logPath}.1`, logPath]);
  });
});
