import type {
  CameraOverview,
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
  listPrinterConnectionSecrets,
  type AppDatabase,
  type PrinterConnectionSecretRecord,
  updatePrinterConnectionStatus,
} from "./db.js";
import {
  fetchBambuMqttReport,
  parseBambuTelemetry,
  type BambuPrinterTelemetry,
} from "./bambu.js";

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
): string {
  if (connection.connectionMode === "bambu-connect") {
    return "Bambu Connect handles authorized camera, monitoring, controls, and sliced-file handoff.";
  }

  if (connection.connectionMode === "cloud") {
    return "Cloud / Normal keeps the printer in Bambu's normal account workflow and uses Bambu Connect for secure job handoff.";
  }

  if (connection.connectionMode === "developer") {
    return "Developer Mode uses direct local MQTT, camera stream, and machine-control protocols.";
  }

  return "LAN Mode uses local MQTT for status telemetry and Bambu Connect for restricted commands.";
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
): PrinterDetail {
  const isReachable = connection.connectionStatus === "online";
  const isCloudMode = connection.connectionMode === "cloud";
  const isBambuConnectMode = connection.connectionMode === "bambu-connect";
  const modeLabel = modeLabelForConnection(connection);
  const integrationCopy = integrationCopyForConnection(connection);
  const status = telemetry?.printStatus ?? (isReachable ? "idle" : "offline");
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
    status: isCloudMode || isBambuConnectMode ? "idle" : status,
    statusLabel: telemetry
      ? telemetry.statusLabel
      : isReachable
        ? `${modeLabel} Ready`
        : isBambuConnectMode
          ? "Bambu Connect Ready"
          : isCloudMode
            ? "Cloud / Normal Ready"
            : "Offline",
    progress: telemetry?.progress ?? 0,
    layer: telemetry
      ? layerLabel(telemetry)
      : isReachable
        ? `Connected through Bambu ${modeLabel}`
        : modeLabel,
    eta: telemetry
      ? formatEta(telemetry.remainingMinutes)
      : isReachable
        ? "Ready"
        : isBambuConnectMode || isCloudMode
          ? "Ready"
          : "Offline",
    elapsed: telemetry
      ? formatMinutes(telemetry.elapsedMinutes)
      : isReachable
        ? "Idle"
        : isBambuConnectMode
          ? "Bridge"
          : isCloudMode
            ? "Cloud"
            : "No heartbeat",
    fileName:
      telemetry?.fileName ??
      (isReachable ? "Waiting for live telemetry." : integrationCopy),
    location: modeLabel,
    material: slots[0]?.material ?? "PLA",
    materialColor: slots[0]?.colorName ?? "Unknown",
    nozzleProfile: "Printer profile pending",
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
    { expiresAt: number; telemetry: BambuPrinterTelemetry | null }
  >();

  constructor(private readonly db: AppDatabase) {}

  private async telemetryForConnection(
    connection: PrinterConnectionSecretRecord,
  ): Promise<BambuPrinterTelemetry | null> {
    if (!isRawLanConnection(connection) || !connection.accessCode) {
      return null;
    }

    const cached = this.telemetryCache.get(connection.id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.telemetry;
    }

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
      this.telemetryCache.set(connection.id, {
        expiresAt: Date.now() + TELEMETRY_CACHE_MS,
        telemetry,
      });

      return telemetry;
    } catch {
      await updatePrinterConnectionStatus(
        this.db,
        connection.id,
        "offline",
        null,
      );
      this.telemetryCache.set(connection.id, {
        expiresAt: Date.now() + TELEMETRY_CACHE_MS,
        telemetry: null,
      });

      return null;
    }
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
    const [connections, feedsByPrinter] = await Promise.all([
      listPrinterConnectionSecrets(this.db),
      this.cameraFeedsByPrinter(),
    ]);

    return Promise.all(
      connections.map(async (connection) =>
        detailForConnection(
          connection,
          await this.telemetryForConnection(connection),
          feedsByPrinter.get(connection.id) ?? [],
        ),
      ),
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
      status: "planned",
      headline: "Prepare files and hand them to Bambu Connect.",
      description:
        "BambuView can generate Bambu Connect import links for sliced Bambu G-code and 3MF files today. The in-browser editor remains the reserved workspace for future model editing and slicing.",
      capabilities: [
        "Bambu Connect import-file URL generation",
        "Secure handoff to Bambu's authorized print flow",
        "3mf upload planning",
        "job queue planning",
        "printer profile targeting",
        "remote slice submission planning",
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
