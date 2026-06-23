import { mkdirSync } from "node:fs";
import path from "node:path";

import { buildApp } from "./app.js";
import { resolveConfig } from "./config.js";

async function main() {
  const config = resolveConfig();
  mkdirSync(path.dirname(config.databaseFile), { recursive: true });

  const app = await buildApp(config);
  await app.listen({
    host: config.host,
    port: config.port
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
