import {
  ArrowDown,
  ArrowUp,
  Fan,
  Flame,
  LampDesk,
  Maximize2,
  Minimize2,
  Move3d,
  Pause,
  Play,
  Square,
  Thermometer,
  Video,
  X
} from "lucide-react";
import { startTransition, useDeferredValue, useEffect, useState } from "react";

import type {
  AppearanceSettings,
  FleetOverview,
  PrinterCameraFeed,
  PrinterDetail,
  PrinterSummary
} from "@bambuview/contracts";

import { appearanceStyleClass } from "../app/appearance";
import { PrinterPreviewArt } from "./art";

const PRINTING_GREEN = "var(--accent)";
const PRINTING_GREEN_CLASS = "text-[color:var(--accent)]";
const PRINTING_GREEN_BG_CLASS = "bg-[color:var(--accent)]";

function statusTone(status: PrinterSummary["status"]) {
  if (status === "printing") return PRINTING_GREEN_CLASS;
  if (status === "paused") return "text-amber-400";
  if (status === "idle") return "text-sky-400";
  return "text-zinc-400";
}

function progressTone(status: PrinterSummary["status"]) {
  if (status === "paused") return "bg-amber-400";
  if (status === "idle") return "bg-sky-400";
  return PRINTING_GREEN_BG_CLASS;
}

function previewColor(printer: Pick<PrinterSummary, "slots">) {
  return printer.slots.find((slot) => slot.active)?.color ?? printer.slots[0]?.color;
}

export function StatsBar({ overview }: { overview: FleetOverview }) {
  const items = [
    ["PRINTERS", overview.stats.printers, "Online"],
    ["ACTIVE PRINTS", overview.stats.activePrints, "Printing"],
    ["COMPLETED", overview.stats.completedToday, "Today"],
    ["FARM GROUPS", overview.stats.farmGroups, "Online"]
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[28px] border border-white/8 bg-white/6 xl:grid-cols-4">
      {items.map(([label, value, sublabel]) => (
        <div
          className="bg-[color:var(--panel)] px-5 py-5 sm:px-7"
          key={label}
        >
          <div className="text-[11px] font-semibold tracking-[0.24em] text-zinc-500">
            {label}
          </div>
          <div className="mt-3 text-4xl font-semibold text-white">{value}</div>
          <div className="mt-2 flex items-center gap-2 text-sm text-zinc-300">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PRINTING_GREEN }} />
            {sublabel}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PrinterCard({
  isSelected,
  onClick,
  printer
}: {
  isSelected: boolean;
  onClick: () => void;
  printer: PrinterSummary;
}) {
  return (
    <button
      className={`panel cursor-pointer text-left transition hover:-translate-y-0.5 ${
        isSelected ? "ring-1 ring-[color:var(--accent)]" : ""
      }`}
      onClick={onClick}
      type="button"
    >
      <div className="grid gap-5 xl:grid-cols-[110px_1fr]">
        <PrinterPreviewArt
          className="h-[108px]"
          kind={printer.previewKind}
          primaryColor={previewColor(printer)}
        />
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="chip">{printer.shortCode}</div>
              <h3 className="mt-4 text-[30px] font-semibold leading-none text-white">
                {printer.name}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                <span className={`font-medium ${statusTone(printer.status)}`}>
                  {printer.statusLabel}
                </span>
                <span>&bull;</span>
                <span>{printer.layer}</span>
              </div>
            </div>
            <div className="text-right text-zinc-400">
              <div className={`text-5xl font-semibold ${statusTone(printer.status)}`}>
                {printer.progress}%
              </div>
              <div className="mt-1 text-sm">{printer.elapsed}</div>
              <div className="text-sm">{printer.eta}</div>
            </div>
          </div>
          <div className="mt-5">
            <div className="h-2.5 overflow-hidden rounded-full bg-white/8">
              <div
                className={`h-full rounded-full ${progressTone(printer.status)}`}
                style={{ width: `${printer.progress}%` }}
              />
            </div>
          </div>
          <div className="mt-4 text-lg text-zinc-200">{printer.fileName}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
            <span>{printer.material}</span>
            <span>&bull;</span>
            <span>{printer.nozzleProfile}</span>
            <span>&bull;</span>
            <span>{printer.materialColor}</span>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-white/8 pt-4">
            <div className="flex flex-wrap gap-3">
              {printer.slots.map((slot) => (
                <div
                  className="flex items-center gap-2 text-sm text-zinc-300"
                  key={slot.slot}
                >
                  <span>{slot.label}</span>
                  <span
                    className="h-5 w-5 rounded-md border border-white/10"
                    style={{ backgroundColor: slot.color, opacity: slot.active ? 1 : 0.72 }}
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm text-[color:var(--accent)]">
              <Video className="h-4 w-4" />
              {printer.cameraLabel}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

function CameraFeedTabs({
  feeds,
  onSelect,
  selectedFeedId
}: {
  feeds: PrinterCameraFeed[];
  onSelect: (feedId: string) => void;
  selectedFeedId: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {feeds.map((feed) => (
        <button
          className={`rounded-full border px-4 py-2 text-sm transition ${
            selectedFeedId === feed.id
              ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-white"
              : "border-white/8 bg-white/[0.03] text-zinc-400 hover:border-white/14"
          }`}
          key={feed.id}
          onClick={() => onSelect(feed.id)}
          type="button"
        >
          {feed.label}
        </button>
      ))}
    </div>
  );
}

function CameraFeedFrame({
  printer,
  selectedFeedId
}: {
  printer: PrinterDetail;
  selectedFeedId: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-4">
      <div className="camera-stage">
        <div className="camera-stage__top">
          <div className="text-sm text-zinc-300">{printer.cameraLabel}</div>
          <div className="camera-stage__meta">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PRINTING_GREEN }} />
            Live
            <span>&bull;</span>
            {selectedFeedId.replace(`${printer.shortCode.toLowerCase()}-`, "").replaceAll("-", " ")}
          </div>
        </div>
        <div className="camera-stage__viewport">
          <div className="camera-stage__machine" />
          <div className="camera-stage__print">
            <PrinterPreviewArt
              className="h-full"
              kind={printer.previewKind}
              primaryColor={previewColor(printer)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function FullscreenControlDeck({
  controlTab,
  movementLabel,
  onMovement,
  setAutoRefillEnabled,
  setControlTab,
  setFanPower,
  setLampEnabled,
  setSelectedSlot,
  fanPower,
  lampEnabled,
  printer,
  selectedSlot,
  autoRefillEnabled
}: {
  autoRefillEnabled: boolean;
  controlTab: "printer-parts" | "print-options" | "calibration";
  fanPower: number;
  lampEnabled: boolean;
  movementLabel: string;
  onMovement: (label: string) => void;
  printer: PrinterDetail;
  selectedSlot: string;
  setAutoRefillEnabled: (next: boolean) => void;
  setControlTab: (next: "printer-parts" | "print-options" | "calibration") => void;
  setFanPower: (next: number) => void;
  setLampEnabled: (next: boolean) => void;
  setSelectedSlot: (next: string) => void;
}) {
  return (
    <section className="panel">
      <div className="flex items-center justify-between gap-4">
        <div className="section-title">Control</div>
        <div className="flex flex-wrap gap-2">
          {[
            ["printer-parts", "Printer Parts"],
            ["print-options", "Print Options"],
            ["calibration", "Calibration"]
          ].map(([tabKey, label]) => (
            <button
              className={`rounded-xl px-4 py-2 text-sm transition ${
                controlTab === tabKey
                  ? "bg-[color:var(--accent)] text-zinc-950"
                  : "bg-white/[0.04] text-zinc-300"
              }`}
              key={tabKey}
              onClick={() => setControlTab(tabKey as typeof controlTab)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 grid gap-5">
        <div className="grid gap-5 xl:grid-cols-[220px_1fr_120px]">
          <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
            {printer.temperatures.map((temperature) => (
              <div
                className="border-b border-white/8 py-4 last:border-b-0 last:pb-0 first:pt-0"
                key={temperature.label}
              >
                <div className="flex items-center gap-3 text-zinc-400">
                  <Thermometer className="h-4 w-4" />
                  <span>{temperature.label}</span>
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {temperature.current}
                  <span className="ml-2 text-base font-normal text-zinc-500">/ {temperature.target}</span>
                </div>
              </div>
            ))}
            <div className="mt-4 border-t border-white/8 pt-4">
              <div className="flex items-center gap-3 text-zinc-400">
                <Fan className="h-4 w-4" />
                Fan
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-2xl font-semibold text-white">{fanPower}%</span>
                <input
                  className="accent-[var(--accent)]"
                  max="100"
                  min="0"
                  onChange={(event) => setFanPower(Number(event.target.value))}
                  type="range"
                  value={fanPower}
                />
              </div>
              <button
                className={`mt-4 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm ${
                  lampEnabled
                    ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-white"
                    : "border-white/10 text-zinc-300"
                }`}
                onClick={() => setLampEnabled(!lampEnabled)}
                type="button"
              >
                <LampDesk className="h-4 w-4" />
                Lamp {lampEnabled ? "On" : "Off"}
              </button>
            </div>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
            <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">Motion</div>
            <div className="mt-5 grid place-items-center">
              <div className="motion-pad">
                <button className="motion-pad__home" onClick={() => onMovement("Home")} type="button">
                  Home
                </button>
                <button className="motion-pad__north" onClick={() => onMovement("Y +10")} type="button">
                  Y+
                </button>
                <button className="motion-pad__south" onClick={() => onMovement("Y -10")} type="button">
                  Y-
                </button>
                <button className="motion-pad__west" onClick={() => onMovement("X -10")} type="button">
                  X-
                </button>
                <button className="motion-pad__east" onClick={() => onMovement("X +10")} type="button">
                  X+
                </button>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-4 gap-3">
              {[
                { icon: <ArrowUp className="h-4 w-4" />, label: "Z +10" },
                { icon: <ArrowUp className="h-4 w-4" />, label: "Z +1" },
                { icon: <ArrowDown className="h-4 w-4" />, label: "Bed -1" },
                { icon: <ArrowDown className="h-4 w-4" />, label: "Bed -10" }
              ].map(({ icon, label }) => (
                <button
                  className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-xs text-zinc-200"
                  key={label}
                  onClick={() => onMovement(label)}
                  type="button"
                >
                  <span className="mb-2 flex justify-center">{icon}</span>
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4 text-sm text-zinc-500">Last command: {movementLabel}</div>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
            <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">Extruder</div>
            <div className="mt-4 flex h-full flex-col items-center justify-between">
              <button className="icon-button h-14 w-14" type="button">
                <ArrowUp className="h-5 w-5" />
              </button>
              <div className="grid h-[4.5rem] w-[4.5rem] place-items-center rounded-[24px] border border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
                <Flame className="h-6 w-6" />
              </div>
              <button className="icon-button h-14 w-14" type="button">
                <ArrowDown className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
        <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Move3d className="h-4 w-4 text-[color:var(--accent)]" />
              <span className="font-medium text-white">AMS</span>
            </div>
            <button
              className={`rounded-full border px-4 py-2 text-sm ${
                autoRefillEnabled
                  ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-white"
                  : "border-white/10 text-zinc-300"
              }`}
              onClick={() => setAutoRefillEnabled(!autoRefillEnabled)}
              type="button"
            >
              Auto-refill {autoRefillEnabled ? "On" : "Off"}
            </button>
          </div>
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {printer.slots.map((slot) => (
                <button
                  className={`rounded-[22px] border p-4 text-left ${
                    selectedSlot === slot.slot
                      ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)]"
                      : "border-white/8 bg-white/[0.02]"
                  }`}
                  key={slot.slot}
                  onClick={() => setSelectedSlot(slot.slot)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-zinc-400">{slot.slot}</span>
                    <span
                      className="h-4 w-4 rounded-md border border-white/8"
                      style={{ backgroundColor: slot.color }}
                    />
                  </div>
                  <div className="mt-6 text-2xl font-semibold text-white">{slot.material}</div>
                  <div className="mt-2 text-sm text-zinc-300">{selectedSlot === slot.slot ? "Loaded" : "Ready"}</div>
                </button>
              ))}
            </div>
            <div className="rounded-[22px] border border-white/8 bg-white/[0.02] p-4">
              <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">Selected filament</div>
              <div className="mt-4 text-3xl font-semibold text-white">{selectedSlot}</div>
              <div className="mt-2 text-sm text-zinc-400">
                {printer.slots.find((slot) => slot.slot === selectedSlot)?.material} spool routed to the extruder path.
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button className="rounded-full border border-white/10 px-4 py-3 text-white" type="button">
                  Unload
                </button>
                <button className="rounded-full bg-[color:var(--accent)] px-4 py-3 font-medium text-zinc-950" type="button">
                  Load
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4 text-sm text-zinc-400">
          {controlTab === "printer-parts"
            ? "Printer parts mode exposes motion, filament path, and direct machine controls first."
            : controlTab === "print-options"
              ? "Print options will house speed, flow, cooling, and future live tuning controls."
              : "Calibration will house bed leveling, vibration compensation, flow calibration, and maintenance sequences."}
        </div>
      </div>
    </section>
  );
}

function FullscreenPrinterWorkspace({
  autoRefillEnabled,
  controlTab,
  fanPower,
  lampEnabled,
  movementLabel,
  onFocusModeChange,
  onMovement,
  printer,
  selectedFeedId,
  selectedSlot,
  setAutoRefillEnabled,
  setControlTab,
  setFanPower,
  setLampEnabled,
  setSelectedFeedId,
  setSelectedSlot
}: {
  autoRefillEnabled: boolean;
  controlTab: "printer-parts" | "print-options" | "calibration";
  fanPower: number;
  lampEnabled: boolean;
  movementLabel: string;
  onFocusModeChange: (next: boolean) => void;
  onMovement: (label: string) => void;
  printer: PrinterDetail;
  selectedFeedId: string;
  selectedSlot: string;
  setAutoRefillEnabled: (next: boolean) => void;
  setControlTab: (next: "printer-parts" | "print-options" | "calibration") => void;
  setFanPower: (next: number) => void;
  setLampEnabled: (next: boolean) => void;
  setSelectedFeedId: (next: string) => void;
  setSelectedSlot: (next: string) => void;
}) {
  return (
    <aside className="detail-panel detail-panel--focus">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">Fullscreen printer workspace</div>
          <h2 className="mt-2 text-[42px] font-semibold leading-none text-white">{printer.name}</h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            aria-label="Restore detail panel"
            className="icon-button"
            onClick={() => onFocusModeChange(false)}
            type="button"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
          <button
            aria-label="Close fullscreen workspace"
            className="icon-button"
            onClick={() => onFocusModeChange(false)}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-8 grid gap-6 xl:grid-cols-[1.22fr_0.78fr]">
        <div className="space-y-6">
          <section className="panel">
            <div className="flex items-center justify-between gap-4">
              <div className="section-title">Camera</div>
              <CameraFeedTabs
                feeds={printer.cameraFeeds}
                onSelect={(feedId) => startTransition(() => setSelectedFeedId(feedId))}
                selectedFeedId={selectedFeedId}
              />
            </div>
            <div className="camera-stage mt-5">
              <div className="camera-stage__top">
                <div className="text-sm text-zinc-300">{printer.cameraLabel}</div>
                <div className="camera-stage__meta">
                  <button className="icon-button icon-button--tiny" type="button">
                    <Video className="h-4 w-4" />
                  </button>
                  <button className="icon-button icon-button--tiny" type="button">
                    <Play className="h-4 w-4" />
                  </button>
                  <button className="icon-button icon-button--tiny" type="button">
                    <Maximize2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="camera-stage__viewport camera-stage__viewport--full">
                <div className="camera-feed-blur" />
                <div className="camera-stage__machine" />
                <div className="camera-stage__print camera-stage__print--full">
                  <PrinterPreviewArt className="h-full" kind={printer.previewKind} primaryColor={previewColor(printer)} />
                </div>
                <div className="camera-feed-watermark">Bambu Lab</div>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-white/8 px-4 py-3 text-sm text-zinc-400">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PRINTING_GREEN }} />
                  Live stream active
                </div>
                <div>Last move: {movementLabel}</div>
              </div>
            </div>
          </section>
          <section className="panel">
            <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">Printing Progress</div>
            <div className="mt-5 grid gap-5 lg:grid-cols-[120px_1fr]">
              <PrinterPreviewArt className="h-[112px]" kind={printer.previewKind} primaryColor={previewColor(printer)} />
              <div>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-2xl font-semibold text-white">{printer.fileName}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                      <span className={statusTone(printer.status)}>{printer.statusLabel}</span>
                      <span>&bull;</span>
                      <span>{printer.layer}</span>
                      <span>&bull;</span>
                      <span>{printer.printTimeRemaining} remaining</span>
                    </div>
                  </div>
                  <div className="text-right text-zinc-400">
                    <div>{printer.elapsed}</div>
                    <div>{printer.filamentUsed} used</div>
                  </div>
                </div>
                <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/8">
                  <div className={`h-full rounded-full ${progressTone(printer.status)}`} style={{ width: `${printer.progress}%` }} />
                </div>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <div className={`text-4xl font-semibold ${statusTone(printer.status)}`}>{printer.progress}%</div>
                  <div className="flex items-center gap-3">
                    <button className="icon-button text-amber-400" type="button">
                      <Pause className="h-4 w-4" />
                    </button>
                    <button className="icon-button text-red-400" type="button">
                      <Square className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
        <FullscreenControlDeck
          autoRefillEnabled={autoRefillEnabled}
          controlTab={controlTab}
          fanPower={fanPower}
          lampEnabled={lampEnabled}
          movementLabel={movementLabel}
          onMovement={onMovement}
          printer={printer}
          selectedSlot={selectedSlot}
          setAutoRefillEnabled={setAutoRefillEnabled}
          setControlTab={setControlTab}
          setFanPower={setFanPower}
          setLampEnabled={setLampEnabled}
          setSelectedSlot={setSelectedSlot}
        />
      </div>
    </aside>
  );
}

export function PrinterDetailPanel({
  printer
}: {
  printer: PrinterDetail;
}) {
  const [selectedFeedId, setSelectedFeedId] = useState(printer.selectedCameraFeedId);
  const [focusMode, setFocusMode] = useState(false);
  const [controlTab, setControlTab] = useState<"printer-parts" | "print-options" | "calibration">(
    "printer-parts"
  );
  const [fanPower, setFanPower] = useState(100);
  const [lampEnabled, setLampEnabled] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState(printer.slots.find((slot) => slot.active)?.slot ?? printer.slots[0]?.slot ?? "A1");
  const [autoRefillEnabled, setAutoRefillEnabled] = useState(true);
  const [movementLabel, setMovementLabel] = useState("Home");

  useEffect(() => {
    setSelectedFeedId(printer.selectedCameraFeedId);
    setFocusMode(false);
    setControlTab("printer-parts");
    setFanPower(100);
    setLampEnabled(true);
    setSelectedSlot(printer.slots.find((slot) => slot.active)?.slot ?? printer.slots[0]?.slot ?? "A1");
    setAutoRefillEnabled(true);
    setMovementLabel("Home");
  }, [printer]);

  if (focusMode) {
    return (
      <FullscreenPrinterWorkspace
        autoRefillEnabled={autoRefillEnabled}
        controlTab={controlTab}
        fanPower={fanPower}
        lampEnabled={lampEnabled}
        movementLabel={movementLabel}
        onFocusModeChange={setFocusMode}
        onMovement={setMovementLabel}
        printer={printer}
        selectedFeedId={selectedFeedId}
        selectedSlot={selectedSlot}
        setAutoRefillEnabled={setAutoRefillEnabled}
        setControlTab={setControlTab}
        setFanPower={setFanPower}
        setLampEnabled={setLampEnabled}
        setSelectedFeedId={setSelectedFeedId}
        setSelectedSlot={setSelectedSlot}
      />
    );
  }

  return (
    <aside className="detail-panel">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[42px] font-semibold leading-none text-white">{printer.name}</h2>
          <div className="mt-3 flex flex-wrap gap-6 text-sm text-zinc-400">
            {["Overview", "Jobs", "History", "Maintenance", "Config"].map((tab, index) => (
              <span
                className={index === 0 ? "border-b border-[color:var(--accent)] pb-2 text-white" : ""}
                key={tab}
              >
                {tab}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            aria-label="Focus detail panel"
            className="icon-button"
            onClick={() => setFocusMode(true)}
            type="button"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-8">
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <section className="panel">
              <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">Status</div>
              <div className={`mt-4 flex items-center gap-3 ${statusTone(printer.status)}`}>
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: PRINTING_GREEN }} />
                <span className="text-lg font-medium">{printer.statusLabel}</span>
              </div>
              <div className="mt-6 space-y-4 text-sm text-zinc-400">
                <div className="flex justify-between gap-4">
                  <span>File</span>
                  <span className="text-zinc-200">{printer.fileName}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Layer</span>
                  <span className="text-zinc-200">{printer.layer}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Progress</span>
                  <span className="text-zinc-200">{printer.progress}%</span>
                </div>
              </div>
              <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-white/8">
                <div className={`h-full rounded-full ${progressTone(printer.status)}`} style={{ width: `${printer.progress}%` }} />
              </div>
            </section>
            <section className="panel">
              <div className="section-title">Temperatures</div>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                {printer.temperatures.map((item) => (
                  <div
                    className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4"
                    key={item.label}
                  >
                    <div className="text-sm text-zinc-400">{item.label}</div>
                    <div className="mt-3 text-2xl font-semibold text-white">{item.current}</div>
                    <div className="text-sm text-zinc-500">Target {item.target}</div>
                  </div>
                ))}
              </div>
            </section>
            <section className="panel">
              <div className="section-title">Camera</div>
              <div className="mt-5">
                <CameraFeedTabs
                  feeds={printer.cameraFeeds}
                  onSelect={(feedId) => startTransition(() => setSelectedFeedId(feedId))}
                  selectedFeedId={selectedFeedId}
                />
              </div>
              <div className="mt-5">
                <CameraFeedFrame
                  printer={printer}
                  selectedFeedId={selectedFeedId}
                />
              </div>
            </section>
          </div>
          <div className="space-y-6">
            <section className="panel">
              <div className="section-title">Quick Info</div>
              <div className="mt-5 space-y-4 text-sm text-zinc-400">
                {[
                  ["Model", printer.name],
                  ["Serial", printer.serial],
                  ["Location", printer.location],
                  ["IP Address", printer.ipAddress],
                  ["Firmware", printer.firmwareVersion]
                ].map(([label, value]) => (
                  <div
                    className="flex justify-between gap-4"
                    key={label}
                  >
                    <span>{label}</span>
                    <span className="text-zinc-200">{value}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="panel">
              <div className="section-title">Filament</div>
              <div className="mt-5 grid gap-3">
                {printer.slots.map((slot) => (
                  <div
                    className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4"
                    key={slot.slot}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-white">{slot.label}</div>
                      <div
                        className="h-5 w-5 rounded-md border border-white/8"
                        style={{ backgroundColor: slot.color }}
                      />
                    </div>
                    <div className="mt-3 text-sm text-zinc-400">{slot.material}</div>
                  </div>
                ))}
              </div>
            </section>
            <section className="panel">
              <div className="section-title">Controls</div>
              <div className="mt-5 grid gap-3">
                {["Pause Print", "Stop Print", "Send File"].map((action, index) => (
                  <button
                    className={`rounded-full border px-5 py-3 text-sm font-medium transition ${
                      index === 0
                        ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-white"
                        : "border-white/10 bg-white/[0.03] text-zinc-200 hover:border-white/20"
                    }`}
                    key={action}
                    type="button"
                  >
                    {action}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function LiveFleetPreview({
  appearance,
  overview
}: {
  appearance: AppearanceSettings;
  overview: FleetOverview;
}) {
  const deferredPrinters = useDeferredValue(overview.printers.slice(0, 2));

  return (
    <div
      className={`${appearanceStyleClass(appearance.backgroundStyle)} live-fleet-preview rounded-[30px] border border-white/8 p-4 ${
        appearance.mode === "light" ? "bg-white text-zinc-900" : "bg-[color:var(--panel)] text-white"
      }`}
    >
      <StatsBar overview={overview} />
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {deferredPrinters.map((printer, index) => (
          <PrinterCard
            isSelected={index === 0}
            key={printer.id}
            onClick={() => undefined}
            printer={printer}
          />
        ))}
      </div>
    </div>
  );
}
