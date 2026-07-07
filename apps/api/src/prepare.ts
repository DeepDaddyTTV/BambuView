import { existsSync, statSync } from "node:fs";
import path from "node:path";

import type {
  PrepareProjectRecord,
  PrepareStatus,
  PrepareWorkspace,
  PrepareWorkspaceStatus,
} from "@bambuview/contracts";

import type { AppDatabase, PrepareProjectRow } from "./db.js";
import { listPrepareProjects } from "./db.js";

function prepareRootDirectory(): string {
  const configured = process.env.PREPARE_WORKSPACE_ROOT?.trim();
  if (configured) {
    return configured;
  }

  return path.resolve(process.cwd(), "workspace");
}

function fileInfo(filePath: string): {
  exists: boolean;
  sizeBytes: number | null;
} {
  const trimmed = filePath.trim();
  if (!trimmed || !existsSync(trimmed)) {
    return { exists: false, sizeBytes: null };
  }

  try {
    const stats = statSync(trimmed);
    return {
      exists: stats.isFile(),
      sizeBytes: stats.isFile() ? stats.size : null,
    };
  } catch {
    return { exists: false, sizeBytes: null };
  }
}

function validationMessages(row: PrepareProjectRow): string[] {
  const source = fileInfo(row.sourcePath);
  const output = fileInfo(row.outputPath);
  const messages: string[] = [];

  if (!row.jobName.trim()) {
    messages.push("Add a job name before routing this project.");
  }
  if (!row.sourcePath.trim()) {
    messages.push("Select the source model or project path.");
  } else if (!source.exists) {
    messages.push(
      "The source path is not available where BambuView is running.",
    );
  }
  if (!row.outputPath.trim()) {
    messages.push(
      "Choose the output path for the sliced export or handoff file.",
    );
  }
  if (row.workflowId === "filament" && !row.printerId) {
    messages.push("Pick a printer target for this filament project.");
  }
  if (!output.exists && row.workflowId === "resin") {
    messages.push(
      "Resin exports stay staged until the SLA output file exists.",
    );
  }

  return messages;
}

function summarizeProject(
  row: PrepareProjectRow,
  sourceExists: boolean,
  outputExists: boolean,
  messages: string[],
): { state: PrepareProjectRecord["state"]; summary: string } {
  const actionLabel = row.lastActionLabel?.trim() ?? "";

  if (outputExists && actionLabel.toLowerCase().includes("sent")) {
    return {
      state: "sent",
      summary:
        "A sliced artifact exists and this project has already been routed.",
    };
  }

  if (outputExists) {
    return {
      state: "sliced",
      summary:
        "The sliced output already exists and is ready for upload or handoff.",
    };
  }

  if (messages.length === 0 && sourceExists) {
    return {
      state: "ready",
      summary:
        "The source, target, and export path are ready for the next handoff.",
    };
  }

  if (row.sourcePath.trim() || row.outputPath.trim() || row.notes.trim()) {
    return {
      state: "warning",
      summary:
        "This project is saved, but it still needs at least one setup step.",
    };
  }

  return {
    state: "draft",
    summary: "Draft workspace waiting for a source file and routing details.",
  };
}

function mapPrepareProject(row: PrepareProjectRow): PrepareProjectRecord {
  const source = fileInfo(row.sourcePath);
  const output = fileInfo(row.outputPath);
  const messages = validationMessages(row);
  const summary = summarizeProject(row, source.exists, output.exists, messages);

  return {
    createdAt: row.createdAt,
    fileName:
      path.basename((output.exists ? row.outputPath : row.sourcePath).trim()) ||
      null,
    id: row.id,
    inputType: row.inputType,
    jobName: row.jobName,
    lastActionAt: row.lastActionAt,
    lastActionLabel: row.lastActionLabel,
    layerProfile: row.layerProfile,
    materialProfile: row.materialProfile,
    notes: row.notes,
    outputExists: output.exists,
    outputPath: row.outputPath,
    printerId: row.printerId,
    sizeBytes: output.sizeBytes ?? source.sizeBytes,
    sourceExists: source.exists,
    sourcePath: row.sourcePath,
    state: summary.state,
    summary: summary.summary,
    updatedAt: row.updatedAt,
    validationMessages: messages,
    workflowId: row.workflowId,
  };
}

export async function listPrepareProjectRecords(
  db: AppDatabase,
): Promise<PrepareProjectRecord[]> {
  const rows = await listPrepareProjects(db);
  return rows.map(mapPrepareProject);
}

export async function buildPrepareWorkspace(
  db: AppDatabase,
): Promise<PrepareWorkspace> {
  const projects = await listPrepareProjectRecords(db);
  return {
    activeProjectId: projects[0]?.id ?? null,
    projects,
    rootDirectory: prepareRootDirectory(),
  };
}

export async function buildPrepareStatus(
  db: AppDatabase,
): Promise<PrepareStatus> {
  const workspace = await buildPrepareWorkspace(db);
  const hasProjects = workspace.projects.length > 0;
  const status: PrepareWorkspaceStatus = hasProjects
    ? "available"
    : "scaffolded";

  return {
    status,
    headline: "Prepare around Orca for filament and Prusa for resin.",
    description:
      "The Prepare & Slice workspace now stores real project rows, validates source and output paths where BambuView is running, and keeps direct send, Companion handoff, and Bambu Connect routing in one fork-aware flow.",
    capabilities: [
      "saved project workbench for Orca-derived filament and Prusa-derived resin jobs",
      "real source and output path validation on the machine running BambuView",
      "persisted printer targets, presets, notes, and last handoff history",
      "direct upload, Companion bridge send, and Bambu Connect fallback from the same workspace",
      "resin projects stay isolated from the filament lane while export support grows",
      "project shelf with ready, sliced, sent, and warning states",
    ],
    workflows: [
      {
        id: "filament",
        label: "Filament / FDM",
        summary:
          "Use Orca as the default workbench for Bambu and other filament printers, then route exports through direct upload, Companion, or Bambu Connect.",
        printerClass: "Bambu, farm, and FDM printers",
        delivery:
          "Keep the Orca-style filament lane focused on saved projects, sliced artifacts, and printer-bound send flows.",
        acceptedInputs: [".3mf", ".stl", ".step", ".obj", ".amf"],
        activeSlicerId: "orcaslicer",
      },
      {
        id: "resin",
        label: "Resin / SLA",
        summary:
          "Reserve Prusa for resin-only projects so supports, exposure presets, and SLA exports stay separate from the filament workflow.",
        printerClass: "Resin and SLA printers only",
        delivery:
          "Keep resin jobs staged and validated in their own project shelf until the dedicated resin export is ready.",
        acceptedInputs: [".sl1", ".sl1s", ".stl", ".obj", ".3mf"],
        activeSlicerId: "prusaslicer",
      },
    ],
    slicers: [
      {
        id: "orcaslicer",
        label: "Orca Workbench",
        summary:
          "Primary filament workbench for saved projects, sliced export validation, and Bambu printer routing inside BambuView.",
        status: "available",
        upstreamName: "OrcaSlicer/OrcaSlicer",
        upstreamUrl: "https://github.com/OrcaSlicer/OrcaSlicer",
        license: "AGPL-3.0",
        workflowKinds: ["filament"],
        defaultFor: ["filament"],
        notes: [
          "The BambuView workbench now persists real project rows instead of only ephemeral routing form state.",
          "Filament projects can keep source paths, export paths, and target printers together in one shelf.",
          "Direct upload, Companion handoff, and Bambu Connect fallback stay available from the same project.",
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
          "Secondary resin workbench for staged resin projects, export tracking, and resin-only queue planning.",
        status: "available",
        upstreamName: "prusa3d/PrusaSlicer",
        upstreamUrl: "https://github.com/prusa3d/PrusaSlicer",
        license: "AGPL-3.0",
        workflowKinds: ["resin"],
        defaultFor: ["resin"],
        notes: [
          "Resin projects now persist in the same workspace instead of living as placeholder copy.",
          "Keep SLA jobs isolated from the Bambu filament send path.",
          "The workbench validates whether the staged resin export file actually exists before handoff.",
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
          "Bring in raw models and project containers, then save them into the persisted BambuView workbench.",
        status: "available",
        slicerIds: ["orcaslicer", "prusaslicer"],
      },
      {
        id: "prepare",
        label: "Prepare Workspace",
        summary:
          "Store printer targets, layer presets, materials, notes, and output destinations in reusable project rows.",
        status: "available",
        slicerIds: ["orcaslicer", "prusaslicer"],
      },
      {
        id: "slice",
        label: "Track Exports",
        summary:
          "Validate whether the sliced output already exists and keep that state visible before any send or handoff attempt.",
        status: "available",
        slicerIds: ["orcaslicer", "prusaslicer"],
      },
      {
        id: "handoff",
        label: "Export And Send",
        summary:
          "Route saved projects through direct upload, Companion, or Bambu Connect without leaving the workbench.",
        status: "available",
        slicerIds: ["orcaslicer", "prusaslicer"],
      },
    ],
    handoffActions: [
      {
        id: "workspace-projects",
        label: "Save project row",
        description:
          "Persist the source path, output path, target printer, and preset choices in the BambuView workbench so the job can be resumed later.",
        availableFor: ["filament", "resin"],
        requirement:
          "Requires a project name plus at least a source or output path.",
      },
      {
        id: "direct-or-bridge-send",
        label: "Direct or bridge send",
        description:
          "Route a saved filament project through direct local upload when available, or through a paired Companion or Bambu Connect handoff when that is the active path.",
        availableFor: ["filament"],
        requirement:
          "Requires a saved filament project with a valid export path and printer target.",
      },
      {
        id: "resin-export-staging",
        label: "Resin export staging",
        description:
          "Keep resin projects validated and staged without forcing them through the Bambu filament delivery path.",
        availableFor: ["resin"],
        requirement:
          "Requires a resin project row and a staged resin export path.",
      },
    ],
    workspace,
  };
}
