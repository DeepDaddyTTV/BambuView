import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, vi } from "vitest";

import { PreparePage } from "./prepare-page";

afterEach(() => {
  vi.restoreAllMocks();
});

function prepareStatusPayload() {
  return {
    capabilities: [
      "printer-aware Orca filament lane with real Bambu target selection",
      "direct Developer Mode send and start-print handoff from the workspace",
    ],
    description:
      "The Prepare & Slice workspace now routes real printer targets and handoff behavior.",
    handoffActions: [
      {
        availableFor: ["filament"],
        description: "Fallback desktop handoff",
        id: "bambu-connect-import",
        label: "Bambu Connect import link",
        requirement: "Needs a sliced file path",
      },
    ],
    headline: "Prepare around Orca for filament and Prusa for resin.",
    pipeline: [
      {
        id: "import",
        label: "Import Models",
        slicerIds: ["orcaslicer", "prusaslicer"],
        status: "available",
        summary: "Load models first.",
      },
    ],
    slicers: [
      {
        defaultFor: ["filament"],
        id: "orcaslicer",
        label: "Orca Workbench",
        license: "AGPL-3.0",
        notes: ["Orca handles filament work."],
        plannedCapabilities: ["plate layout"],
        status: "available",
        summary: "Primary filament slicer.",
        upstreamName: "OrcaSlicer/OrcaSlicer",
        upstreamUrl: "https://github.com/OrcaSlicer/OrcaSlicer",
        workflowKinds: ["filament"],
      },
      {
        defaultFor: ["resin"],
        id: "prusaslicer",
        label: "Prusa Resin Workbench",
        license: "AGPL-3.0",
        notes: ["Prusa handles resin."],
        plannedCapabilities: ["resin export"],
        status: "scaffolded",
        summary: "Resin-only lane.",
        upstreamName: "prusa3d/PrusaSlicer",
        upstreamUrl: "https://github.com/prusa3d/PrusaSlicer",
        workflowKinds: ["resin"],
      },
    ],
    status: "available",
    workflows: [
      {
        acceptedInputs: [".3mf", ".stl"],
        activeSlicerId: "orcaslicer",
        delivery: "Route through direct upload, Companion, or Connect.",
        id: "filament",
        label: "Filament / FDM",
        printerClass: "Bambu and FDM printers",
        summary: "Use Orca for filament jobs.",
      },
      {
        acceptedInputs: [".sl1", ".stl"],
        activeSlicerId: "prusaslicer",
        delivery: "Keep resin in the Prusa lane.",
        id: "resin",
        label: "Resin / SLA",
        printerClass: "Resin printers",
        summary: "Use Prusa for resin jobs.",
      },
    ],
    workspace: {
      activeProjectId: null,
      projects: [],
      rootDirectory: "/workspace",
    },
  };
}

function renderPreparePage() {
  const client = new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        retry: false,
      },
    },
  });

  render(
    <QueryClientProvider client={client}>
      <PreparePage />
    </QueryClientProvider>,
  );
}

it("shows the empty printer guidance when no printers have been added", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/api/prepare/status")) {
      return new Response(JSON.stringify(prepareStatusPayload()), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/api/printers/connections")) {
      return new Response(JSON.stringify({ printers: [] }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unhandled request: ${url}`);
  });

  renderPreparePage();

  expect(
    await screen.findByRole("heading", {
      name: "Prepare around Orca for filament and Prusa for resin.",
    }),
  ).toBeInTheDocument();
  expect(screen.getByText("No printer target selected")).toBeInTheDocument();
});

it("sends a developer-mode job through the printer file endpoint", async () => {
  let requestBody: Record<string, unknown> | null = null;

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.endsWith("/api/prepare/status")) {
      return new Response(JSON.stringify(prepareStatusPayload()), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/api/printers/connections")) {
      return new Response(
        JSON.stringify({
          printers: [
            {
              accessCodeSet: true,
              connectionMode: "developer",
              connectionStatus: "online",
              createdAt: "2026-07-07T00:00:00.000Z",
              host: "printer.local",
              id: "dev-printer-1",
              lastSeenAt: null,
              lastTestedAt: null,
              model: "P1S",
              name: "The Forge",
              provider: "bambu-lan",
              serial: "SERIAL-123",
              updatedAt: "2026-07-07T00:00:00.000Z",
            },
          ],
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (
      url.endsWith("/api/printers/dev-printer-1/files") &&
      method === "POST"
    ) {
      requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      return new Response(
        JSON.stringify({
          accepted: true,
          detail: "Direct upload queued for The Forge.",
          fileName: "drone_arm_v3.gcode.3mf",
          mode: "developer",
          sizeBytes: 1200,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    throw new Error(`Unhandled request: ${method} ${url}`);
  });

  renderPreparePage();
  const user = userEvent.setup();

  await screen.findByRole("heading", {
    name: "Prepare around Orca for filament and Prusa for resin.",
  });

  await user.type(
    screen.getByLabelText("Source model or project path"),
    "/workspace/jobs/drone_arm_v3.3mf",
  );
  await user.type(
    screen.getByLabelText("Output handoff path"),
    "/workspace/exports/drone_arm_v3.gcode.3mf",
  );

  await user.click(screen.getByRole("button", { name: "Send To Printer" }));

  await screen.findByText("Direct upload queued for The Forge.");
  expect(requestBody).toMatchObject({
    action: "send",
    fileName: "drone_arm_v3.gcode.3mf",
    path: "/workspace/exports/drone_arm_v3.gcode.3mf",
    startPrint: true,
  });
});

it("generates a Bambu Connect fallback link for staged cloud printers", async () => {
  let requestBody: Record<string, unknown> | null = null;

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.endsWith("/api/prepare/status")) {
      return new Response(JSON.stringify(prepareStatusPayload()), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/api/printers/connections")) {
      return new Response(
        JSON.stringify({
          printers: [
            {
              accessCodeSet: false,
              connectionMode: "bambu-connect",
              connectionStatus: "unverified",
              createdAt: "2026-07-07T00:00:00.000Z",
              host: "printer.local",
              id: "connect-printer-1",
              lastSeenAt: null,
              lastTestedAt: null,
              model: "X1 Carbon",
              name: "Studio X1C",
              provider: "bambu-lan",
              serial: "SERIAL-456",
              updatedAt: "2026-07-07T00:00:00.000Z",
            },
          ],
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (url.endsWith("/api/bambu-connect/import-url") && method === "POST") {
      requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      return new Response(
        JSON.stringify({
          importUrl: {
            name: "Drone Arm",
            path: "/workspace/exports/drone_arm_v3.gcode.3mf",
            url: "bambu-connect://import-file?path=%2Fworkspace%2Fexports%2Fdrone_arm_v3.gcode.3mf&name=Drone%20Arm",
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    throw new Error(`Unhandled request: ${method} ${url}`);
  });

  renderPreparePage();
  const user = userEvent.setup();

  await screen.findByRole("heading", {
    name: "Prepare around Orca for filament and Prusa for resin.",
  });

  await user.type(screen.getByLabelText("Job name"), "Drone Arm");
  await user.type(
    screen.getByLabelText("Output handoff path"),
    "/workspace/exports/drone_arm_v3.gcode.3mf",
  );
  await user.click(
    screen.getByRole("button", { name: "Generate Bambu Connect Link" }),
  );

  await waitFor(() => {
    expect(requestBody).toMatchObject({
      name: "Drone Arm",
      path: "/workspace/exports/drone_arm_v3.gcode.3mf",
    });
  });
  expect(
    screen.getByText(/bambu-connect:\/\/import-file\?path=/i),
  ).toBeInTheDocument();
});
