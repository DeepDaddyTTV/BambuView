import net from "node:net";
import tls from "node:tls";

import type {
  BambuConnectionMode,
  BambuConnectImportRequest,
  BambuConnectImportResponse,
  BambuConnectionTestResult,
  BambuPrinterConnectionInput,
  PrinterConnectionCheck,
} from "@bambuview/contracts";

const BAMBU_LAN_CONTROL_PORT = 8883;
const BAMBU_CAMERA_PORT = 322;
const CONNECTION_TIMEOUT_MS = 3000;
const MQTT_REPORT_TIMEOUT_MS = 4500;

export interface BambuPrinterTelemetry {
  activeTray: string | null;
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
  partFanSpeed: number | null;
  printStatus: "printing" | "paused" | "idle" | "offline";
  progress: number;
  remainingMinutes: number | null;
  raw: unknown;
  slots: Array<{
    active: boolean;
    color: string;
    colorName: string;
    material: string;
    slot: string;
  }>;
  statusLabel: string;
}

interface BambuMqttReport {
  latencyMs: number;
  payload: unknown;
}

function elapsed(startedAt: number): number {
  return Math.max(1, Math.round(performance.now() - startedAt));
}

async function testTcpConnection(
  host: string,
  port: number,
): Promise<PrinterConnectionCheck> {
  const startedAt = performance.now();

  return new Promise((resolve) => {
    const socket = net.createConnection({
      host,
      port,
    });

    const finish = (check: PrinterConnectionCheck) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(check);
    };

    socket.setTimeout(CONNECTION_TIMEOUT_MS);
    socket.once("connect", () => {
      finish({
        detail: "The printer accepted a local LAN control connection.",
        label: "Bambu LAN control",
        latencyMs: elapsed(startedAt),
        status: "passed",
      });
    });
    socket.once("timeout", () => {
      finish({
        detail:
          "The connection timed out. Confirm the printer is on this network and LAN/developer mode is enabled.",
        label: "Bambu LAN control",
        latencyMs: elapsed(startedAt),
        status: "failed",
      });
    });
    socket.once("error", () => {
      finish({
        detail: "The printer did not accept a local LAN control connection.",
        label: "Bambu LAN control",
        latencyMs: elapsed(startedAt),
        status: "failed",
      });
    });
  });
}

function availableCheck(label: string, detail: string): PrinterConnectionCheck {
  return {
    detail,
    label,
    latencyMs: null,
    status: "available",
  };
}

function actionRequiredCheck(
  label: string,
  detail: string,
): PrinterConnectionCheck {
  return {
    detail,
    label,
    latencyMs: null,
    status: "action-required",
  };
}

function notSupportedCheck(
  label: string,
  detail: string,
): PrinterConnectionCheck {
  return {
    detail,
    label,
    latencyMs: null,
    status: "not-supported",
  };
}

function failedCheck(
  label: string,
  detail: string,
  latencyMs: number | null = null,
): PrinterConnectionCheck {
  return {
    detail,
    label,
    latencyMs,
    status: "failed",
  };
}

function modeLabel(mode: BambuConnectionMode): string {
  if (mode === "developer") {
    return "LAN-only Developer Mode";
  }

  if (mode === "lan") {
    return "LAN Mode";
  }

  if (mode === "bambu-connect") {
    return "Bambu Connect";
  }

  return "Cloud / Normal Mode";
}

function isRawLanMode(mode: BambuConnectionMode): boolean {
  return mode === "lan" || mode === "developer";
}

function isBambuConnectBackedMode(mode: BambuConnectionMode): boolean {
  return mode === "cloud" || mode === "bambu-connect" || mode === "lan";
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
  const packetId = Buffer.from([0, 1]);
  const payload = Buffer.concat([encodeMqttString(topic), Buffer.from([0])]);

  return createMqttPacket(0x82, Buffer.concat([packetId, payload]));
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
      return {
        bytesRead: index,
        value,
      };
    }

    multiplier *= 128;
    if (multiplier > 128 * 128 * 128) {
      return null;
    }
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
): BambuPrinterTelemetry["printStatus"] {
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

function labelForStatus(status: BambuPrinterTelemetry["printStatus"]): string {
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
): BambuPrinterTelemetry["slots"] {
  const ams = asRecord(print.ams);
  const activeTray =
    readString(readNested(print, ["tray_now", "vt_tray", "ams_tray_now"])) ??
    readString(readNested(ams, ["tray_now", "ams_tray_now"]));
  const amsUnits = Array.isArray(ams.ams) ? ams.ams : [];
  const slots: BambuPrinterTelemetry["slots"] = [];

  for (const unit of amsUnits) {
    const unitRecord = asRecord(unit);
    const trays = Array.isArray(unitRecord.tray) ? unitRecord.tray : [];
    for (const tray of trays) {
      const trayRecord = asRecord(tray);
      const id =
        readString(readNested(trayRecord, ["id", "tray_id"])) ??
        String(slots.length);
      const material =
        readString(
          readNested(trayRecord, ["tray_type", "type", "filament_type"]),
        ) ?? "Unknown";
      const colorName =
        readString(
          readNested(trayRecord, [
            "tray_sub_brands",
            "name",
            "filament_name",
            "tray_info_idx",
          ]),
        ) ?? "Loaded";
      const color = normalizeColor(
        readString(readNested(trayRecord, ["tray_color", "color"])),
      );
      const slot = `A${Number(id) + 1}`;

      slots.push({
        active: activeTray === id || activeTray === slot,
        color,
        colorName,
        material,
        slot,
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

export function parseBambuTelemetry(payload: unknown): BambuPrinterTelemetry {
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
  const layerCurrent = readNumber(readNested(print, ["layer_num", "layer"]));
  const layerTotal = readNumber(
    readNested(print, ["total_layer_num", "total_layers"]),
  );
  const remainingMinutes = readNumber(
    readNested(print, ["mc_remaining_time", "remaining_time"]),
  );

  return {
    activeTray: readString(readNested(print, ["tray_now", "vt_tray"])),
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
    layerCurrent,
    layerTotal,
    nozzleTemperature: readNumber(
      readNested(print, ["nozzle_temper", "nozzle_temp"]),
    ),
    nozzleTargetTemperature: readNumber(
      readNested(print, ["nozzle_target_temper", "nozzle_target_temp"]),
    ),
    partFanSpeed: readNumber(
      readNested(print, ["big_fan1_speed", "fan_gear", "cooling_fan_speed"]),
    ),
    printStatus,
    progress,
    raw: payload,
    remainingMinutes,
    slots: parseSlots(print),
    statusLabel: labelForStatus(printStatus),
  };
}

export async function fetchBambuMqttReport(
  input: BambuPrinterConnectionInput,
): Promise<BambuMqttReport> {
  const host = input.host.trim();
  const serial = input.serial.trim().toUpperCase();
  const accessCode = input.accessCode?.trim() ?? "";
  const startedAt = performance.now();

  if (!host || !serial || !accessCode) {
    throw new Error(
      "Local Bambu status telemetry requires the printer host, serial number, and LAN access code.",
    );
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let connected = false;
    let buffered: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    const reportTopic = buildMqttTopic(serial, "report");
    const requestTopic = buildMqttTopic(serial, "request");
    const socket = tls.connect({
      host,
      port: BAMBU_LAN_CONTROL_PORT,
      rejectUnauthorized: false,
    });

    const finish = (report: BambuMqttReport) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      socket.removeAllListeners();
      socket.destroy();
      resolve(report);
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
      if (connected) {
        fail(
          "BambuView authenticated to MQTT and requested a status report, but the printer did not publish a report before the timeout.",
        );
        return;
      }

      fail(
        "BambuView could not authenticate to the printer MQTT service before the timeout.",
      );
    }, MQTT_REPORT_TIMEOUT_MS);

    socket.setTimeout(CONNECTION_TIMEOUT_MS);
    socket.once("secureConnect", () => {
      socket.write(
        createConnectPacket({
          clientId: `bambuview_${serial.slice(-8).toLowerCase()}_${Date.now()}`,
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
                  sequence_id: "0",
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
          const publishPayload = getPublishPayload(parsed.packet, parsed.flags);
          if (!publishPayload) {
            fail("The printer published an empty MQTT status payload.");
            return;
          }

          let payload: unknown;
          try {
            payload = JSON.parse(publishPayload);
          } catch {
            fail("The printer returned a status payload that was not JSON.");
            return;
          }

          finish({
            latencyMs: elapsed(startedAt),
            payload,
          });
          return;
        }
      }
    });

    socket.once("timeout", () => {
      fail(
        "BambuView could not complete the MQTT TLS handshake before the timeout.",
      );
    });

    socket.once("error", () => {
      fail(
        "The printer rejected the MQTT session or the LAN access code is not valid for this printer.",
      );
    });
  });
}

async function testMqttTelemetry(
  input: BambuPrinterConnectionInput,
): Promise<PrinterConnectionCheck> {
  const startedAt = performance.now();

  if (!input.host.trim() || !input.serial.trim() || !input.accessCode?.trim()) {
    return actionRequiredCheck(
      "MQTT status telemetry",
      "Local Bambu status telemetry requires the printer host, serial number, and LAN access code.",
    );
  }

  try {
    const report = await fetchBambuMqttReport(input);
    const telemetry = parseBambuTelemetry(report.payload);

    return {
      detail: `BambuView received live status for ${telemetry.fileName} (${telemetry.progress}% complete).`,
      label: "MQTT status telemetry",
      latencyMs: report.latencyMs,
      status: "passed",
    };
  } catch (error) {
    return failedCheck(
      "MQTT status telemetry",
      error instanceof Error
        ? error.message
        : "BambuView could not read the printer MQTT status report.",
      elapsed(startedAt),
    );
  }
}

export function buildBambuConnectImportUrl(
  input: BambuConnectImportRequest,
): BambuConnectImportResponse {
  const name = input.name.trim();
  const path = input.path.trim();

  return {
    name,
    path,
    url: `bambu-connect://import-file?path=${encodeURIComponent(path)}&name=${encodeURIComponent(name)}`,
  };
}

export async function testBambuLanConnection(
  input: BambuPrinterConnectionInput,
): Promise<BambuConnectionTestResult> {
  const checkedAt = new Date().toISOString();
  const connectionMode = input.connectionMode;
  const trimmedHost = input.host.trim();
  const rawLanMode = isRawLanMode(connectionMode);
  const shouldCheckLan = rawLanMode && trimmedHost.length > 0;
  const lanControl = shouldCheckLan
    ? await testTcpConnection(trimmedHost, BAMBU_LAN_CONTROL_PORT)
    : rawLanMode
      ? actionRequiredCheck(
          "Bambu LAN control",
          "Enter the printer host/IP and access code to authenticate local Bambu LAN control.",
        )
      : notSupportedCheck(
          "Bambu LAN control",
          connectionMode === "bambu-connect"
            ? "Bambu Connect uses Bambu's supported authorization path instead of raw LAN MQTT control."
            : "Cloud / Normal keeps printer communication inside Bambu cloud/Bambu Connect and does not expose raw LAN MQTT control.",
        );
  const statusTelemetry = rawLanMode
    ? await testMqttTelemetry(input)
    : isBambuConnectBackedMode(connectionMode)
      ? availableCheck(
          "Status telemetry",
          "Bambu Connect exposes printer status and print progress through Bambu's supported integration path.",
        )
      : notSupportedCheck(
          "Status telemetry",
          "This connection mode does not expose a status telemetry path.",
        );
  const reachable =
    lanControl.status === "passed" || statusTelemetry.status === "passed";

  const cameraStream =
    connectionMode === "developer"
      ? await testTcpConnection(trimmedHost, BAMBU_CAMERA_PORT).then(
          (check) => ({
            ...check,
            detail:
              check.status === "passed"
                ? "The printer accepted a local camera stream connection. BambuView can assign this as a native feed."
                : "BambuView could not reach the local camera stream. Confirm Developer Mode/live stream access on the printer.",
            label: "Native camera stream",
          }),
        )
      : connectionMode === "bambu-connect" || connectionMode === "cloud"
        ? availableCheck(
            "Bambu Connect camera",
            "Bambu Connect is the supported path for authorized camera/live-view access when Bambu exposes it through the network plugin.",
          )
        : actionRequiredCheck(
            "Camera stream",
            "Normal LAN Mode can report status, but authorized camera access requires Bambu Connect or LAN-only Developer Mode.",
          );

  const bambuConnectBridge = isBambuConnectBackedMode(connectionMode)
    ? availableCheck(
        "Bambu Connect bridge",
        "BambuView can launch Bambu Connect using Bambu's import-file URL scheme for secure job handoff.",
      )
    : notSupportedCheck(
        "Bambu Connect bridge",
        "LAN-only Developer Mode uses the direct local protocol path instead of Bambu Connect.",
      );
  const developerMode =
    connectionMode === "developer"
      ? availableCheck(
          "Developer Mode",
          "Developer Mode is the direct local integration profile for MQTT, camera stream, file transfer, and machine commands.",
        )
      : actionRequiredCheck(
          "Developer Mode",
          "Direct local machine controls require LAN-only Developer Mode. Use Bambu Connect for authorized controls without switching the printer to Developer Mode.",
        );
  const printJobHandoff = isBambuConnectBackedMode(connectionMode)
    ? availableCheck(
        "Print job handoff",
        "BambuView can generate a Bambu Connect import link for sliced G-code or 3MF files.",
      )
    : availableCheck(
        "Print job handoff",
        "Developer Mode is prepared for direct local file transfer once a sliced file exists in BambuView.",
      );
  const printerControls =
    connectionMode === "developer"
      ? availableCheck(
          "Printer controls",
          "Developer Mode is the direct local-control path for movement, temperature, fan, AMS, and calibration commands.",
        )
      : isBambuConnectBackedMode(connectionMode)
        ? availableCheck(
            "Printer controls",
            "Bambu Connect is the authorized control path for movement, temperature, fan, AMS, and calibration commands.",
          )
        : notSupportedCheck(
            "Printer controls",
            "This connection mode does not expose printer controls.",
          );

  return {
    checkedAt,
    checks: {
      bambuConnectBridge,
      cameraStream,
      developerMode,
      lanControl,
      printJobHandoff,
      printerControls,
      statusTelemetry,
    },
    connectionMode,
    message: reachable
      ? `${modeLabel(connectionMode)} authenticated through an available printer integration path.`
      : isBambuConnectBackedMode(connectionMode)
        ? `${modeLabel(connectionMode)} is configured for Bambu Connect integration. Use the Prepare page to launch file handoff through Bambu Connect.`
        : `${modeLabel(connectionMode)} did not authenticate locally. The printer can still be saved, but live local controls stay offline until the connection succeeds.`,
    reachable,
  };
}
