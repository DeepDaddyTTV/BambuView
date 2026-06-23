import { Rocket } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import type { PrepareStatus } from "@bambuview/contracts";

import { apiFetch } from "../lib/api";

export function PreparePage() {
  const statusQuery = useQuery({
    queryKey: ["prepare-status"],
    queryFn: () => apiFetch<PrepareStatus>("/api/prepare/status")
  });

  if (statusQuery.isLoading || !statusQuery.data) {
    return <div className="panel">Loading prepare workspace…</div>;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="panel">
        <div className="flex items-center gap-3 text-[color:var(--accent)]">
          <Rocket className="h-5 w-5" />
          <span className="font-medium">Prepare & Slice is staged in `0.0.4`.</span>
        </div>
        <h2 className="mt-6 text-4xl font-semibold text-white">{statusQuery.data.headline}</h2>
        <p className="mt-5 max-w-3xl text-base leading-8 text-zinc-400">
          {statusQuery.data.description}
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {statusQuery.data.capabilities.map((capability) => (
            <div
              className="rounded-[24px] border border-white/8 bg-white/[0.03] px-5 py-5 text-zinc-200"
              key={capability}
            >
              {capability}
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="section-title">Planned editor shape</div>
        <div className="prepare-wireframe mt-5">
          <div className="prepare-wireframe__rail" />
          <div className="prepare-wireframe__canvas" />
          <div className="prepare-wireframe__inspector" />
        </div>
        <p className="mt-5 text-sm leading-7 text-zinc-400">
          This route already preserves the place in the shell for the future Orca/Prusa-derived editor so the rest of the product can ship without relayout later.
        </p>
      </section>
    </div>
  );
}
