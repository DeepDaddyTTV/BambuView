import net from "node:net";

import type {
  CameraProviderType,
  CameraSourceInput,
  CameraStreamKind,
  CameraTestResult,
} from "@bambuview/contracts";

import type { CameraSourceSecretRecord } from "./db.js";

const CAMERA_TEST_TIMEOUT_MS = 3500;
const BAMBU_CAMERA_PORT = 322;

export interface NormalizedCameraSourceInput {
  details: string;
  frigateBaseUrl: string | null;
  frigateCamera: string | null;
  password: string;
  provider: CameraProviderType;
  streamKind: CameraStreamKind;
  streamUrl: string;
  username: string;
}

function checkedAt(): string {
  return new Date().toISOString();
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function basicAuth(username: string, password: string): string | null {
  if (!username && !password) {
    return null;
  }

  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function fetchWithTimeout(
  url: string,
  input: { password?: string; username?: string } = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CAMERA_TEST_TIMEOUT_MS);
  const headers = new Headers();
  const authorization = basicAuth(input.username ?? "", input.password ?? "");
  if (authorization) {
    headers.set("authorization", authorization);
  }

  try {
    return await fetch(url, {
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function tcpProbe(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (reachable: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(reachable);
    };

    socket.setTimeout(CAMERA_TEST_TIMEOUT_MS);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function tcpTargetFromUrl(
  value: string,
  defaultPort = 554,
): { host: string; port: number } | null {
  try {
    const url = new URL(value);
    return {
      host: url.hostname,
      port: Number(url.port || defaultPort),
    };
  } catch {
    return null;
  }
}

export function frigateSnapshotUrl(baseUrl: string, camera: string): string {
  return `${stripTrailingSlash(baseUrl)}/api/${encodeURIComponent(camera)}/latest.jpg`;
}

export function frigateStreamUrl(baseUrl: string, camera: string): string {
  return `${stripTrailingSlash(baseUrl)}/api/${encodeURIComponent(camera)}`;
}

export function parseFrigateRestreamUrl(
  value: string,
): { baseUrl: string; camera: string } | null {
  try {
    const url = new URL(value);
    if (url.hash) {
      return null;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    const apiIndex = parts.findIndex((part) => part === "api");
    const encodedCamera = parts[apiIndex + 1];
    if (apiIndex < 0 || !encodedCamera) {
      return null;
    }

    const basePath = parts.slice(0, apiIndex).join("/");
    return {
      baseUrl: stripTrailingSlash(
        `${url.origin}${basePath ? `/${basePath}` : ""}`,
      ),
      camera: decodeURIComponent(encodedCamera),
    };
  } catch {
    return null;
  }
}

export function isFrigateRestreamUrl(value: string): boolean {
  return parseFrigateRestreamUrl(value) !== null;
}

export function inferCameraStreamKind(
  provider: CameraProviderType,
  streamUrl: string,
): CameraStreamKind {
  if (provider === "frigate") {
    return isFrigateRestreamUrl(streamUrl) ? "mjpeg" : "unknown";
  }

  if (provider === "direct-mjpeg") {
    return "mjpeg";
  }

  if (provider === "direct-rtsp") {
    return "rtsp";
  }

  if (provider === "bambu") {
    return "bambu-native";
  }

  const normalized = streamUrl.toLowerCase();
  if (normalized.endsWith(".m3u8")) {
    return "hls";
  }

  if (normalized.includes("mjpeg") || normalized.includes("mjpg")) {
    return "mjpeg";
  }

  if (normalized.startsWith("rtsp://") || normalized.startsWith("rtsps://")) {
    return "rtsp";
  }

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return "snapshot";
  }

  return "unknown";
}

export function normalizeCameraSourceInput(
  input: CameraSourceInput,
): NormalizedCameraSourceInput {
  const provider = input.provider;
  const explicitStreamUrl = input.streamUrl?.trim() ?? "";
  const parsedFrigateUrl =
    provider === "frigate" && explicitStreamUrl
      ? parseFrigateRestreamUrl(explicitStreamUrl)
      : null;
  const frigateBaseUrl =
    input.frigateBaseUrl?.trim() || parsedFrigateUrl?.baseUrl || null;
  const frigateCamera =
    input.frigateCamera?.trim() || parsedFrigateUrl?.camera || null;
  const rawStreamUrl =
    provider === "frigate" && explicitStreamUrl
      ? explicitStreamUrl
      : provider === "frigate" && frigateBaseUrl && frigateCamera
        ? frigateStreamUrl(frigateBaseUrl, frigateCamera)
        : explicitStreamUrl;
  const streamKind = inferCameraStreamKind(provider, rawStreamUrl);
  const frigateIsRestream =
    provider !== "frigate" || isFrigateRestreamUrl(rawStreamUrl);

  return {
    details:
      provider === "frigate"
        ? frigateIsRestream
          ? "Frigate restream URL saved. BambuView proxies the MJPEG feed for browser playback and assignment."
          : "This is not a Frigate restream URL. Use a Frigate/go2rtc restream endpoint such as http://frigate:5000/api/workbench_left, not the Frigate web UI or a shared dashboard page."
        : provider === "bambu-connect"
          ? "BambuConnect Direct source saved. This must be a browser-compatible stream or bridge URL; the desktop plugin itself is not exposed directly to the web container."
          : provider === "network-plugin"
            ? "Bambu Network Plugin bridge saved. Use a local bridge endpoint that exposes MJPEG, HLS, or snapshot output to BambuView."
            : provider === "bambuview-companion"
              ? "BambuView Companion endpoint saved. Companion should expose a browser-compatible local stream back to BambuView."
              : streamKind === "rtsp"
                ? "RTSP source saved. Add it through Frigate/go2rtc or another HTTP restreamer to embed it in the browser."
                : streamKind === "bambu-native"
                  ? "Native Bambu source saved. BambuView can detect it, but browser playback needs a compatible restream."
                  : "Camera source is browser-renderable through BambuView's proxy.",
    frigateBaseUrl,
    frigateCamera,
    password: input.password?.trim() ?? "",
    provider,
    streamKind,
    streamUrl: rawStreamUrl,
    username: input.username?.trim() ?? "",
  };
}

function contentTypeIsRenderable(
  kind: CameraStreamKind,
  contentType: string | null,
): boolean {
  const normalized = contentType?.toLowerCase() ?? "";
  if (kind === "mjpeg") {
    return (
      normalized.includes("multipart") ||
      normalized.includes("image/") ||
      normalized.includes("octet-stream")
    );
  }

  if (kind === "snapshot") {
    return normalized.includes("image/");
  }

  if (kind === "hls") {
    return (
      normalized.includes("mpegurl") ||
      normalized.includes("application/vnd.apple") ||
      normalized.includes("text/plain")
    );
  }

  if (kind === "unknown") {
    return (
      normalized.includes("multipart") ||
      normalized.includes("image/") ||
      normalized.includes("video/") ||
      normalized.includes("mpegurl")
    );
  }

  return false;
}

function httpCameraResult(
  response: Response,
  kind: CameraStreamKind,
  okDetail: string,
): CameraTestResult {
  const now = checkedAt();
  const contentType = response.headers.get("content-type");
  const renderable = response.ok && contentTypeIsRenderable(kind, contentType);

  if (renderable) {
    return {
      checkedAt: now,
      detail: okDetail,
      kind,
      reachable: true,
      status: "online",
    };
  }

  return {
    checkedAt: now,
    detail: response.ok
      ? `The endpoint responded, but its content type (${contentType ?? "unknown"}) does not look browser-renderable. Use an MJPEG, HLS, JPEG snapshot, or Frigate/go2rtc restream URL.`
      : `The camera endpoint responded with HTTP ${response.status}.`,
    kind,
    reachable: response.ok,
    status: response.ok ? "degraded" : "offline",
  };
}

export async function testCameraSource(
  input: CameraSourceInput,
): Promise<CameraTestResult> {
  const normalized = normalizeCameraSourceInput(input);
  const now = checkedAt();

  if (normalized.provider === "frigate") {
    if (!normalized.streamUrl) {
      return {
        checkedAt: now,
        detail:
          "Frigate sources require a restream URL, for example http://frigate:5000/api/workbench_left.",
        kind: "mjpeg",
        reachable: false,
        status: "offline",
      };
    }

    if (!isFrigateRestreamUrl(normalized.streamUrl)) {
      return {
        checkedAt: now,
        detail:
          "This does not look like a Frigate restream URL. Use the camera restream endpoint, for example http://frigate:5000/api/workbench_left, instead of the Frigate UI, a dashboard share link, or a URL with a # fragment.",
        kind: "unknown",
        reachable: false,
        status: "degraded",
      };
    }

    try {
      const response =
        normalized.frigateBaseUrl && normalized.frigateCamera
          ? await fetchWithTimeout(
              frigateSnapshotUrl(
                normalized.frigateBaseUrl,
                normalized.frigateCamera,
              ),
              normalized,
            )
          : await fetchWithTimeout(normalized.streamUrl, normalized);

      return httpCameraResult(
        response,
        "mjpeg",
        "Frigate returned a browser-renderable camera response for this restream URL.",
      );
    } catch {
      return {
        checkedAt: now,
        detail: "BambuView could not reach the Frigate restream endpoint.",
        kind: "mjpeg",
        reachable: false,
        status: "offline",
      };
    }
  }

  if (normalized.streamKind === "rtsp") {
    const target = tcpTargetFromUrl(normalized.streamUrl);
    const reachable = target ? await tcpProbe(target.host, target.port) : false;

    return {
      checkedAt: now,
      detail: reachable
        ? "The RTSP endpoint accepted a TCP connection. Browser playback still needs a restreamer."
        : "BambuView could not reach the RTSP endpoint.",
      kind: "rtsp",
      reachable,
      status: reachable ? "degraded" : "offline",
    };
  }

  if (normalized.streamKind === "bambu-native") {
    const target = tcpTargetFromUrl(normalized.streamUrl, BAMBU_CAMERA_PORT);
    const reachable = target ? await tcpProbe(target.host, target.port) : false;

    return {
      checkedAt: now,
      detail: reachable
        ? "The native Bambu camera port is reachable. Embed it by assigning a browser-compatible restream."
        : "BambuView could not reach the native Bambu camera port.",
      kind: "bambu-native",
      reachable,
      status: reachable ? "degraded" : "offline",
    };
  }

  try {
    const response = await fetchWithTimeout(normalized.streamUrl, normalized);

    return httpCameraResult(
      response,
      normalized.streamKind,
      "The camera endpoint responded with browser-renderable media.",
    );
  } catch {
    return {
      checkedAt: now,
      detail: "BambuView could not reach the HTTP camera endpoint.",
      kind: normalized.streamKind,
      reachable: false,
      status: "offline",
    };
  }
}

export function cameraProxyTarget(
  source: CameraSourceSecretRecord,
  mode: "snapshot" | "stream",
): string | null {
  if (source.provider === "frigate") {
    if (!parseFrigateRestreamUrl(source.rawStreamUrl)) {
      return null;
    }

    if (mode === "stream") {
      return source.rawStreamUrl || null;
    }

    if (!source.frigateBaseUrl || !source.frigateCamera) {
      return null;
    }

    return frigateSnapshotUrl(source.frigateBaseUrl, source.frigateCamera);
  }

  if (
    source.streamKind === "mjpeg" ||
    source.streamKind === "snapshot" ||
    source.streamKind === "hls"
  ) {
    return source.rawStreamUrl;
  }

  return null;
}

export function cameraRequestHeaders(
  source: CameraSourceSecretRecord,
): Headers {
  const headers = new Headers();
  const authorization = basicAuth(source.username, source.password);
  if (authorization) {
    headers.set("authorization", authorization);
  }

  return headers;
}
