import { Camera, Link2, RadioTower, Wifi } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import type { CameraOverview } from "@bambuview/contracts";

import { apiFetch } from "../lib/api";

const providerIcons = {
  bambu: Camera,
  "direct-rtsp": Link2,
  frigate: RadioTower,
  "farm-overview": Wifi
};

export function CamerasPage() {
  const camerasQuery = useQuery({
    queryKey: ["cameras"],
    queryFn: () => apiFetch<CameraOverview>("/api/cameras")
  });

  if (camerasQuery.isLoading || !camerasQuery.data) {
    return <div className="panel">Loading camera sources…</div>;
  }

  return (
    <div className="space-y-6">
      <p className="text-base leading-7 text-zinc-400">
        Manage Frigate, direct RTSP, Bambu native feeds, and farm overview assignments from one routing layer.
      </p>
      <div className="grid gap-5 xl:grid-cols-2">
        {camerasQuery.data.sources.map((source) => {
          const SourceIcon = providerIcons[source.provider];

          return (
            <section
              className="panel"
              key={source.id}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
                    <SourceIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white">{source.name}</h3>
                    <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">
                      {source.provider.replace("-", " ")}
                    </div>
                  </div>
                </div>
                <div className={`status-pill status-pill--${source.status}`}>{source.status}</div>
              </div>
              <div className="camera-stage mt-6">
                <div className="camera-stage__top">
                  <div className="text-sm text-zinc-300">Assigned printers</div>
                  <div className="camera-stage__meta">{source.assignedTo.length} linked</div>
                </div>
                <div className="camera-stage__viewport camera-stage__viewport--wide">
                  <div className="camera-grid" />
                </div>
              </div>
              <div className="mt-5 rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-zinc-400">
                <div className="font-medium text-zinc-200">Stream URI</div>
                <div className="mt-2 break-all">{source.streamUrl}</div>
              </div>
            </section>
          );
        })}
      </div>
      <section className="panel">
        <div className="section-title">Assignments</div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead className="text-xs uppercase tracking-[0.2em] text-zinc-500">
              <tr>
                <th className="pb-4">Printer</th>
                <th className="pb-4">Assigned Feed</th>
                <th className="pb-4">Feed Label</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {camerasQuery.data.assignments.map((assignment) => (
                <tr key={`${assignment.printerId}-${assignment.feedId}`}>
                  <td className="py-4 text-zinc-100">{assignment.printerName}</td>
                  <td className="py-4 text-zinc-400">{assignment.feedId}</td>
                  <td className="py-4 text-zinc-300">{assignment.feedLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
