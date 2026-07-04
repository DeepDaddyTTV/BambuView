import net from "node:net";
import tls from "node:tls";

import type {
  CompanionPrinterInput,
  CompanionPrinterTelemetry,
  CompanionPrinterTestResult,
} from "@bambuview/contracts";

const BAMBU_CAMERA_PORT = 322;
const BAMBU_LAN_CONTROL_PORT = 8883;
const CONNECTION_TIMEOUT_MS = 3000;
const MQTT_REPORT_TIMEOUT_MS = 4500;

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

function labelForStatus(status: CompanionPrinterTelemetry["printStatus"]): string {
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

function parseSlots(print: Record<string, unknown>): CompanionPrinterTelemetry["slots"] {
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
    elapsedMinutes: readNumber(readNested(print, ["print_time", "mc_print_time"])),
    fileName:
      readString(
        readNested(print, ["subtask_name", "gcode_file", "file", "gcode_name"]),
      ) ?? (printStatus === "idle" ? "Ready for a print job." : "Live print"),
    firmwareVersion:
      readString(root.firmware_version) ??
      readString(readNested(print, ["firmware_version", "version"])),
    layerCurrent: readNumber(readNested(print, ["layer_num", "layer"])),
    layerTotal: readNumber(readNested(print, ["total_layer_num", "total_layers"])),
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
    Buffer.concat([Buffer.from([0, 1]), encodeMqttString(topic), Buffer.from([0])]),
  );
}

function createPublishPacket(topic: string, payload: string): Buffer {
  return createMqttPacket(
    0x30,
    Buffer.concat([encodeMqttString(topic), Buffer.from(payload, "utf8")]),
  );
}

function readRemainingLength(
  buffer: Buffer,
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

function shiftMqttPacket(
  buffer: Buffer,
): { flags: number; packet: Buffer; remaining: Buffer; type: number } | null {
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

function packetContainsTopic(packet: Buffer, expectedTopic: string): boolean {
  if (packet.length < 2) {
    return false;
  }
  const topicLength = packet.readUInt16BE(0);
  if (packet.length < 2 + topicLength) {
    return false;
  }
  return packet.subarray(2, 2 + topicLength).toString("utf8") === expectedTopic;
}

function getPublishPayload(packet: Buffer, flags: number): string | null {
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
  const rawLan = printer.connectionMode === "lan" || printer.connectionMode === "developer";
  if (!rawLan) {
    return {
      capabilities: {
        ams: "unavailable",
        camera: "requires_restream",
        controls: "requires_developer_mode",
        discovery: "unavailable",
        fileUpload: "requires_developer_mode",
        slicingAssist: "future",
        telemetry: "unavailable",
      },
      capabilityNotes: {
        camera: "Cloud and Bambu Connect profiles need a browser-compatible restream to embed video.",
        controls: "Direct controls require LAN-only Developer Mode.",
        fileUpload: "Direct printer file upload is only planned for Developer Mode.",
        telemetry: "Live telemetry requires LAN Mode or LAN-only Developer Mode.",
      },
      checkedAt,
      message: "This profile is saved for handoff. Live telemetry and control need LAN/Developer Mode.",
      reachable: true,
    };
  }

  const host = printer.hostname.trim();
  const reachable = host ? await probeTcp(host, BAMBU_LAN_CONTROL_PORT) : false;
  const telemetryState =
    host && printer.accessCode?.trim() ? "available" : "requires_setup";
  const controlsState =
    printer.connectionMode === "developer" ? "unavailable" : "requires_developer_mode";

  return {
    capabilities: {
      ams: telemetryState,
      camera: "requires_restream",
      controls: controlsState,
      discovery: "unavailable",
      fileUpload:
        printer.connectionMode === "developer" ? "unavailable" : "requires_developer_mode",
      slicingAssist: "future",
      telemetry: telemetryState,
    },
    capabilityNotes: {
      ams: "AMS state comes through the same live report path as telemetry when the printer answers.",
      camera:
        "Native Bambu video still needs a browser-compatible MJPEG or snapshot bridge in this alpha.",
      controls:
        printer.connectionMode === "developer"
          ? "The control boundary is wired, but direct machine commands are not enabled in this alpha."
          : "Switch this printer to LAN-only Developer Mode before enabling direct commands.",
      discovery:
        "Automatic Bambu discovery is not implemented in this alpha. Add the printer manually with hostname, serial, and access code.",
      fileUpload:
        printer.connectionMode === "developer"
          ? "Local file staging is ready, but direct printer upload is not enabled in this alpha."
          : "Direct file upload planning starts once Developer Mode is enabled.",
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
      message: "Add the printer hostname, serial number, and LAN access code to request telemetry.",
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
        error instanceof Error ? error.message : "The printer did not return telemetry.",
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
  printer: Required<Pick<CompanionPrinterInput, "accessCode">> & CompanionPrinterInput,
): Promise<unknown> {
  const host = printer.hostname.trim();
  const serial = printer.serial.trim().toUpperCase();
  const startedAt = performance.now();

  return new Promise((resolve, reject) => {
    let settled = false;
    let connected = false;
    let buffered = Buffer.alloc(0);
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
        fail("The printer did not publish a telemetry report before the timeout.");
        return;
      }
      fail("The printer did not accept MQTT authentication before the timeout.");
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
      const packetChunk = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
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
            fail("The printer rejected the MQTT username, access code, or client session.");
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

        if (parsed.type === 3 && packetContainsTopic(parsed.packet, reportTopic)) {
          const payload = getPublishPayload(parsed.packet, parsed.flags);
          if (!payload) {
            continue;
          }

          try {
            finish(JSON.parse(payload));
          } catch {
            fail("The printer returned a telemetry packet that was not valid JSON.");
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
