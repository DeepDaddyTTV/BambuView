import { spawnSync } from "node:child_process";

if (process.env.BAMBUVIEW_SKIP_POSTINSTALL === "1") {
  process.exit(0);
}

const result = spawnSync(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["--filter", "@bambuview/contracts", "build"],
  {
    env: process.env,
    shell: false,
    stdio: "inherit",
  },
);

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
