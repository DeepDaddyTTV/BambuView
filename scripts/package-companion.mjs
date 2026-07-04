import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const companionDir = path.join(repoRoot, "apps/companion");
const stageScript = path.join(repoRoot, "scripts/stage-companion.mjs");
const outputDir = path.join(companionDir, "release");
const stageDir = path.join(
  os.tmpdir(),
  `bambuview-companion-stage-${Date.now().toString(36)}`,
);
const skipBuild = process.argv.includes("--skip-build");
const passthroughArgs = process.argv
  .slice(2)
  .filter((arg) => arg !== "--skip-build" && arg !== "--");

function resolveElectronBuilderCli() {
  const pnpmDir = path.join(repoRoot, "node_modules/.pnpm");
  const entry = readdirSync(pnpmDir).find((candidate) =>
    candidate.startsWith("electron-builder@"),
  );

  if (!entry) {
    throw new Error("electron-builder is not installed in this workspace.");
  }

  const cliPath = path.join(
    pnpmDir,
    entry,
    "node_modules/electron-builder/cli.js",
  );
  if (!existsSync(cliPath)) {
    throw new Error("electron-builder CLI could not be located.");
  }

  return cliPath;
}

const electronBuilderCli = resolveElectronBuilderCli();
function run(command, args, cwd, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      ...extraEnv,
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

if (!skipBuild) {
  run(process.execPath, ["build.mjs"], companionDir);
}

run(process.execPath, [stageScript, stageDir], repoRoot);

rmSync(outputDir, { force: true, recursive: true });
mkdirSync(outputDir, { recursive: true });

run(
  process.execPath,
  [
    electronBuilderCli,
    "--projectDir",
    stageDir,
    "--publish",
    "never",
    "--config.directories.output",
    outputDir,
    ...passthroughArgs,
  ],
  repoRoot,
  {
    BAMBUVIEW_SKIP_POSTINSTALL: "1",
    CI: "true",
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
    NPM_CONFIG_CONFIRM_MODULES_PURGE: "false",
    PNPM_CONFIG_CONFIRM_MODULES_PURGE: "false",
  },
);

rmSync(stageDir, { force: true, recursive: true });

console.log(outputDir);
