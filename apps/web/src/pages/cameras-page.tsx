import {
  Camera,
  CheckCircle2,
  Edit3,
  Link2,
  PlugZap,
  RadioTower,
  Save,
  TestTube2,
  Trash2,
  Wifi,
  X,
} from "lucide-react";
import { startTransition, useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  CameraAssignmentInput,
  CameraAssignmentTargetType,
  CameraOverview,
  CameraProviderType,
  CameraSource,
  CameraSourceInput,
  CameraTestResult,
  PrinterConnectionRecord,
} from "@bambuview/contracts";
import { FLEET_CAMERA_TARGET_ID } from "@bambuview/contracts";

import {
  StyledSelect,
  type StyledSelectOption,
} from "../components/styled-select";
import { apiFetch } from "../lib/api";

const providerIcons: Record<CameraProviderType, typeof Camera> = {
  bambu: Camera,
  "bambu-connect": PlugZap,
  "bambuview-companion": Wifi,
  "direct-http": Link2,
  "direct-mjpeg": Link2,
  "direct-rtsp": Link2,
  frigate: RadioTower,
  "farm-overview": Wifi,
  "network-plugin": PlugZap,
};

const providerOptions: Array<StyledSelectOption<CameraProviderType>> = [
  {
    description: "Frigate or go2rtc MJPEG restream",
    label: "Frigate",
    value: "frigate",
  },
  {
    description: "Bridge URL from Bambu Connect workflows",
    label: "BambuConnect Direct",
    value: "bambu-connect",
  },
  {
    description: "Local Bambu Network Plugin bridge endpoint",
    label: "Bambu Network Plugin",
    value: "network-plugin",
  },
  {
    description: "Native local bridge paired through BambuView Companion",
    label: "BambuView Companion",
    value: "bambuview-companion",
  },
  {
    description: "Browser-ready MJPEG stream",
    label: "Direct MJPEG",
    value: "direct-mjpeg",
  },
  {
    description: "JPEG snapshot or HLS URL",
    label: "Direct Snapshot / HLS",
    value: "direct-http",
  },
  {
    description: "Save RTSP for restream planning",
    label: "Direct RTSP",
    value: "direct-rtsp",
  },
  {
    description: "Native LAN camera path that needs a restream",
    label: "Bambu Native LAN",
    value: "bambu",
  },
];

function emptySourceForm(): CameraSourceInput {
  return {
    frigateBaseUrl: "",
    frigateCamera: "",
    name: "",
    password: "",
    provider: "frigate",
    streamUrl: "",
    username: "",
  };
}

function emptyAssignment(): CameraAssignmentInput {
  return {
    feedLabel: "Printer Cam",
    printerId: "",
    sourceId: "",
    targetType: "printer",
  };
}

function providerLabel(provider: CameraProviderType): string {
  return (
    providerOptions.find((option) => option.value === provider)?.label ??
    provider.replaceAll("-", " ")
  );
}

function CameraPreview({ source }: { source: CameraSource }) {
  const [loadFailed, setLoadFailed] = useState(false);
  const sourceUrl =
    source.streamKind === "hls"
      ? source.streamUrl
      : (source.snapshotUrl ?? source.streamUrl);
  const canRender =
    source.status === "online" &&
    sourceUrl &&
    ["mjpeg", "snapshot", "hls"].includes(source.streamKind);

  useEffect(() => {
    setLoadFailed(false);
  }, [sourceUrl]);

  if (canRender && source.streamKind === "hls" && !loadFailed) {
    return (
      <video
        className="h-full w-full bg-black object-cover"
        controls
        muted
        onError={() => setLoadFailed(true)}
        playsInline
        src={sourceUrl}
      />
    );
  }

  if (canRender && !loadFailed) {
    return (
      <img
        alt={`${source.name} live preview`}
        className="h-full w-full bg-black object-cover"
        onError={() => setLoadFailed(true)}
        src={sourceUrl}
      />
    );
  }

  return (
    <div className="grid h-full place-items-center bg-black px-6 text-center">
      <div>
        <Camera className="mx-auto mb-4 h-10 w-10 text-zinc-500" />
        <div className="text-sm uppercase tracking-[0.22em] text-zinc-500">
          {loadFailed
            ? "Preview Unavailable"
            : source.status === "degraded"
              ? "Source Needs Attention"
              : source.streamKind === "rtsp" ||
                  source.streamKind === "bambu-native"
                ? "Restream Needed"
                : "No Preview"}
        </div>
        <p className="mt-3 text-sm leading-6 text-zinc-300">
          {loadFailed
            ? "The source is saved, but the browser could not render it. Use a Frigate/go2rtc MJPEG, HLS, or snapshot restream."
            : source.details}
        </p>
      </div>
    </div>
  );
}

export function CamerasPage() {
  const queryClient = useQueryClient();
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [form, setForm] = useState<CameraSourceInput>(emptySourceForm);
  const [assignOnSave, setAssignOnSave] =
    useState<CameraAssignmentInput>(emptyAssignment);
  const [assignment, setAssignment] =
    useState<CameraAssignmentInput>(emptyAssignment);
  const [lastTest, setLastTest] = useState<CameraTestResult | null>(null);
  const [deleteSourceId, setDeleteSourceId] = useState<string | null>(null);

  const camerasQuery = useQuery({
    queryKey: ["cameras"],
    queryFn: () => apiFetch<CameraOverview>("/api/cameras"),
  });
  const printersQuery = useQuery({
    queryKey: ["printer-connections"],
    queryFn: () =>
      apiFetch<{ printers: PrinterConnectionRecord[] }>(
        "/api/printers/connections",
      ),
  });

  const testMutation = useMutation({
    mutationFn: (input: CameraSourceInput) =>
      apiFetch<{ test: CameraTestResult }>("/api/cameras/sources/test", {
        body: JSON.stringify(input),
        method: "POST",
      }),
    onSuccess: ({ test }) => {
      setLastTest(test);
    },
  });

  const saveSourceMutation = useMutation({
    mutationFn: async ({
      assign,
      id,
      input,
    }: {
      assign: CameraAssignmentInput | null;
      id: string | null;
      input: CameraSourceInput;
    }) => {
      const result = await apiFetch<{
        source: CameraSource;
        test: CameraTestResult;
      }>(id ? `/api/cameras/sources/${id}` : "/api/cameras/sources", {
        body: JSON.stringify(input),
        method: id ? "PUT" : "POST",
      });

      if (assign?.printerId) {
        await apiFetch("/api/cameras/assignments", {
          body: JSON.stringify({
            ...assign,
            sourceId: result.source.id,
          }),
          method: "POST",
        });
      }

      return result;
    },
    onSuccess: ({ source, test }) => {
      setLastTest(test);
      startTransition(() => {
        setAssignment((current) => ({
          ...current,
          sourceId: source.id,
        }));
        setAssignOnSave(emptyAssignment);
        setEditingSourceId(null);
        setForm(emptySourceForm());
      });
      void queryClient.invalidateQueries({ queryKey: ["cameras"] });
      void queryClient.invalidateQueries({ queryKey: ["fleet-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["printer-detail"] });
    },
  });

  const assignMutation = useMutation({
    mutationFn: (input: CameraAssignmentInput) =>
      apiFetch("/api/cameras/assignments", {
        body: JSON.stringify(input),
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cameras"] });
      void queryClient.invalidateQueries({ queryKey: ["fleet-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["printer-detail"] });
    },
  });

  const deleteSourceMutation = useMutation({
    mutationFn: (sourceId: string) =>
      apiFetch(`/api/cameras/sources/${sourceId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setDeleteSourceId(null);
      void queryClient.invalidateQueries({ queryKey: ["cameras"] });
      void queryClient.invalidateQueries({ queryKey: ["fleet-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["printer-detail"] });
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: (assignmentId: string) =>
      apiFetch(`/api/cameras/assignments/${assignmentId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cameras"] });
      void queryClient.invalidateQueries({ queryKey: ["fleet-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["printer-detail"] });
    },
  });

  function updateAssignTarget(
    nextTargetId: string,
    setter: (next: CameraAssignmentInput) => void,
    current: CameraAssignmentInput,
    cameraTargets: Array<{
      id: string;
      label: string;
      type: CameraAssignmentTargetType;
    }>,
  ) {
    const selectedTarget = cameraTargets.find(
      (target) => target.id === nextTargetId,
    );
    setter({
      ...current,
      feedLabel:
        selectedTarget?.type === "fleet"
          ? "Fleet Overview"
          : current.feedLabel === "Fleet Overview"
            ? "Printer Cam"
            : current.feedLabel,
      printerId: nextTargetId,
      targetType: selectedTarget?.type ?? "printer",
    });
  }

  function submitSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveSourceMutation.mutate({
      assign: assignOnSave.printerId ? assignOnSave : null,
      id: editingSourceId,
      input: form,
    });
  }

  function testSource() {
    testMutation.mutate(form);
  }

  function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    assignMutation.mutate(assignment);
  }

  function beginEdit(source: CameraSource) {
    startTransition(() => {
      setEditingSourceId(source.id);
      setLastTest(null);
      setForm({
        frigateBaseUrl: "",
        frigateCamera: "",
        name: source.name,
        password: "",
        provider: source.provider,
        streamUrl: source.displayUrl,
        username: "",
      });
      setAssignOnSave(emptyAssignment());
    });
  }

  function cancelEdit() {
    startTransition(() => {
      setEditingSourceId(null);
      setForm(emptySourceForm());
      setLastTest(null);
    });
  }

  if (camerasQuery.isLoading || !camerasQuery.data) {
    return <div className="panel">Loading camera sources...</div>;
  }

  const sources = camerasQuery.data.sources;
  const persistedSources = sources.filter((source) =>
    /^[0-9a-f-]{36}$/i.test(source.id),
  );
  const printers = printersQuery.data?.printers ?? [];
  const cameraTargets: Array<{
    id: string;
    label: string;
    type: CameraAssignmentTargetType;
  }> = [
    {
      id: FLEET_CAMERA_TARGET_ID,
      label: "Fleet Overview",
      type: "fleet",
    },
    ...printers.map((printer) => ({
      id: printer.id,
      label: printer.name,
      type: "printer" as const,
    })),
  ];
  const targetOptions: Array<StyledSelectOption<string>> = cameraTargets.map(
    (target) => ({
      description:
        target.type === "fleet" ? "Shared fleet camera" : "Printer camera slot",
      label: target.label,
      value: target.id,
    }),
  );
  const sourceOptions: Array<StyledSelectOption<string>> = persistedSources.map(
    (source) => ({
      description: providerLabel(source.provider),
      label: source.name,
      value: source.id,
    }),
  );
  const frigateRestreamExample =
    form.streamUrl?.trim() || "http://frigate:5000/api/workbench_left";

  return (
    <div className="space-y-4">
      <p className="text-base leading-7 text-zinc-400">
        Add Frigate restreams, direct browser-compatible feeds, Network Plugin
        bridge URLs, or future BambuView Companion endpoints, then assign any
        source to a printer or Fleet Overview slot.
      </p>

      <section className="panel panel--dense">
        <div className="section-title">
          {editingSourceId ? "Edit Camera Source" : "Add Camera Source"}
        </div>
        <form className="camera-source-form" onSubmit={submitSource}>
          <div className="camera-source-form__grid">
            <label className="camera-field">
              <span>Name</span>
              <input
                className="input-field"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Workbench Left"
                value={form.name}
              />
            </label>
            <label className="camera-field">
              <span>Connection Type</span>
              <StyledSelect
                onChange={(provider) =>
                  setForm((current) => ({ ...current, provider }))
                }
                options={providerOptions}
                value={form.provider ?? "frigate"}
              />
            </label>
            <label className="camera-field camera-field--wide">
              <span>
                {form.provider === "frigate"
                  ? "Frigate Restream URL"
                  : form.provider === "network-plugin"
                    ? "Network Plugin Bridge URL"
                    : form.provider === "bambuview-companion"
                      ? "Companion Stream URL"
                      : "Stream URL"}
              </span>
              <input
                className="input-field"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    streamUrl: event.target.value,
                  }))
                }
                placeholder={
                  form.provider === "frigate"
                    ? "http://frigate:5000/api/workbench_left"
                    : form.provider === "direct-rtsp"
                      ? "rtsp://camera.local:554/stream"
                      : "http://camera.local/video.mjpg"
                }
                value={form.streamUrl ?? ""}
              />
              {form.provider === "frigate" ? (
                <small>
                  Example: {frigateRestreamExample}. BambuView proxies this
                  MJPEG restream and can infer snapshots from standard Frigate
                  URLs.
                </small>
              ) : null}
            </label>
            <label className="camera-field">
              <span>Username</span>
              <input
                className="input-field"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    username: event.target.value,
                  }))
                }
                placeholder="Optional"
                value={form.username ?? ""}
              />
            </label>
            <label className="camera-field">
              <span>Password / Token</span>
              <input
                className="input-field"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                placeholder={
                  editingSourceId
                    ? "Leave blank to keep saved token"
                    : "Stored server-side"
                }
                type="password"
                value={form.password ?? ""}
              />
            </label>
          </div>

          <div className="camera-source-form__assign">
            <div>
              <div className="text-sm font-semibold text-white">
                Assign When Saved
              </div>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Optional. Pick a printer or Fleet Overview now, or save the
                source and assign it later.
              </p>
            </div>
            <StyledSelect
              onChange={(nextTargetId) =>
                updateAssignTarget(
                  nextTargetId,
                  setAssignOnSave,
                  assignOnSave,
                  cameraTargets,
                )
              }
              options={targetOptions}
              placeholder="No immediate assignment"
              value={assignOnSave.printerId}
            />
            <input
              className="input-field"
              onChange={(event) =>
                setAssignOnSave((current) => ({
                  ...current,
                  feedLabel: event.target.value,
                }))
              }
              placeholder="Printer Cam"
              value={assignOnSave.feedLabel}
            />
          </div>

          <div className="camera-source-form__actions">
            {editingSourceId ? (
              <button
                className="fleet-console-controls__button"
                onClick={cancelEdit}
                type="button"
              >
                <X className="h-4 w-4" />
                <span>Cancel Edit</span>
              </button>
            ) : null}
            <button
              className="fleet-console-controls__button"
              disabled={testMutation.isPending}
              onClick={testSource}
              type="button"
            >
              <TestTube2 className="h-4 w-4" />
              <span>{testMutation.isPending ? "Testing..." : "Test"}</span>
            </button>
            <button
              className="fleet-console-controls__button fleet-console-controls__button--primary"
              disabled={saveSourceMutation.isPending}
              type="submit"
            >
              <Save className="h-4 w-4" />
              <span>
                {saveSourceMutation.isPending
                  ? "Saving..."
                  : editingSourceId
                    ? "Update Source"
                    : "Save Source"}
              </span>
            </button>
          </div>
        </form>
        {lastTest ? (
          <div className="mt-4 border border-white/10 bg-black/15 p-4 text-sm text-zinc-300">
            <div className="flex items-center gap-2 font-semibold text-white">
              <CheckCircle2 className="h-4 w-4 text-[color:var(--accent)]" />
              <span>
                {lastTest.status.toUpperCase()} - {lastTest.kind}
              </span>
            </div>
            <p className="mt-2 text-zinc-400">{lastTest.detail}</p>
          </div>
        ) : null}
      </section>

      <section className="panel panel--dense">
        <div className="section-title">Assign Feed</div>
        <form className="camera-assign-form" onSubmit={submitAssignment}>
          <label className="camera-field">
            <span>Target</span>
            <StyledSelect
              onChange={(nextTargetId) =>
                updateAssignTarget(
                  nextTargetId,
                  setAssignment,
                  assignment,
                  cameraTargets,
                )
              }
              options={targetOptions}
              placeholder="Select printer or fleet"
              value={assignment.printerId}
            />
          </label>
          <label className="camera-field">
            <span>Source</span>
            <StyledSelect
              onChange={(sourceId) =>
                setAssignment((current) => ({
                  ...current,
                  sourceId,
                }))
              }
              options={sourceOptions}
              placeholder="Select source"
              value={assignment.sourceId}
            />
          </label>
          <label className="camera-field">
            <span>Feed Label</span>
            <input
              className="input-field"
              onChange={(event) =>
                setAssignment((current) => ({
                  ...current,
                  feedLabel: event.target.value,
                }))
              }
              placeholder="Printer Cam"
              value={assignment.feedLabel}
            />
          </label>
          <button
            className="fleet-console-controls__button fleet-console-controls__button--primary"
            disabled={
              assignMutation.isPending ||
              !assignment.printerId ||
              !assignment.sourceId
            }
            type="submit"
          >
            <Save className="h-4 w-4" />
            <span>{assignMutation.isPending ? "Assigning..." : "Assign"}</span>
          </button>
        </form>
      </section>

      {sources.length === 0 ? (
        <section className="panel">
          <div className="grid min-h-[240px] place-items-center text-center">
            <div>
              <Camera className="mx-auto h-10 w-10 text-[color:var(--accent)]" />
              <h3 className="mt-4 text-2xl font-semibold text-white">
                No camera sources yet
              </h3>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-400">
                Add a Frigate restream URL, direct MJPEG/HTTP feed, HLS feed,
                Network Plugin bridge, or RTSP source above. Once saved, assign
                it to a printer or the Fleet Overview target.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <div className="camera-source-grid">
        {sources.map((source) => {
          const SourceIcon = providerIcons[source.provider];

          return (
            <section
              className="panel panel--dense camera-source-card"
              key={source.id}
            >
              <div className="camera-source-card__top">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
                    <SourceIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-xl font-semibold text-white">
                      {source.name}
                    </h3>
                    <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">
                      {providerLabel(source.provider)} / {source.streamKind}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`status-pill status-pill--${source.status}`}>
                    {source.status}
                  </div>
                  <button
                    aria-label={`Edit ${source.name}`}
                    className="icon-button icon-button--square"
                    onClick={() => beginEdit(source)}
                    type="button"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    aria-label={`Delete ${source.name}`}
                    className="icon-button icon-button--square icon-button--danger"
                    disabled={deleteSourceMutation.isPending}
                    onClick={() => setDeleteSourceId(source.id)}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {deleteSourceId === source.id ? (
                <div className="camera-source-card__delete-confirm">
                  <div>
                    <div className="font-semibold text-white">
                      Delete this camera source?
                    </div>
                    <p>
                      Assignments using {source.name} will be removed from
                      printers and fleets.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="fleet-console-controls__button"
                      onClick={() => setDeleteSourceId(null)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="fleet-console-controls__button fleet-console-controls__button--danger"
                      disabled={deleteSourceMutation.isPending}
                      onClick={() => deleteSourceMutation.mutate(source.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="camera-stage mt-4">
                <div className="camera-stage__top">
                  <div className="text-sm text-zinc-300">Live Preview</div>
                  <div className="camera-stage__meta">
                    {source.assignedTo.length} linked
                  </div>
                </div>
                <div className="camera-stage__viewport camera-stage__viewport--wide">
                  <CameraPreview source={source} />
                </div>
              </div>
              <div className="camera-source-card__source">
                <div className="font-medium text-zinc-200">Source</div>
                <div className="mt-2 break-all">
                  {source.displayUrl || source.streamUrl}
                </div>
                <p className="mt-2 leading-6">{source.details}</p>
              </div>
            </section>
          );
        })}
      </div>

      <section className="panel panel--dense">
        <div className="section-title">Assignments</div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              <tr>
                <th className="pb-4">Target</th>
                <th className="pb-4">Source</th>
                <th className="pb-4">Feed Label</th>
                <th className="pb-4">Feed ID</th>
                <th className="pb-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {camerasQuery.data.assignments.map((item) => (
                <tr key={`${item.targetId}-${item.feedId}`}>
                  <td className="py-4 text-zinc-100">
                    <div>{item.targetName}</div>
                    <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                      {item.targetType}
                    </div>
                  </td>
                  <td className="py-4 text-zinc-300">{item.sourceName}</td>
                  <td className="py-4 text-zinc-300">{item.feedLabel}</td>
                  <td className="py-4 text-zinc-500">{item.feedId}</td>
                  <td className="py-4 text-right">
                    <button
                      className="fleet-console-controls__button fleet-console-controls__button--icon"
                      disabled={deleteAssignmentMutation.isPending}
                      onClick={() =>
                        deleteAssignmentMutation.mutate(item.feedId)
                      }
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {camerasQuery.data.assignments.length === 0 ? (
            <div className="border-t border-white/8 py-6 text-sm text-zinc-400">
              No camera assignments yet.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
