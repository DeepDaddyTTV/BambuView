import type {
  CompanionCapabilityFlags,
  CompanionCapabilityNotes,
  CompanionConnectionSnapshot,
  CompanionHealthResponse,
  CompanionPrinter,
  CompanionPrinterTelemetry,
  CompanionStream,
} from "@bambuview/contracts";

import type { CompanionSecretRecord } from "./db.js";

function basicAuth(username: string, token: string): string {
  return `Basic ${Buffer.from(`${username}:${token}`).toString("base64")}`;
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => null)) as
    | { message?: string }
    | T
    | null;

  if (!response.ok || !data) {
    throw new Error(
      (data && typeof data === "object" && "message" in data && data.message) ||
        `Companion returned HTTP ${response.status}.`,
    );
  }

  return data as T;
}

export async function fetchCompanionSnapshot(
  companion: Pick<
    CompanionSecretRecord,
    "baseUrl" | "bridgeToken" | "bridgeUsername"
  >,
): Promise<{
  capabilities: CompanionCapabilityFlags;
  capabilityNotes: CompanionCapabilityNotes;
  health: CompanionHealthResponse;
  printers: CompanionPrinter[];
  streams: CompanionStream[];
}> {
  const headers = {
    authorization: basicAuth(companion.bridgeUsername, companion.bridgeToken),
  };

  const [health, capabilities, printers, streams] = await Promise.all([
    fetchJson<CompanionHealthResponse>(`${companion.baseUrl}/health`, {
      headers,
    }),
    fetchJson<{
      capabilities: CompanionCapabilityFlags;
      capabilityNotes: CompanionCapabilityNotes;
    }>(`${companion.baseUrl}/capabilities`, { headers }),
    fetchJson<{ printers: CompanionPrinter[] }>(
      `${companion.baseUrl}/printers`,
      {
        headers,
      },
    ),
    fetchJson<{ streams: CompanionStream[] }>(`${companion.baseUrl}/streams`, {
      headers,
    }),
  ]);

  return {
    capabilities: capabilities.capabilities,
    capabilityNotes: capabilities.capabilityNotes,
    health,
    printers: printers.printers,
    streams: streams.streams,
  };
}

export async function testCompanionConnection(
  companion: CompanionSecretRecord,
): Promise<CompanionConnectionSnapshot> {
  const snapshot = await fetchCompanionSnapshot(companion);
  return {
    companion: {
      baseUrl: companion.baseUrl,
      bridgeUsername: companion.bridgeUsername,
      capabilities: snapshot.capabilities,
      capabilityNotes: snapshot.capabilityNotes,
      createdAt: companion.createdAt,
      id: companion.id,
      lastError: null,
      lastHealthAt:
        snapshot.health.pairing.pairedAt ?? new Date().toISOString(),
      name: companion.name,
      pairedAt: companion.pairedAt,
      printerCount: snapshot.printers.length,
      status: snapshot.streams.some((stream) => stream.status === "online")
        ? "online"
        : "degraded",
      streamCount: snapshot.streams.length,
      tokenSet: true,
      updatedAt: new Date().toISOString(),
    },
    health: snapshot.health,
    printers: snapshot.printers,
    streams: snapshot.streams,
  };
}

export async function fetchCompanionPrinterTelemetry(
  companion: Pick<
    CompanionSecretRecord,
    "baseUrl" | "bridgeToken" | "bridgeUsername"
  >,
  printerId: string,
): Promise<CompanionPrinterTelemetry> {
  const headers = {
    authorization: basicAuth(companion.bridgeUsername, companion.bridgeToken),
  };
  const response = await fetchJson<{ telemetry: CompanionPrinterTelemetry }>(
    `${companion.baseUrl}/printers/${encodeURIComponent(printerId)}/telemetry`,
    {
      headers,
    },
  );

  return response.telemetry;
}
