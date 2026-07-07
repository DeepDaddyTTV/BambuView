import {
  Blocks,
  CheckCircle2,
  ExternalLink,
  FileUp,
  FlaskConical,
  HardDriveDownload,
  Layers3,
  Rocket,
  RotateCcw,
  Send,
  Trash2,
  Workflow,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  BambuConnectImportResponse,
  BambuConnectionMode,
  PrepareProjectRecord,
  PrepareStatus,
  PrepareWorkflowKind,
  PrinterConnectionRecord,
  PrinterFileSendResponse,
} from "@bambuview/contracts";
import { BAMBU_CONNECTION_MODE_OPTIONS } from "@bambuview/contracts";

import {
  StyledSelect,
  type StyledSelectOption,
} from "../components/styled-select";
import { APP_VERSION } from "../app/version";
import { apiFetch } from "../lib/api";

const workflowIcons = {
  filament: Layers3,
  resin: FlaskConical,
} as const;

const filamentInputOptions = [
  {
    description: "Plate or project file from Orca or Bambu Studio.",
    label: ".3mf Project",
    value: ".3mf",
  },
  {
    description: "Raw printable model for the Orca workbench.",
    label: ".stl Model",
    value: ".stl",
  },
  {
    description: "CAD-friendly source to prep before slicing.",
    label: ".step Model",
    value: ".step",
  },
] as const satisfies readonly StyledSelectOption<string>[];

const resinInputOptions = [
  {
    description: "Prusa resin workspace container.",
    label: ".sl1 Project",
    value: ".sl1",
  },
  {
    description: "Raw resin model for support and exposure prep.",
    label: ".stl Model",
    value: ".stl",
  },
  {
    description: "Shared project container for resin staging.",
    label: ".3mf Project",
    value: ".3mf",
  },
] as const satisfies readonly StyledSelectOption<string>[];

const filamentLayerOptions = [
  {
    description: "Balanced speed and finish for most Bambu jobs.",
    label: "0.20mm Standard",
    value: "0.20mm Standard",
  },
  {
    description: "Sharper detail for mechanical parts and prototypes.",
    label: "0.16mm Fine",
    value: "0.16mm Fine",
  },
  {
    description: "Fast draft profile for rough validation prints.",
    label: "0.28mm Draft",
    value: "0.28mm Draft",
  },
] as const satisfies readonly StyledSelectOption<string>[];

const resinLayerOptions = [
  {
    description: "Balanced resin profile for everyday parts.",
    label: "0.05mm Standard Resin",
    value: "0.05mm Standard Resin",
  },
  {
    description: "High-detail resin pass for showcase pieces.",
    label: "0.03mm Fine Resin",
    value: "0.03mm Fine Resin",
  },
] as const satisfies readonly StyledSelectOption<string>[];

const filamentMaterialOptions = [
  {
    description: "General purpose Bambu-compatible filament lane.",
    label: "PLA Matte Green",
    value: "PLA Matte Green",
  },
  {
    description: "Durable workshop-ready profile for P-series prints.",
    label: "PETG Workshop Gray",
    value: "PETG Workshop Gray",
  },
  {
    description: "Higher-temp engineering profile for X and H lines.",
    label: "ABS Charcoal",
    value: "ABS Charcoal",
  },
] as const satisfies readonly StyledSelectOption<string>[];

const resinMaterialOptions = [
  {
    description: "Default tough resin staging profile.",
    label: "Tough Resin Gray",
    value: "Tough Resin Gray",
  },
  {
    description: "Sharper model resin for detail-first exports.",
    label: "Model Resin Ivory",
    value: "Model Resin Ivory",
  },
] as const satisfies readonly StyledSelectOption<string>[];

function optionValue(options: readonly StyledSelectOption<string>[]) {
  return options[0]?.value ?? "";
}

function modeOption(mode: BambuConnectionMode) {
  return (
    BAMBU_CONNECTION_MODE_OPTIONS.find((option) => option.value === mode) ??
    BAMBU_CONNECTION_MODE_OPTIONS[0]
  );
}

function supportsDirectSend(printer: PrinterConnectionRecord | null) {
  return (
    printer?.connectionMode === "developer" || printer?.connectionMode === "lan"
  );
}

function supportsCompanionSend(printer: PrinterConnectionRecord | null) {
  return Boolean(
    printer &&
    (printer.connectionMode === "cloud" ||
      printer.connectionMode === "bambu-connect" ||
      printer.connectionMode === "lan"),
  );
}

function activeInputOptions(workflowId: PrepareWorkflowKind) {
  return workflowId === "filament" ? filamentInputOptions : resinInputOptions;
}

function activeLayerOptions(workflowId: PrepareWorkflowKind) {
  return workflowId === "filament" ? filamentLayerOptions : resinLayerOptions;
}

function activeMaterialOptions(workflowId: PrepareWorkflowKind) {
  return workflowId === "filament"
    ? filamentMaterialOptions
    : resinMaterialOptions;
}

function pipelineChecklist(input: {
  jobName: string;
  outputPath: string;
  printer: PrinterConnectionRecord | null;
  sourcePath: string;
  workflowId: PrepareWorkflowKind;
}) {
  return [
    {
      detail: input.sourcePath
        ? input.sourcePath
        : "Choose the local model or project path to prep.",
      done: input.sourcePath.trim().length > 0,
      label: "Source loaded",
    },
    {
      detail:
        input.workflowId === "filament"
          ? input.printer
            ? `${input.printer.name} • ${modeOption(input.printer.connectionMode).label}`
            : "Select the printer this job should target."
          : "Resin projects stay staged here until the dedicated export file is ready.",
      done: input.workflowId === "resin" || Boolean(input.printer),
      label: "Target selected",
    },
    {
      detail: input.outputPath
        ? input.outputPath
        : "Pick the output file path that the send or handoff should use.",
      done: input.outputPath.trim().length > 0,
      label: "Output ready",
    },
    {
      detail: input.jobName.trim()
        ? input.jobName.trim()
        : "Give the job a human-readable name for handoff and history.",
      done: input.jobName.trim().length > 0,
      label: "Job named",
    },
  ];
}

function sendRouteCopy(
  workflowId: PrepareWorkflowKind,
  printer: PrinterConnectionRecord | null,
) {
  if (workflowId === "resin") {
    return {
      detail:
        "Prusa stays reserved for resin-only prep. Keep the project, notes, and export path saved here until the resin output file is ready.",
      label: "Resin export lane",
    };
  }

  if (!printer) {
    return {
      detail:
        "Add a printer in Fleet first, then come back here to aim the sliced job at a real Bambu target.",
      label: "No printer target selected",
    };
  }

  if (supportsDirectSend(printer)) {
    return {
      detail:
        printer.connectionMode === "developer"
          ? "This printer can use direct Developer Mode upload and optional start-print handoff from the server."
          : "This printer can use the direct local upload path from the server with its saved LAN credentials.",
      label: "Direct send available",
    };
  }

  if (supportsCompanionSend(printer)) {
    return {
      detail:
        "This profile can hand off through a paired Companion, or you can fall back to a local Bambu Connect import link.",
      label: "Bridge or Connect handoff",
    };
  }

  return {
    detail:
      "This connection mode is saved, but it still needs a live bridge before BambuView can push a sliced job through it.",
    label: "Profile saved",
  };
}

function sendButtonLabel(
  workflowId: PrepareWorkflowKind,
  printer: PrinterConnectionRecord | null,
) {
  if (workflowId === "resin") {
    return "Stage Resin Export";
  }

  if (supportsDirectSend(printer)) {
    return "Send To Printer";
  }

  if (supportsCompanionSend(printer)) {
    return "Send Through Bridge";
  }

  return "Stage Job";
}

function canSubmitWorkspace(
  workflowId: PrepareWorkflowKind,
  sourcePath: string,
  outputPath: string,
) {
  if (workflowId === "resin") {
    return sourcePath.trim().length > 0 || outputPath.trim().length > 0;
  }

  return sourcePath.trim().length > 0 && outputPath.trim().length > 0;
}

export function PreparePage() {
  const queryClient = useQueryClient();
  const [jobName, setJobName] = useState("");
  const [notes, setNotes] = useState("");
  const [outputPath, setOutputPath] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [selectedInputType, setSelectedInputType] = useState(
    optionValue(filamentInputOptions),
  );
  const [selectedMaterialProfile, setSelectedMaterialProfile] = useState(
    optionValue(filamentMaterialOptions),
  );
  const [selectedLayerProfile, setSelectedLayerProfile] = useState(
    optionValue(filamentLayerOptions),
  );
  const [selectedPrinterId, setSelectedPrinterId] = useState("");
  const [selectedWorkflowId, setSelectedWorkflowId] =
    useState<PrepareWorkflowKind>("filament");
  const [sourcePath, setSourcePath] = useState("");
  const [startAfterSend, setStartAfterSend] = useState(true);
  const [workspaceMessage, setWorkspaceMessage] = useState<string | null>(null);
  const [workspaceTone, setWorkspaceTone] = useState<
    "neutral" | "success" | "warning"
  >("neutral");

  const statusQuery = useQuery({
    queryKey: ["prepare-status"],
    queryFn: () => apiFetch<PrepareStatus>("/api/prepare/status"),
  });
  const printersQuery = useQuery({
    queryKey: ["printer-connections"],
    queryFn: () =>
      apiFetch<{ printers: PrinterConnectionRecord[] }>(
        "/api/printers/connections",
      ),
  });
  const importUrlMutation = useMutation({
    mutationFn: (payload: { name: string; path: string }) =>
      apiFetch<{ importUrl: BambuConnectImportResponse }>(
        "/api/bambu-connect/import-url",
        {
          body: JSON.stringify(payload),
          method: "POST",
        },
      ),
    onSuccess: () => {
      setWorkspaceTone("success");
      setWorkspaceMessage(
        "Bambu Connect handoff link generated. Open it on the machine that has both the file path and Bambu Connect installed.",
      );
    },
  });
  const sendJobMutation = useMutation({
    mutationFn: (payload: {
      action: "send" | "stage";
      fileName: string;
      path: string;
      printerId: string;
      startPrint: boolean;
    }) =>
      apiFetch<PrinterFileSendResponse>(
        `/api/printers/${payload.printerId}/files`,
        {
          body: JSON.stringify({
            action: payload.action,
            fileName: payload.fileName,
            path: payload.path,
            startPrint: payload.startPrint,
          }),
          method: "POST",
        },
      ),
  });
  const saveProjectMutation = useMutation({
    mutationFn: (payload: {
      inputType: string;
      jobName: string;
      layerProfile: string;
      materialProfile: string;
      notes: string;
      outputPath: string;
      printerId: string | null;
      sourcePath: string;
      workflowId: PrepareWorkflowKind;
    }) =>
      apiFetch<{ project: { id: string } }>(
        selectedProjectId
          ? `/api/prepare/projects/${selectedProjectId}`
          : "/api/prepare/projects",
        {
          body: JSON.stringify(payload),
          method: selectedProjectId ? "PUT" : "POST",
        },
      ),
    onSuccess: ({ project }) => {
      setSelectedProjectId(project.id);
      void queryClient.invalidateQueries({ queryKey: ["prepare-status"] });
      setWorkspaceTone("success");
      setWorkspaceMessage(
        selectedProjectId
          ? "Prepare project updated in the workbench."
          : "Prepare project saved to the workbench.",
      );
    },
  });
  const deleteProjectMutation = useMutation({
    mutationFn: (projectId: string) =>
      apiFetch(`/api/prepare/projects/${projectId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["prepare-status"] });
      setWorkspaceTone("success");
      setWorkspaceMessage("Prepare project removed from the workbench.");
    },
  });
  const markProjectActionMutation = useMutation({
    mutationFn: (payload: { id: string; label: string }) =>
      apiFetch(`/api/prepare/projects/${payload.id}/actions`, {
        body: JSON.stringify({
          label: payload.label,
        }),
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["prepare-status"] });
    },
  });

  const workflows = statusQuery.data?.workflows ?? [];
  const workspace = statusQuery.data?.workspace;
  const savedProjects = workspace?.projects ?? [];
  const activeWorkflow =
    workflows.find((workflow) => workflow.id === selectedWorkflowId) ??
    workflows[0] ??
    null;
  const WorkflowIcon = activeWorkflow
    ? workflowIcons[activeWorkflow.id]
    : workflowIcons.filament;
  const slicers = statusQuery.data?.slicers ?? [];
  const visibleSlicers = activeWorkflow
    ? slicers.filter((slicer) =>
        slicer.workflowKinds.includes(activeWorkflow.id),
      )
    : [];
  const printers = printersQuery.data?.printers ?? [];
  const selectedPrinter =
    printers.find((printer) => printer.id === selectedPrinterId) ?? null;
  const inputOptions = activeInputOptions(selectedWorkflowId);
  const layerOptions = activeLayerOptions(selectedWorkflowId);
  const materialOptions = activeMaterialOptions(selectedWorkflowId);
  const targetPrinters =
    selectedWorkflowId === "filament"
      ? printers
      : ([] as PrinterConnectionRecord[]);
  const targetOptions = targetPrinters.map((printer) => ({
    description: `${printer.model} • ${modeOption(printer.connectionMode).label}`,
    label: printer.name,
    value: printer.id,
  }));
  const routeCopy = sendRouteCopy(selectedWorkflowId, selectedPrinter);
  const checklist = pipelineChecklist({
    jobName,
    outputPath,
    printer: selectedPrinter,
    sourcePath,
    workflowId: selectedWorkflowId,
  });
  const progressCount = checklist.filter((item) => item.done).length;

  function resetWorkspaceForm(
    nextWorkflowId: PrepareWorkflowKind = "filament",
  ) {
    setSelectedProjectId(null);
    setJobName("");
    setNotes("");
    setOutputPath("");
    setSelectedWorkflowId(nextWorkflowId);
    setSourcePath("");
    setStartAfterSend(true);
    setSelectedInputType(optionValue(activeInputOptions(nextWorkflowId)));
    setSelectedLayerProfile(optionValue(activeLayerOptions(nextWorkflowId)));
    setSelectedMaterialProfile(
      optionValue(activeMaterialOptions(nextWorkflowId)),
    );
    setSelectedPrinterId("");
  }

  function loadProject(project: PrepareProjectRecord) {
    setSelectedProjectId(project.id);
    setJobName(project.jobName);
    setNotes(project.notes);
    setOutputPath(project.outputPath);
    setSelectedWorkflowId(project.workflowId);
    setSourcePath(project.sourcePath);
    setSelectedInputType(project.inputType);
    setSelectedLayerProfile(project.layerProfile);
    setSelectedMaterialProfile(project.materialProfile);
    setSelectedPrinterId(project.printerId ?? "");
    setWorkspaceTone("neutral");
    setWorkspaceMessage(`Loaded ${project.jobName} from the workbench.`);
  }

  async function saveCurrentProject() {
    await saveProjectMutation.mutateAsync({
      inputType: selectedInputType,
      jobName: jobName.trim() || "Untitled BambuView Job",
      layerProfile: selectedLayerProfile,
      materialProfile: selectedMaterialProfile,
      notes,
      outputPath: outputPath.trim() || sourcePath.trim(),
      printerId:
        selectedWorkflowId === "filament" ? selectedPrinterId || null : null,
      sourcePath: sourcePath.trim() || outputPath.trim(),
      workflowId: selectedWorkflowId,
    });
  }

  useEffect(() => {
    if (
      selectedInputType &&
      inputOptions.some((option) => option.value === selectedInputType)
    ) {
      return;
    }

    setSelectedInputType(optionValue(inputOptions));
  }, [inputOptions, selectedInputType]);

  useEffect(() => {
    if (
      selectedMaterialProfile &&
      materialOptions.some((option) => option.value === selectedMaterialProfile)
    ) {
      return;
    }

    setSelectedMaterialProfile(optionValue(materialOptions));
  }, [materialOptions, selectedMaterialProfile]);

  useEffect(() => {
    if (
      selectedLayerProfile &&
      layerOptions.some((option) => option.value === selectedLayerProfile)
    ) {
      return;
    }

    setSelectedLayerProfile(optionValue(layerOptions));
  }, [layerOptions, selectedLayerProfile]);

  useEffect(() => {
    if (selectedWorkflowId !== "filament") {
      setSelectedPrinterId("");
      return;
    }

    if (targetPrinters.some((printer) => printer.id === selectedPrinterId)) {
      return;
    }

    setSelectedPrinterId(targetPrinters[0]?.id ?? "");
  }, [selectedPrinterId, selectedWorkflowId, targetPrinters]);

  if (statusQuery.isLoading || !statusQuery.data || printersQuery.isLoading) {
    return <div className="panel">Loading prepare workspace…</div>;
  }

  async function handleGenerateBambuConnectLink(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const resolvedPath = outputPath.trim() || sourcePath.trim();
    await importUrlMutation.mutateAsync({
      name:
        jobName.trim() || resolvedPath.split(/[\\/]/).pop() || "BambuView job",
      path: resolvedPath,
    });
    if (selectedProjectId) {
      await markProjectActionMutation.mutateAsync({
        id: selectedProjectId,
        label: "Bambu Connect link generated",
      });
    }
  }

  async function handleWorkspaceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedWorkflowId === "resin") {
      if (selectedProjectId) {
        await markProjectActionMutation.mutateAsync({
          id: selectedProjectId,
          label: "Resin project staged",
        });
      }
      setWorkspaceTone("success");
      setWorkspaceMessage(
        "Resin project staged. Keep working in the resin lane until the dedicated export file exists at the saved output path.",
      );
      return;
    }

    if (!selectedPrinter) {
      setWorkspaceTone("warning");
      setWorkspaceMessage(
        "Add or select a printer target before sending this filament job.",
      );
      return;
    }

    const payloadPath = outputPath.trim() || sourcePath.trim();
    const payloadName =
      jobName.trim() || payloadPath.split(/[\\/]/).pop() || "BambuView job";
    const action = supportsDirectSend(selectedPrinter) ? "send" : "stage";
    const response = await sendJobMutation.mutateAsync({
      action,
      fileName: payloadName,
      path: payloadPath,
      printerId: selectedPrinter.id,
      startPrint: action === "send" ? startAfterSend : false,
    });
    if (selectedProjectId) {
      await markProjectActionMutation.mutateAsync({
        id: selectedProjectId,
        label: response.accepted ? "Project sent" : "Send attempted",
      });
    }

    setWorkspaceTone(response.accepted ? "success" : "warning");
    setWorkspaceMessage(response.detail);
  }

  return (
    <div className="space-y-6">
      <section className="panel space-y-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-5">
            <div className="flex items-center gap-3 text-[color:var(--accent)]">
              <Rocket className="h-5 w-5" />
              <span className="font-medium">{`Prepare & Slice now routes real printer targets, live handoff rules, and Bambu Connect fallback in ${APP_VERSION} alpha.`}</span>
            </div>
            <div className="space-y-3">
              <div className="section-title">Fork-aware workspace</div>
              <h2 className="text-4xl font-semibold text-white">
                {statusQuery.data.headline}
              </h2>
              <p className="max-w-4xl text-base leading-8 text-zinc-400">
                {statusQuery.data.description}
              </p>
            </div>
          </div>
          <div className="min-w-[280px] border border-[color:var(--accent)] bg-[color:var(--accent-10)] px-5 py-4">
            <div className="text-xs uppercase tracking-[0.32em] text-zinc-500">
              Active route
            </div>
            <div className="mt-3 flex items-center gap-3 text-white">
              <WorkflowIcon className="h-5 w-5 text-[color:var(--accent)]" />
              <div>
                <div className="text-lg font-semibold">
                  {activeWorkflow?.label}
                </div>
                <div className="text-sm text-zinc-400">{routeCopy.label}</div>
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-zinc-300">
              {routeCopy.detail}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {workflows.map((workflow) => {
            const Icon = workflowIcons[workflow.id];
            const isActive = workflow.id === selectedWorkflowId;

            return (
              <button
                className={
                  isActive
                    ? "fleet-console-segmented__button fleet-console-segmented__button--active"
                    : "fleet-console-segmented__button"
                }
                key={workflow.id}
                onClick={() => setSelectedWorkflowId(workflow.id)}
                type="button"
              >
                <Icon className="h-4 w-4" />
                <span>{workflow.label}</span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {statusQuery.data.capabilities.map((capability) => (
            <div
              className="border border-white/8 bg-white/[0.03] px-5 py-5 text-sm leading-7 text-zinc-200"
              key={capability}
            >
              {capability}
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <section className="panel space-y-5">
          <div className="flex items-center gap-3 text-[color:var(--accent)]">
            <FileUp className="h-5 w-5" />
            <div className="section-title">Job workspace</div>
          </div>
          <div className="border border-white/8 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-zinc-300">
            <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">
              Workspace root
            </div>
            <div className="mt-2 break-all text-white">
              {statusQuery.data.workspace.rootDirectory}
            </div>
            <div className="mt-2 text-zinc-400">
              {selectedProjectId
                ? "Editing a saved Prepare project from the workbench."
                : "Build a new project here, then save it into the workbench shelf for later slicing and handoff."}
            </div>
          </div>
          <form className="space-y-5" onSubmit={handleWorkspaceSubmit}>
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="camera-field">
                <span>Job name</span>
                <input
                  className="input-field"
                  onChange={(event) => setJobName(event.target.value)}
                  placeholder="Drone Arm v3"
                  type="text"
                  value={jobName}
                />
              </label>
              <label className="camera-field">
                <span>Input type</span>
                <StyledSelect
                  onChange={setSelectedInputType}
                  options={[...inputOptions]}
                  value={selectedInputType}
                />
              </label>
            </div>

            <div className="grid gap-4">
              <label className="camera-field">
                <span>Source model or project path</span>
                <input
                  className="input-field"
                  onChange={(event) => setSourcePath(event.target.value)}
                  placeholder={
                    selectedWorkflowId === "filament"
                      ? "/workspace/jobs/drone_arm_v3.3mf"
                      : "/workspace/jobs/resin-miniature.sl1"
                  }
                  type="text"
                  value={sourcePath}
                />
                <small>
                  Use a path that exists where this BambuView instance is
                  running.
                </small>
              </label>
              <label className="camera-field">
                <span>Output handoff path</span>
                <input
                  className="input-field"
                  onChange={(event) => setOutputPath(event.target.value)}
                  placeholder={
                    selectedWorkflowId === "filament"
                      ? "/workspace/exports/drone_arm_v3.gcode.3mf"
                      : "/workspace/exports/resin-miniature.sl1s"
                  }
                  type="text"
                  value={outputPath}
                />
                <small>
                  Direct send uses this path. Leave it aligned with where the
                  sliced export will actually land.
                </small>
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <label className="camera-field">
                <span>Layer profile</span>
                <StyledSelect
                  onChange={setSelectedLayerProfile}
                  options={[...layerOptions]}
                  value={selectedLayerProfile}
                />
              </label>
              <label className="camera-field">
                <span>Material profile</span>
                <StyledSelect
                  onChange={setSelectedMaterialProfile}
                  options={[...materialOptions]}
                  value={selectedMaterialProfile}
                />
              </label>
              <label className="camera-field">
                <span>Printer target</span>
                <StyledSelect
                  disabled={
                    selectedWorkflowId !== "filament" ||
                    targetOptions.length === 0
                  }
                  onChange={setSelectedPrinterId}
                  options={targetOptions}
                  placeholder={
                    selectedWorkflowId === "filament"
                      ? "Select printer"
                      : "Resin staging only"
                  }
                  value={selectedPrinterId}
                />
              </label>
            </div>

            <label className="camera-field">
              <span>Operator notes</span>
              <textarea
                className="input-field min-h-[132px] resize-y py-4"
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Plate notes, preset reminders, or what this handoff should do next."
                value={notes}
              />
            </label>

            <div className="grid gap-4 border border-white/8 bg-black/20 px-4 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-white">
                  Start print after upload
                </div>
                <p className="text-sm leading-7 text-zinc-400">
                  Only direct Developer Mode printers can automatically start
                  right after the file handoff completes.
                </p>
              </div>
              <label className="inline-flex items-center gap-3 text-sm text-zinc-200">
                <input
                  checked={startAfterSend}
                  className="h-4 w-4 rounded-none border border-white/20 bg-black/20 text-[color:var(--accent)]"
                  disabled={!supportsDirectSend(selectedPrinter)}
                  onChange={(event) => setStartAfterSend(event.target.checked)}
                  type="checkbox"
                />
                Enable auto-start
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                className="fleet-console-controls__button"
                disabled={
                  saveProjectMutation.isPending ||
                  (jobName.trim().length === 0 &&
                    sourcePath.trim().length === 0 &&
                    outputPath.trim().length === 0)
                }
                onClick={(event) => {
                  event.preventDefault();
                  void saveCurrentProject();
                }}
                type="button"
              >
                <HardDriveDownload className="h-4 w-4" />
                <span>
                  {saveProjectMutation.isPending
                    ? "Saving…"
                    : selectedProjectId
                      ? "Update Workbench Project"
                      : "Save To Workbench"}
                </span>
              </button>
              <button
                className="fleet-console-controls__button fleet-console-controls__button--primary"
                disabled={
                  sendJobMutation.isPending ||
                  !canSubmitWorkspace(
                    selectedWorkflowId,
                    sourcePath,
                    outputPath,
                  )
                }
                type="submit"
              >
                <Send className="h-4 w-4" />
                <span>
                  {sendJobMutation.isPending
                    ? "Sending…"
                    : sendButtonLabel(selectedWorkflowId, selectedPrinter)}
                </span>
              </button>
              {selectedWorkflowId === "filament" ? (
                <button
                  className="fleet-console-controls__button"
                  disabled={
                    importUrlMutation.isPending ||
                    (outputPath.trim().length === 0 &&
                      sourcePath.trim().length === 0)
                  }
                  onClick={(event) => {
                    event.preventDefault();
                  }}
                  type="button"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>
                    {supportsDirectSend(selectedPrinter)
                      ? "Developer send selected"
                      : "Use the form below for Connect fallback"}
                  </span>
                </button>
              ) : null}
              <button
                className="fleet-console-controls__button"
                onClick={(event) => {
                  event.preventDefault();
                  resetWorkspaceForm(selectedWorkflowId);
                }}
                type="button"
              >
                <RotateCcw className="h-4 w-4" />
                <span>
                  {selectedProjectId ? "Unload Project" : "Clear Form"}
                </span>
              </button>
            </div>
          </form>
        </section>

        <section className="panel space-y-5">
          <div className="flex items-center gap-3 text-[color:var(--accent)]">
            <Workflow className="h-5 w-5" />
            <div className="section-title">Delivery plan</div>
          </div>

          <div className="border border-[color:var(--accent)] bg-[color:var(--accent-10)] px-5 py-5">
            <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">
              Recommended route
            </div>
            <div className="mt-3 text-2xl font-semibold text-white">
              {routeCopy.label}
            </div>
            <p className="mt-3 text-sm leading-7 text-zinc-300">
              {routeCopy.detail}
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="border border-white/8 bg-white/[0.03] px-5 py-5">
              <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">
                Completion
              </div>
              <div className="mt-3 text-4xl font-semibold text-white">
                {progressCount}/{checklist.length}
              </div>
              <div className="mt-2 text-sm text-zinc-400">
                Workspace checklist complete
              </div>
            </div>
            <div className="border border-white/8 bg-white/[0.03] px-5 py-5">
              <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">
                Active slicer
              </div>
              <div className="mt-3 text-2xl font-semibold text-white">
                {visibleSlicers[0]?.label ?? "Awaiting workflow"}
              </div>
              <div className="mt-2 text-sm text-zinc-400">
                {visibleSlicers[0]?.summary ?? "Select a lane to continue."}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {checklist.map((item) => (
              <div
                className={`border px-4 py-4 ${
                  item.done
                    ? "border-[color:var(--accent)] bg-[color:var(--accent-10)]"
                    : "border-white/8 bg-white/[0.03]"
                }`}
                key={item.label}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">
                    {item.label}
                  </div>
                  {item.done ? (
                    <CheckCircle2 className="h-4 w-4 text-[color:var(--accent)]" />
                  ) : null}
                </div>
                <div className="mt-2 text-sm leading-7 text-zinc-400">
                  {item.detail}
                </div>
              </div>
            ))}
          </div>

          <div className="border border-white/8 bg-black/20 px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="section-title">Workbench shelf</div>
                <div className="mt-2 text-sm leading-7 text-zinc-400">
                  Saved projects persist their source path, export path,
                  presets, and last handoff action.
                </div>
              </div>
              <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">
                {savedProjects.length} saved
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {savedProjects.length === 0 ? (
                <div className="border border-white/8 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-zinc-400">
                  No Prepare projects are saved yet. Use the form on the left to
                  create your first workbench project.
                </div>
              ) : null}
              {savedProjects.map((project) => (
                <div
                  className={`border px-4 py-4 ${
                    project.id === selectedProjectId
                      ? "border-[color:var(--accent)] bg-[color:var(--accent-10)]"
                      : "border-white/8 bg-white/[0.03]"
                  }`}
                  key={project.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-white">
                        {project.jobName}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-[0.24em] text-zinc-500">
                        {project.workflowId} • {project.state}
                      </div>
                    </div>
                    <div className="text-sm text-zinc-400">
                      {project.lastActionLabel ?? "No handoff yet"}
                    </div>
                  </div>
                  <div className="mt-3 text-sm leading-7 text-zinc-300">
                    {project.summary}
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-zinc-400">
                    <div>Source: {project.sourcePath}</div>
                    <div>Output: {project.outputPath}</div>
                    {project.fileName ? (
                      <div>Artifact: {project.fileName}</div>
                    ) : null}
                  </div>
                  {project.validationMessages.length > 0 ? (
                    <div className="mt-3 border border-amber-500/25 bg-amber-500/10 px-3 py-3 text-sm leading-7 text-amber-100">
                      {project.validationMessages[0]}
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      className="fleet-console-controls__button"
                      onClick={() => loadProject(project)}
                      type="button"
                    >
                      <HardDriveDownload className="h-4 w-4" />
                      <span>Load Project</span>
                    </button>
                    <button
                      className="fleet-console-controls__button"
                      disabled={deleteProjectMutation.isPending}
                      onClick={() => {
                        if (project.id === selectedProjectId) {
                          resetWorkspaceForm(selectedWorkflowId);
                        }
                        deleteProjectMutation.mutate(project.id);
                      }}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {workspaceMessage ? (
            <div
              className={`border px-5 py-5 text-sm leading-7 ${
                workspaceTone === "success"
                  ? "border-[color:var(--accent)] bg-[color:var(--accent-10)] text-zinc-200"
                  : workspaceTone === "warning"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                    : "border-white/8 bg-white/[0.03] text-zinc-300"
              }`}
            >
              {workspaceMessage}
            </div>
          ) : null}

          {importUrlMutation.data ? (
            <div className="border border-white/8 bg-white/[0.03] px-5 py-5">
              <div className="flex items-center gap-3 text-[color:var(--accent)]">
                <ExternalLink className="h-4 w-4" />
                <div className="section-title">Bambu Connect fallback</div>
              </div>
              <p className="mt-3 break-all text-sm leading-7 text-zinc-300">
                {importUrlMutation.data.importUrl.url}
              </p>
              <a
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--accent)]"
                href={importUrlMutation.data.importUrl.url}
              >
                Open in Bambu Connect
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          ) : null}

          {selectedWorkflowId === "filament" ? (
            <form
              className="border border-white/8 bg-black/20 px-5 py-5"
              onSubmit={handleGenerateBambuConnectLink}
            >
              <div className="flex items-center gap-3 text-[color:var(--accent)]">
                <Send className="h-4 w-4" />
                <div className="section-title">Generate Bambu Connect link</div>
              </div>
              <p className="mt-3 text-sm leading-7 text-zinc-400">
                Use this fallback when the printer profile is Cloud / Normal or
                Bambu Connect and you want a local desktop handoff without
                waiting on Companion.
              </p>
              <button
                className="fleet-console-controls__button mt-5"
                disabled={
                  importUrlMutation.isPending ||
                  (outputPath.trim().length === 0 &&
                    sourcePath.trim().length === 0)
                }
                type="submit"
              >
                <ExternalLink className="h-4 w-4" />
                <span>
                  {importUrlMutation.isPending
                    ? "Building link…"
                    : "Generate Bambu Connect Link"}
                </span>
              </button>
            </form>
          ) : null}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="panel space-y-5">
          <div className="flex items-center gap-3 text-[color:var(--accent)]">
            <Blocks className="h-5 w-5" />
            <div className="section-title">Slicer workspaces</div>
          </div>
          <div className="grid gap-4">
            {slicers.map((slicer) => {
              const isVisible = activeWorkflow
                ? slicer.workflowKinds.includes(activeWorkflow.id)
                : false;

              return (
                <article
                  className={`border px-5 py-5 ${
                    isVisible
                      ? "border-[color:var(--accent)] bg-[color:var(--accent-10)]"
                      : "border-white/8 bg-white/[0.03] opacity-70"
                  }`}
                  key={slicer.id}
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-2xl font-semibold text-white">
                          {slicer.label}
                        </h3>
                        <span className="border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-zinc-400">
                          {slicer.status}
                        </span>
                      </div>
                      <p className="max-w-3xl text-sm leading-7 text-zinc-300">
                        {slicer.summary}
                      </p>
                    </div>
                    <div className="min-w-[220px] border border-white/8 bg-black/20 px-4 py-4 text-sm text-zinc-300">
                      <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">
                        Upstream
                      </div>
                      <a
                        className="mt-3 inline-flex items-center gap-2 font-semibold text-[color:var(--accent)]"
                        href={slicer.upstreamUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {slicer.upstreamName}
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <div className="mt-3 text-zinc-400">
                        License: {slicer.license}
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {slicer.plannedCapabilities.map((capability) => (
                      <span
                        className="border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.16em] text-zinc-300"
                        key={capability}
                      >
                        {capability}
                      </span>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="panel space-y-5">
          <div className="flex items-center gap-3 text-[color:var(--accent)]">
            <Workflow className="h-5 w-5" />
            <div className="section-title">Pipeline</div>
          </div>
          <div className="space-y-4">
            {statusQuery.data.pipeline.map((stage) => {
              const isRelevant = activeWorkflow
                ? stage.slicerIds.some((slicerId) =>
                    visibleSlicers.some((slicer) => slicer.id === slicerId),
                  )
                : false;

              return (
                <div
                  className={`border px-4 py-4 ${
                    isRelevant
                      ? "border-[color:var(--accent)] bg-[color:var(--accent-10)]"
                      : "border-white/8 bg-white/[0.03]"
                  }`}
                  key={stage.id}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-lg font-semibold text-white">
                      {stage.label}
                    </div>
                    <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">
                      {stage.status}
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-zinc-300">
                    {stage.summary}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="border border-white/8 bg-black/20 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">
              Accepted inputs
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {activeWorkflow?.acceptedInputs.map((inputType) => (
                <span
                  className="border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.16em] text-zinc-300"
                  key={inputType}
                >
                  {inputType}
                </span>
              ))}
            </div>
            <div className="mt-5 border-t border-white/8 pt-4 text-sm leading-7 text-zinc-300">
              {activeWorkflow?.delivery}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
