import { mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveEsbuildInvocation } from "../../scripts/resolve-esbuild.mjs";

const desktopDir = fileURLToPath(new URL("./", import.meta.url));
const repoRoot = path.resolve(desktopDir, "../..");
const outDir = path.join(desktopDir, "out");
const esbuildInvocation = resolveEsbuildInvocation({
  label: "desktop",
  repoRoot,
  workspaceDir: desktopDir,
});

rmSync(outDir, { force: true, recursive: true });
mkdirSync(path.join(outDir, "main"), { recursive: true });

const result = spawnSync(
  esbuildInvocation.command,
  [
    ...esbuildInvocation.args,
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
