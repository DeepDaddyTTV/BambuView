import { mkdirSync } from "node:fs";
import path from "node:path";

import { buildApp } from "./app.js";
import { resolveConfig } from "./config.js";

async function main() {
  const trace =
    process.env.BAMBUVIEW_BOOT_TRACE === "1"
      ? (label: string) => console.log(`[bambuview-api] ${label}`)
      : () => {};

  trace("main:start");
  const config = resolveConfig();
  trace("main:config-resolved");
  mkdirSync(path.dirname(config.databaseFile), { recursive: true });
  trace("main:database-dir-ready");

  const app = await buildApp(config);
  trace("main:app-built");
  await app.listen({
    host: config.host,
    port: config.port,
  });
  trace(`main:listening ${config.host}:${config.port}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
