import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = fileURLToPath(new URL("./", import.meta.url));
const repoRoot = path.resolve(desktopDir, "../..");
const outDir = path.join(desktopDir, "out");
const esbuildBinaryName = process.platform === "win32" ? "esbuild.exe" : "esbuild";

function resolveEsbuildCli() {
  const directPackageBinary = path.join(
    desktopDir,
    "node_modules/esbuild/bin",
    esbuildBinaryName,
  );

  if (existsSync(directPackageBinary)) {
    return directPackageBinary;
  }

  const pnpmStoreDir = path.join(repoRoot, "node_modules/.pnpm");
  const pnpmEntries = existsSync(pnpmStoreDir)
    ? readdirSync(pnpmStoreDir)
        .filter((entry) => entry.startsWith("esbuild@"))
        .sort()
        .reverse()
    : [];

  for (const entry of pnpmEntries) {
    const candidate = path.join(
      pnpmStoreDir,
      entry,
      "node_modules/esbuild/bin",
      esbuildBinaryName,
    );

    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("Unable to locate a working esbuild binary for the desktop build.");
}

const esbuildCli = resolveEsbuildCli();

rmSync(outDir, { force: true, recursive: true });
mkdirSync(path.join(outDir, "main"), { recursive: true });

const result = spawnSync(
  esbuildCli,
  [
    "src/main/index.ts",
    "--bundle",
    "--external:electron",
    "--format=cjs",
    "--legal-comments=none",
    "--log-level=info",
    "--outfile=out/main/index.js",
    "--packages=external",
    "--platform=node",
    "--resolve-extensions=.ts,.tsx,.mjs,.js,.json",
    "--target=node24",
    "--tsconfig=tsconfig.json",
  ],
  {
    cwd: desktopDir,
    stdio: "inherit",
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
