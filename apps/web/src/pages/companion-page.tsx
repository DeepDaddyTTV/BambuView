import {
  ArrowRight,
  CircleAlert,
  Copy,
  ExternalLink,
  MonitorPlay,
  PlugZap,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  CompanionConnectionSnapshot,
  CompanionPairingCode,
  CompanionRegistration,
} from "@bambuview/contracts";

import { apiFetch } from "../lib/api";
import { copyText } from "../lib/copy-text";

const COMPANION_DOCS_URL =
  "https://deepdaddyttv.github.io/BambuView/companion.html";
const COMPANION_RELEASE_URL =
  "https://github.com/DeepDaddyTTV/BambuView/releases";
const COMPANION_DEFAULT_SERVER_URL = "http://localhost:4173";

function toneClasses(status: CompanionRegistration["status"]) {
  if (status === "online") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }

  if (status === "degraded") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }

  return "border-red-500/30 bg-red-500/10 text-red-200";
}

export function CompanionPage() {
  const queryClient = useQueryClient();
  const [selectedCompanionId, setSelectedCompanionId] = useState<string | null>(
    null,
  );
  const [latestPairingCode, setLatestPairingCode] =
    useState<CompanionPairingCode | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [pairingCodeMessage, setPairingCodeMessage] = useState<string | null>(
    null,
  );

  const companionsQuery = useQuery({
    queryKey: ["companions"],
    queryFn: () =>
      apiFetch<{ companions: CompanionRegistration[] }>("/api/companions"),
  });

  useEffect(() => {
    if (!selectedCompanionId && companionsQuery.data?.companions[0]) {
      setSelectedCompanionId(companionsQuery.data.companions[0].id);
    }
  }, [companionsQuery.data, selectedCompanionId]);

  const detailQuery = useQuery({
    queryKey: ["companion", selectedCompanionId],
    queryFn: () =>
      apiFetch<{ snapshot: CompanionConnectionSnapshot }>(
        `/api/companions/${selectedCompanionId}`,
      ),
    enabled: Boolean(selectedCompanionId),
  });

  const createPairingCodeMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ pairingCode: CompanionPairingCode }>(
        "/api/companions/pairing-codes",
        {
          body: "{}",
          method: "POST",
        },
      ),
    onSuccess: ({ pairingCode }) => {
      setLatestPairingCode(pairingCode);
      setPairingCodeMessage("Pairing token ready to copy.");
    },
    onError: (error) => {
      setPairingCodeMessage(
        error instanceof Error
          ? error.message
          : "Could not create a pairing token.",
      );
    },
  });

  const testCompanionMutation = useMutation({
    mutationFn: (companionId: string) =>
      apiFetch<{ snapshot: CompanionConnectionSnapshot }>(
        `/api/companions/${companionId}/test`,
        {
          method: "POST",
        },
      ),
    onSuccess: ({ snapshot }) => {
      void queryClient.invalidateQueries({ queryKey: ["companions"] });
      setSelectedCompanionId(snapshot.companion.id);
      void queryClient.setQueryData(["companion", snapshot.companion.id], {
        snapshot,
      });
    },
  });

  const importStreamMutation = useMutation({
    mutationFn: ({
      companionId,
      streamId,
      streamName,
    }: {
      companionId: string;
      streamId: string;
      streamName: string;
    }) =>
      apiFetch<{ source: { name: string } }>(
        `/api/companions/${companionId}/import-streams/${streamId}`,
        {
          body: JSON.stringify({
            name: streamName,
          }),
          method: "POST",
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cameras"] });
    },
  });

  const deleteCompanionMutation = useMutation({
    mutationFn: (companionId: string) =>
      apiFetch(`/api/companions/${companionId}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      setSelectedCompanionId(null);
      await queryClient.invalidateQueries({ queryKey: ["companions"] });
    },
  });

  async function copyPairingCode(code: string) {
    try {
      await copyText(code);
      setCopyMessage("Pairing token copied.");
    } catch (error) {
      setCopyMessage(
        error instanceof Error ? error.message : "Could not copy the token.",
      );
    }

    window.setTimeout(() => setCopyMessage(null), 2200);
  }

  const selectedSnapshot = detailQuery.data?.snapshot ?? null;

  return (
    <div className="grid gap-6 2xl:grid-cols-[0.72fr_1.28fr]">
      <div className="space-y-6">
        <section className="panel">
          <div className="section-title">Install Companion</div>
          <p className="mt-3 text-sm leading-7 text-zinc-400">
            Companion is the native bridge app for cloud-mode Bambu printers.
            Install it on the machine where Bambu Connect or Bambu Studio is
            signed in, then pair it here so BambuView can use that desktop
            bridge for telemetry, camera auto-bridging, and file handoff.
          </p>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <a
              className="fleet-console-toolbar__button justify-center"
              href={COMPANION_RELEASE_URL}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" />
              <span>Open Companion Releases</span>
            </a>
            <a
              className="fleet-console-toolbar__button justify-center"
              href={COMPANION_DOCS_URL}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" />
              <span>Open Setup Guide</span>
            </a>
          </div>
          <div className="mt-5 border border-white/8 bg-white/[0.03] px-5 py-5 text-sm leading-7 text-zinc-300">
            Companion release assets are published as macOS <strong>DMG</strong>
            , Windows <strong>EXE</strong>, and Linux <strong>DEB</strong> or{" "}
            <strong>RPM</strong> installers.
          </div>
        </section>

        <section className="panel">
          <div className="section-title">Pair Companion</div>
          <p className="mt-3 text-sm leading-7 text-zinc-400">
            Generate a one-time pairing token here, then paste it into BambuView
            Companion along with this server URL.
          </p>
          <div className="mt-5 rounded-[22px] border border-white/8 bg-white/[0.03] p-5">
            <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">
              BambuView Server URL
            </div>
            <div className="mt-2 text-base font-medium text-white">
              {COMPANION_DEFAULT_SERVER_URL}
            </div>
            <div className="mt-2 text-sm leading-7 text-zinc-400">
              Keep the default neutral while pairing. If Companion is running on
              another machine, replace <strong>localhost</strong> with the
              hostname or IP for the BambuView server.
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className="fleet-console-toolbar__button"
                onClick={() => {
                  void copyPairingCode(COMPANION_DEFAULT_SERVER_URL);
                }}
                type="button"
              >
                <Copy className="h-4 w-4" />
                <span>Copy Server URL</span>
              </button>
              {copyMessage ? (
                <div className="inline-flex items-center text-xs text-zinc-300">
                  {copyMessage}
                </div>
              ) : null}
            </div>
            <button
              className="fleet-console-toolbar__button mt-5"
              disabled={createPairingCodeMutation.isPending}
              onClick={() => {
                createPairingCodeMutation.mutate();
              }}
              type="button"
            >
              <PlugZap className="h-4 w-4" />
              <span>
                {createPairingCodeMutation.isPending
                  ? "Generating…"
                  : "Generate Pairing Token"}
              </span>
            </button>
            {pairingCodeMessage ? (
              <div className="mt-3 text-sm text-zinc-300">
                {pairingCodeMessage}
              </div>
            ) : null}
            {latestPairingCode ? (
              <div className="mt-5 rounded-[18px] border border-emerald-500/20 bg-emerald-500/10 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                  One-Time Token
                </div>
                <div className="mt-2 break-all font-mono text-sm text-white">
                  {latestPairingCode.code}
                </div>
                <div className="mt-2 text-xs text-emerald-100/80">
                  Expires{" "}
                  {new Date(latestPairingCode.expiresAt).toLocaleString()}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    className="fleet-console-toolbar__button"
                    onClick={() => {
                      void copyPairingCode(latestPairingCode.code);
                    }}
                    type="button"
                  >
                    <Copy className="h-4 w-4" />
                    <span>Copy Token</span>
                  </button>
                  {copyMessage ? (
                    <div className="inline-flex items-center text-xs text-emerald-100">
                      {copyMessage}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="section-title">Paired Companions</div>
          <div className="mt-5 space-y-4">
            {companionsQuery.isLoading ? (
              <div className="rounded-[22px] border border-white/8 bg-white/[0.03] px-5 py-6 text-sm text-zinc-400">
                Loading Companion registrations…
              </div>
            ) : null}
            {companionsQuery.data?.companions.length === 0 ? (
              <div className="rounded-[22px] border border-white/8 bg-white/[0.03] px-5 py-6 text-sm leading-7 text-zinc-400">
                No Companions are paired yet. Generate a pairing token, then
                finish setup in the desktop app.
              </div>
            ) : null}
            {companionsQuery.data?.companions.map((companion) => (
              <div className="relative" key={companion.id}>
                <button
                  className={`w-full rounded-[22px] border px-5 py-5 pr-20 text-left transition ${
                    selectedCompanionId === companion.id
                      ? "border-[color:var(--accent)] bg-[color:rgba(126,211,33,0.1)]"
                      : "border-white/8 bg-white/[0.03]"
                  }`}
                  onClick={() => setSelectedCompanionId(companion.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-lg font-medium text-white">
                        {companion.name}
                      </div>
                      <div className="mt-1 text-sm text-zinc-400">
                        {companion.baseUrl}
                      </div>
                    </div>
                    <div
                      className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${toneClasses(
                        companion.status,
                      )}`}
                    >
                      {companion.status}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-zinc-400 sm:grid-cols-2">
                    <div>{companion.printerCount} printers cached</div>
                    <div>{companion.streamCount} streams cached</div>
                  </div>
                </button>
                <button
                  aria-label={`Remove ${companion.name}`}
                  className="icon-button icon-button--square icon-button--danger absolute right-5 top-5"
                  disabled={deleteCompanionMutation.isPending}
                  onClick={() => deleteCompanionMutation.mutate(companion.id)}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="space-y-6">
        <section className="panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="section-title">Companion Detail</div>
              <p className="mt-3 text-sm leading-7 text-zinc-400">
                Refresh the connection to pull the latest health, capability,
                printer, and stream data from the local bridge. Removing a
                Companion also clears any camera feeds imported from that bridge
                on this server.
              </p>
            </div>
            {selectedCompanionId ? (
              <div className="flex flex-wrap gap-3">
                <button
                  className="fleet-console-toolbar__button"
                  disabled={testCompanionMutation.isPending}
                  onClick={() =>
                    testCompanionMutation.mutate(selectedCompanionId)
                  }
                  type="button"
                >
                  <RefreshCcw className="h-4 w-4" />
                  <span>
                    {testCompanionMutation.isPending
                      ? "Testing…"
                      : "Test Companion"}
                  </span>
                </button>
              </div>
            ) : null}
          </div>

          {!selectedCompanionId ? (
            <div className="mt-5 rounded-[22px] border border-white/8 bg-white/[0.03] px-5 py-6 text-sm text-zinc-400">
              Select a paired Companion to see live capabilities and importable
              streams.
            </div>
          ) : null}

          {detailQuery.isLoading ? (
            <div className="mt-5 rounded-[22px] border border-white/8 bg-white/[0.03] px-5 py-6 text-sm text-zinc-400">
              Loading Companion detail…
            </div>
          ) : null}

          {selectedSnapshot ? (
            <div className="mt-5 space-y-5">
              {selectedSnapshot.companion.lastError ? (
                <div className="rounded-[20px] border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
                  <div className="flex gap-3">
                    <CircleAlert className="mt-0.5 h-4 w-4" />
                    <div>{selectedSnapshot.companion.lastError}</div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-3">
                {Object.entries(selectedSnapshot.companion.capabilities).map(
                  ([key, value]) => (
                    <div
                      className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4"
                      key={key}
                    >
                      <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                        {key}
                      </div>
                      <div className="mt-2 text-base font-medium text-white">
                        {value.replaceAll("_", " ")}
                      </div>
                    </div>
                  ),
                )}
              </div>

              <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
                <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-5">
                  <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                    Cached Printers
                  </div>
                  <div className="mt-4 space-y-4">
                    {selectedSnapshot.printers.length === 0 ? (
                      <div className="text-sm text-zinc-400">
                        No Companion printers are cached yet.
                      </div>
                    ) : null}
                    {selectedSnapshot.printers.map((printer) => (
                      <div
                        className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4"
                        key={printer.id}
                      >
                        <div className="text-base font-medium text-white">
                          {printer.name}
                        </div>
                        <div className="mt-1 text-sm text-zinc-400">
                          {printer.model} • {printer.hostname}
                        </div>
                        <div className="mt-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
                          Telemetry:{" "}
                          {printer.capabilities.telemetry.replaceAll("_", " ")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                      Importable Streams
                    </div>
                    <div className="text-xs text-zinc-500">
                      Import a stream here, then assign it on Cameras or Fleet.
                    </div>
                  </div>
                  <div className="mt-4 space-y-4">
                    {selectedSnapshot.streams.length === 0 ? (
                      <div className="text-sm text-zinc-400">
                        No Companion streams are cached yet.
                      </div>
                    ) : null}
                    {selectedSnapshot.streams.map((stream) => (
                      <div
                        className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4"
                        key={stream.id}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-medium text-white">
                              {stream.name}
                            </div>
                            <div className="mt-1 text-sm text-zinc-400">
                              {stream.sourceKind} / {stream.outputKind}
                            </div>
                          </div>
                          <button
                            className="fleet-console-toolbar__button"
                            disabled={
                              importStreamMutation.isPending ||
                              !(
                                stream.mjpegPath ||
                                stream.snapshotPath ||
                                stream.hlsPath
                              )
                            }
                            onClick={() =>
                              importStreamMutation.mutate({
                                companionId: selectedSnapshot.companion.id,
                                streamId: stream.id,
                                streamName: `${selectedSnapshot.companion.name} • ${stream.name}`,
                              })
                            }
                            type="button"
                          >
                            <MonitorPlay className="h-4 w-4" />
                            <span>Import As Camera Source</span>
                          </button>
                        </div>
                        <div className="mt-3 text-sm leading-6 text-zinc-400">
                          {stream.details}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3 text-xs uppercase tracking-[0.16em] text-zinc-500">
                          <span>{stream.status}</span>
                          <span>{stream.upstreamUrl}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {selectedSnapshot.health?.bridgeSources?.length ? (
                <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-5">
                  <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                    Detected Bridge Surfaces
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {selectedSnapshot.health.bridgeSources.map((surface) => (
                      <div
                        className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4"
                        key={surface.id}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-medium text-white">
                              {surface.label}
                            </div>
                            <div className="mt-1 text-sm text-zinc-400">
                              {surface.kind} • {surface.status}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 text-sm leading-7 text-zinc-400">
                          {surface.detail}
                        </div>
                        <div className="mt-2 text-xs text-zinc-500">
                          {surface.location ??
                            "No local install or config path detected"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-[22px] border border-emerald-500/15 bg-emerald-500/8 p-5">
                <div className="flex gap-3">
                  <ArrowRight className="mt-0.5 h-4 w-4 text-emerald-200" />
                  <div className="text-sm leading-7 text-emerald-100">
                    Imported Companion streams show up under{" "}
                    <strong>Cameras</strong> with provider{" "}
                    <strong>BambuView Companion</strong>. After import, assign
                    them to printers or Fleet Overview there.
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
