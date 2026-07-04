import { spawnSync } from "node:child_process";

if (process.env.BAMBUVIEW_SKIP_POSTINSTALL === "1") {
  process.exit(0);
}

function resolvePnpmInvocation(args) {
  const pnpmCli =
    process.env.npm_execpath ??
    process.env.PNPM_EXECUTABLE ??
    (process.platform === "win32" ? "pnpm.cmd" : "pnpm");

  if (/\.(?:[cm]?js)$/i.test(pnpmCli)) {
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

function shouldUseWindowsShell(command) {
  return process.platform === "win32" && /\.(?:cmd|bat)$/i.test(command);
}

const pnpmInvocation = resolvePnpmInvocation([
  "--filter",
  "@bambuview/contracts",
  "build",
]);
const result = spawnSync(pnpmInvocation.command, pnpmInvocation.args, {
  env: process.env,
  shell: shouldUseWindowsShell(pnpmInvocation.command),
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

if (typeof result.status === "number") {
  process.exit(result.status);
}

process.exit(1);
