import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const apiDir = fileURLToPath(new URL(".", import.meta.url));
const distDir = path.join(apiDir, "dist");
const repoRoot = path.resolve(apiDir, "../..");
const esbuildBinaryName = process.platform === "win32" ? "esbuild.exe" : "esbuild";

function resolveEsbuildCli() {
  const directPackageBinary = path.join(
    apiDir,
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

  throw new Error("Unable to locate a working esbuild binary for the API build.");
}

const esbuildCli = resolveEsbuildCli();

mkdirSync(distDir, { recursive: true });

const result = spawnSync(
  esbuildCli,
  [
    "src/server.ts",
    "--bundle",
    "--format=cjs",
    "--log-level=info",
    "--outfile=dist/server.cjs",
    "--platform=node",
    "--sourcemap",
    "--target=node24",
  ],
  {
    cwd: apiDir,
    stdio: "inherit",
  },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
