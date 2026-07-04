import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

function createInvocation(binaryPath) {
  if (process.platform === "win32") {
    return {
      args: [binaryPath],
      command: process.execPath,
    };
  }

  return {
    args: [],
    command: binaryPath,
  };
}

export function resolveEsbuildInvocation({ label, repoRoot, workspaceDir }) {
  const packageBinary = path.join("node_modules", "esbuild", "bin", "esbuild");
  const directPackageBinary = path.join(workspaceDir, packageBinary);

  if (existsSync(directPackageBinary)) {
    return createInvocation(directPackageBinary);
  }

  const pnpmStoreDir = path.join(repoRoot, "node_modules", ".pnpm");
  const pnpmEntries = existsSync(pnpmStoreDir)
    ? readdirSync(pnpmStoreDir)
        .filter((entry) => entry.startsWith("esbuild@"))
        .sort()
        .reverse()
    : [];

  for (const entry of pnpmEntries) {
    const candidate = path.join(pnpmStoreDir, entry, packageBinary);

    if (existsSync(candidate)) {
      return createInvocation(candidate);
    }
  }

  throw new Error(
    `Unable to locate a working esbuild binary for the ${label} build.`,
  );
}
