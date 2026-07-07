import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import dgram from "node:dgram";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";

import { Client as FtpClient } from "basic-ftp";

import type {
  CompanionFileHandoffInput,
  CompanionFileHandoffResult,
  CompanionPrinterInput,
  CompanionPrinterCommandRequest,
  CompanionPrinterCommandResponse,
  CompanionPrinterDiscoveryResult,
  CompanionPrinterTelemetry,
  CompanionPrinterTestResult,
} from "@bambuview/contracts";

import {
  nativeBambuBridgeSupport,
  resolvePrinterCameraBridgeSource,
} from "./camera-bridge.js";

type MqttBuffer = Buffer<ArrayBufferLike>;

const BAMBU_CAMERA_PORT = 322;
const BAMBU_LAN_CONTROL_PORT = 8883;
const BAMBU_SSDP_PORT = 2021;
const BAMBU_MULTICAST_GROUP = "239.255.255.250";
const BAMBU_FTPS_PORT = 990;
const CONNECTION_TIMEOUT_MS = 3000;
const MQTT_COMMAND_TIMEOUT_MS = 4000;
const MQTT_REPORT_TIMEOUT_MS = 4500;
const SSDP_DISCOVERY_TIMEOUT_MS = 5500;

type RawTelemetry = {
  bedTemperature: number | null;
  bedTargetTemperature: number | null;
  chamberTemperature: number | null;
  chamberTargetTemperature: number | null;
  elapsedMinutes: number | null;
  fileName: string;
  firmwareVersion: string | null;
  layerCurrent: number | null;
  layerTotal: number | null;
  nozzleTemperature: number | null;
  nozzleTargetTemperature: number | null;
  printStatus: CompanionPrinterTelemetry["printStatus"];
  progress: number;
  remainingMinutes: number | null;
  slots: CompanionPrinterTelemetry["slots"];
  statusLabel: string;
};

function elapsed(startedAt: number): number {
  return Math.max(1, Math.round(performance.now() - startedAt));
}

function lowerCaseHeaders(value: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const lines = value.split(/\r?\n/).slice(1);

  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator < 0) {
      continue;
    }

    const key = line.slice(0, separator).trim().toLowerCase();
    const headerValue = line.slice(separator + 1).trim();
    if (key) {
      headers[key] = headerValue;
    }
  }

  return headers;
}

function hostFromLocation(value: string): string {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).hostname || value;
  } catch {
    return value;
  }
}

function sanitizeModel(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return "Bambu Printer";
  }

  return normalized.replace(/^3dprinter[-_\s]*/i, "").replace(/-ams\d*$/i, "");
}

function normalizeRemoteFileName(inputPath: string, fileName?: string): string {
  const preferred = (fileName?.trim() || path.basename(inputPath)).trim();
  if (!preferred) {
    return "print.gcode.3mf";
  }

  if (/\.gcode\.3mf$/i.test(preferred)) {
    return preferred;
  }
  if (/\.3mf$/i.test(preferred)) {
    return preferred.replace(/\.3mf$/i, ".gcode.3mf");
  }

  return preferred;
}

function buildSequenceId(): string {
  return String(Date.now());
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function readFileMd5(filePath: string): string {
  const hash = createHash("md5");
  hash.update(readFileSync(filePath));
  return hash.digest("hex").toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readNested(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function normalizeStatus(
  value: string | null,
): CompanionPrinterTelemetry["printStatus"] {
  const status = value?.toUpperCase() ?? "";
  if (["RUNNING", "PRINTING", "PREPARE", "SLICING"].includes(status)) {
    return "printing";
  }
  if (["PAUSE", "PAUSED"].includes(status)) {
    return "paused";
  }
  if (["FAILED", "ERROR", "OFFLINE"].includes(status)) {
    return "offline";
  }
  return "idle";
}

function labelForStatus(
  status: CompanionPrinterTelemetry["printStatus"],
): string {
  if (status === "printing") return "Printing";
  if (status === "paused") return "Paused";
  if (status === "offline") return "Offline";
  return "Idle";
}

function normalizeColor(value: string | null): string {
  if (!value) {
    return "#b8babd";
  }
  const trimmed = value.trim();
  if (/^[0-9a-fA-F]{6,8}$/.test(trimmed)) {
    return `#${trimmed.slice(0, 6)}`;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed;
  }
  return "#b8babd";
}

function parseSlots(
  print: Record<string, unknown>,
): CompanionPrinterTelemetry["slots"] {
  const ams = asRecord(print.ams);
  const activeTray =
    readString(readNested(print, ["tray_now", "vt_tray", "ams_tray_now"])) ??
    readString(readNested(ams, ["tray_now", "ams_tray_now"]));
  const amsUnits = Array.isArray(ams.ams) ? ams.ams : [];
  const slots: CompanionPrinterTelemetry["slots"] = [];

  for (const unit of amsUnits) {
    const unitRecord = asRecord(unit);
    const trays = Array.isArray(unitRecord.tray) ? unitRecord.tray : [];
    for (const tray of trays) {
      const trayRecord = asRecord(tray);
      const id =
        readString(readNested(trayRecord, ["id", "tray_id"])) ??
        String(slots.length);

      slots.push({
        active: activeTray === id || activeTray === `A${Number(id) + 1}`,
        color: normalizeColor(
          readString(readNested(trayRecord, ["tray_color", "color"])),
        ),
        colorName:
          readString(
            readNested(trayRecord, [
              "tray_sub_brands",
              "name",
              "filament_name",
            ]),
          ) ?? "Loaded",
        material:
          readString(
            readNested(trayRecord, ["tray_type", "type", "filament_type"]),
          ) ?? "Unknown",
        slot: `A${Number(id) + 1}`,
      });
    }
  }

  if (slots.length > 0) {
    return slots.slice(0, 4);
  }

  return [
    {
      active: true,
      color: "#66d139",
      colorName: "Loaded",
      material: readString(print.filam_type) ?? "PLA",
      slot: "A1",
    },
  ];
}

function parseTelemetry(payload: unknown): RawTelemetry {
  const root = asRecord(payload);
  const print = asRecord(root.print ?? root);
  const rawStatus = readString(
    readNested(print, ["gcode_state", "print_status", "stg_cur"]),
  );
  const printStatus = normalizeStatus(rawStatus);
  const progress = Math.min(
    100,
    Math.max(0, Math.round(readNumber(print.mc_percent) ?? 0)),
  );

  return {
    bedTemperature: readNumber(readNested(print, ["bed_temper", "bed_temp"])),
    bedTargetTemperature: readNumber(
      readNested(print, ["bed_target_temper", "bed_target_temp"]),
    ),
    chamberTemperature: readNumber(
      readNested(print, ["chamber_temper", "chamber_temp"]),
    ),
    chamberTargetTemperature: readNumber(
      readNested(print, ["chamber_target_temper", "chamber_target_temp"]),
    ),
    elapsedMinutes: readNumber(
      readNested(print, ["print_time", "mc_print_time"]),
    ),
    fileName:
      readString(
        readNested(print, ["subtask_name", "gcode_file", "file", "gcode_name"]),
      ) ?? (printStatus === "idle" ? "Ready for a print job." : "Live print"),
    firmwareVersion:
      readString(root.firmware_version) ??
      readString(readNested(print, ["firmware_version", "version"])),
    layerCurrent: readNumber(readNested(print, ["layer_num", "layer"])),
    layerTotal: readNumber(
      readNested(print, ["total_layer_num", "total_layers"]),
    ),
    nozzleTemperature: readNumber(
      readNested(print, ["nozzle_temper", "nozzle_temp"]),
    ),
    nozzleTargetTemperature: readNumber(
      readNested(print, ["nozzle_target_temper", "nozzle_target_temp"]),
    ),
    printStatus,
    progress,
    remainingMinutes: readNumber(
      readNested(print, ["mc_remaining_time", "remaining_time"]),
    ),
    slots: parseSlots(print),
    statusLabel: labelForStatus(printStatus),
  };
}

function buildMqttTopic(serial: string, topic: "report" | "request"): string {
  return `device/${serial.trim().toUpperCase()}/${topic}`;
}

function encodeMqttString(value: string): Buffer {
  const body = Buffer.from(value, "utf8");
  const header = Buffer.alloc(2);
  header.writeUInt16BE(body.length, 0);
  return Buffer.concat([header, body]);
}

function encodeRemainingLength(length: number): Buffer {
  const bytes: number[] = [];
  let remaining = length;
  do {
    let encodedByte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) {
      encodedByte |= 128;
    }
    bytes.push(encodedByte);
  } while (remaining > 0);
  return Buffer.from(bytes);
}

function createMqttPacket(typeAndFlags: number, body: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([typeAndFlags]),
    encodeRemainingLength(body.length),
    body,
  ]);
}

function createConnectPacket(input: {
  clientId: string;
  password: string;
  username: string;
}): Buffer {
  const variableHeader = Buffer.concat([
    encodeMqttString("MQTT"),
    Buffer.from([4, 0xc2, 0, 30]),
  ]);
  const payload = Buffer.concat([
    encodeMqttString(input.clientId),
    encodeMqttString(input.username),
    encodeMqttString(input.password),
  ]);
  return createMqttPacket(0x10, Buffer.concat([variableHeader, payload]));
}

function createSubscribePacket(topic: string): Buffer {
  return createMqttPacket(
    0x82,
    Buffer.concat([
      Buffer.from([0, 1]),
      encodeMqttString(topic),
      Buffer.from([0]),
    ]),
  );
}

function createPublishPacket(topic: string, payload: string): Buffer {
  return createMqttPacket(
    0x30,
    Buffer.concat([encodeMqttString(topic), Buffer.from(payload, "utf8")]),
  );
}

function buildProjectFilePayload(input: {
  fileName: string;
  md5: string;
  remotePath: string;
  request: CompanionFileHandoffInput;
}) {
  const storedPath = input.remotePath.replace(/^\/+/, "");
  const isThreeMf = /\.3mf$/i.test(input.fileName);
  const plateParam = isThreeMf ? "Metadata/plate_1.gcode" : input.fileName;
  const useAms = input.request.startPrint !== false;
  const title = input.fileName.replace(/\.(gcode\.3mf|3mf|gcode)$/i, "");

  return {
    print: {
      ams_mapping: useAms ? [0] : [],
      ams_mapping2: [],
      auto_bed_leveling: false,
      bed_leveling: false,
      bed_type: "auto",
      cfg: "0",
      command: "project_file",
      extrude_cali_flag: 0,
      file: storedPath,
      flow_cali: false,
      layer_inspect: false,
      md5: input.md5,
      param: plateParam,
      profile_id: "0",
      project_id: "0",
      sequence_id: buildSequenceId(),
      subtask_id: "0",
      subtask_name: title || "BambuView Job",
      task_id: "0",
      timelapse: false,
      url: `ftp://${storedPath}`,
      use_ams: useAms,
      vibration_cali: false,
    },
  };
}

function readRemainingLength(
  buffer: MqttBuffer,
): { bytesRead: number; value: number } | null {
  let multiplier = 1;
  let value = 0;
  for (let index = 1; index < buffer.length; index += 1) {
    const encodedByte = buffer[index];
    value += (encodedByte & 127) * multiplier;
    if ((encodedByte & 128) === 0) {
      return { bytesRead: index, value };
    }
    multiplier *= 128;
  }
  return null;
}

function shiftMqttPacket(buffer: MqttBuffer): {
  flags: number;
  packet: MqttBuffer;
  remaining: MqttBuffer;
  type: number;
} | null {
  if (buffer.length < 2) {
    return null;
  }
  const remainingLength = readRemainingLength(buffer);
  if (!remainingLength) {
    return null;
  }
  const fixedHeaderLength = remainingLength.bytesRead + 1;
  const packetLength = fixedHeaderLength + remainingLength.value;
  if (buffer.length < packetLength) {
    return null;
  }
  return {
    flags: buffer[0] & 0x0f,
    packet: buffer.subarray(fixedHeaderLength, packetLength),
    remaining: buffer.subarray(packetLength),
    type: buffer[0] >> 4,
  };
}

function packetContainsTopic(
  packet: MqttBuffer,
  expectedTopic: string,
): boolean {
  if (packet.length < 2) {
    return false;
  }
  const topicLength = packet.readUInt16BE(0);
  if (packet.length < 2 + topicLength) {
    return false;
  }
  return packet.subarray(2, 2 + topicLength).toString("utf8") === expectedTopic;
}

function getPublishPayload(packet: MqttBuffer, flags: number): string | null {
  if (packet.length < 2) {
    return null;
  }
  const topicLength = packet.readUInt16BE(0);
  let payloadOffset = 2 + topicLength;
  const qos = (flags & 0x06) >> 1;
  if (qos > 0) {
    payloadOffset += 2;
  }
  if (packet.length < payloadOffset) {
    return null;
  }
  return packet.subarray(payloadOffset).toString("utf8");
}

function formatEta(minutes: number | null): string | null {
  if (minutes === null) {
    return null;
  }
  const eta = new Date(Date.now() + minutes * 60 * 1000);
  return eta.toISOString();
}

export async function probeTcp(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (reachable: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(reachable);
    };

    socket.setTimeout(CONNECTION_TIMEOUT_MS);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

export async function testBambuPrinter(
  printer: CompanionPrinterInput,
): Promise<CompanionPrinterTestResult> {
  const checkedAt = new Date().toISOString();
  const rawLan =
    printer.connectionMode === "lan" || printer.connectionMode === "developer";
  const nativeCamera = resolvePrinterCameraBridgeSource(printer);
  const nativeCameraSupport = nativeBambuBridgeSupport(printer.model);
  if (!rawLan) {
    return {
      capabilities: {
        ams: "unavailable",
        camera: "requires_setup",
        controls: "requires_developer_mode",
        discovery: "unavailable",
        fileUpload: "available",
        slicingAssist: "available",
        telemetry: "unavailable",
      },
      capabilityNotes: {
        camera:
          "Cloud and Bambu Connect profiles still need a linked browser-compatible stream or bridge feed before video can render in the web UI.",
        controls: "Direct controls require LAN-only Developer Mode.",
        fileUpload:
          "Companion can open the local Bambu Connect import handoff from this machine for sliced jobs.",
        slicingAssist:
          "Prepared jobs can already route through the local Bambu Connect handoff on this machine.",
        telemetry:
          "Live telemetry requires LAN Mode or LAN-only Developer Mode.",
      },
      checkedAt,
      message:
        "This profile is ready for local Bambu Connect handoff. Live telemetry and machine controls still need LAN/Developer Mode.",
      reachable: true,
    };
  }

  const host = printer.hostname.trim();
  const reachable = host ? await probeTcp(host, BAMBU_LAN_CONTROL_PORT) : false;
  const telemetryState =
    host && printer.accessCode?.trim() ? "available" : "requires_setup";
  const controlsState =
    printer.connectionMode === "developer"
      ? "unavailable"
      : "requires_developer_mode";

  return {
    capabilities: {
      ams: telemetryState,
      camera: nativeCamera
        ? "available"
        : telemetryState === "available" && nativeCameraSupport.supported
          ? "requires_setup"
          : "requires_restream",
      controls:
        printer.connectionMode === "developer" ? "available" : controlsState,
      discovery: "available",
      fileUpload:
        printer.connectionMode === "developer"
          ? "available"
          : "requires_developer_mode",
      slicingAssist:
        printer.connectionMode === "developer" ? "available" : "requires_setup",
      telemetry: telemetryState,
    },
    capabilityNotes: {
      ams: "AMS state comes through the same live report path as telemetry when the printer answers.",
      camera: nativeCamera
        ? "Companion can expose this printer's native camera directly for browser playback."
        : telemetryState === "available" && nativeCameraSupport.supported
          ? "Add the same LAN access code you use for telemetry, then Companion can expose the native camera directly."
          : nativeCameraSupport.detail,
      controls:
        printer.connectionMode === "developer"
          ? "Developer Mode direct machine controls are available through Companion."
          : "Switch this printer to LAN-only Developer Mode before enabling direct commands.",
      discovery:
        "BambuView Companion can now discover LAN-advertising Bambu printers and still lets you save printers manually.",
      fileUpload:
        printer.connectionMode === "developer"
          ? "Developer Mode direct FTPS upload and start-print handoff are available."
          : "Direct file upload planning starts once Developer Mode is enabled.",
      slicingAssist:
        printer.connectionMode === "developer"
          ? "Prepared jobs can already route through direct upload and start-print handoff on this printer."
          : "Finish the required upload path before using this printer as a send target from BambuView.",
      telemetry:
        telemetryState === "available"
          ? "Telemetry can be requested directly from the printer's MQTT report channel."
          : "Add the printer hostname and LAN access code to request telemetry.",
    },
    checkedAt,
    message: reachable
      ? "The printer accepted a local LAN control connection."
      : "The printer did not accept a local LAN control connection.",
    reachable,
  };
}

export async function readBambuTelemetry(
  printer: CompanionPrinterInput,
): Promise<CompanionPrinterTelemetry> {
  const checkedAt = new Date().toISOString();
  const host = printer.hostname.trim();
  const serial = printer.serial.trim().toUpperCase();
  const accessCode = printer.accessCode?.trim() ?? "";
  if (!host || !serial || !accessCode) {
    return {
      amsState: null,
      available: false,
      bedTargetTemperature: null,
      bedTemperature: null,
      chamberTargetTemperature: null,
      chamberTemperature: null,
      checkedAt,
      elapsedMinutes: null,
      eta: null,
      fanState: null,
      fileName: null,
      firmwareVersion: null,
      layerCurrent: null,
      layerTotal: null,
      message:
        "Add the printer hostname, serial number, and LAN access code to request telemetry.",
      nozzleTargetTemperature: null,
      nozzleTemperature: null,
      printStatus: "offline",
      progress: null,
      readiness: "unknown",
      remainingMinutes: null,
      slots: [],
      state: "setup-required",
      warnings: ["Telemetry is not configured yet."],
    };
  }

  try {
    const payload = await fetchTelemetryPayload({ ...printer, accessCode });
    return mapTelemetry(parseTelemetry(payload), checkedAt);
  } catch (error) {
    return {
      amsState: null,
      available: false,
      bedTargetTemperature: null,
      bedTemperature: null,
      chamberTargetTemperature: null,
      chamberTemperature: null,
      checkedAt,
      elapsedMinutes: null,
      eta: null,
      fanState: null,
      fileName: null,
      firmwareVersion: null,
      layerCurrent: null,
      layerTotal: null,
      message:
        error instanceof Error
          ? error.message
          : "The printer did not return telemetry.",
      nozzleTargetTemperature: null,
      nozzleTemperature: null,
      printStatus: "offline",
      progress: null,
      readiness: "offline",
      remainingMinutes: null,
      slots: [],
      state: "offline",
      warnings: ["The telemetry request failed."],
    };
  }
}

async function fetchTelemetryPayload(
  printer: Required<Pick<CompanionPrinterInput, "accessCode">> &
    CompanionPrinterInput,
): Promise<unknown> {
  const host = printer.hostname.trim();
  const serial = printer.serial.trim().toUpperCase();
  const startedAt = performance.now();

  return new Promise((resolve, reject) => {
    let settled = false;
    let connected = false;
    let buffered: MqttBuffer = Buffer.alloc(0);
    const reportTopic = buildMqttTopic(serial, "report");
    const requestTopic = buildMqttTopic(serial, "request");
    const socket = tls.connect({
      host,
      port: BAMBU_LAN_CONTROL_PORT,
      rejectUnauthorized: false,
    });

    const finish = (payload: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.removeAllListeners();
      socket.destroy();
      resolve(payload);
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.removeAllListeners();
      socket.destroy();
      reject(new Error(message));
    };

    const timeout = setTimeout(() => {
      if (connected) {
        fail(
          "The printer did not publish a telemetry report before the timeout.",
        );
        return;
      }
      fail(
        "The printer did not accept MQTT authentication before the timeout.",
      );
    }, MQTT_REPORT_TIMEOUT_MS);

    socket.setTimeout(CONNECTION_TIMEOUT_MS);
    socket.once("secureConnect", () => {
      socket.write(
        createConnectPacket({
          clientId: `bambuview_companion_${serial.slice(-8).toLowerCase()}_${Date.now()}`,
          password: printer.accessCode.trim(),
          username: "bblp",
        }),
      );
    });

    socket.on("data", (chunk) => {
      const packetChunk =
        typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      buffered = Buffer.concat([buffered, packetChunk]);

      while (buffered.length > 0) {
        const parsed = shiftMqttPacket(buffered);
        if (!parsed) {
          return;
        }

        buffered = parsed.remaining;
        if (parsed.type === 2) {
          const returnCode = parsed.packet[1];
          if (returnCode !== 0) {
            fail(
              "The printer rejected the MQTT username, access code, or client session.",
            );
            return;
          }

          connected = true;
          socket.write(createSubscribePacket(reportTopic));
          socket.write(
            createPublishPacket(
              requestTopic,
              JSON.stringify({
                pushing: {
                  command: "pushall",
                  sequence_id: String(Math.max(1, elapsed(startedAt))),
                  version: 1,
                },
              }),
            ),
          );
          continue;
        }

        if (
          parsed.type === 3 &&
          packetContainsTopic(parsed.packet, reportTopic)
        ) {
          const payload = getPublishPayload(parsed.packet, parsed.flags);
          if (!payload) {
            continue;
          }

          try {
            finish(JSON.parse(payload));
          } catch {
            fail(
              "The printer returned a telemetry packet that was not valid JSON.",
            );
          }
        }
      }
    });

    socket.once("timeout", () => {
      fail("The printer did not respond before the LAN timeout.");
    });
    socket.once("error", () => {
      fail("The printer did not accept a LAN telemetry connection.");
    });
  });
}

function mapTelemetry(
  telemetry: RawTelemetry,
  checkedAt: string,
): CompanionPrinterTelemetry {
  return {
    amsState: telemetry.slots.length > 0 ? "loaded" : null,
    available: true,
    bedTargetTemperature: telemetry.bedTargetTemperature,
    bedTemperature: telemetry.bedTemperature,
    chamberTargetTemperature: telemetry.chamberTargetTemperature,
    chamberTemperature: telemetry.chamberTemperature,
    checkedAt,
    elapsedMinutes: telemetry.elapsedMinutes,
    eta: formatEta(telemetry.remainingMinutes),
    fanState: null,
    fileName: telemetry.fileName,
    firmwareVersion: telemetry.firmwareVersion,
    layerCurrent: telemetry.layerCurrent,
    layerTotal: telemetry.layerTotal,
    message: `${telemetry.statusLabel} over local MQTT telemetry.`,
    nozzleTargetTemperature: telemetry.nozzleTargetTemperature,
    nozzleTemperature: telemetry.nozzleTemperature,
    printStatus: telemetry.printStatus,
    progress: telemetry.progress,
    readiness:
      telemetry.printStatus === "offline"
        ? "offline"
        : telemetry.printStatus === "idle"
          ? "ready"
          : "busy",
    remainingMinutes: telemetry.remainingMinutes,
    slots: telemetry.slots,
    state: telemetry.statusLabel,
    warnings: [],
  };
}

export async function probeBambuCamera(host: string): Promise<boolean> {
  return probeTcp(host, BAMBU_CAMERA_PORT);
}

function toCommandPayload(
  request: CompanionPrinterCommandRequest,
): { detail: string; payload: Record<string, unknown> } | null {
  const args = request.args ?? {};

  switch (request.action) {
    case "pause":
      return {
        detail: "Queued a pause request over Developer Mode MQTT.",
        payload: {
          print: {
            command: "pause",
            sequence_id: buildSequenceId(),
          },
        },
      };
    case "resume":
      return {
        detail: "Queued a resume request over Developer Mode MQTT.",
        payload: {
          print: {
            command: "resume",
            sequence_id: buildSequenceId(),
          },
        },
      };
    case "stop":
      return {
        detail: "Queued a stop request over Developer Mode MQTT.",
        payload: {
          print: {
            command: "stop",
            sequence_id: buildSequenceId(),
          },
        },
      };
    case "home":
      return {
        detail: "Queued an axis homing command.",
        payload: {
          print: {
            command: "gcode_line",
            param: "G28",
            sequence_id: buildSequenceId(),
          },
        },
      };
    case "move": {
      const axis =
        typeof args.axis === "string" ? args.axis.trim().toUpperCase() : "Z";
      const distance = Number(args.distance ?? 0);
      const feedrate = Number(args.feedrate ?? 4800);
      if (!["X", "Y", "Z"].includes(axis) || !Number.isFinite(distance)) {
        return null;
      }

      return {
        detail: `Queued a relative ${axis} move of ${distance}.`,
        payload: {
          print: {
            command: "gcode_line",
            param: `G91\nG0 ${axis}${distance} F${Math.max(120, Math.round(feedrate))}\nG90`,
            sequence_id: buildSequenceId(),
          },
        },
      };
    }
    case "temperature": {
      const target =
        typeof args.target === "string" ? args.target.trim().toLowerCase() : "";
      const value = Number(args.value ?? Number.NaN);
      if (!Number.isFinite(value) || !["nozzle", "bed"].includes(target)) {
        return null;
      }

      return {
        detail: `Queued a ${target} temperature change to ${value}°C.`,
        payload: {
          print: {
            command: "gcode_line",
            param:
              target === "bed"
                ? `M140 S${Math.round(value)}`
                : `M104 S${Math.round(value)}`,
            sequence_id: buildSequenceId(),
          },
        },
      };
    }
    case "fan": {
      const power = Number(args.power ?? Number.NaN);
      if (!Number.isFinite(power)) {
        return null;
      }

      const pwm = Math.round((clamp(power, 0, 100) / 100) * 255);
      return {
        detail: `Queued a part fan change to ${Math.round(power)}%.`,
        payload: {
          print: {
            command: "gcode_line",
            param: `M106 S${pwm}`,
            sequence_id: buildSequenceId(),
          },
        },
      };
    }
    case "lamp": {
      const enabled = Boolean(args.enabled);
      return {
        detail: `Queued the chamber light to turn ${enabled ? "on" : "off"}.`,
        payload: {
          system: {
            command: "ledctrl",
            led_mode: enabled ? "on" : "off",
            led_node: "chamber_light",
            sequence_id: buildSequenceId(),
          },
        },
      };
    }
    case "extruder": {
      const distance = Number(args.distance ?? Number.NaN);
      const feedrate = Number(args.feedrate ?? 900);
      if (!Number.isFinite(distance)) {
        return null;
      }

      return {
        detail: `Queued an extruder move of ${distance}.`,
        payload: {
          print: {
            command: "gcode_line",
            param: `M83\nG1 E${distance} F${Math.max(60, Math.round(feedrate))}`,
            sequence_id: buildSequenceId(),
          },
        },
      };
    }
    case "ams":
      return null;
    default:
      return null;
  }
}

async function publishBambuRequest(
  printer: CompanionPrinterInput,
  payload: Record<string, unknown>,
): Promise<void> {
  const host = printer.hostname.trim();
  const serial = printer.serial.trim().toUpperCase();
  const accessCode = printer.accessCode?.trim() ?? "";

  if (!host || !serial || !accessCode) {
    throw new Error(
      "Developer Mode commands require the printer host, serial number, and LAN access code.",
    );
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let buffered: Buffer = Buffer.alloc(0);
    const socket = tls.connect({
      host,
      port: BAMBU_LAN_CONTROL_PORT,
      rejectUnauthorized: false,
    });

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      socket.removeAllListeners();
      socket.destroy();
      resolve();
    };

    const fail = (message: string) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      socket.removeAllListeners();
      socket.destroy();
      reject(new Error(message));
    };

    const timeout = setTimeout(() => {
      fail("The printer did not accept the MQTT command session in time.");
    }, MQTT_COMMAND_TIMEOUT_MS);

    socket.setTimeout(CONNECTION_TIMEOUT_MS);
    socket.once("secureConnect", () => {
      socket.write(
        createConnectPacket({
          clientId: `bambuview_companion_cmd_${serial.slice(-8).toLowerCase()}_${Date.now()}`,
          password: accessCode,
          username: "bblp",
        }),
      );
    });

    socket.on("data", (chunk) => {
      const packetChunk =
        typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      buffered = Buffer.concat([buffered, packetChunk]);

      while (buffered.length > 0) {
        const parsed = shiftMqttPacket(buffered);
        if (!parsed) {
          return;
        }

        buffered = parsed.remaining;
        if (parsed.type !== 2) {
          continue;
        }

        const returnCode = parsed.packet[1];
        if (returnCode !== 0) {
          fail(
            "The printer rejected the MQTT command session or the LAN access code is not valid.",
          );
          return;
        }

        socket.write(
          createPublishPacket(
            buildMqttTopic(serial, "request"),
            JSON.stringify(payload),
          ),
        );
        setTimeout(finish, 250);
        return;
      }
    });

    socket.once("timeout", () => {
      fail("The printer did not answer before the command timeout.");
    });
    socket.once("error", () => {
      fail("The printer did not accept a local command connection.");
    });
  });
}

async function uploadBambuFtpsFile(
  printer: CompanionPrinterInput,
  request: CompanionFileHandoffInput,
) {
  const localPath = request.path.trim();
  if (!localPath) {
    throw new Error("Choose a local file path before sending it to the printer.");
  }

  const stats = statSync(localPath);
  const fileName = normalizeRemoteFileName(localPath, request.fileName);
  const remotePath = `/${fileName}`;
  const ftp = new FtpClient(MQTT_REPORT_TIMEOUT_MS);

  try {
    await ftp.access({
      host: printer.hostname.trim(),
      password: printer.accessCode?.trim() ?? "",
      port: BAMBU_FTPS_PORT,
      secure: "implicit",
      secureOptions: {
        rejectUnauthorized: false,
      },
      user: "bblp",
    });
    await ftp.uploadFrom(localPath, remotePath);
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `FTPS upload failed: ${error.message}`
        : "FTPS upload failed.",
    );
  } finally {
    ftp.close();
  }

  return {
    fileName,
    md5: readFileMd5(localPath),
    remotePath,
    sizeBytes: stats.size,
  };
}

export async function discoverBambuPrinters(
  timeoutMs = SSDP_DISCOVERY_TIMEOUT_MS,
): Promise<CompanionPrinterDiscoveryResult> {
  const attemptedAt = new Date().toISOString();

  return new Promise((resolve) => {
    const printers = new Map<string, CompanionPrinterDiscoveryResult["printers"][0]>();
    const socket = dgram.createSocket({ reuseAddr: true, type: "udp4" });

    const finish = (supported: boolean, detail: string) => {
      socket.removeAllListeners();
      try {
        socket.close();
      } catch {
        // Ignore socket shutdown issues while discovery is ending.
      }

      resolve({
        attemptedAt,
        detail,
        instructions: [
          "Open the printer network screen if nothing appears after one broadcast cycle.",
          "Enable LAN Mode for telemetry or LAN-only Developer Mode for direct controls and file upload.",
          "Cloud and Bambu Connect printers can still be added manually when they are not advertising locally.",
        ],
        printers: [...printers.values()].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
        supported,
      });
    };

    const timer = setTimeout(() => {
      finish(
        true,
        printers.size > 0
          ? "BambuView Companion found printers advertising over the local Bambu SSDP broadcast."
          : "No Bambu printers advertised themselves on the LAN during the discovery window.",
      );
    }, timeoutMs);

    socket.on("message", (message) => {
      const payload = message.toString("utf8");
      if (!payload.includes("HTTP/1.")) {
        return;
      }

      const headers = lowerCaseHeaders(payload);
      const serial = headers.usn?.trim().toUpperCase() ?? "";
      const host = hostFromLocation(headers.location ?? "");
      if (!serial || !host) {
        return;
      }

      const model = sanitizeModel(headers["devmodel.bambu.com"] ?? "");
      const name =
        headers["devname.bambu.com"]?.trim() ||
        `${model} ${serial.slice(-4)}`.trim();
      const key = `${serial}:${host}`;
      const nativeCameraSupport = nativeBambuBridgeSupport(model);
      printers.set(key, {
        accessCodeSet: false,
        capabilities: {
          ams: "requires_setup",
          camera: nativeCameraSupport.supported
            ? "requires_setup"
            : "requires_restream",
          controls: "requires_developer_mode",
          discovery: "available",
          fileUpload: "requires_developer_mode",
          slicingAssist: "requires_setup",
          telemetry: "requires_setup",
        },
        capabilityNotes: {
          ams: "Add the LAN access code before Companion can request the live AMS report.",
          camera: nativeCameraSupport.supported
            ? "Save the LAN access code and Companion can expose this printer's native camera directly."
            : nativeCameraSupport.detail,
          controls:
            "Switch the printer to LAN-only Developer Mode and add its access code before using direct controls.",
          discovery: "This printer was discovered automatically over the local Bambu SSDP broadcast.",
          fileUpload:
            "Switch to LAN-only Developer Mode to allow direct FTPS upload and start-print handoff.",
          slicingAssist:
            "Finish the required upload path before using this printer as a prepared-job target from BambuView.",
          telemetry:
            "Add the LAN access code before Companion can request the live MQTT telemetry report.",
        },
        connectionMode: "lan",
        createdAt: attemptedAt,
        hostname: host,
        id: `discover:${serial}:${host}`,
        lastSeenAt: attemptedAt,
        lastTestedAt: null,
        model,
        name,
        notes: "Discovered over the local Bambu LAN broadcast.",
        provider: "bambu-lab",
        serial,
        streamId: null,
        updatedAt: attemptedAt,
      });
    });

    socket.once("error", (error) => {
      clearTimeout(timer);
      finish(
        false,
        `Bambu discovery could not bind a LAN listener: ${error.message}`,
      );
    });

    socket.bind(BAMBU_SSDP_PORT, "0.0.0.0", () => {
      try {
        socket.addMembership(BAMBU_MULTICAST_GROUP);
      } catch {
        // Some networks only expose the broadcast packets and not the multicast join.
      }
    });
  });
}

export async function runBambuPrinterCommand(
  printer: CompanionPrinterInput,
  request: CompanionPrinterCommandRequest,
): Promise<CompanionPrinterCommandResponse> {
  if (printer.connectionMode !== "developer") {
    return {
      accepted: false,
      detail:
        printer.connectionMode === "lan"
          ? "Direct machine controls require LAN-only Developer Mode on the printer."
          : "This printer profile can monitor or hand off jobs, but direct machine controls are not exposed through its current connection mode.",
    };
  }

  const resolved = toCommandPayload(request);
  if (!resolved) {
    return {
      accepted: false,
      detail:
        request.action === "ams"
          ? "This AMS action is still waiting on a verified local command payload for your printer family."
          : "BambuView Companion could not build that machine command yet.",
    };
  }

  await publishBambuRequest(printer, resolved.payload);
  return {
    accepted: true,
    detail: resolved.detail,
  };
}

export async function sendBambuPrinterFile(
  printer: CompanionPrinterInput,
  request: CompanionFileHandoffInput,
): Promise<CompanionFileHandoffResult> {
  if (printer.connectionMode !== "developer") {
    return {
      accepted: false,
      detail:
        printer.connectionMode === "lan"
          ? "Direct printer upload requires LAN-only Developer Mode on the printer."
          : "This printer profile is not using the direct local upload path.",
      fileName: null,
      sizeBytes: null,
    };
  }

  const uploaded = await uploadBambuFtpsFile(printer, request);
  const shouldStartPrint =
    request.action === "send" || request.startPrint === true;

  if (shouldStartPrint) {
    await publishBambuRequest(
      printer,
      buildProjectFilePayload({
        fileName: uploaded.fileName,
        md5: uploaded.md5,
        remotePath: uploaded.remotePath,
        request,
      }),
    );
  }

  return {
    accepted: true,
    detail: shouldStartPrint
      ? "The file was uploaded over FTPS and a Developer Mode print-start request was published."
      : "The file was uploaded to the printer over FTPS and is ready for a later start command.",
    fileName: uploaded.fileName,
    sizeBytes: uploaded.sizeBytes,
  };
}
