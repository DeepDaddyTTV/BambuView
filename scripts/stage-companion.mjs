import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const companionDir = path.join(repoRoot, "apps/companion");
const pnpmCli =
  process.env.npm_execpath ??
  process.env.PNPM_EXECUTABLE ??
  (process.platform === "win32" ? "pnpm.cmd" : "pnpm");
const stageDir =
  process.argv[2] ??
  path.join(
    os.tmpdir(),
    `bambuview-companion-stage-${Date.now().toString(36)}`,
  );

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      BAMBUVIEW_SKIP_POSTINSTALL: "1",
      CI: "true",
    },
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    if (result.signal) {
      console.error(`Command terminated by signal: ${result.signal}`);
    }
    process.exit(result.status ?? 1);
  }
}

function resolvePnpmInvocation(args) {
  if (/\.(?:[cm]?js)$/i.test(pnpmCli ?? "")) {
    return {
      args: [pnpmCli, ...args],
      command: process.execPath,
    };
  }

  return {
    args,
    command: pnpmCli,
  };
}

if (!existsSync(path.join(companionDir, "out/main/index.js"))) {
  console.error(
    "Companion build output is missing. Run the Companion build before staging.",
  );
  process.exit(1);
}

rmSync(stageDir, { force: true, recursive: true });
mkdirSync(stageDir, { recursive: true });

const pnpmInvocation = resolvePnpmInvocation([
  "--config.confirmModulesPurge=false",
  "--filter",
  "@bambuview/companion",
  "deploy",
  "--prod",
  "--legacy",
  stageDir,
]);

run(pnpmInvocation.command, pnpmInvocation.args, repoRoot);

for (const entry of [
  "release",
  "src",
  "electron.vite.config.ts",
  "tsconfig.json",
  "vitest.config.ts",
]) {
  rmSync(path.join(stageDir, entry), { force: true, recursive: true });
}

cpSync(path.join(companionDir, "out"), path.join(stageDir, "out"), {
  force: true,
  recursive: true,
});

if (existsSync(path.join(repoRoot, ".npmrc"))) {
  cpSync(path.join(repoRoot, ".npmrc"), path.join(stageDir, ".npmrc"), {
    force: true,
  });
}

if (existsSync(path.join(companionDir, "buildResources"))) {
  cpSync(
    path.join(companionDir, "buildResources"),
    path.join(stageDir, "buildResources"),
    {
      force: true,
      recursive: true,
    },
  );
}

console.log(stageDir);
