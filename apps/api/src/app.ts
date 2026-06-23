import fs from "node:fs";

import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";

import { type AppConfig, resolveConfig } from "./config.js";
import { closeDatabase, createDatabase } from "./db.js";
import { createProviders } from "./providers.js";
import { registerRoutes } from "./routes.js";

export async function buildApp(overrides: Partial<AppConfig> = {}) {
  const config = resolveConfig(overrides);
  const app = Fastify({
    logger: false
  });

  const database = createDatabase(config.databaseFile);
  const providers = createProviders();

  await app.register(cookie);
  await registerRoutes(app, {
    cameraProvider: providers.cameraProvider,
    config,
    db: database.db,
    printerProvider: providers.printerProvider,
    sliceProvider: providers.sliceProvider
  });

  const hasWebAssets = fs.existsSync(config.webDistPath);
  if (hasWebAssets) {
    await app.register(fastifyStatic, {
      root: config.webDistPath,
      prefix: "/"
    });
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (
      hasWebAssets &&
      request.method === "GET" &&
      !request.url.startsWith("/api/") &&
      !request.url.includes(".")
    ) {
      return reply.type("text/html").send(fs.readFileSync(`${config.webDistPath}/index.html`, "utf8"));
    }

    return reply.code(404).send({ message: "Not found." });
  });

  app.addHook("onClose", async () => {
    closeDatabase(database);
  });

  return app;
}
