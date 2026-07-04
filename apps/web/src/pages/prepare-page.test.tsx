import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, vi } from "vitest";

import { PreparePage } from "./prepare-page";

afterEach(() => {
  vi.restoreAllMocks();
});

it("renders Orca as the filament workbench and switches to the resin lane", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        status: "scaffolded",
        headline: "Build around Orca for filament and Prusa for resin.",
        description: "Real fork-aware prepare workspace.",
        capabilities: ["Orca filament workbench", "Prusa resin lane"],
        workflows: [
          {
            id: "filament",
            label: "Filament / FDM",
            summary: "Use Orca for filament jobs.",
            printerClass: "Bambu and FDM printers",
            delivery: "Slice and hand off through Bambu Connect.",
            acceptedInputs: [".3mf", ".stl"],
            activeSlicerId: "orcaslicer",
          },
          {
            id: "resin",
            label: "Resin / SLA",
            summary: "Use Prusa for resin jobs.",
            printerClass: "Resin printers",
            delivery: "Export through the Prusa resin lane.",
            acceptedInputs: [".sl1", ".stl"],
            activeSlicerId: "prusaslicer",
          },
        ],
        slicers: [
          {
            id: "orcaslicer",
            label: "Orca Workbench",
            summary: "Primary filament slicer.",
            status: "scaffolded",
            upstreamName: "OrcaSlicer/OrcaSlicer",
            upstreamUrl: "https://github.com/OrcaSlicer/OrcaSlicer",
            license: "AGPL-3.0",
            workflowKinds: ["filament"],
            defaultFor: ["filament"],
            notes: ["Keep Orca on filament."],
            plannedCapabilities: ["plate layout"],
          },
          {
            id: "prusaslicer",
            label: "Prusa Resin Workbench",
            summary: "Resin-only lane.",
            status: "scaffolded",
            upstreamName: "prusa3d/PrusaSlicer",
            upstreamUrl: "https://github.com/prusa3d/PrusaSlicer",
            license: "AGPL-3.0",
            workflowKinds: ["resin"],
            defaultFor: ["resin"],
            notes: ["Keep Prusa on resin."],
            plannedCapabilities: ["resin export"],
          },
        ],
        pipeline: [
          {
            id: "import",
            label: "Import Models",
            summary: "Bring models into the right lane.",
            status: "scaffolded",
            slicerIds: ["orcaslicer", "prusaslicer"],
          },
        ],
        handoffActions: [
          {
            id: "bambu-connect-import",
            label: "Bambu Connect import link",
            description: "Filament handoff",
            availableFor: ["filament"],
            requirement: "Needs a sliced file",
          },
          {
            id: "resin-export-staging",
            label: "Resin export staging",
            description: "Resin delivery",
            availableFor: ["resin"],
            requirement: "Resin only",
          },
        ],
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    ),
  );

  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={client}>
      <PreparePage />
    </QueryClientProvider>,
  );

  expect(
    await screen.findByRole("heading", {
      name: "Build around Orca for filament and Prusa for resin.",
    }),
  ).toBeInTheDocument();
  expect(screen.getByText("Orca Workbench")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Generate Bambu Connect Link" }),
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Resin / SLA" }));

  expect(await screen.findAllByText("Prusa resin lane")).not.toHaveLength(0);
  expect(
    screen.queryByRole("button", { name: "Generate Bambu Connect Link" }),
  ).not.toBeInTheDocument();
});
