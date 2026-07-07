import { spawn } from "node:child_process";
import net from "node:net";
import { URL } from "node:url";
import type { Readable } from "node:stream";

import type {
  CompanionPrinterInput,
  CompanionStreamInput,
} from "@bambuview/contracts";
import { BAMBU_PRINTER_MODELS } from "@bambuview/contracts";
import ffmpegPath from "ffmpeg-static";

const CAMERA_CONNECT_TIMEOUT_MS = 3500;
const CAMERA_PROCESS_TIMEOUT_MS = 12000;
const NATIVE_BAMBU_RTSP_FAMILIES = new Set(["H2", "P2", "X1", "X2"]);

export interface CameraBridgeSource {
  displayName: string;
  sourceKind: "rtsp" | "bambu-native";
  targetUrl: string;
}

export interface NativeBambuBridgeSupport {
  detail: string;
  family: string | null;
  supported: boolean;
}

function modelFamily(model: string): string | null {
  const normalized = model.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const known = BAMBU_PRINTER_MODELS.find(
    (entry) => entry.value.trim().toLowerCase() === normalized,
  );
  if (known) {
    return known.family;
  }

  const match = normalized.match(/^(h2|p2|x2|x1|p1|a2|a1)/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function normalizeRtspUrl(
  value: string,
  credentials?: { password?: string; username?: string },
): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    try {
      url = new URL(`rtsp://${trimmed}`);
    } catch {
      return null;
    }
  }

  if (url.protocol !== "rtsp:" && url.protocol !== "rtsps:") {
    return null;
  }

  if (!url.username && credentials?.username) {
    url.username = credentials.username;
  }
  if (!url.password && credentials?.password) {
    url.password = credentials.password;
  }

  return url.toString();
}

function buildNativeBambuRtspUrl(
  printer: Pick<CompanionPrinterInput, "accessCode" | "hostname">,
): string | null {
  const host = printer.hostname.trim();
  const accessCode = printer.accessCode?.trim() ?? "";
  if (!host || !accessCode) {
    return null;
  }

  const url = new URL(`rtsps://${host}:322/streaming/live/1`);
  url.username = "bblp";
  url.password = accessCode;
  return url.toString();
}

function readBridgePort(url: string): { host: string; port: number } | null {
  try {
    const parsed = new URL(url);
    const port =
      parsed.port.length > 0
        ? Number(parsed.port)
        : parsed.protocol === "rtsps:"
          ? 322
          : 554;
    if (!parsed.hostname || !Number.isFinite(port)) {
      return null;
    }

    return {
      host: parsed.hostname,
      port,
    };
  } catch {
    return null;
  }
}

function ffmpegBinaryPath(): string | null {
  return typeof ffmpegPath === "string" && ffmpegPath.trim().length > 0
    ? ffmpegPath
    : null;
}

function ffmpegInputArgs(source: CameraBridgeSource): string[] {
  return [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-rtsp_transport",
    "tcp",
    "-rw_timeout",
    "8000000",
    "-i",
    source.targetUrl,
  ];
}

function collectProcessOutput(
  child: ReturnType<typeof spawn>,
  timeoutMs: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      callback();
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => {
        reject(
          new Error("The camera bridge timed out before returning media."),
        );
      });
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr?.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.once("error", (error) => {
      finish(() => reject(error));
    });
    child.once("close", (code) => {
      finish(() => {
        if (code === 0 && stdoutChunks.length > 0) {
          resolve(Buffer.concat(stdoutChunks));
          return;
        }

        const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
        reject(
          new Error(
            stderr ||
              `The camera bridge exited with code ${code ?? "unknown"}.`,
          ),
        );
      });
    });
  });
}

export function cameraBridgeReady(): boolean {
  return Boolean(ffmpegBinaryPath());
}

export function nativeBambuBridgeSupport(
  model: string,
): NativeBambuBridgeSupport {
  const family = modelFamily(model);
  if (!family) {
    return {
      detail:
        "BambuView could not match this printer model to a known native camera family yet.",
      family: null,
      supported: false,
    };
  }

  if (!NATIVE_BAMBU_RTSP_FAMILIES.has(family)) {
    return {
      detail: `${family} family printers still need a separate browser-safe bridge feed for camera playback in this revision.`,
      family,
      supported: false,
    };
  }

  return {
    detail: `${family} family printers can use the native Companion camera bridge when the host and access code are saved.`,
    family,
    supported: true,
  };
}

export function resolvePrinterCameraBridgeSource(
  printer: CompanionPrinterInput,
): CameraBridgeSource | null {
  if (!cameraBridgeReady()) {
    return null;
  }

  if (!nativeBambuBridgeSupport(printer.model).supported) {
    return null;
  }

  const targetUrl = buildNativeBambuRtspUrl(printer);
  if (!targetUrl) {
    return null;
  }

  return {
    displayName: printer.name.trim() || printer.model.trim() || "Bambu camera",
    sourceKind: "bambu-native",
    targetUrl,
  };
}

export function resolveStreamCameraBridgeSource(
  input: Pick<
    CompanionStreamInput,
    "name" | "password" | "sourceKind" | "upstreamUrl" | "username"
  >,
): CameraBridgeSource | null {
  if (!cameraBridgeReady()) {
    return null;
  }

  if (input.sourceKind === "rtsp") {
    const targetUrl = normalizeRtspUrl(input.upstreamUrl, {
      password: input.password,
      username: input.username,
    });
    if (!targetUrl) {
      return null;
    }

    return {
      displayName: input.name.trim() || "RTSP camera",
      sourceKind: "rtsp",
      targetUrl,
    };
  }

  if (input.sourceKind === "bambu-native") {
    const targetUrl =
      normalizeRtspUrl(input.upstreamUrl, {
        password: input.password,
        username: input.username,
      }) ??
      buildNativeBambuRtspUrl({
        accessCode: input.password,
        hostname: input.upstreamUrl,
      });
    if (!targetUrl) {
      return null;
    }

    return {
      displayName: input.name.trim() || "Native Bambu camera",
      sourceKind: "bambu-native",
      targetUrl,
    };
  }

  return null;
}

export async function probeCameraBridgeSource(
  source: CameraBridgeSource,
): Promise<boolean> {
  const target = readBridgePort(source.targetUrl);
  if (!target) {
    return false;
  }

  return new Promise((resolve) => {
    const socket = net.createConnection(target);
    const finish = (reachable: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(reachable);
    };

    socket.setTimeout(CAMERA_CONNECT_TIMEOUT_MS);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

export async function renderCameraBridgeSnapshot(
  source: CameraBridgeSource,
): Promise<Buffer> {
  const binary = ffmpegBinaryPath();
  if (!binary) {
    throw new Error(
      "The bundled camera bridge binary is not available on this machine.",
    );
  }

  const child = spawn(
    binary,
    [
      ...ffmpegInputArgs(source),
      "-frames:v",
      "1",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "pipe:1",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  return collectProcessOutput(child, CAMERA_PROCESS_TIMEOUT_MS);
}

export function openCameraBridgeMjpegStream(source: CameraBridgeSource): {
  cleanup: () => void;
  contentType: string;
  stream: Readable;
} {
  const binary = ffmpegBinaryPath();
  if (!binary) {
    throw new Error(
      "The bundled camera bridge binary is not available on this machine.",
    );
  }

  const child = spawn(
    binary,
    [
      ...ffmpegInputArgs(source),
      "-an",
      "-c:v",
      "mjpeg",
      "-q:v",
      "5",
      "-f",
      "mpjpeg",
      "pipe:1",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stderr?.resume();

  const cleanup = () => {
    if (!child.killed) {
      child.kill("SIGKILL");
    }
  };

  child.once("error", () => {
    cleanup();
  });

  return {
    cleanup,
    contentType: "multipart/x-mixed-replace; boundary=ffmpeg",
    stream: child.stdout as Readable,
  };
}
