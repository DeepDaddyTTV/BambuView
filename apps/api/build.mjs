import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { resolveEsbuildInvocation } from "../../scripts/resolve-esbuild.mjs";

const apiDir = fileURLToPath(new URL(".", import.meta.url));
const distDir = path.join(apiDir, "dist");
const repoRoot = path.resolve(apiDir, "../..");
const esbuildInvocation = resolveEsbuildInvocation({
  label: "API",
  repoRoot,
  workspaceDir: apiDir,
});

mkdirSync(distDir, { recursive: true });

const result = spawnSync(
  esbuildInvocation.command,
  [
    ...esbuildInvocation.args,
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
