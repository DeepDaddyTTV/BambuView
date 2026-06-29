import { ExternalLink, Rocket, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import type {
  BambuConnectImportResponse,
  PrepareStatus,
} from "@bambuview/contracts";

import { apiFetch } from "../lib/api";
import { APP_VERSION } from "../app/version";

export function PreparePage() {
  const [connectPath, setConnectPath] = useState("");
  const [connectName, setConnectName] = useState("");
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

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="panel">
        <div className="flex items-center gap-3 text-[color:var(--accent)]">
          <Rocket className="h-5 w-5" />
          <span className="font-medium">
            Prepare & Slice includes Bambu Connect handoff in `{APP_VERSION}`
            alpha.
          </span>
        </div>
        <h2 className="mt-6 text-4xl font-semibold text-white">
          {statusQuery.data.headline}
        </h2>
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
        <div className="flex items-center gap-3 text-[color:var(--accent)]">
          <Send className="h-5 w-5" />
          <div className="section-title">Bambu Connect handoff</div>
        </div>
        <p className="mt-4 text-sm leading-7 text-zinc-400">
          Bambu Connect accepts sliced Bambu G-code or 3MF files through its
          official import URL scheme. Use an absolute path that exists on the
          computer where Bambu Connect is installed.
        </p>
        <form className="mt-6 grid gap-4" onSubmit={generateBambuConnectLink}>
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
          <div className="mt-6 border border-[color:var(--accent)] bg-[color:var(--accent-10)] p-4">
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
      </section>
    </div>
  );
}
