import type {
  CameraOverview,
  CompanionPrinter,
  CompanionPrinterTelemetry,
  CompanionStream,
  FleetDataMode,
  FleetOverview,
  PrepareStatus,
  PrinterCameraFeed,
  PrinterConnectionRecord,
  PrinterDetail,
} from "@bambuview/contracts";

import {
  listCameraAssignments,
  listCameraSources,
  listCompanionSecrets,
  listPrinterConnectionSecrets,
  type AppDatabase,
  type CompanionSecretRecord,
  type PrinterConnectionSecretRecord,
  updatePrinterConnectionStatus,
} from "./db.js";
import {
  fetchBambuMqttReport,
  parseBambuTelemetry,
  type BambuPrinterTelemetry,
} from "./bambu.js";
import { fetchCompanionPrinterTelemetry } from "./companion.js";

export interface PrinterProvider {
  getFleetOverview(mode?: FleetDataMode): Promise<FleetOverview>;
  getPrinterDetail(
    printerId: string,
    mode?: FleetDataMode,
  ): Promise<PrinterDetail | null>;
}

export interface CameraProvider {
  getOverview(): Promise<CameraOverview>;
}

export interface SliceProvider {
  getStatus(): Promise<PrepareStatus>;
}

const TELEMETRY_CACHE_MS = 8000;

type TelemetrySource = "direct-lan" | "companion";

interface CompanionPrinterMatch {
  companion: CompanionSecretRecord;
  printer: CompanionPrinter;
  stream: CompanionStream | null;
}

interface TelemetryResolution {
  source: TelemetrySource | null;
  telemetry: BambuPrinterTelemetry | null;
}

function mockCameraFeed(
  id: string,
  label: string,
  kind: PrinterCameraFeed["kind"],
): PrinterCameraFeed {
  return {
    id,
    kind,
    label,
    snapshotUrl: null,
    sourceId: null,
    status: "online",
    streamKind: "snapshot",
    streamUrl: null,
  };
}

const printers: PrinterDetail[] = [
  {
    id: "x1-carbon-office",
    shortCode: "X1C",
    name: "X1 Carbon - Office",
    status: "printing",
    statusLabel: "Printing",
    progress: 28,
    layer: "Layer 256 of 912",
    eta: "Today 2:35 PM",
    elapsed: "2h 47m",
    fileName: "Drone_Arm_v3.gcode",
    location: "Office",
    material: "PLA",
    materialColor: "Matte Green",
    nozzleProfile: "0.20mm",
    cameraLabel: "Printer Cam",
    previewKind: "bracket",
    serial: "X1C-OFFICE-001",
    ipAddress: "192.0.2.101",
    firmwareVersion: "01.06.02.00",
    filamentRemaining: "612g",
    filamentUsed: "179g",
    printTimeRemaining: "4h 18m",
    temperatures: [
      { label: "Nozzle", current: "220°C", target: "220°C" },
      { label: "Bed", current: "60°C", target: "60°C" },
      { label: "Chamber", current: "35°C", target: "35°C" },
    ],
    cameraFeeds: [
      mockCameraFeed("x1c-printer", "Printer Cam", "printer"),
      mockCameraFeed("x1c-ams", "AMS Cam", "ams"),
      mockCameraFeed("x1c-enclosure", "Enclosure Cam", "enclosure"),
      mockCameraFeed("x1c-overview", "Studio Overview", "overview"),
    ],
    selectedCameraFeedId: "x1c-printer",
    slots: [
      {
        slot: "A1",
        label: "A1",
        color: "#66d139",
        colorName: "Matte Green",
        material: "PLA",
        active: true,
      },
      {
        slot: "B2",
        label: "B2",
        color: "#b8babd",
        colorName: "Gray",
        material: "PLA",
        active: false,
      },
      {
        slot: "C3",
        label: "C3",
        color: "#36393f",
        colorName: "Black",
        material: "PLA",
        active: false,
      },
      {
        slot: "D4",
        label: "D4",
        color: "#f6f7f8",
        colorName: "White",
        material: "PLA",
        active: false,
      },
    ],
  },
  {
    id: "p1s-studio",
    shortCode: "P1S",
    name: "P1S - Studio",
    status: "idle",
    statusLabel: "Idle",
    progress: 0,
    layer: "Ready to Print",
    eta: "Ready",
    elapsed: "Idle",
    fileName: "Send a print job to get started.",
    location: "Studio",
    material: "PLA",
    materialColor: "Gray",
    nozzleProfile: "0.20mm",
    cameraLabel: "Studio Cam",
    previewKind: "benchy",
    serial: "P1S-STUDIO-002",
    ipAddress: "192.0.2.102",
    firmwareVersion: "01.07.00.00",
    filamentRemaining: "411g",
    filamentUsed: "0g",
    printTimeRemaining: "—",
    temperatures: [
      { label: "Nozzle", current: "31°C", target: "0°C" },
      { label: "Bed", current: "24°C", target: "0°C" },
      { label: "Chamber", current: "27°C", target: "0°C" },
    ],
    cameraFeeds: [
      mockCameraFeed("p1s-printer", "Printer Cam", "printer"),
      mockCameraFeed("p1s-ams", "AMS Cam", "ams"),
      mockCameraFeed("p1s-enclosure", "Enclosure Cam", "enclosure"),
      mockCameraFeed("p1s-overview", "Studio Overview", "overview"),
    ],
    selectedCameraFeedId: "p1s-printer",
    slots: [
      {
        slot: "A1",
        label: "A1",
        color: "#66d139",
        colorName: "Green",
        material: "PLA",
        active: true,
      },
      {
        slot: "B2",
        label: "B2",
        color: "#b8babd",
        colorName: "Gray",
        material: "PLA",
        active: false,
      },
      {
        slot: "C3",
        label: "C3",
        color: "#4d93ff",
        colorName: "Blue",
        material: "PLA",
        active: false,
      },
      {
        slot: "D4",
        label: "D4",
        color: "#ff9a1e",
        colorName: "Orange",
        material: "PLA",
        active: false,
      },
    ],
  },
  {
    id: "a1-mini-workshop",
    shortCode: "A1",
    name: "A1 Mini - Workshop",
    status: "printing",
    statusLabel: "Printing",
    progress: 30,
    layer: "Layer 128 of 423",
    eta: "Today 1:03 PM",
    elapsed: "1h 15m",
    fileName: "Flexi_Dino.gcode",
    location: "Workshop",
    material: "PLA",
    materialColor: "Green",
    nozzleProfile: "0.16mm",
    cameraLabel: "Workshop Cam",
    previewKind: "dino",
    serial: "A1-WORKSHOP-003",
    ipAddress: "192.0.2.103",
    firmwareVersion: "01.05.04.00",
    filamentRemaining: "612g",
    filamentUsed: "188g",
    printTimeRemaining: "4h 42m",
    temperatures: [
      { label: "Nozzle", current: "215°C", target: "220°C" },
      { label: "Bed", current: "60°C", target: "60°C" },
      { label: "Chamber", current: "33°C", target: "35°C" },
    ],
    cameraFeeds: [
      mockCameraFeed("a1-printer", "Printer Cam", "printer"),
      mockCameraFeed("a1-ams", "AMS Cam", "ams"),
      mockCameraFeed("a1-enclosure", "Enclosure Cam", "enclosure"),
      mockCameraFeed("a1-overview", "Studio Overview", "overview"),
    ],
    selectedCameraFeedId: "a1-printer",
    slots: [
      {
        slot: "A1",
        label: "A1",
        color: "#66d139",
        colorName: "Green",
        material: "PLA",
        active: true,
      },
      {
        slot: "B2",
        label: "B2",
        color: "#c9a05a",
        colorName: "Tan",
        material: "PLA",
        active: false,
      },
      {
        slot: "C3",
        label: "C3",
        color: "#2f3237",
        colorName: "Charcoal",
        material: "PLA",
        active: false,
      },
      {
        slot: "D4",
        label: "D4",
        color: "#1f2125",
        colorName: "Black",
        material: "PLA",
        active: false,
      },
    ],
  },
  {
    id: "x1e-engineering",
    shortCode: "X1E",
    name: "X1E - Engineering",
    status: "paused",
    statusLabel: "Paused",
    progress: 68,
    layer: "User Paused",
    eta: "Today 3:20 PM",
    elapsed: "1h 32m",
    fileName: "Gear_Housing.gcode",
    location: "Engineering",
    material: "PETG",
    materialColor: "Standard",
    nozzleProfile: "0.20mm",
    cameraLabel: "Engineering Cam",
    previewKind: "housing",
    serial: "X1E-ENG-004",
    ipAddress: "192.0.2.104",
    firmwareVersion: "01.06.08.00",
    filamentRemaining: "256g",
    filamentUsed: "188g",
    printTimeRemaining: "58m",
    temperatures: [
      { label: "Nozzle", current: "242°C", target: "245°C" },
      { label: "Bed", current: "71°C", target: "70°C" },
      { label: "Chamber", current: "39°C", target: "40°C" },
    ],
    cameraFeeds: [
      mockCameraFeed("x1e-printer", "Printer Cam", "printer"),
      mockCameraFeed("x1e-ams", "AMS Cam", "ams"),
      mockCameraFeed("x1e-enclosure", "Enclosure Cam", "enclosure"),
      mockCameraFeed("x1e-overview", "Studio Overview", "overview"),
    ],
    selectedCameraFeedId: "x1e-printer",
    slots: [
      {
        slot: "A1",
        label: "A1",
        color: "#353941",
        colorName: "Graphite",
        material: "PETG",
        active: false,
      },
      {
        slot: "B2",
        label: "B2",
        color: "#e8eaed",
        colorName: "White",
        material: "PETG",
        active: true,
      },
      {
        slot: "C3",
        label: "C3",
        color: "#2e3239",
        colorName: "Slate",
        material: "PETG",
        active: false,
      },
      {
        slot: "D4",
        label: "D4",
        color: "#1a1d21",
        colorName: "Onyx",
        material: "PETG",
        active: false,
      },
    ],
  },
  {
    id: "p1p-break-room",
    shortCode: "P1P",
    name: "P1P - Break Room",
    status: "offline",
    statusLabel: "Offline",
    progress: 0,
    layer: "Last seen 2h ago",
    eta: "Offline",
    elapsed: "No heartbeat",
    fileName: "Check the connection and power.",
    location: "Break Room",
    material: "PLA",
    materialColor: "White",
    nozzleProfile: "0.20mm",
    cameraLabel: "Break Room Cam",
    previewKind: "bracket",
    serial: "P1P-BREAK-005",
    ipAddress: "192.0.2.105",
    firmwareVersion: "01.04.10.00",
    filamentRemaining: "812g",
    filamentUsed: "0g",
    printTimeRemaining: "—",
    temperatures: [
      { label: "Nozzle", current: "23°C", target: "0°C" },
      { label: "Bed", current: "24°C", target: "0°C" },
      { label: "Chamber", current: "25°C", target: "0°C" },
    ],
    cameraFeeds: [
      mockCameraFeed("p1p-printer", "Printer Cam", "printer"),
      mockCameraFeed("p1p-ams", "AMS Cam", "ams"),
      mockCameraFeed("p1p-enclosure", "Enclosure Cam", "enclosure"),
    ],
    selectedCameraFeedId: "p1p-printer",
    slots: [
      {
        slot: "A1",
        label: "A1",
        color: "#f5f6f7",
        colorName: "White",
        material: "PLA",
        active: true,
      },
      {
        slot: "B2",
        label: "B2",
        color: "#b8babd",
        colorName: "Gray",
        material: "PLA",
        active: false,
      },
      {
        slot: "C3",
        label: "C3",
        color: "#2f3237",
        colorName: "Charcoal",
        material: "PLA",
        active: false,
      },
      {
        slot: "D4",
        label: "D4",
        color: "#1f2125",
        colorName: "Black",
        material: "PLA",
        active: false,
      },
    ],
  },
  {
    id: "production-farm",
    shortCode: "FARM",
    name: "Production Farm",
    status: "printing",
    statusLabel: "4 Printers",
    progress: 42,
    layer: "2 Printing",
    eta: "Today 4:15 PM",
    elapsed: "5h 18m",
    fileName: "Overall Progress",
    location: "Farm",
    material: "PLA",
    materialColor: "Mixed",
    nozzleProfile: "Multi",
    cameraLabel: "Farm Overview",
    previewKind: "farm",
    serial: "FARM-OVERVIEW",
    ipAddress: "192.0.2.200",
    firmwareVersion: "N/A",
    filamentRemaining: "12 loaded",
    filamentUsed: "2 Printing • 1 Paused",
    printTimeRemaining: "1 Idle • 0 Offline",
    temperatures: [
      { label: "Printers", current: "4", target: "4" },
      { label: "Active", current: "2", target: "2" },
      { label: "Paused", current: "1", target: "0" },
    ],
    cameraFeeds: [
      mockCameraFeed("farm-overview", "Studio Overview", "overview"),
    ],
    selectedCameraFeedId: "farm-overview",
    slots: [
      {
        slot: "12",
        label: "12",
        color: "#66d139",
        colorName: "Online",
        material: "PLA",
        active: true,
      },
      {
        slot: "8",
        label: "8",
        color: "#b8babd",
        colorName: "Idle",
        material: "PLA",
        active: false,
      },
      {
        slot: "6",
        label: "6",
        color: "#4d93ff",
        colorName: "Queued",
        material: "PLA",
        active: false,
      },
      {
        slot: "4",
        label: "4",
        color: "#ff9a1e",
        colorName: "Paused",
        material: "PLA",
        active: false,
      },
    ],
  },
];

const printerById = new Map(printers.map((printer) => [printer.id, printer]));

function shortCodeForConnection(connection: PrinterConnectionRecord): string {
  const model = connection.model.toUpperCase();
  if (model.includes("H2D PRO")) return "H2P";
  if (model.includes("H2D")) return "H2D";
  if (model.includes("H2S")) return "H2S";
  if (model.includes("H2C")) return "H2C";
  if (model.includes("X2D")) return "X2D";
  if (model.includes("X2")) return "X2";
  if (model.includes("P2S")) return "P2S";
  if (model.includes("P2")) return "P2";
  if (model.includes("A2L")) return "A2L";
  if (model.includes("X1C")) return "X1C";
  if (model.includes("X1 CARBON")) return "X1C";
  if (model.includes("X1E")) return "X1E";
  if (model.includes("P1S")) return "P1S";
  if (model.includes("P1P")) return "P1P";
  if (model.includes("A1")) return "A1";

  return "BMB";
}

function previewKindForConnection(
  connection: PrinterConnectionRecord,
): PrinterDetail["previewKind"] {
  const model = connection.model.toUpperCase();
  if (model.includes("A1") || model.includes("A2")) return "dino";
  if (model.includes("P1") || model.includes("P2")) return "benchy";
  if (model.includes("H2") || model.includes("X2")) return "housing";

  return "bracket";
}

function modeLabelForConnection(connection: PrinterConnectionRecord): string {
  if (connection.connectionMode === "developer") return "Developer Mode";
  if (connection.connectionMode === "bambu-connect") return "Bambu Connect";
  if (connection.connectionMode === "cloud") return "Cloud Mode";

  return "LAN Mode";
}

function integrationCopyForConnection(
  connection: PrinterConnectionRecord,
  telemetrySource: TelemetrySource | null = null,
): string {
  if (telemetrySource === "companion") {
    return "Live telemetry is bridged through BambuView Companion. Pair the same printer serial in Companion to keep progress, temperatures, AMS state, and camera access available even when the server cannot talk to the printer directly.";
  }

  if (connection.connectionMode === "bambu-connect") {
    return "Bambu Connect profile saved for slicer handoff. Live telemetry and cameras need LAN/Developer telemetry or an assigned browser-compatible restream.";
  }

  if (connection.connectionMode === "cloud") {
    return "Cloud / Normal profile saved. Use LAN/Developer telemetry for live progress, or assign a Frigate/go2rtc/direct camera source.";
  }

  if (connection.connectionMode === "developer") {
    return "Developer Mode uses direct local MQTT, camera stream, and machine-control protocols.";
  }

  return "LAN Mode uses local MQTT for status telemetry and Bambu Connect for restricted commands.";
}

function telemetryStateForConnection(
  connection: PrinterConnectionRecord,
  telemetry: BambuPrinterTelemetry | null,
): NonNullable<PrinterDetail["telemetryState"]> {
  if (telemetry) {
    return "live";
  }

  if (
    connection.connectionMode === "bambu-connect" ||
    connection.connectionMode === "cloud"
  ) {
    return "limited";
  }

  return connection.connectionStatus === "offline" ? "offline" : "pending";
}

function telemetryLabelForConnection(
  connection: PrinterConnectionRecord,
  telemetry: BambuPrinterTelemetry | null,
): string {
  if (telemetry) {
    return telemetry.statusLabel;
  }

  if (connection.connectionMode === "bambu-connect") {
    return "BambuConnect Handoff Saved";
  }

  if (connection.connectionMode === "cloud") {
    return "Cloud / Normal Saved";
  }

  return connection.connectionStatus === "online"
    ? "Waiting For Telemetry"
    : "Offline";
}

function formatTemperature(
  current: number | null,
  target: number | null,
): { current: string; target: string } {
  return {
    current: current === null ? "—" : `${Math.round(current)}°C`,
    target: target === null ? "—" : `${Math.round(target)}°C`,
  };
}

function formatMinutes(minutes: number | null): string {
  if (minutes === null) {
    return "—";
  }

  const hours = Math.floor(minutes / 60);
  const mins = Math.max(0, Math.round(minutes % 60));
  if (hours <= 0) {
    return `${mins}m`;
  }

  return `${hours}h ${mins}m`;
}

function formatEta(minutes: number | null): string {
  if (minutes === null) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(Date.now() + minutes * 60_000));
}

function layerLabel(telemetry: BambuPrinterTelemetry): string {
  if (telemetry.layerCurrent !== null && telemetry.layerTotal !== null) {
    return `Layer ${telemetry.layerCurrent} of ${telemetry.layerTotal}`;
  }

  if (telemetry.printStatus === "idle") {
    return "Ready to Print";
  }

  return "Live telemetry";
}

function telemetrySlots(
  telemetry: BambuPrinterTelemetry | null,
): PrinterDetail["slots"] {
  if (!telemetry?.slots.length) {
    return [
      {
        slot: "A1",
        label: "A1",
        color: "#66d139",
        colorName: "Pending",
        material: "PLA",
        active: true,
      },
    ];
  }

  return telemetry.slots.map((slot) => ({
    ...slot,
    label: slot.slot,
  }));
}

function cameraFeedsForConnection(
  connection: PrinterConnectionRecord,
  assignedFeeds: PrinterCameraFeed[] = [],
): PrinterCameraFeed[] {
  const isBambuConnect =
    connection.connectionMode === "bambu-connect" ||
    connection.connectionMode === "cloud";
  const defaultFeed: PrinterCameraFeed = {
    id: `${connection.id}-bambu-printer`,
    kind: "printer",
    label: isBambuConnect ? "Bambu Connect Slot" : "Printer Cam Slot",
    snapshotUrl: null,
    sourceId: null,
    status: "offline",
    streamKind: "unknown",
    streamUrl: null,
  };

  return assignedFeeds.length > 0
    ? assignedFeeds
    : [
        defaultFeed,
        {
          ...defaultFeed,
          id: `${connection.id}-bambu-overview`,
          kind: "overview",
          label: "Studio Overview",
        },
      ];
}

function normalizeSlotColor(value: string | null): string {
  if (!value) {
    return "#b8babd";
  }

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#/, "").slice(0, 6)}`;
}

function mapCompanionTelemetry(
  telemetry: CompanionPrinterTelemetry,
): BambuPrinterTelemetry | null {
  if (!telemetry.available) {
    return null;
  }

  return {
    activeTray: telemetry.slots.find((slot) => slot.active)?.slot ?? null,
    bedTargetTemperature: telemetry.bedTargetTemperature,
    bedTemperature: telemetry.bedTemperature,
    chamberTargetTemperature: telemetry.chamberTargetTemperature,
    chamberTemperature: telemetry.chamberTemperature,
    elapsedMinutes: telemetry.elapsedMinutes,
    fileName:
      telemetry.fileName ??
      (telemetry.printStatus === "idle"
        ? "Ready for a print job."
        : "Live print"),
    firmwareVersion: telemetry.firmwareVersion,
    layerCurrent: telemetry.layerCurrent,
    layerTotal: telemetry.layerTotal,
    nozzleTargetTemperature: telemetry.nozzleTargetTemperature,
    nozzleTemperature: telemetry.nozzleTemperature,
    partFanSpeed: null,
    printStatus: telemetry.printStatus,
    progress: telemetry.progress ?? 0,
    raw: telemetry,
    remainingMinutes: telemetry.remainingMinutes,
    slots: telemetry.slots.map((slot) => ({
      active: slot.active,
      color: normalizeSlotColor(slot.color),
      colorName: slot.colorName ?? "Loaded",
      material: slot.material,
      slot: slot.slot,
    })),
    statusLabel:
      telemetry.state?.trim() || telemetry.message || "Live telemetry",
  };
}

function companionCameraFeed(
  connection: PrinterConnectionRecord,
  match: CompanionPrinterMatch | null,
): PrinterCameraFeed | null {
  if (!match) {
    return null;
  }

  const streamKind = match.stream
    ? match.stream.outputKind === "mjpeg"
      ? "mjpeg"
      : match.stream.outputKind === "snapshot"
        ? "snapshot"
        : match.stream.outputKind === "hls"
          ? "hls"
          : "unknown"
    : match.printer.capabilities.camera === "available"
      ? "mjpeg"
      : "unknown";

  if (streamKind === "unknown") {
    return null;
  }

  const basePath = `/api/companions/${match.companion.id}/printers/${match.printer.id}/camera`;
  const label = match.stream?.name || "Printer Cam";

  return {
    id: `${connection.id}-companion-${match.companion.id}-${match.printer.id}`,
    kind: cameraFeedKind(label),
    label,
    snapshotUrl: `${basePath}/snapshot`,
    sourceId: null,
    status:
      match.stream?.status ??
      (match.printer.capabilities.camera === "available" ? "online" : "degraded"),
    streamKind,
    streamUrl: `${basePath}/stream`,
  };
}

function mergeCameraFeeds(
  assignedFeeds: PrinterCameraFeed[],
  extraFeed: PrinterCameraFeed | null,
): PrinterCameraFeed[] {
  if (!extraFeed) {
    return assignedFeeds;
  }

  if (assignedFeeds.some((feed) => feed.id === extraFeed.id)) {
    return assignedFeeds;
  }

  return [extraFeed, ...assignedFeeds];
}

function isRawLanConnection(connection: PrinterConnectionRecord): boolean {
  return (
    connection.connectionMode === "lan" ||
    connection.connectionMode === "developer"
  );
}

function cameraFeedKind(label: string): PrinterCameraFeed["kind"] {
  const normalized = label.toLowerCase();
  if (normalized.includes("ams")) return "ams";
  if (normalized.includes("overview") || normalized.includes("studio")) {
    return "overview";
  }
  if (normalized.includes("enclosure")) return "enclosure";

  return "printer";
}

function detailForConnection(
  connection: PrinterConnectionRecord,
  telemetry: BambuPrinterTelemetry | null = null,
  assignedFeeds: PrinterCameraFeed[] = [],
  telemetrySource: TelemetrySource | null = null,
): PrinterDetail {
  const isReachable = connection.connectionStatus === "online";
  const isCloudMode = connection.connectionMode === "cloud";
  const isBambuConnectMode = connection.connectionMode === "bambu-connect";
  const modeLabel = modeLabelForConnection(connection);
  const integrationCopy = integrationCopyForConnection(
    connection,
    telemetrySource,
  );
  const resolvedStatus =
    telemetry?.printStatus ?? (isReachable ? "idle" : "offline");
  const telemetryState = telemetryStateForConnection(connection, telemetry);
  const slots = telemetrySlots(telemetry);
  const selectedCameraFeeds = cameraFeedsForConnection(
    connection,
    assignedFeeds,
  );
  const primaryFeed = selectedCameraFeeds[0];
  const nozzle = formatTemperature(
    telemetry?.nozzleTemperature ?? null,
    telemetry?.nozzleTargetTemperature ?? null,
  );
  const bed = formatTemperature(
    telemetry?.bedTemperature ?? null,
    telemetry?.bedTargetTemperature ?? null,
  );
  const chamber = formatTemperature(
    telemetry?.chamberTemperature ?? null,
    telemetry?.chamberTargetTemperature ?? null,
  );

  return {
    id: connection.id,
    shortCode: shortCodeForConnection(connection),
    name: connection.name,
    status:
      telemetry?.printStatus ??
      (isCloudMode || isBambuConnectMode ? "idle" : resolvedStatus),
    statusLabel: telemetryLabelForConnection(connection, telemetry),
    telemetryMessage: integrationCopy,
    telemetryState,
    progress: telemetry?.progress ?? 0,
    layer: telemetry
      ? layerLabel(telemetry)
      : telemetryState === "limited"
        ? "Live telemetry not connected"
        : isReachable
          ? `Connected through Bambu ${modeLabel}`
          : modeLabel,
    eta: telemetry
      ? formatEta(telemetry.remainingMinutes)
      : telemetryState === "limited"
        ? "Assign telemetry"
        : isReachable
          ? "Ready"
          : isBambuConnectMode || isCloudMode
            ? "Ready"
            : "Offline",
    elapsed: telemetry
      ? formatMinutes(telemetry.elapsedMinutes)
      : telemetryState === "limited"
        ? "Limited"
        : isReachable
          ? "Idle"
          : isBambuConnectMode
            ? "Bridge"
            : isCloudMode
              ? "Cloud"
              : "No heartbeat",
    fileName:
      telemetry?.fileName ??
      (telemetryState === "limited"
        ? "Live progress unavailable through this profile."
        : isReachable
          ? "Waiting for live telemetry."
          : integrationCopy),
    location: modeLabel,
    material: slots[0]?.material ?? "PLA",
    materialColor:
      telemetryState === "limited"
        ? "Use LAN telemetry"
        : (slots[0]?.colorName ?? "Unknown"),
    nozzleProfile:
      telemetryState === "limited" ? "Telemetry not connected" : "Live profile",
    cameraLabel: primaryFeed?.label ?? "Printer Cam",
    previewKind: previewKindForConnection(connection),
    serial: connection.serial,
    ipAddress:
      connection.host ||
      (isBambuConnectMode ? "Bambu Connect bridge" : "Cloud profile"),
    firmwareVersion: telemetry?.firmwareVersion ?? "Pending live query",
    filamentRemaining: "Pending",
    filamentUsed: "0g",
    printTimeRemaining: formatMinutes(telemetry?.remainingMinutes ?? null),
    temperatures: [
      { label: "Nozzle", current: nozzle.current, target: nozzle.target },
      { label: "Bed", current: bed.current, target: bed.target },
      { label: "Chamber", current: chamber.current, target: chamber.target },
    ],
    cameraFeeds: selectedCameraFeeds,
    selectedCameraFeedId: primaryFeed?.id ?? `${connection.id}-bambu-printer`,
    slots,
  };
}

class DatabaseBackedPrinterProvider implements PrinterProvider {
  private readonly telemetryCache = new Map<
    string,
    {
      expiresAt: number;
      source: TelemetrySource | null;
      telemetry: BambuPrinterTelemetry | null;
    }
  >();

  constructor(private readonly db: AppDatabase) {}

  private companionMatchesBySerial(
    companions: CompanionSecretRecord[],
  ): Map<string, CompanionPrinterMatch> {
    const matches = new Map<string, CompanionPrinterMatch>();

    for (const companion of companions) {
      for (const printer of companion.printers) {
        const serial = printer.serial.trim().toUpperCase();
        if (!serial || matches.has(serial)) {
          continue;
        }

        matches.set(serial, {
          companion,
          printer,
          stream:
            companion.streams.find(
              (stream) => stream.id === printer.streamId,
            ) ?? null,
        });
      }
    }

    return matches;
  }

  private async telemetryForConnection(
    connection: PrinterConnectionSecretRecord,
    companionMatch: CompanionPrinterMatch | null,
  ): Promise<TelemetryResolution> {
    const cached = this.telemetryCache.get(connection.id);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        source: cached.source,
        telemetry: cached.telemetry,
      };
    }

    let resolved: TelemetryResolution = {
      source: null,
      telemetry: null,
    };
    let attemptedDirectLan = false;

    if (isRawLanConnection(connection) && connection.accessCode) {
      attemptedDirectLan = true;

      try {
        const report = await fetchBambuMqttReport({
          accessCode: connection.accessCode,
          connectionMode: connection.connectionMode,
          host: connection.host,
          model: connection.model,
          name: connection.name,
          serial: connection.serial,
        });
        const telemetry = parseBambuTelemetry(report.payload);
        const seenAt = new Date().toISOString();
        await updatePrinterConnectionStatus(
          this.db,
          connection.id,
          "online",
          seenAt,
        );
        resolved = {
          source: "direct-lan",
          telemetry,
        };
      } catch {
        resolved = {
          source: null,
          telemetry: null,
        };
      }
    }

    if (!resolved.telemetry && companionMatch) {
      try {
        const telemetry = mapCompanionTelemetry(
          await fetchCompanionPrinterTelemetry(
            companionMatch.companion,
            companionMatch.printer.id,
          ),
        );

        if (telemetry) {
          await updatePrinterConnectionStatus(
            this.db,
            connection.id,
            "online",
            new Date().toISOString(),
          );
          resolved = {
            source: "companion",
            telemetry,
          };
        }
      } catch {
        // Keep the last known state if the companion bridge is temporarily unreachable.
      }
    }

    if (!resolved.telemetry && attemptedDirectLan) {
      await updatePrinterConnectionStatus(
        this.db,
        connection.id,
        "offline",
        null,
      );
    }

    this.telemetryCache.set(connection.id, {
      expiresAt: Date.now() + TELEMETRY_CACHE_MS,
      source: resolved.source,
      telemetry: resolved.telemetry,
    });

    return resolved;
  }

  private async cameraFeedsByPrinter(): Promise<
    Map<string, PrinterCameraFeed[]>
  > {
    const [assignments, sources] = await Promise.all([
      listCameraAssignments(this.db),
      listCameraSources(this.db),
    ]);
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    const feedsByPrinter = new Map<string, PrinterCameraFeed[]>();

    for (const assignment of assignments) {
      if (assignment.targetType !== "printer") {
        continue;
      }

      const source = sourceById.get(assignment.sourceId);
      if (!source) {
        continue;
      }

      const existing = feedsByPrinter.get(assignment.printerId) ?? [];
      existing.push({
        id: assignment.feedId,
        kind: cameraFeedKind(assignment.feedLabel),
        label: assignment.feedLabel,
        snapshotUrl: source.snapshotUrl,
        sourceId: source.id,
        status: source.status,
        streamKind: source.streamKind,
        streamUrl: source.streamUrl,
      });
      feedsByPrinter.set(assignment.printerId, existing);
    }

    return feedsByPrinter;
  }

  private async getStoredPrinterDetails(): Promise<PrinterDetail[]> {
    const [connections, feedsByPrinter, companions] = await Promise.all([
      listPrinterConnectionSecrets(this.db),
      this.cameraFeedsByPrinter(),
      listCompanionSecrets(this.db),
    ]);
    const companionMatches = this.companionMatchesBySerial(companions);

    return Promise.all(
      connections.map(async (connection) => {
        const companionMatch =
          companionMatches.get(connection.serial.trim().toUpperCase()) ?? null;
        const telemetry = await this.telemetryForConnection(
          connection,
          companionMatch,
        );
        const feeds = mergeCameraFeeds(
          feedsByPrinter.get(connection.id) ?? [],
          companionCameraFeed(connection, companionMatch),
        );

        return detailForConnection(
          connection,
          telemetry.telemetry,
          feeds,
          telemetry.source,
        );
      }),
    );
  }

  async getFleetOverview(
    mode: FleetDataMode = "placeholder",
  ): Promise<FleetOverview> {
    const storedPrinters = await this.getStoredPrinterDetails();
    const allPrinters =
      mode === "live" ? storedPrinters : [...storedPrinters, ...printers];
    const selectedPrinter = allPrinters[0] ?? null;
    const farmGroups = allPrinters.filter(
      (printer) => printer.previewKind === "farm",
    ).length;

    return {
      stats: {
        printers: allPrinters.filter(
          (printer) => printer.previewKind !== "farm",
        ).length,
        activePrints: allPrinters.filter(
          (printer) => printer.status === "printing",
        ).length,
        completedToday: mode === "live" ? 0 : 23,
        farmGroups,
      },
      printers: allPrinters,
      selectedPrinterId: selectedPrinter?.id ?? null,
      selectedPrinter,
    };
  }

  async getPrinterDetail(
    printerId: string,
    mode: FleetDataMode = "placeholder",
  ): Promise<PrinterDetail | null> {
    const stored = (await this.getStoredPrinterDetails()).find(
      (printer) => printer.id === printerId,
    );

    if (stored) {
      return stored;
    }

    if (mode === "live") {
      return null;
    }

    return printerById.get(printerId) ?? null;
  }
}

class DatabaseBackedCameraProvider implements CameraProvider {
  constructor(private readonly db: AppDatabase) {}

  async getOverview(): Promise<CameraOverview> {
    const [persistedSources, persistedAssignments] = await Promise.all([
      listCameraSources(this.db),
      listCameraAssignments(this.db),
    ]);

    return {
      sources: persistedSources,
      assignments: persistedAssignments,
    };
  }
}

class MockSliceProvider implements SliceProvider {
  async getStatus(): Promise<PrepareStatus> {
    return {
      status: "available",
      headline: "Prepare around Orca for filament and Prusa for resin.",
      description:
        "The Prepare & Slice workspace now routes real printer targets, direct Developer Mode sends, paired Companion bridge handoff, and Bambu Connect fallback from one fork-aware shell. OrcaSlicer stays primary for filament work, while PrusaSlicer remains isolated for resin workflows.",
      capabilities: [
        "printer-aware Orca filament lane with real Bambu target selection",
        "direct Developer Mode send and start-print handoff from the workspace",
        "paired Companion bridge send path for staged printer profiles",
        "Bambu Connect import-file URL generation as a desktop fallback",
        "Prusa resin lane kept separate so SLA export can evolve cleanly",
        "shared pipeline checklist for source path, target, output, and handoff",
      ],
      workflows: [
        {
          id: "filament",
          label: "Filament / FDM",
          summary:
            "Use Orca as the default workbench for Bambu and other filament printers, with plate editing, printer presets, and Bambu Connect handoff.",
          printerClass: "Bambu, farm, and FDM printers",
          delivery:
            "Slice to .3mf or Bambu-ready G-code, then route through direct upload, Companion bridge handoff, or Bambu Connect fallback.",
          acceptedInputs: [".3mf", ".stl", ".step", ".obj", ".amf"],
          activeSlicerId: "orcaslicer",
        },
        {
          id: "resin",
          label: "Resin / SLA",
          summary:
            "Reserve Prusa for resin printers only so supports, exposure presets, and SLA export stay isolated from the filament path.",
          printerClass: "Resin and SLA printers only",
          delivery:
            "Prepare resin-specific jobs and export via the dedicated Prusa resin fork path.",
          acceptedInputs: [".sl1", ".sl1s", ".stl", ".obj", ".3mf"],
          activeSlicerId: "prusaslicer",
        },
      ],
      slicers: [
        {
          id: "orcaslicer",
          label: "Orca Workbench",
          summary:
            "Primary fork target for filament slicing, Bambu-centric presets, and multi-printer FDM preparation inside BambuView.",
          status: "available",
          upstreamName: "OrcaSlicer/OrcaSlicer",
          upstreamUrl: "https://github.com/OrcaSlicer/OrcaSlicer",
          license: "AGPL-3.0",
          workflowKinds: ["filament"],
          defaultFor: ["filament"],
          notes: [
            "Treat Orca as the first-class filament workspace.",
            "Direct Developer Mode send is now wired through the Prepare workspace.",
            "Bambu Connect fallback stays available for desktop import workflows.",
            "Future adapters can still target CLI or native helper surfaces without changing the route.",
          ],
          plannedCapabilities: [
            "plate layout and object transforms",
            "printer and filament preset targeting",
            "slice queue and export tracking",
            "Bambu job handoff and direct upload resolution",
          ],
        },
        {
          id: "prusaslicer",
          label: "Prusa Resin Workbench",
          summary:
            "Secondary fork target reserved for resin-only workflows so SLA tooling does not leak into the filament path.",
          status: "scaffolded",
          upstreamName: "prusa3d/PrusaSlicer",
          upstreamUrl: "https://github.com/prusa3d/PrusaSlicer",
          license: "AGPL-3.0",
          workflowKinds: ["resin"],
          defaultFor: ["resin"],
          notes: [
            "Only surface this workspace for resin workflows.",
            "Do not present Prusa as a filament default inside BambuView.",
            "Resin export and printer targeting stay separate from the Bambu handoff flow.",
          ],
          plannedCapabilities: [
            "resin printer preset routing",
            "support and exposure profile management",
            "resin export staging",
            "future resin queue and validation hooks",
          ],
        },
      ],
      pipeline: [
        {
          id: "import",
          label: "Import Models",
          summary:
            "Bring in raw models and project containers before they are routed into the correct slicer workspace.",
          status: "available",
          slicerIds: ["orcaslicer", "prusaslicer"],
        },
        {
          id: "prepare",
          label: "Prepare Workspace",
          summary:
            "Apply printer presets, plate layout, transforms, and material context inside the workflow-specific slicer shell.",
          status: "available",
          slicerIds: ["orcaslicer", "prusaslicer"],
        },
        {
          id: "slice",
          label: "Slice Jobs",
          summary:
            "Run workflow-aware slicing so filament jobs stay in Orca and resin jobs stay in Prusa.",
          status: "scaffolded",
          slicerIds: ["orcaslicer", "prusaslicer"],
        },
        {
          id: "handoff",
          label: "Export And Send",
          summary:
            "Keep direct upload, Companion bridge send, and Bambu Connect fallback available without mixing resin and filament delivery paths.",
          status: "available",
          slicerIds: ["orcaslicer", "prusaslicer"],
        },
      ],
      handoffActions: [
        {
          id: "bambu-connect-import",
          label: "Bambu Connect import link",
          description:
            "Generate the official Bambu Connect import URL for sliced filament jobs that already exist on the computer running Bambu Connect.",
          availableFor: ["filament"],
          requirement:
            "Requires an absolute local file path for a sliced .3mf or Bambu-ready G-code file.",
        },
        {
          id: "direct-or-bridge-send",
          label: "Direct or bridge send",
          description:
            "Send through direct Developer Mode upload when available, or resolve the same printer through a paired Companion bridge when that is the active route.",
          availableFor: ["filament"],
          requirement:
            "Requires a saved printer target plus either LAN-only Developer Mode or a paired Companion for that serial.",
        },
        {
          id: "resin-export-staging",
          label: "Resin export staging",
          description:
            "Keep resin exports isolated for the future Prusa resin fork instead of forcing them through the Bambu Connect path.",
          availableFor: ["resin"],
          requirement:
            "Resin printer delivery stays in the Prusa resin workspace until a dedicated upload path exists.",
        },
      ],
    };
  }
}

export function createProviders(db: AppDatabase): {
  cameraProvider: CameraProvider;
  printerProvider: PrinterProvider;
  sliceProvider: SliceProvider;
} {
  return {
    cameraProvider: new DatabaseBackedCameraProvider(db),
    printerProvider: new DatabaseBackedPrinterProvider(db),
    sliceProvider: new MockSliceProvider(),
  };
}
