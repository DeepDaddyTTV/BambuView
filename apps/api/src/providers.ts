import type {
  CameraOverview,
  CameraSource,
  FleetOverview,
  PrepareStatus,
  PrinterDetail
} from "@bambuview/contracts";

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
    cameraLabel: "Office Cam",
    previewKind: "bracket",
    serial: "A1A123456789",
    ipAddress: "192.168.1.101",
    firmwareVersion: "01.06.02.00",
    filamentRemaining: "612g",
    filamentUsed: "142g",
    printTimeRemaining: "3h 22m",
    temperatures: [
      { label: "Nozzle", current: "220°C", target: "220°C" },
      { label: "Bed", current: "60°C", target: "60°C" },
      { label: "Chamber", current: "35°C", target: "35°C" }
    ],
    cameraFeeds: [
      { id: "x1c-printer", label: "Printer Cam", kind: "printer" },
      { id: "x1c-ams", label: "AMS Cam", kind: "ams" },
      { id: "x1c-enclosure", label: "Enclosure Cam", kind: "enclosure" },
      { id: "x1c-overview", label: "Studio Overview", kind: "overview" }
    ],
    selectedCameraFeedId: "x1c-printer",
    slots: [
      { slot: "A1", label: "A1", color: "#7ed321", material: "PLA", active: true },
      { slot: "B2", label: "B2", color: "#d3d5d8", material: "PLA", active: false },
      { slot: "C3", label: "C3", color: "#35383d", material: "PLA", active: false },
      { slot: "D4", label: "D4", color: "#f4f5f7", material: "PLA", active: false }
    ]
  },
  {
    id: "p1s-studio",
    shortCode: "P1S",
    name: "P1S - Studio",
    status: "idle",
    statusLabel: "Ready to Print",
    progress: 0,
    layer: "No active print",
    eta: "Ready",
    elapsed: "Idle",
    fileName: "Send a print job to get started.",
    location: "Studio",
    material: "PLA",
    materialColor: "Gray",
    nozzleProfile: "0.20mm",
    cameraLabel: "Workshop Cam",
    previewKind: "benchy",
    serial: "P1S99887766",
    ipAddress: "192.168.1.102",
    firmwareVersion: "01.07.00.00",
    filamentRemaining: "411g",
    filamentUsed: "0g",
    printTimeRemaining: "—",
    temperatures: [
      { label: "Nozzle", current: "31°C", target: "0°C" },
      { label: "Bed", current: "24°C", target: "0°C" },
      { label: "Chamber", current: "27°C", target: "0°C" }
    ],
    cameraFeeds: [
      { id: "p1s-printer", label: "Printer Cam", kind: "printer" },
      { id: "p1s-enclosure", label: "Enclosure Cam", kind: "enclosure" }
    ],
    selectedCameraFeedId: "p1s-printer",
    slots: [
      { slot: "A1", label: "A1", color: "#7ed321", material: "PLA", active: true },
      { slot: "B2", label: "B2", color: "#d3d5d8", material: "PLA", active: false },
      { slot: "C3", label: "C3", color: "#3b82f6", material: "PLA", active: false },
      { slot: "D4", label: "D4", color: "#f59e0b", material: "PLA", active: false }
    ]
  },
  {
    id: "a1-mini-workshop",
    shortCode: "A1",
    name: "A1 Mini - Workshop",
    status: "printing",
    statusLabel: "Printing",
    progress: 30,
    layer: "Layer 128 of 423",
    eta: "ETA 1:03 PM",
    elapsed: "1h 15m",
    fileName: "Flexi_Dino.gcode",
    location: "Workshop",
    material: "PLA",
    materialColor: "Lime Green",
    nozzleProfile: "0.16mm",
    cameraLabel: "Lab Cam",
    previewKind: "dino",
    serial: "A1M11223344",
    ipAddress: "192.168.1.103",
    firmwareVersion: "01.05.04.00",
    filamentRemaining: "329g",
    filamentUsed: "98g",
    printTimeRemaining: "1h 45m",
    temperatures: [
      { label: "Nozzle", current: "215°C", target: "220°C" },
      { label: "Bed", current: "61°C", target: "60°C" },
      { label: "Chamber", current: "32°C", target: "35°C" }
    ],
    cameraFeeds: [
      { id: "a1-printer", label: "Printer Cam", kind: "printer" },
      { id: "a1-overview", label: "Workbench Left", kind: "overview" }
    ],
    selectedCameraFeedId: "a1-printer",
    slots: [
      { slot: "A1", label: "A1", color: "#7ed321", material: "PLA", active: true },
      { slot: "B2", label: "B2", color: "#d0b077", material: "PLA", active: false },
      { slot: "C3", label: "C3", color: "#737883", material: "PLA", active: false },
      { slot: "D4", label: "D4", color: "#272b31", material: "PLA", active: false }
    ]
  },
  {
    id: "x1e-engineering",
    shortCode: "X1E",
    name: "X1E - Engineering",
    status: "paused",
    statusLabel: "User Paused",
    progress: 68,
    layer: "Layer 410 of 800",
    eta: "ETA 3:20 PM",
    elapsed: "1h 32m",
    fileName: "Gear_Housing.gcode",
    location: "Engineering",
    material: "PETG",
    materialColor: "Charcoal",
    nozzleProfile: "0.20mm",
    cameraLabel: "Enclosure Cam",
    previewKind: "housing",
    serial: "X1E55667788",
    ipAddress: "192.168.1.104",
    firmwareVersion: "01.06.08.00",
    filamentRemaining: "256g",
    filamentUsed: "188g",
    printTimeRemaining: "58m",
    temperatures: [
      { label: "Nozzle", current: "242°C", target: "245°C" },
      { label: "Bed", current: "71°C", target: "70°C" },
      { label: "Chamber", current: "39°C", target: "40°C" }
    ],
    cameraFeeds: [
      { id: "x1e-printer", label: "Printer Cam", kind: "printer" },
      { id: "x1e-enclosure", label: "Enclosure Cam", kind: "enclosure" }
    ],
    selectedCameraFeedId: "x1e-printer",
    slots: [
      { slot: "A1", label: "A1", color: "#3a3f46", material: "PETG", active: false },
      { slot: "B2", label: "B2", color: "#eceef0", material: "PETG", active: true },
      { slot: "C3", label: "C3", color: "#35383d", material: "PETG", active: false },
      { slot: "D4", label: "D4", color: "#515661", material: "PETG", active: false }
    ]
  },
  {
    id: "production-farm",
    shortCode: "FARM",
    name: "Production Farm",
    status: "printing",
    statusLabel: "2 Printing",
    progress: 42,
    layer: "4 Printers • 2 Printing",
    eta: "ETA 4:15 PM",
    elapsed: "5h 18m",
    fileName: "Overall Progress",
    location: "Farm",
    material: "Mixed",
    materialColor: "Cluster",
    nozzleProfile: "Multi",
    cameraLabel: "Farm Overview",
    previewKind: "farm",
    serial: "FARM-OVERVIEW",
    ipAddress: "192.168.1.105",
    firmwareVersion: "N/A",
    filamentRemaining: "—",
    filamentUsed: "—",
    printTimeRemaining: "Several active jobs",
    temperatures: [
      { label: "Printers", current: "4", target: "4" },
      { label: "Active", current: "2", target: "2" },
      { label: "Paused", current: "1", target: "0" }
    ],
    cameraFeeds: [
      { id: "farm-overview", label: "Farm Overview", kind: "overview" }
    ],
    selectedCameraFeedId: "farm-overview",
    slots: [
      { slot: "A1", label: "A1", color: "#7ed321", material: "PLA", active: true },
      { slot: "B2", label: "B2", color: "#d3d5d8", material: "PLA", active: false },
      { slot: "C3", label: "C3", color: "#3b82f6", material: "PLA", active: false },
      { slot: "D4", label: "D4", color: "#f59e0b", material: "PLA", active: false }
    ]
  }
];

const cameraSources: CameraSource[] = [
  {
    id: "frigate-studio-a1",
    name: "Frigate Studio A1",
    provider: "frigate",
    streamUrl: "rtsp://placeholder/frigate/studio-a1",
    status: "online",
    assignedTo: ["x1-carbon-office"]
  },
  {
    id: "direct-workshop-cam",
    name: "Workshop RTSP Cam",
    provider: "direct-rtsp",
    streamUrl: "rtsp://placeholder/workshop-cam",
    status: "online",
    assignedTo: ["a1-mini-workshop", "p1s-studio"]
  },
  {
    id: "bambu-x1e",
    name: "Bambu X1E Native Cam",
    provider: "bambu",
    streamUrl: "bambu://x1e-engineering/printer",
    status: "degraded",
    assignedTo: ["x1e-engineering"]
  },
  {
    id: "farm-overview",
    name: "Farm Overview",
    provider: "farm-overview",
    streamUrl: "rtsp://placeholder/farm-overview",
    status: "online",
    assignedTo: ["production-farm"]
  }
];

const printerById = new Map(printers.map((printer) => [printer.id, printer]));

class MockPrinterProvider implements PrinterProvider {
  async getFleetOverview(): Promise<FleetOverview> {
    return {
      stats: {
        printers: 7,
        activePrints: 4,
        completedToday: 23,
        farmGroups: 1
      },
      printers,
      selectedPrinterId: "x1-carbon-office",
      selectedPrinter: printers[0]
    };
  }

  async getPrinterDetail(printerId: string): Promise<PrinterDetail | null> {
    return printerById.get(printerId) ?? null;
  }
}

class MockCameraProvider implements CameraProvider {
  async getOverview(): Promise<CameraOverview> {
    return {
      sources: cameraSources,
      assignments: printers.map((printer) => ({
        printerId: printer.id,
        printerName: printer.name,
        feedId: printer.selectedCameraFeedId,
        feedLabel: printer.cameraLabel
      }))
    };
  }
}

class MockSliceProvider implements SliceProvider {
  async getStatus(): Promise<PrepareStatus> {
    return {
      status: "planned",
      headline: "Prepare & Slice is staged for the Orca/Prusa-derived workspace.",
      description:
        "The first release reserves this route and its data contract so file import, editing, and slicing can land without reshaping the rest of the app shell.",
      capabilities: [
        "3mf upload staging",
        "job queue planning",
        "printer profile targeting",
        "future remote slice submission"
      ]
    };
  }
}

export function createProviders(): {
  cameraProvider: CameraProvider;
  printerProvider: PrinterProvider;
  sliceProvider: SliceProvider;
} {
  return {
    cameraProvider: new MockCameraProvider(),
    printerProvider: new MockPrinterProvider(),
    sliceProvider: new MockSliceProvider()
  };
}
