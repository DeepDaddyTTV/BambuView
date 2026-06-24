import type {
  CameraOverview,
  CameraSource,
  FleetOverview,
  PrepareStatus,
  PrinterConnectionRecord,
  PrinterDetail,
} from "@bambuview/contracts";

import { listPrinterConnections, type AppDatabase } from "./db.js";

export interface PrinterProvider {
  getFleetOverview(): Promise<FleetOverview>;
  getPrinterDetail(printerId: string): Promise<PrinterDetail | null>;
}

export interface CameraProvider {
  getOverview(): Promise<CameraOverview>;
}

export interface SliceProvider {
  getStatus(): Promise<PrepareStatus>;
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
      { id: "x1c-printer", label: "Printer Cam", kind: "printer" },
      { id: "x1c-ams", label: "AMS Cam", kind: "ams" },
      { id: "x1c-enclosure", label: "Enclosure Cam", kind: "enclosure" },
      { id: "x1c-overview", label: "Studio Overview", kind: "overview" },
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
      { id: "p1s-printer", label: "Printer Cam", kind: "printer" },
      { id: "p1s-ams", label: "AMS Cam", kind: "ams" },
      { id: "p1s-enclosure", label: "Enclosure Cam", kind: "enclosure" },
      { id: "p1s-overview", label: "Studio Overview", kind: "overview" },
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
      { id: "a1-printer", label: "Printer Cam", kind: "printer" },
      { id: "a1-ams", label: "AMS Cam", kind: "ams" },
      { id: "a1-enclosure", label: "Enclosure Cam", kind: "enclosure" },
      { id: "a1-overview", label: "Studio Overview", kind: "overview" },
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
      { id: "x1e-printer", label: "Printer Cam", kind: "printer" },
      { id: "x1e-ams", label: "AMS Cam", kind: "ams" },
      { id: "x1e-enclosure", label: "Enclosure Cam", kind: "enclosure" },
      { id: "x1e-overview", label: "Studio Overview", kind: "overview" },
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
      { id: "p1p-printer", label: "Printer Cam", kind: "printer" },
      { id: "p1p-ams", label: "AMS Cam", kind: "ams" },
      { id: "p1p-enclosure", label: "Enclosure Cam", kind: "enclosure" },
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
      { id: "farm-overview", label: "Studio Overview", kind: "overview" },
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

const cameraSources: CameraSource[] = [
  {
    id: "frigate-x1-office",
    name: "Frigate X1 Office",
    provider: "frigate",
    streamUrl: "rtsp://placeholder/frigate/x1-office",
    status: "online",
    assignedTo: ["x1-carbon-office"],
  },
  {
    id: "direct-workshop-cam",
    name: "Workshop RTSP Cam",
    provider: "direct-rtsp",
    streamUrl: "rtsp://placeholder/workshop-cam",
    status: "online",
    assignedTo: ["p1s-studio", "a1-mini-workshop"],
  },
  {
    id: "bambu-x1e",
    name: "Bambu X1E Native Cam",
    provider: "bambu",
    streamUrl: "bambu://x1e-engineering/printer",
    status: "degraded",
    assignedTo: ["x1e-engineering", "p1p-break-room"],
  },
  {
    id: "farm-overview",
    name: "Farm Overview",
    provider: "farm-overview",
    streamUrl: "rtsp://placeholder/farm-overview",
    status: "online",
    assignedTo: ["production-farm"],
  },
];

const printerById = new Map(printers.map((printer) => [printer.id, printer]));

function shortCodeForConnection(connection: PrinterConnectionRecord): string {
  const model = connection.model.toUpperCase();
  if (model.includes("X1C")) return "X1C";
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
  if (model.includes("A1")) return "dino";
  if (model.includes("P1")) return "benchy";

  return "bracket";
}

function detailForConnection(
  connection: PrinterConnectionRecord,
): PrinterDetail {
  const isReachable = connection.connectionStatus === "online";

  return {
    id: connection.id,
    shortCode: shortCodeForConnection(connection),
    name: connection.name,
    status: isReachable ? "idle" : "offline",
    statusLabel: isReachable ? "LAN Ready" : "Offline",
    progress: 0,
    layer: isReachable
      ? "Connected through Bambu LAN"
      : "Awaiting printer connection",
    eta: isReachable ? "Ready" : "Offline",
    elapsed: isReachable ? "Idle" : "No heartbeat",
    fileName: isReachable
      ? "Waiting for live telemetry."
      : "Check LAN mode, host, and power.",
    location: "Bambu LAN",
    material: "PLA",
    materialColor: "Unknown",
    nozzleProfile: "Printer profile pending",
    cameraLabel: "Bambu Native Cam",
    previewKind: previewKindForConnection(connection),
    serial: connection.serial,
    ipAddress: connection.host,
    firmwareVersion: "Pending live query",
    filamentRemaining: "Pending",
    filamentUsed: "0g",
    printTimeRemaining: "—",
    temperatures: [
      { label: "Nozzle", current: "—", target: "—" },
      { label: "Bed", current: "—", target: "—" },
      { label: "Chamber", current: "—", target: "—" },
    ],
    cameraFeeds: [
      {
        id: `${connection.id}-bambu-printer`,
        label: "Printer Cam",
        kind: "printer",
      },
      {
        id: `${connection.id}-bambu-overview`,
        label: "Studio Overview",
        kind: "overview",
      },
    ],
    selectedCameraFeedId: `${connection.id}-bambu-printer`,
    slots: [
      {
        slot: "A1",
        label: "A1",
        color: "#66d139",
        colorName: "Pending",
        material: "PLA",
        active: true,
      },
      {
        slot: "B2",
        label: "B2",
        color: "#b8babd",
        colorName: "Pending",
        material: "PLA",
        active: false,
      },
      {
        slot: "C3",
        label: "C3",
        color: "#36393f",
        colorName: "Pending",
        material: "PLA",
        active: false,
      },
      {
        slot: "D4",
        label: "D4",
        color: "#f6f7f8",
        colorName: "Pending",
        material: "PLA",
        active: false,
      },
    ],
  };
}

class DatabaseBackedPrinterProvider implements PrinterProvider {
  constructor(private readonly db: AppDatabase) {}

  private async getStoredPrinterDetails(): Promise<PrinterDetail[]> {
    const connections = await listPrinterConnections(this.db);

    return connections.map(detailForConnection);
  }

  async getFleetOverview(): Promise<FleetOverview> {
    const storedPrinters = await this.getStoredPrinterDetails();
    const allPrinters = [...storedPrinters, ...printers];
    const selectedPrinter = storedPrinters[0] ?? printers[0];

    return {
      stats: {
        printers: 7 + storedPrinters.length,
        activePrints: allPrinters.filter(
          (printer) => printer.status === "printing",
        ).length,
        completedToday: 23,
        farmGroups: 1,
      },
      printers: allPrinters,
      selectedPrinterId: selectedPrinter.id,
      selectedPrinter,
    };
  }

  async getPrinterDetail(printerId: string): Promise<PrinterDetail | null> {
    const stored = (await this.getStoredPrinterDetails()).find(
      (printer) => printer.id === printerId,
    );

    if (stored) {
      return stored;
    }

    return printerById.get(printerId) ?? null;
  }
}

class DatabaseBackedCameraProvider implements CameraProvider {
  constructor(private readonly db: AppDatabase) {}

  async getOverview(): Promise<CameraOverview> {
    const connections = await listPrinterConnections(this.db);
    const storedSources: CameraSource[] = connections.map((connection) => ({
      id: `${connection.id}-bambu-printer`,
      name: `${connection.name} Native Cam`,
      provider: "bambu",
      streamUrl: `bambu://${connection.id}/printer-cam`,
      status: connection.connectionStatus === "online" ? "degraded" : "offline",
      assignedTo: [connection.id],
    }));
    const storedAssignments = connections.map((connection) => ({
      printerId: connection.id,
      printerName: connection.name,
      feedId: `${connection.id}-bambu-printer`,
      feedLabel: "Printer Cam",
    }));

    return {
      sources: [...storedSources, ...cameraSources],
      assignments: [
        ...storedAssignments,
        ...printers.map((printer) => ({
          printerId: printer.id,
          printerName: printer.name,
          feedId: printer.selectedCameraFeedId,
          feedLabel: printer.cameraLabel,
        })),
      ],
    };
  }
}

class MockSliceProvider implements SliceProvider {
  async getStatus(): Promise<PrepareStatus> {
    return {
      status: "planned",
      headline:
        "Prepare & Slice is staged for the Orca/Prusa-derived workspace.",
      description:
        "The first release reserves this route and its data contract so file import, editing, and slicing can land without reshaping the rest of the app shell.",
      capabilities: [
        "3mf upload staging",
        "job queue planning",
        "printer profile targeting",
        "future remote slice submission",
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
