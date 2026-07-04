import fs from "node:fs";

import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";

import { type AppConfig, resolveConfig } from "./config.js";
import { closeDatabase, createDatabase } from "./db.js";
import { createProviders } from "./providers.js";
import { registerRoutes } from "./routes.js";

function createBootTrace() {
  if (process.env.BAMBUVIEW_BOOT_TRACE !== "1") {
    return () => {};
  }

  const startedAt = performance.now();

  return (label: string) => {
    const elapsedMs = Math.round(performance.now() - startedAt);
    console.log(`[bambuview-api] +${elapsedMs}ms ${label}`);
  };
}

export async function buildApp(overrides: Partial<AppConfig> = {}) {
  const trace = createBootTrace();
  trace("buildApp:start");
  const config = resolveConfig(overrides);
  trace("config:resolved");
  const app = Fastify({
    logger: false,
  });
  trace("fastify:created");

  const database = createDatabase(config.databaseFile);
  trace("database:ready");
  const providers = createProviders(database.db);
  trace("providers:ready");

  await app.register(cookie);
  trace("cookie:registered");
  await registerRoutes(app, {
    cameraProvider: providers.cameraProvider,
    config,
    db: database.db,
    printerProvider: providers.printerProvider,
    sliceProvider: providers.sliceProvider,
  });
  trace("routes:registered");

  const hasWebAssets = fs.existsSync(config.webDistPath);
  if (hasWebAssets) {
    await app.register(fastifyStatic, {
      root: config.webDistPath,
      prefix: "/",
    });
    trace("static:registered");
  } else {
    trace("static:skipped");
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (
      hasWebAssets &&
      request.method === "GET" &&
      !request.url.startsWith("/api/") &&
      !request.url.includes(".")
    ) {
      return reply
        .type("text/html")
        .send(fs.readFileSync(`${config.webDistPath}/index.html`, "utf8"));
    }

    return reply.code(404).send({ message: "Not found." });
  });

  app.addHook("onClose", async () => {
    closeDatabase(database);
  });
  trace("buildApp:complete");

  return app;
}
