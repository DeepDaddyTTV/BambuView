import {
  Camera,
  CheckCircle2,
  Link2,
  RadioTower,
  Save,
  TestTube2,
  Wifi,
} from "lucide-react";
import { startTransition, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  CameraAssignmentInput,
  CameraOverview,
  CameraProviderType,
  CameraSource,
  CameraSourceInput,
  CameraTestResult,
  PrinterConnectionRecord,
} from "@bambuview/contracts";

import { apiFetch } from "../lib/api";

const providerIcons = {
  bambu: Camera,
  "bambu-connect": Camera,
  "direct-http": Link2,
  "direct-mjpeg": Link2,
  "direct-rtsp": Link2,
  frigate: RadioTower,
  "farm-overview": Wifi,
};

const providerOptions: Array<[CameraProviderType, string]> = [
  ["frigate", "Frigate"],
  ["direct-mjpeg", "Direct MJPEG"],
  ["direct-http", "Direct HTTP/JPEG/HLS"],
  ["direct-rtsp", "Direct RTSP"],
  ["bambu", "Bambu Native"],
];

function CameraPreview({ source }: { source: CameraSource }) {
  const canRender =
    source.streamUrl &&
    ["mjpeg", "snapshot", "hls"].includes(source.streamKind);

  if (canRender && source.streamKind === "hls") {
    return (
      <video
        className="h-full w-full bg-black object-cover"
        controls
        muted
        playsInline
        src={source.streamUrl}
      />
    );
  }

  if (canRender) {
    return (
      <img
        alt={`${source.name} live preview`}
        className="h-full w-full bg-black object-cover"
        src={source.snapshotUrl ?? source.streamUrl}
      />
    );
  }

  return (
    <div className="grid h-full place-items-center bg-black/40 px-6 text-center">
      <div>
        <div className="text-sm uppercase tracking-[0.22em] text-zinc-500">
          {source.streamKind === "rtsp" || source.streamKind === "bambu-native"
            ? "Restream Needed"
            : "No Preview"}
        </div>
        <p className="mt-3 text-sm leading-6 text-zinc-300">{source.details}</p>
      </div>
    </div>
  );
}

export function CamerasPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CameraSourceInput>({
    frigateBaseUrl: "",
    frigateCamera: "",
    name: "",
    password: "",
    provider: "frigate",
    streamUrl: "",
    username: "",
  });
  const [assignment, setAssignment] = useState<CameraAssignmentInput>({
    feedLabel: "Printer Cam",
    printerId: "",
    sourceId: "",
  });
  const [lastTest, setLastTest] = useState<CameraTestResult | null>(null);

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
  const createMutation = useMutation({
    mutationFn: (input: CameraSourceInput) =>
      apiFetch<{ source: CameraSource; test: CameraTestResult }>(
        "/api/cameras/sources",
        {
          body: JSON.stringify(input),
          method: "POST",
        },
      ),
    onSuccess: ({ source, test }) => {
      setLastTest(test);
      startTransition(() => {
        setAssignment((current) => ({
          ...current,
          sourceId: source.id,
        }));
        setForm({
          frigateBaseUrl: "",
          frigateCamera: "",
          name: "",
          password: "",
          provider: "frigate",
          streamUrl: "",
          username: "",
        });
      });
      void queryClient.invalidateQueries({ queryKey: ["cameras"] });
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

  function submitSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate(form);
  }

  function testSource() {
    testMutation.mutate(form);
  }

  function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    assignMutation.mutate(assignment);
  }

  if (camerasQuery.isLoading || !camerasQuery.data) {
    return <div className="panel">Loading camera sources...</div>;
  }

  const sources = camerasQuery.data.sources;
  const persistedSources = sources.filter((source) =>
    /^[0-9a-f-]{36}$/i.test(source.id),
  );
  const printers = printersQuery.data?.printers ?? [];

  return (
    <div className="space-y-5">
      <p className="text-base leading-7 text-zinc-400">
        Add Frigate, direct HTTP/MJPEG/HLS, RTSP, and native Bambu camera
        sources, then assign any source to a printer feed slot. Browser playback
        works through BambuView&apos;s proxy for Frigate and HTTP-compatible
        streams.
      </p>

      <section className="panel">
        <div className="section-title">Add Camera Source</div>
        <form
          className="mt-5 grid gap-4 xl:grid-cols-4"
          onSubmit={submitSource}
        >
          <label className="space-y-2">
            <span className="text-sm font-medium text-zinc-300">Name</span>
            <input
              className="input-field"
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Workbench Left"
              value={form.name}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-zinc-300">Provider</span>
            <select
              className="input-field"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  provider: event.target.value as CameraProviderType,
                }))
              }
              value={form.provider}
            >
              {providerOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {form.provider === "frigate" ? (
            <>
              <label className="space-y-2">
                <span className="text-sm font-medium text-zinc-300">
                  Frigate URL
                </span>
                <input
                  className="input-field"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      frigateBaseUrl: event.target.value,
                    }))
                  }
                  placeholder="http://frigate:5000"
                  value={form.frigateBaseUrl ?? ""}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-zinc-300">
                  Camera Name
                </span>
                <input
                  className="input-field"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      frigateCamera: event.target.value,
                    }))
                  }
                  placeholder="workbench_left"
                  value={form.frigateCamera ?? ""}
                />
              </label>
            </>
          ) : (
            <label className="space-y-2 xl:col-span-2">
              <span className="text-sm font-medium text-zinc-300">
                Stream URL
              </span>
              <input
                className="input-field"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    streamUrl: event.target.value,
                  }))
                }
                placeholder="http://camera.local/video.mjpg"
                value={form.streamUrl ?? ""}
              />
            </label>
          )}
          <label className="space-y-2">
            <span className="text-sm font-medium text-zinc-300">Username</span>
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
          <label className="space-y-2">
            <span className="text-sm font-medium text-zinc-300">
              Password / Token
            </span>
            <input
              className="input-field"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              placeholder="Stored server-side"
              type="password"
              value={form.password ?? ""}
            />
          </label>
          <div className="flex flex-wrap items-end gap-3 xl:col-span-2">
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
              disabled={createMutation.isPending}
              type="submit"
            >
              <Save className="h-4 w-4" />
              <span>
                {createMutation.isPending ? "Saving..." : "Save Source"}
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

      <section className="panel">
        <div className="section-title">Assign Feed</div>
        <form
          className="mt-5 grid gap-4 md:grid-cols-4"
          onSubmit={submitAssignment}
        >
          <label className="space-y-2">
            <span className="text-sm font-medium text-zinc-300">Printer</span>
            <select
              className="input-field"
              onChange={(event) =>
                setAssignment((current) => ({
                  ...current,
                  printerId: event.target.value,
                }))
              }
              value={assignment.printerId}
            >
              <option value="">Select printer</option>
              {printers.map((printer) => (
                <option key={printer.id} value={printer.id}>
                  {printer.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-zinc-300">Source</span>
            <select
              className="input-field"
              onChange={(event) =>
                setAssignment((current) => ({
                  ...current,
                  sourceId: event.target.value,
                }))
              }
              value={assignment.sourceId}
            >
              <option value="">Select source</option>
              {persistedSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-zinc-300">
              Feed Label
            </span>
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
          <div className="flex items-end">
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
              <span>
                {assignMutation.isPending ? "Assigning..." : "Assign"}
              </span>
            </button>
          </div>
        </form>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        {sources.map((source) => {
          const SourceIcon = providerIcons[source.provider];

          return (
            <section className="panel" key={source.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
                    <SourceIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white">
                      {source.name}
                    </h3>
                    <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">
                      {source.provider.replace("-", " ")} / {source.streamKind}
                    </div>
                  </div>
                </div>
                <div className={`status-pill status-pill--${source.status}`}>
                  {source.status}
                </div>
              </div>
              <div className="camera-stage mt-5">
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
              <div className="mt-4 border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-zinc-400">
                <div className="font-medium text-zinc-200">Source</div>
                <div className="mt-2 break-all">{source.streamUrl}</div>
                <p className="mt-2 leading-6">{source.details}</p>
              </div>
            </section>
          );
        })}
      </div>

      <section className="panel">
        <div className="section-title">Assignments</div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              <tr>
                <th className="pb-4">Printer</th>
                <th className="pb-4">Source</th>
                <th className="pb-4">Feed Label</th>
                <th className="pb-4">Feed ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {camerasQuery.data.assignments.map((item) => (
                <tr key={`${item.printerId}-${item.feedId}`}>
                  <td className="py-4 text-zinc-100">{item.printerName}</td>
                  <td className="py-4 text-zinc-300">{item.sourceName}</td>
                  <td className="py-4 text-zinc-300">{item.feedLabel}</td>
                  <td className="py-4 text-zinc-500">{item.feedId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
