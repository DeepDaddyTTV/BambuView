import { Readable } from "node:stream";

import Fastify from "fastify";
import { z } from "zod";

import type {
  CompanionPrinterInput,
  CompanionStreamInput,
} from "@bambuview/contracts";

import { CompanionRuntime } from "./runtime.js";

function parseAuthorization(header: string | undefined): {
  password: string | null;
  token: string | null;
} {
  if (!header) {
    return { password: null, token: null };
  }
  if (header.startsWith("Bearer ")) {
    return { password: null, token: header.slice(7).trim() };
  }
  if (!header.startsWith("Basic ")) {
    return { password: null, token: null };
  }

  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const [, password = ""] = decoded.split(":", 2);
    return { password, token: null };
  } catch {
    return { password: null, token: null };
  }
}

function printerSchema() {
  return z.object({
    accessCode: z.string().trim().max(128).optional(),
    connectionMode: z.enum(["cloud", "bambu-connect", "lan", "developer"]),
    hostname: z.string().trim().min(1).max(255),
    model: z.string().trim().min(2).max(120),
    name: z.string().trim().min(2).max(120),
    notes: z.string().trim().max(512).optional(),
    provider: z.enum(["bambu-lab"]).default("bambu-lab"),
    serial: z.string().trim().min(4).max(80),
    streamId: z.string().trim().max(120).nullable().optional(),
  }) satisfies z.ZodType<CompanionPrinterInput>;
}

function streamSchema() {
  return z.object({
    linkedPrinterId: z.string().trim().max(120).nullable().optional(),
    name: z.string().trim().min(2).max(120),
    password: z.string().trim().max(512).optional(),
    sourceKind: z.enum(["mjpeg", "snapshot", "hls", "rtsp", "bambu-native"]),
    upstreamUrl: z.string().trim().min(1).max(2048),
    username: z.string().trim().max(120).optional(),
  }) satisfies z.ZodType<CompanionStreamInput>;
}

export async function createBridgeServer(runtime: CompanionRuntime) {
  const app = Fastify({
    logger: false,
  });

  app.addHook("onRequest", async (request, reply) => {
    const bridgeAuth = runtime.getBridgeAuth();
    const authorization = parseAuthorization(
      request.headers.authorization as string | undefined,
    );
    const headerToken = request.headers["x-companion-token"];
    const tokenCandidate =
      typeof headerToken === "string"
        ? headerToken
        : (authorization.password ?? authorization.token);
    if (!tokenCandidate || tokenCandidate !== bridgeAuth.token) {
      return reply
        .code(401)
        .send({ message: "Companion auth token required." });
    }
  });

  app.get("/health", async () => runtime.getHealth());
  app.get("/capabilities", async () => runtime.getCapabilitySummary());
  app.get("/printers/discover", async () => runtime.getDiscoveryResult());
  app.get("/printers", async () => ({
    printers: runtime.getSnapshot().printers,
  }));
  app.post("/printers", async (request, reply) => {
    const input = printerSchema().parse(request.body);
    const snapshot = await runtime.createPrinter(input);
    return reply.code(201).send({ printer: snapshot.printers.at(-1) });
  });
  app.get("/printers/:id", async (request, reply) => {
    const params = z
      .object({ id: z.string().trim().min(1) })
      .parse(request.params);
    const printer = runtime
      .getSnapshot()
      .printers.find((item) => item.id === params.id);
    if (!printer) {
      return reply.code(404).send({ message: "Printer not found." });
    }
    return { printer };
  });
  app.patch("/printers/:id", async (request, reply) => {
    const params = z
      .object({ id: z.string().trim().min(1) })
      .parse(request.params);
    const input = printerSchema().parse(request.body);
    const snapshot = await runtime.updatePrinter(params.id, input);
    const printer = snapshot.printers.find((item) => item.id === params.id);
    return reply.send({ printer });
  });
  app.delete("/printers/:id", async (request, reply) => {
    const params = z
      .object({ id: z.string().trim().min(1) })
      .parse(request.params);
    runtime.deletePrinter(params.id);
    return reply.code(204).send();
  });
  app.post("/printers/:id/test", async (request, reply) => {
    const params = z
      .object({ id: z.string().trim().min(1) })
      .parse(request.params);
    const result = await runtime.testPrinter(params.id);
    return reply.send({ test: result });
  });
  app.get("/printers/:id/telemetry", async (request, reply) => {
    const params = z
      .object({ id: z.string().trim().min(1) })
      .parse(request.params);
    const telemetry = await runtime.readTelemetry(params.id);
    return reply.send({ telemetry });
  });
  app.get("/printers/:id/camera/snapshot", async (request, reply) => {
    const params = z
      .object({ id: z.string().trim().min(1) })
      .parse(request.params);
    const printer = runtime
      .getSnapshot()
      .printers.find((item) => item.id === params.id);
    if (!printer?.streamId) {
      return reply
        .code(409)
        .send({ message: "No stream is linked to this printer." });
    }
    return proxyStream(runtime, printer.streamId, "snapshot", reply);
  });
  app.get("/printers/:id/camera/mjpeg", async (request, reply) => {
    const params = z
      .object({ id: z.string().trim().min(1) })
      .parse(request.params);
    const printer = runtime
      .getSnapshot()
      .printers.find((item) => item.id === params.id);
    if (!printer?.streamId) {
      return reply
        .code(409)
        .send({ message: "No stream is linked to this printer." });
    }
    return proxyStream(runtime, printer.streamId, "mjpeg", reply);
  });
  app.post("/printers/:id/command", async (request, reply) => {
    const params = z
      .object({ id: z.string().trim().min(1) })
      .parse(request.params);
    const body = z.object({ action: z.string() }).parse(request.body);
    const printer = runtime
      .getSnapshot()
      .printers.find((item) => item.id === params.id);
    if (!printer) {
      return reply.code(404).send({ message: "Printer not found." });
    }
    return reply.code(409).send({
      command: {
        accepted: false,
        detail:
          body.action && printer.connectionMode !== "developer"
            ? "Direct commands stay disabled until the printer is switched to LAN-only Developer Mode."
            : "The command boundary exists, but direct machine commands are not enabled in this alpha.",
      },
    });
  });
  app.post("/printers/:id/files", async (request, reply) => {
    const params = z
      .object({ id: z.string().trim().min(1) })
      .parse(request.params);
    const input = z
      .object({
        action: z.enum(["open", "reveal", "stage"]).optional(),
        path: z.string().trim().min(1).max(4096),
      })
      .parse(request.body);
    const handoff = await runtime.handleFileHandoff(params.id, input);
    return reply.send({ handoff });
  });

  app.get("/streams", async () => ({ streams: runtime.getSnapshot().streams }));
  app.post("/streams", async (request, reply) => {
    const input = streamSchema().parse(request.body);
    const snapshot = await runtime.createStream(input);
    return reply.code(201).send({ stream: snapshot.streams.at(-1) });
  });
  app.get("/streams/:id", async (request, reply) => {
    const params = z
      .object({ id: z.string().trim().min(1) })
      .parse(request.params);
    const stream = runtime
      .getSnapshot()
      .streams.find((item) => item.id === params.id);
    if (!stream) {
      return reply.code(404).send({ message: "Stream not found." });
    }
    return { stream };
  });
  app.patch("/streams/:id", async (request, reply) => {
    const params = z
      .object({ id: z.string().trim().min(1) })
      .parse(request.params);
    const input = streamSchema().parse(request.body);
    const snapshot = await runtime.updateStream(params.id, input);
    const stream = snapshot.streams.find((item) => item.id === params.id);
    return reply.send({ stream });
  });
  app.delete("/streams/:id", async (request, reply) => {
    const params = z
      .object({ id: z.string().trim().min(1) })
      .parse(request.params);
    runtime.deleteStream(params.id);
    return reply.code(204).send();
  });
  app.get("/streams/:id/mjpeg", async (request, reply) => {
    const params = z
      .object({ id: z.string().trim().min(1) })
      .parse(request.params);
    return proxyStream(runtime, params.id, "mjpeg", reply);
  });
  app.get("/streams/:id/snapshot", async (request, reply) => {
    const params = z
      .object({ id: z.string().trim().min(1) })
      .parse(request.params);
    return proxyStream(runtime, params.id, "snapshot", reply);
  });
  app.get("/logs", async () => ({ logs: runtime.getSnapshot().logs }));

  return app;
}

async function proxyStream(
  runtime: CompanionRuntime,
  streamId: string,
  mode: "mjpeg" | "snapshot",
  reply: {
    code(statusCode: number): typeof reply;
    send(payload: unknown): unknown;
    header(key: string, value: string): void;
    type(value: string): void;
  },
) {
  const target = runtime.getStreamProxyTarget(streamId, mode);
  if (!target) {
    return reply.code(409).send({
      message:
        mode === "mjpeg"
          ? "This stream does not expose an MJPEG output yet."
          : "This stream does not expose a snapshot output yet.",
    });
  }

  try {
    const upstream = await fetch(target.target, {
      headers: target.headers,
    });
    if (!upstream.ok || !upstream.body) {
      return reply.code(upstream.status || 502).send({
        message: `The upstream stream returned HTTP ${upstream.status}.`,
      });
    }

    reply.header("cache-control", "no-store");
    reply.type(
      upstream.headers.get("content-type") ??
        (mode === "snapshot" ? "image/jpeg" : "multipart/x-mixed-replace"),
    );
    return reply.send(
      Readable.from(upstream.body as AsyncIterable<Uint8Array>),
    );
  } catch {
    return reply.code(502).send({
      message: "Companion could not reach the configured upstream stream.",
    });
  }
}
