import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const desktopDir = path.join(repoRoot, "apps/desktop");
const apiDir = path.join(repoRoot, "apps/api");
const webDir = path.join(repoRoot, "apps/web");
const outputDir = path.join(desktopDir, "release");
const stageDir = path.join(
  os.tmpdir(),
  `bambuview-desktop-stage-${Date.now().toString(36)}`,
);
const skipBuild = process.argv.includes("--skip-build");
const passthroughArgs = process.argv
  .slice(2)
  .filter((arg) => arg !== "--skip-build" && arg !== "--");
const manualWindowsPortableZip = passthroughArgs.includes("--portable-zip");
const electronBuilderArgs = passthroughArgs.filter(
  (arg) => arg !== "--portable-zip",
);
const pnpmCli = process.env.npm_execpath ?? process.env.PNPM_EXECUTABLE ?? null;

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

function shouldUseWindowsShell(command) {
  return process.platform === "win32" && /\.(?:cmd|bat)$/i.test(command);
}

function run(command, args, cwd, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      ...extraEnv,
    },
    shell: shouldUseWindowsShell(command),
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
  const resolvedPnpmCli =
    pnpmCli ?? (process.platform === "win32" ? "pnpm.cmd" : "pnpm");

  if (/\.(?:[cm]?js)$/i.test(resolvedPnpmCli)) {
    return {
      args: [resolvedPnpmCli, ...args],
      command: process.execPath,
    };
  }

  return {
    args,
    command: resolvedPnpmCli,
  };
}

function removePackagedAppDependencies() {
  const packagePath = path.join(stageDir, "package.json");
  const packageData = JSON.parse(readFileSync(packagePath, "utf8"));

  // Runtime dependencies live under resources/node_modules for the bundled API.
  delete packageData.dependencies;
  delete packageData.optionalDependencies;

  writeFileSync(packagePath, `${JSON.stringify(packageData, null, 2)}\n`);
}

function materializeRuntimeDependencyTree(rootDependencyName) {
  const sourceNodeModules = path.join(stageDir, "node_modules");
  const cleanNodeModules = path.join(stageDir, "node_modules.clean");
  const rootResolver = createRequire(path.join(stageDir, "package.json"));
  const copiedDependencies = new Set();

  function copyDependency(dependencyName, resolver) {
    if (copiedDependencies.has(dependencyName)) {
      return;
    }

    const packageJsonPath = realpathSync(
      resolver.resolve(`${dependencyName}/package.json`),
    );
    const packageSource = path.dirname(packageJsonPath);
    const packageTarget = path.join(cleanNodeModules, dependencyName);
    const packageData = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    const packageResolver = createRequire(packageJsonPath);

    copiedDependencies.add(dependencyName);
    mkdirSync(path.dirname(packageTarget), { recursive: true });
    cpSync(packageSource, packageTarget, {
      dereference: true,
      force: true,
      recursive: true,
    });

    for (const childDependencyName of Object.keys({
      ...packageData.dependencies,
      ...packageData.optionalDependencies,
    })) {
      copyDependency(childDependencyName, packageResolver);
    }
  }

  if (!existsSync(sourceNodeModules)) {
    throw new Error("Expected staged node_modules to exist.");
  }

  rmSync(cleanNodeModules, { force: true, recursive: true });
  mkdirSync(cleanNodeModules, { recursive: true });
  copyDependency(rootDependencyName, rootResolver);
  rmSync(sourceNodeModules, { force: true, recursive: true });
  renameSync(cleanNodeModules, sourceNodeModules);
}

function runWebBuild() {
  const tscBinary = path.join(
    repoRoot,
    "node_modules/.bin",
    process.platform === "win32" ? "tsc.cmd" : "tsc",
  );
  const viteBinary = path.join(
    webDir,
    "node_modules/.bin",
    process.platform === "win32" ? "vite.cmd" : "vite",
  );

  run(tscBinary, ["-p", "tsconfig.json"], webDir);
  run(viteBinary, ["build"], webDir);
}

function getTargetArch() {
  if (electronBuilderArgs.includes("--arm64")) {
    return "arm64";
  }

  if (electronBuilderArgs.includes("--ia32")) {
    return "ia32";
  }

  return "x64";
}

function createWindowsPortableZip() {
  if (process.platform !== "win32") {
    throw new Error("--portable-zip is only supported on Windows runners.");
  }

  const packageData = JSON.parse(
    readFileSync(path.join(desktopDir, "package.json"), "utf8"),
  );
  const arch = getTargetArch();
  const productName = (
    packageData.build?.productName ??
    packageData.productName ??
    packageData.name
  ).replace(/[<>:"/\\|?*\x00-\x1F]/g, "-");
  const portableName = `${productName}-${packageData.version}-Portable-${arch}`;
  const unpackedDir = path.join(outputDir, "win-unpacked");
  const portableDir = path.join(outputDir, portableName);
  const portableZip = path.join(outputDir, `${portableName}.zip`);

  if (!existsSync(unpackedDir)) {
    throw new Error("Expected win-unpacked output before portable zip creation.");
  }

  rmSync(portableDir, { force: true, recursive: true });
  rmSync(portableZip, { force: true });
  renameSync(unpackedDir, portableDir);

  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  const tarCommand = path.join(systemRoot, "System32", "tar.exe");

  run(
    existsSync(tarCommand) ? tarCommand : "tar.exe",
    [
      "-a",
      "-cf",
      portableZip,
      "-C",
      outputDir,
      portableName,
    ],
    repoRoot,
  );
}

const electronBuilderCli = resolveElectronBuilderCli();

if (!skipBuild) {
  run(process.execPath, ["build.mjs"], apiDir);
  runWebBuild();
  run(process.execPath, ["build.mjs"], desktopDir);
}

rmSync(stageDir, { force: true, recursive: true });
mkdirSync(stageDir, { recursive: true });

const pnpmInvocation = resolvePnpmInvocation([
  "--config.confirmModulesPurge=false",
  "--filter",
  "@bambuview/desktop",
  "deploy",
  "--prod",
  "--legacy",
  stageDir,
]);

run(pnpmInvocation.command, pnpmInvocation.args, repoRoot, {
  BAMBUVIEW_SKIP_POSTINSTALL: "1",
  CI: "true",
});

materializeRuntimeDependencyTree("better-sqlite3");

for (const entry of ["release", "src", "tsconfig.json", "vitest.config.ts"]) {
  rmSync(path.join(stageDir, entry), { force: true, recursive: true });
}

cpSync(path.join(desktopDir, "out"), path.join(stageDir, "out"), {
  force: true,
  recursive: true,
});
cpSync(path.join(apiDir, "dist"), path.join(stageDir, "api"), {
  force: true,
  recursive: true,
});
cpSync(path.join(webDir, "dist"), path.join(stageDir, "web"), {
  force: true,
  recursive: true,
});

const nodeRuntimeDir = path.join(stageDir, "node-runtime");
const nodeRuntimeName = process.platform === "win32" ? "node.exe" : "node";
const nodeRuntimePath = path.join(nodeRuntimeDir, nodeRuntimeName);
mkdirSync(nodeRuntimeDir, { recursive: true });
cpSync(realpathSync(process.execPath), nodeRuntimePath, {
  force: true,
});

if (process.platform !== "win32") {
  chmodSync(nodeRuntimePath, 0o755);
}

if (existsSync(path.join(repoRoot, ".npmrc"))) {
  cpSync(path.join(repoRoot, ".npmrc"), path.join(stageDir, ".npmrc"), {
    force: true,
  });
}

removePackagedAppDependencies();

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
    ...electronBuilderArgs,
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

if (manualWindowsPortableZip) {
  createWindowsPortableZip();
}

rmSync(stageDir, { force: true, recursive: true });

console.log(outputDir);
