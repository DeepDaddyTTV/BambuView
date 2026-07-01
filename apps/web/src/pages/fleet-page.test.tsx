import { render, screen } from "@testing-library/react";

import type { PrinterDetail } from "@bambuview/contracts";

import { CameraFeedFrame } from "./fleet-page";

const printer: PrinterDetail = {
  cameraFeeds: [],
  cameraLabel: "Printer Cam",
  elapsed: "Idle",
  eta: "Ready",
  filamentRemaining: "500g",
  filamentUsed: "0g",
  fileName: "Ready",
  firmwareVersion: "01.00.00.00",
  id: "printer-1",
  ipAddress: "printer.local",
  layer: "Ready",
  location: "Lab",
  material: "PLA",
  materialColor: "Green",
  name: "Test Printer",
  nozzleProfile: "0.4mm",
  previewKind: "benchy",
  printTimeRemaining: "0m",
  progress: 0,
  selectedCameraFeedId: "",
  serial: "SERIAL-001",
  shortCode: "T1",
  slots: [
    {
      active: true,
      color: "#7ed321",
      label: "A1",
      material: "PLA",
      slot: "A1",
    },
  ],
  status: "idle",
  statusLabel: "Idle",
  temperatures: [
    {
      current: "25°C",
      label: "Nozzle",
      target: "0°C",
    },
  ],
};

it("shows the no-camera fallback copy", () => {
  render(
    <CameraFeedFrame
      feed={null}
      printer={printer}
    />,
  );

  expect(screen.getByText("No Camera Detected")).toBeInTheDocument();
  expect(
    screen.getByText("If this is in error, configure cameras in Cameras."),
  ).toBeInTheDocument();
});
