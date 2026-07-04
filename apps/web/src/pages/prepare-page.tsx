import {
  Blocks,
  ExternalLink,
  FlaskConical,
  Layers3,
  Rocket,
  Send,
  Workflow,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import type {
  BambuConnectImportResponse,
  PrepareStatus,
  PrepareWorkflowKind,
} from "@bambuview/contracts";

import { APP_VERSION } from "../app/version";
import { apiFetch } from "../lib/api";

const workflowIcons = {
  filament: Layers3,
  resin: FlaskConical,
} as const;

const statusCopy = {
  available: "Available",
  planned: "Planned",
  scaffolded: "Scaffolded",
} as const;

function actionMatchesWorkflow(
  availableFor: PrepareWorkflowKind[],
  workflowId: PrepareWorkflowKind,
) {
  return availableFor.includes(workflowId);
}

export function PreparePage() {
  const [connectPath, setConnectPath] = useState("");
  const [connectName, setConnectName] = useState("");
  const [selectedWorkflowId, setSelectedWorkflowId] =
    useState<PrepareWorkflowKind>("filament");
  const statusQuery = useQuery({
    queryKey: ["prepare-status"],
    queryFn: () => apiFetch<PrepareStatus>("/api/prepare/status"),
  });
  const importUrlMutation = useMutation({
    mutationFn: (payload: { name: string; path: string }) =>
      apiFetch<{ importUrl: BambuConnectImportResponse }>(
        "/api/bambu-connect/import-url",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      ),
  });

  async function generateBambuConnectLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await importUrlMutation.mutateAsync({
      name: connectName || connectPath.split(/[\\/]/).pop() || "BambuView job",
      path: connectPath,
    });
  }

  if (statusQuery.isLoading || !statusQuery.data) {
    return <div className="panel">Loading prepare workspace…</div>;
  }

  const workflows = statusQuery.data.workflows;
  const activeWorkflow =
    workflows.find((workflow) => workflow.id === selectedWorkflowId) ??
    workflows[0];
  const WorkflowIcon = workflowIcons[activeWorkflow.id];
  const visibleSlicers = statusQuery.data.slicers.filter((slicer) =>
    slicer.workflowKinds.includes(activeWorkflow.id),
  );
  const visibleActions = statusQuery.data.handoffActions.filter((action) =>
    actionMatchesWorkflow(action.availableFor, activeWorkflow.id),
  );

  return (
    <div className="space-y-6">
      <section className="panel space-y-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-5">
            <div className="flex items-center gap-3 text-[color:var(--accent)]">
              <Rocket className="h-5 w-5" />
              <span className="font-medium">{`Prepare & Slice is scaffolded around real upstream slicer forks in ${APP_VERSION} alpha.`}</span>
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
          <div className="min-w-[260px] border border-[color:var(--accent)] bg-[color:var(--accent-10)] px-5 py-4">
            <div className="text-xs uppercase tracking-[0.32em] text-zinc-500">
              Current workflow
            </div>
            <div className="mt-3 flex items-center gap-3 text-white">
              <WorkflowIcon className="h-5 w-5 text-[color:var(--accent)]" />
              <div>
                <div className="text-lg font-semibold">
                  {activeWorkflow.label}
                </div>
                <div className="text-sm text-zinc-400">
                  {activeWorkflow.printerClass}
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-zinc-300">
              {activeWorkflow.summary}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {workflows.map((workflow) => {
            const Icon = workflowIcons[workflow.id];
            const isActive = workflow.id === activeWorkflow.id;

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

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="panel space-y-5">
          <div className="flex items-center gap-3 text-[color:var(--accent)]">
            <Blocks className="h-5 w-5" />
            <div className="section-title">Slicer workspaces</div>
          </div>
          <div className="grid gap-4">
            {statusQuery.data.slicers.map((slicer) => {
              const isVisible = slicer.workflowKinds.includes(
                activeWorkflow.id,
              );
              const isPrimary = slicer.defaultFor.includes(activeWorkflow.id);

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
                          {statusCopy[slicer.status]}
                        </span>
                        {isPrimary ? (
                          <span className="border border-[color:var(--accent)] px-3 py-1 text-xs uppercase tracking-[0.24em] text-[color:var(--accent)]">
                            Default for {activeWorkflow.label}
                          </span>
                        ) : null}
                        {!isVisible ? (
                          <span className="border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-zinc-500">
                            {activeWorkflow.id === "filament"
                              ? "Resin only"
                              : "Filament only"}
                          </span>
                        ) : null}
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

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <div className="border border-white/8 bg-black/20 px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">
                        Planned capabilities
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {slicer.plannedCapabilities.map((capability) => (
                          <span
                            className="border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.16em] text-zinc-300"
                            key={capability}
                          >
                            {capability}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="border border-white/8 bg-black/20 px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">
                        Integration notes
                      </div>
                      <div className="mt-4 space-y-3 text-sm leading-7 text-zinc-300">
                        {slicer.notes.map((note) => (
                          <p key={note}>{note}</p>
                        ))}
                      </div>
                    </div>
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
              const isRelevant = stage.slicerIds.some((slicerId) =>
                visibleSlicers.some((slicer) => slicer.id === slicerId),
              );

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
                      {statusCopy[stage.status]}
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
              {activeWorkflow.acceptedInputs.map((inputType) => (
                <span
                  className="border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.16em] text-zinc-300"
                  key={inputType}
                >
                  {inputType}
                </span>
              ))}
            </div>
            <div className="mt-5 border-t border-white/8 pt-4 text-sm leading-7 text-zinc-300">
              {activeWorkflow.delivery}
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
        <section className="panel space-y-5">
          <div className="flex items-center gap-3 text-[color:var(--accent)]">
            <Send className="h-5 w-5" />
            <div className="section-title">Handoff actions</div>
          </div>
          <div className="grid gap-4">
            {visibleActions.map((action) => (
              <article
                className="border border-white/8 bg-white/[0.03] px-5 py-5"
                key={action.id}
              >
                <div className="text-lg font-semibold text-white">
                  {action.label}
                </div>
                <p className="mt-3 text-sm leading-7 text-zinc-300">
                  {action.description}
                </p>
                <div className="mt-4 border-t border-white/8 pt-4 text-sm leading-7 text-zinc-400">
                  {action.requirement}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel space-y-5">
          {activeWorkflow.id === "filament" ? (
            <>
              <div className="flex items-center gap-3 text-[color:var(--accent)]">
                <Send className="h-5 w-5" />
                <div className="section-title">Bambu Connect handoff</div>
              </div>
              <p className="text-sm leading-7 text-zinc-400">
                Orca remains the filament workbench, while Bambu Connect stays
                available as the live handoff path for sliced Bambu G-code and
                3MF files. Use an absolute path that exists on the computer
                where Bambu Connect is installed.
              </p>
              <form className="grid gap-4" onSubmit={generateBambuConnectLink}>
                <label className="grid gap-2 text-sm text-zinc-300">
                  File name
                  <input
                    className="rounded-none border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-[color:var(--accent)]"
                    onChange={(event) => setConnectName(event.target.value)}
                    placeholder="Flexi Dino"
                    type="text"
                    value={connectName}
                  />
                </label>
                <label className="grid gap-2 text-sm text-zinc-300">
                  Absolute local file path
                  <input
                    className="rounded-none border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-[color:var(--accent)]"
                    onChange={(event) => setConnectPath(event.target.value)}
                    placeholder="/Users/you/Downloads/flexi-dino.gcode.3mf"
                    required
                    type="text"
                    value={connectPath}
                  />
                </label>
                <button
                  className="fleet-console-controls__button fleet-console-controls__button--primary w-fit"
                  disabled={importUrlMutation.isPending}
                  type="submit"
                >
                  Generate Bambu Connect Link
                </button>
              </form>
              {importUrlMutation.data ? (
                <div className="border border-[color:var(--accent)] bg-[color:var(--accent-10)] p-4">
                  <div className="text-sm font-semibold text-white">
                    Ready for Bambu Connect
                  </div>
                  <p className="mt-2 break-all text-sm leading-6 text-zinc-300">
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
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 text-[color:var(--accent)]">
                <FlaskConical className="h-5 w-5" />
                <div className="section-title">Prusa resin lane</div>
              </div>
              <div className="border border-[color:var(--accent)] bg-[color:var(--accent-10)] px-5 py-5">
                <div className="text-lg font-semibold text-white">
                  Resin stays out of the Bambu Connect path
                </div>
                <p className="mt-3 text-sm leading-7 text-zinc-300">
                  This workspace is intentionally separate. Prusa is reserved
                  for resin-only printers, so Bambu Connect import links are not
                  surfaced here and resin exports can evolve on their own
                  delivery track.
                </p>
                <p className="mt-4 text-sm leading-7 text-zinc-400">
                  The next step is wiring the Prusa resin fork surface and
                  export staging into this lane without polluting the filament
                  workflow.
                </p>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
