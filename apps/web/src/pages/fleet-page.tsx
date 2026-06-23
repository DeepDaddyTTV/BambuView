import { Search, SlidersHorizontal } from "lucide-react";
import { startTransition, useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import type { FleetOverview, PrinterDetail } from "@bambuview/contracts";

import { PrinterCard, PrinterDetailPanel, StatsBar } from "../components/fleet-shared";
import { apiFetch } from "../lib/api";

const filters = [
  { key: "all", label: "All" },
  { key: "printing", label: "Printing" },
  { key: "idle", label: "Idle" },
  { key: "paused", label: "Paused" },
  { key: "offline", label: "Offline" },
  { key: "farm", label: "Farms" }
] as const;

export function FleetPage() {
  const overviewQuery = useQuery({
    queryKey: ["fleet-overview"],
    queryFn: () => apiFetch<FleetOverview>("/api/fleet/overview")
  });

  const [selectedPrinterId, setSelectedPrinterId] = useState("");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]["key"]>("all");
  const deferredSearch = useDeferredValue(search);

  const overview = overviewQuery.data;
  const currentSelectedPrinterId = selectedPrinterId || overview?.selectedPrinterId || "";
  const printerDetailQuery = useQuery({
    enabled: currentSelectedPrinterId.length > 0,
    queryKey: ["printer-detail", currentSelectedPrinterId],
    queryFn: () => apiFetch<PrinterDetail>(`/api/printers/${currentSelectedPrinterId}`)
  });

  const filteredPrinters = useMemo(() => {
    if (!overview) {
      return [];
    }

    return overview.printers.filter((printer) => {
      const matchesSearch =
        deferredSearch.trim().length === 0 ||
        printer.name.toLowerCase().includes(deferredSearch.toLowerCase()) ||
        printer.fileName.toLowerCase().includes(deferredSearch.toLowerCase()) ||
        printer.location.toLowerCase().includes(deferredSearch.toLowerCase());

      const matchesFilter =
        activeFilter === "all"
          ? true
          : activeFilter === "farm"
            ? printer.previewKind === "farm"
            : printer.status === activeFilter;

      return matchesSearch && matchesFilter;
    });
  }, [activeFilter, deferredSearch, overview]);

  if (overviewQuery.isLoading || !overview || printerDetailQuery.isLoading || !printerDetailQuery.data) {
    return <div className="panel">Loading the fleet view…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-base leading-7 text-zinc-400">
            Monitor and manage your entire printer fleet.
          </p>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="inline-flex rounded-full border border-white/8 bg-white/[0.03] p-1">
            {filters.map((filter) => (
              <button
                className={`rounded-full px-4 py-2 text-sm transition ${
                  activeFilter === filter.key
                    ? "bg-[color:var(--accent-soft)] text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
                key={filter.key}
                onClick={() => setActiveFilter(filter.key)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-3 rounded-full border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-zinc-400">
            <Search className="h-4 w-4" />
            <input
              className="w-full bg-transparent text-white outline-none placeholder:text-zinc-600 lg:w-72"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search printers, farms, cameras…"
              value={search}
            />
          </label>
          <button
            className="icon-button"
            type="button"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>
      <StatsBar overview={overview} />
      <div className="grid gap-6 2xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          {filteredPrinters.map((printer) => (
            <PrinterCard
              isSelected={printer.id === currentSelectedPrinterId}
              key={printer.id}
              onClick={() => startTransition(() => setSelectedPrinterId(printer.id))}
              printer={printer}
            />
          ))}
          <div className="rounded-[28px] border border-dashed border-white/10 px-6 py-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-2xl font-semibold text-white">Add Printer or Farm</h3>
                <p className="mt-2 max-w-xl text-sm leading-7 text-zinc-400">
                  Connect a Bambu Lab printer or create a farm group to manage multiple printers.
                </p>
              </div>
              <button
                className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-[color:var(--accent)] text-[color:var(--accent)]"
                type="button"
              >
                +
              </button>
            </div>
          </div>
        </div>
        <PrinterDetailPanel printer={printerDetailQuery.data} />
      </div>
    </div>
  );
}
