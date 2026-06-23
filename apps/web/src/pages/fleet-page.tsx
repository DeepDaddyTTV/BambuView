import {
  ArrowDown,
  ArrowUp,
  Ban,
  Camera,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  Fan,
  FileCode2,
  Flame,
  Grid2x2,
  LampDesk,
  LayoutGrid,
  List,
  Maximize2,
  Minimize2,
  Moon,
  MoreHorizontal,
  Move3d,
  Palette,
  Pause,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Settings,
  Square,
  Star,
  SunMedium,
  Thermometer,
  Users2,
  X
} from "lucide-react";
import { startTransition, useDeferredValue, useEffect, useState, type KeyboardEvent } from "react";
import { Link, NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import type { FleetOverview, PrinterDetail, PrinterSummary, UserProfile } from "@bambuview/contracts";

import { useAppearance } from "../app/appearance";
import { BrandLogo, PrinterPreviewArt } from "../components/art";
import { apiFetch } from "../lib/api";

const navigationItems = [
  { icon: Grid2x2, label: "Fleet", to: "/fleet" },
  { icon: FileCode2, label: "Prepare & Slice", to: "/prepare" },
  { icon: Camera, label: "Cameras", to: "/cameras" },
  { icon: Users2, label: "Users", to: "/users" },
  { icon: Settings, label: "Settings", to: "/settings" }
] as const;

const scopeOptions = [
  ["all", "All"],
  ["printers", "Printers"],
  ["farms", "Farms"],
  ["offline", "Offline"]
] as const;

const detailTabs = ["Overview", "Jobs", "History", "Maintenance", "Config"] as const;
const controlTabs = [
  ["printer-parts", "Printer Parts"],
  ["print-options", "Print Options"],
  ["calibration", "Calibration"]
] as const;

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function printerTone(printer: Pick<PrinterSummary, "status">) {
  if (printer.status === "paused") {
    return {
      dotClass: "fleet-console-dot--amber",
      progressClass: "fleet-console-meter__bar--amber",
      textClass: "fleet-console-text--amber"
    };
  }

  if (printer.status === "idle") {
    return {
      dotClass: "fleet-console-dot--blue",
      progressClass: "fleet-console-meter__bar--blue",
      textClass: "fleet-console-text--blue"
    };
  }

  if (printer.status === "offline") {
    return {
      dotClass: "fleet-console-dot--red",
      progressClass: "fleet-console-meter__bar--muted",
      textClass: "fleet-console-text--muted"
    };
  }

  return {
    dotClass: "fleet-console-dot--green",
    progressClass: "fleet-console-meter__bar--green",
    textClass: "fleet-console-text--green"
  };
}

function slotMetrics(printer: PrinterDetail, index: number) {
  if (printer.id === "x1-carbon-office") {
    return [
      { weight: "612g", percent: 72 },
      { weight: "411g", percent: 51 },
      { weight: "256g", percent: 32 },
      { weight: "812g", percent: 90 }
    ][index];
  }

  if (printer.status === "offline") {
    return [
      { weight: "812g", percent: 90 },
      { weight: "480g", percent: 52 },
      { weight: "198g", percent: 24 },
      { weight: "126g", percent: 14 }
    ][index];
  }

  if (printer.previewKind === "farm") {
    return [
      { weight: "12", percent: 100 },
      { weight: "8", percent: 68 },
      { weight: "6", percent: 51 },
      { weight: "4", percent: 34 }
    ][index];
  }

  return [
    { weight: "428g", percent: 63 },
    { weight: "311g", percent: 46 },
    { weight: "198g", percent: 31 },
    { weight: "612g", percent: 76 }
  ][index];
}

function fanMetrics(printer: PrinterDetail) {
  if (printer.status === "printing") {
    return { aux: "30%", part: "60%" };
  }

  if (printer.status === "paused") {
    return { aux: "18%", part: "24%" };
  }

  if (printer.status === "idle") {
    return { aux: "0%", part: "0%" };
  }

  return { aux: "—", part: "—" };
}

function previewColor(printer: Pick<PrinterSummary, "slots">) {
  return printer.slots.find((slot) => slot.active)?.color ?? printer.slots[0]?.color;
}

function FleetPreview({
  printer,
  large = false
}: {
  large?: boolean;
  printer: PrinterSummary;
}) {
  if (printer.status === "offline") {
    return (
      <div className={`fleet-console-preview ${large ? "fleet-console-preview--large" : ""}`}>
        <div className="fleet-console-preview__offline">
          <Ban className="h-10 w-10" />
        </div>
      </div>
    );
  }

  return (
    <div className={`fleet-console-preview ${large ? "fleet-console-preview--large" : ""}`}>
      <PrinterPreviewArt
        className="h-full w-full"
        kind={printer.previewKind}
        primaryColor={previewColor(printer)}
      />
    </div>
  );
}

function ModeToggle() {
  const { appearance, updateAppearance } = useAppearance();

  async function setMode(mode: "dark" | "light") {
    if (mode === appearance.mode) {
      return;
    }

    await updateAppearance({
      ...appearance,
      mode
    });
  }

  return (
    <div className="fleet-console-toolbar__group">
      {([
        { icon: Moon, key: "dark", label: "Dark" },
        { icon: SunMedium, key: "light", label: "Light" }
      ] as const).map((mode) => (
        <button
          className={`fleet-console-toolbar__mode ${appearance.mode === mode.key ? "fleet-console-toolbar__mode--active" : ""}`}
          key={mode.key}
          onClick={() => {
            void setMode(mode.key);
          }}
          type="button"
        >
          <mode.icon className="h-4 w-4" />
          <span>{mode.label}</span>
        </button>
      ))}
    </div>
  );
}

function SidebarCard({
  children,
  compact = false
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={`fleet-console-sidebar-card ${compact ? "fleet-console-sidebar-card--compact" : ""}`}>
      {children}
    </section>
  );
}

function FleetStats({
  overview
}: {
  overview: FleetOverview;
}) {
  const items = [
    { label: "PRINTERS", value: overview.stats.printers, sublabel: "Online" },
    { label: "ACTIVE PRINTS", value: overview.stats.activePrints, sublabel: "Printing" },
    { label: "COMPLETED", value: overview.stats.completedToday, sublabel: "Today" },
    { label: "FARM GROUPS", value: overview.stats.farmGroups, sublabel: "Online" }
  ];

  return (
    <section className="fleet-console-stats">
      {items.map((item) => (
        <div className="fleet-console-stats__item" key={item.label}>
          <div className="fleet-console-stats__label">{item.label}</div>
          <div className="fleet-console-stats__value">{item.value}</div>
          <div className="fleet-console-stats__meta">
            <span className="fleet-console-dot fleet-console-dot--green" />
            <span>{item.sublabel}</span>
          </div>
        </div>
      ))}
    </section>
  );
}

function StandardPrinterCard({
  isSelected,
  onSelect,
  printer
}: {
  isSelected: boolean;
  onSelect: () => void;
  printer: PrinterSummary;
}) {
  const tone = printerTone(printer);
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };

  return (
    <article
      aria-pressed={isSelected}
      className={`fleet-console-card ${isSelected ? "fleet-console-card--selected" : ""}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className="fleet-console-card__header">
        <div className="fleet-console-card__code">{printer.shortCode}</div>
        <div className="fleet-console-card__actions">
          {printer.id === "x1-carbon-office" ? <Star className="h-4 w-4" /> : null}
          <Camera className="h-4 w-4" />
          <span className={`fleet-console-dot ${tone.dotClass}`} />
        </div>
      </div>

      <div className="fleet-console-card__title-row">
        <div>
          <h3>{printer.name}</h3>
          <div className={`fleet-console-card__status ${tone.textClass}`}>
            {printer.statusLabel}
            {printer.status === "idle" ? " • " : " • "}
            {printer.layer}
          </div>
        </div>
      </div>

      <div className={`fleet-console-card__content ${printer.status === "offline" ? "fleet-console-card__content--offline" : ""}`}>
        <FleetPreview printer={printer} />

        {printer.status === "offline" ? (
          <div className="fleet-console-card__offline-copy">
            <div className="fleet-console-card__offline-title">Printer is offline</div>
            <div className="fleet-console-card__offline-body">Check the connection and power.</div>
          </div>
        ) : printer.status === "idle" ? (
          <div className="fleet-console-card__idle-copy">
            <div className="fleet-console-card__idle-topline">
              <div className="fleet-console-card__idle-body">
                <div className="fleet-console-card__idle-title">No active print</div>
                <div className="fleet-console-card__idle-subtitle">Send a print job to get started.</div>
              </div>
              <div className="fleet-console-card__time">
                <div>Idle</div>
                <div>Ready</div>
              </div>
            </div>
            <div className="fleet-console-card__meta-line">
              <span>{printer.material}</span>
              <span>&bull;</span>
              <span>{printer.nozzleProfile}</span>
              <span>&bull;</span>
              <span>{printer.materialColor}</span>
            </div>
            <div className="fleet-console-meter">
              <div className={`fleet-console-meter__bar ${tone.progressClass}`} style={{ width: "14%" }} />
            </div>
          </div>
        ) : (
          <div className="fleet-console-card__metrics">
            <div className={`fleet-console-card__percent ${tone.textClass}`}>{printer.progress}%</div>
            <div className="fleet-console-card__time">
              <div>{printer.elapsed}</div>
              <div>{printer.eta}</div>
            </div>
            <div className="fleet-console-card__file">{printer.fileName}</div>
            <div className="fleet-console-card__meta-line">
              <span>{printer.material}</span>
              <span>&bull;</span>
              <span>{printer.nozzleProfile}</span>
              <span>&bull;</span>
              <span>{printer.materialColor}</span>
            </div>
            <div className="fleet-console-meter">
              <div
                className={`fleet-console-meter__bar ${tone.progressClass}`}
                style={{ width: `${Math.max(printer.progress, 10)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="fleet-console-card__footer">
        <div className="fleet-console-card__footer-material">{printer.material}</div>
        <div className="fleet-console-card__slot-row">
          {printer.slots.map((slot) => (
            <span className="fleet-console-card__slot-chip" key={slot.slot}>
              <span>{slot.label}</span>
              <span className="fleet-console-card__slot-swatch" style={{ backgroundColor: slot.color }} />
            </span>
          ))}
        </div>
        <button className="fleet-console-card__more" type="button">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}

function FarmCard({
  isSelected,
  onSelect,
  printer
}: {
  isSelected: boolean;
  onSelect: () => void;
  printer: PrinterSummary;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };

  return (
    <article
      aria-pressed={isSelected}
      className={`fleet-console-card fleet-console-card--farm ${isSelected ? "fleet-console-card--selected" : ""}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className="fleet-console-card__header">
        <div className="fleet-console-card__farm-icon">
          <Grid2x2 className="h-4 w-4" />
        </div>
        <div className="fleet-console-card__actions">
          <Star className="h-4 w-4" />
          <span className="fleet-console-dot fleet-console-dot--muted" />
        </div>
      </div>

      <div className="fleet-console-card__title-row">
        <div>
          <h3>{printer.name}</h3>
          <div className="fleet-console-card__status fleet-console-text--green">4 Printers • 2 Printing</div>
        </div>
      </div>

      <div className="fleet-console-card__farm-layout">
        <FleetPreview printer={printer} />
        <div className="fleet-console-card__farm-metrics">
          <div className="fleet-console-card__farm-label">Overall Progress</div>
          <div className="fleet-console-card__farm-progress-row">
            <div className="fleet-console-card__farm-percent">42%</div>
            <div className="fleet-console-card__time">
              <div>{printer.elapsed}</div>
              <div>{printer.eta}</div>
            </div>
          </div>
          <div className="fleet-console-card__farm-jobs">
            <span>Active Jobs</span>
            <div>
              <span className="fleet-console-card__farm-pill fleet-console-card__farm-pill--green">2 Printing</span>
              <span className="fleet-console-card__farm-pill fleet-console-card__farm-pill--amber">1 Paused</span>
              <span className="fleet-console-card__farm-pill fleet-console-card__farm-pill--muted">1 Idle</span>
              <span className="fleet-console-card__farm-pill fleet-console-card__farm-pill--red">0 Offline</span>
            </div>
          </div>
        </div>
      </div>

      <div className="fleet-console-card__footer">
        <div className="fleet-console-card__footer-material">{printer.material}</div>
        <div className="fleet-console-card__slot-row">
          {printer.slots.map((slot) => (
            <span className="fleet-console-card__slot-chip" key={slot.slot}>
              <span>{slot.label}</span>
              <span className="fleet-console-card__slot-swatch" style={{ backgroundColor: slot.color }} />
            </span>
          ))}
        </div>
        <button className="fleet-console-card__more" type="button">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}

function FleetCard(props: {
  isSelected: boolean;
  onSelect: () => void;
  printer: PrinterSummary;
}) {
  if (props.printer.previewKind === "farm") {
    return <FarmCard {...props} />;
  }

  return <StandardPrinterCard {...props} />;
}

function AddCard() {
  return (
    <button className="fleet-console-add-card" type="button">
      <div className="fleet-console-add-card__icon">
        <Plus className="h-7 w-7" />
      </div>
      <div>
        <div className="fleet-console-add-card__title">Add Printer or Farm</div>
        <div className="fleet-console-add-card__copy">
          Connect a Bambu Lab printer or create a farm to manage multiple printers.
        </div>
      </div>
    </button>
  );
}

function FocusControlDeck({
  autoRefillEnabled,
  controlTab,
  fanPower,
  lampEnabled,
  movementLabel,
  onMovement,
  printer,
  selectedSlot,
  setAutoRefillEnabled,
  setControlTab,
  setFanPower,
  setLampEnabled,
  setSelectedSlot
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
          {controlTabs.map(([tabKey, label]) => (
            <button
              className={`fleet-console-focus-toggle ${controlTab === tabKey ? "fleet-console-focus-toggle--active" : ""}`}
              key={tabKey}
              onClick={() => setControlTab(tabKey)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-5">
        <div className="grid gap-5 xl:grid-cols-[208px_1fr_116px]">
          <div className="fleet-console-focus-surface">
            {printer.temperatures.map((temperature) => (
              <div
                className="fleet-console-focus-temp"
                key={temperature.label}
              >
                <div className="fleet-console-focus-temp__label">
                  <Thermometer className="h-4 w-4" />
                  <span>{temperature.label}</span>
                </div>
                <div className="fleet-console-focus-temp__value">
                  {temperature.current}
                  <span>/ {temperature.target}</span>
                </div>
              </div>
            ))}

            <div className="fleet-console-focus-temp fleet-console-focus-temp--fan">
              <div className="fleet-console-focus-temp__label">
                <Fan className="h-4 w-4" />
                <span>Fan</span>
              </div>
              <div className="fleet-console-focus-range">
                <span>{fanPower}%</span>
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
                className={`fleet-console-focus-lamp ${lampEnabled ? "fleet-console-focus-lamp--active" : ""}`}
                onClick={() => setLampEnabled(!lampEnabled)}
                type="button"
              >
                <LampDesk className="h-4 w-4" />
                Lamp
              </button>
            </div>
          </div>

          <div className="fleet-console-focus-surface">
            <div className="text-sm uppercase tracking-[0.22em] text-zinc-500">Motion</div>
            <div className="mt-5 grid place-items-center">
              <div className="motion-pad">
                <button className="motion-pad__home" onClick={() => onMovement("Home")} type="button">
                  <Move3d className="h-5 w-5" />
                </button>
                <button className="motion-pad__north" onClick={() => onMovement("Y +10")} type="button">
                  Y
                </button>
                <button className="motion-pad__south" onClick={() => onMovement("Y -10")} type="button">
                  -Y
                </button>
                <button className="motion-pad__west" onClick={() => onMovement("X -10")} type="button">
                  -X
                </button>
                <button className="motion-pad__east" onClick={() => onMovement("X +10")} type="button">
                  X
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
                  className="fleet-console-focus-step"
                  key={label}
                  onClick={() => onMovement(label)}
                  type="button"
                >
                  <span>{icon}</span>
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4 text-sm text-zinc-500">Last command: {movementLabel}</div>
          </div>

          <div className="fleet-console-focus-surface fleet-console-focus-surface--extruder">
            <div className="text-sm uppercase tracking-[0.22em] text-zinc-500">Extruder</div>
            <button className="fleet-console-focus-extruder-button" type="button">
              <ArrowUp className="h-5 w-5" />
            </button>
            <div className="fleet-console-focus-extruder-core">
              <Flame className="h-6 w-6" />
            </div>
            <button className="fleet-console-focus-extruder-button" type="button">
              <ArrowDown className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="fleet-console-focus-surface">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Move3d className="h-4 w-4 text-[color:var(--accent)]" />
              <span className="font-medium text-white">AMS</span>
            </div>
            <button
              className={`fleet-console-focus-toggle ${autoRefillEnabled ? "fleet-console-focus-toggle--active" : ""}`}
              onClick={() => setAutoRefillEnabled(!autoRefillEnabled)}
              type="button"
            >
              Auto-refill
            </button>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {printer.slots.map((slot) => (
                <button
                  className={`fleet-console-focus-slot ${selectedSlot === slot.slot ? "fleet-console-focus-slot--active" : ""}`}
                  key={slot.slot}
                  onClick={() => setSelectedSlot(slot.slot)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-zinc-400">{slot.slot}</span>
                    <span
                      className="h-4 w-4 rounded-md border border-white/10"
                      style={{ backgroundColor: slot.color }}
                    />
                  </div>
                  <div className="mt-6 text-2xl font-semibold text-white">{slot.material}</div>
                  <div className="mt-2 text-sm text-zinc-300">
                    {selectedSlot === slot.slot ? "Loaded" : "Ready"}
                  </div>
                </button>
              ))}
            </div>

            <div className="fleet-console-focus-slot-detail">
              <div className="text-sm uppercase tracking-[0.22em] text-zinc-500">Selected filament</div>
              <div className="mt-4 text-3xl font-semibold text-white">{selectedSlot}</div>
              <div className="mt-2 text-sm text-zinc-400">
                {printer.slots.find((slot) => slot.slot === selectedSlot)?.material} spool routed to the extruder path.
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button className="fleet-console-focus-action" type="button">
                  Unload
                </button>
                <button className="fleet-console-focus-action fleet-console-focus-action--primary" type="button">
                  Load
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="fleet-console-focus-copy">
          {controlTab === "printer-parts"
            ? "Printer parts mode keeps direct machine controls, movement, AMS, and live tuning in one place."
            : controlTab === "print-options"
              ? "Print options will house speed, flow, cooling, and future live tuning controls."
              : "Calibration will house bed leveling, vibration compensation, flow calibration, and maintenance sequences."}
        </div>
      </div>
    </section>
  );
}

function FocusWorkspace({
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
          <div className="text-sm uppercase tracking-[0.22em] text-zinc-500">Fullscreen printer workspace</div>
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
              <div className="fleet-console-camera-tabs fleet-console-camera-tabs--focus">
                {printer.cameraFeeds.map((feed) => (
                  <button
                    className={`fleet-console-camera-tabs__button ${selectedFeedId === feed.id ? "fleet-console-camera-tabs__button--active" : ""}`}
                    key={feed.id}
                    onClick={() => startTransition(() => setSelectedFeedId(feed.id))}
                    type="button"
                  >
                    {feed.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="camera-stage mt-5">
              <div className="camera-stage__top">
                <div className="text-sm text-zinc-300">{printer.cameraLabel}</div>
                <div className="camera-stage__meta">
                  <span className="fleet-console-dot fleet-console-dot--green" />
                  <span>Live stream</span>
                  <span>1080p</span>
                  <span>30 FPS</span>
                </div>
              </div>
              <div className="camera-stage__viewport camera-stage__viewport--full">
                <div className="camera-feed-blur" />
                <div className="camera-stage__machine" />
                <div className="camera-stage__print camera-stage__print--full">
                  <PrinterPreviewArt
                    className="h-full"
                    kind={printer.previewKind}
                    primaryColor={previewColor(printer)}
                  />
                </div>
                <div className="camera-feed-watermark">Bambu Lab</div>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-white/8 px-4 py-3 text-sm text-zinc-400">
                <div className="flex items-center gap-2">
                  <span className="fleet-console-dot fleet-console-dot--green" />
                  Live stream active
                </div>
                <div>Last move: {movementLabel}</div>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="text-sm uppercase tracking-[0.22em] text-zinc-500">Printing Progress</div>
            <div className="mt-5 grid gap-5 lg:grid-cols-[120px_1fr]">
              <PrinterPreviewArt
                className="h-[112px]"
                kind={printer.previewKind}
                primaryColor={previewColor(printer)}
              />
              <div>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-2xl font-semibold text-white">{printer.fileName}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                      <span className={printerTone(printer).textClass}>{printer.statusLabel}</span>
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
                  <div
                    className={`h-full rounded-full ${printerTone(printer).progressClass}`}
                    style={{ width: `${printer.progress}%` }}
                  />
                </div>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <div className={`text-4xl font-semibold ${printerTone(printer).textClass}`}>{printer.progress}%</div>
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

        <FocusControlDeck
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

function DetailPanel({
  focusMode,
  onClose,
  onToggleFocus,
  printer
}: {
  focusMode: boolean;
  onClose: () => void;
  onToggleFocus: () => void;
  printer: PrinterDetail;
}) {
  const [selectedFeedId, setSelectedFeedId] = useState(printer.selectedCameraFeedId);
  const [controlTab, setControlTab] = useState<"printer-parts" | "print-options" | "calibration">("printer-parts");
  const [fanPower, setFanPower] = useState(100);
  const [lampEnabled, setLampEnabled] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState(
    printer.slots.find((slot) => slot.active)?.slot ?? printer.slots[0]?.slot ?? "A1"
  );
  const [autoRefillEnabled, setAutoRefillEnabled] = useState(true);
  const [movementLabel, setMovementLabel] = useState("Home");
  const tone = printerTone(printer);
  const fans = fanMetrics(printer);

  useEffect(() => {
    startTransition(() => {
      setSelectedFeedId(printer.selectedCameraFeedId);
      setControlTab("printer-parts");
      setFanPower(100);
      setLampEnabled(true);
      setSelectedSlot(printer.slots.find((slot) => slot.active)?.slot ?? printer.slots[0]?.slot ?? "A1");
      setAutoRefillEnabled(true);
      setMovementLabel("Home");
    });
  }, [printer]);

  if (focusMode) {
    return (
      <FocusWorkspace
        autoRefillEnabled={autoRefillEnabled}
        controlTab={controlTab}
        fanPower={fanPower}
        lampEnabled={lampEnabled}
        movementLabel={movementLabel}
        onFocusModeChange={(next) => {
          if (!next) {
            onToggleFocus();
          }
        }}
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
    <aside className="fleet-console-detail">
      <div className="fleet-console-detail__header">
        <div className="fleet-console-detail__title">{printer.name}</div>
        <div className="fleet-console-detail__actions">
          <button className="fleet-console-detail__icon-button fleet-console-detail__icon-button--focus" onClick={onToggleFocus} type="button">
            <Maximize2 className="h-5 w-5" />
          </button>
          <button className="fleet-console-detail__icon-button" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="fleet-console-detail__tabs">
        {detailTabs.map((tab, index) => (
          <button
            className={`fleet-console-detail__tab ${index === 0 ? "fleet-console-detail__tab--active" : ""}`}
            key={tab}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>

      <section className="fleet-console-detail__section fleet-console-detail__section--status">
        <div className="fleet-console-section-title">Status</div>
        <div className="fleet-console-status">
          <div className="fleet-console-status__copy">
            <div className={`fleet-console-status__state ${tone.textClass}`}>
              <span className={`fleet-console-dot ${tone.dotClass}`} />
              <span>{printer.statusLabel}</span>
            </div>
            <div className="fleet-console-status__rows">
              <div><span>File</span><span>{printer.fileName}</span></div>
              <div><span>Layer</span><span>{printer.layer}</span></div>
              <div><span>Progress</span><span>{printer.progress}%</span></div>
              <div><span>Print Time</span><span>{printer.elapsed}</span></div>
              <div><span>ETA</span><span>{printer.eta}</span></div>
            </div>
            <div className="fleet-console-status__progress">
              <div className="fleet-console-meter">
                <div className={`fleet-console-meter__bar ${tone.progressClass}`} style={{ width: `${printer.progress}%` }} />
              </div>
            </div>
          </div>
          <FleetPreview large printer={printer} />
        </div>
      </section>

      <section className="fleet-console-detail__section">
        <div className="fleet-console-section-title">Temperatures</div>
        <div className="fleet-console-temperature-grid">
          {[
            { label: "Nozzle", value: printer.temperatures[0]?.current ?? "—", target: printer.temperatures[0]?.target ?? "—" },
            { label: "Bed", value: printer.temperatures[1]?.current ?? "—", target: printer.temperatures[1]?.target ?? "—" },
            { label: "Chamber", value: printer.temperatures[2]?.current ?? "—", target: printer.temperatures[2]?.target ?? "—" },
            { label: "Aux Fan", value: fans.aux, target: fans.aux },
            { label: "Part Fan", value: fans.part, target: fans.part }
          ].map((item) => (
            <div className="fleet-console-temperature-grid__item" key={item.label}>
              <div className="fleet-console-temperature-grid__label">
                <Thermometer className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </div>
              <div className="fleet-console-temperature-grid__value">{item.value}</div>
              <div className="fleet-console-temperature-grid__target">{item.target}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="fleet-console-detail__section">
        <div className="fleet-console-section-header">
          <div className="fleet-console-section-title">Filament</div>
          <div className="fleet-console-section-kicker">
            <span className="fleet-console-dot fleet-console-dot--green" />
            <span>AMS</span>
          </div>
        </div>
        <div className="fleet-console-filament-grid">
          {printer.slots.map((slot, index) => {
            const metrics = slotMetrics(printer, index);

            return (
              <div className="fleet-console-filament-card" key={slot.slot}>
                <div className="fleet-console-filament-card__top">
                  <div className="fleet-console-filament-card__slot">
                    {slot.slot}
                    {slot.active ? <span className="fleet-console-dot fleet-console-dot--green" /> : null}
                  </div>
                </div>
                <div className="fleet-console-filament-card__body">
                  <div className="fleet-console-filament-card__swatch" style={{ backgroundColor: slot.color }} />
                  <div>
                    <div className="fleet-console-filament-card__material">{slot.material}</div>
                    <div className="fleet-console-filament-card__color">{slot.colorName ?? printer.materialColor}</div>
                  </div>
                </div>
                <div className="fleet-console-filament-card__metrics">
                  <span>{metrics.weight}</span>
                  <span>{metrics.percent}%</span>
                </div>
                <div className="fleet-console-meter">
                  <div className="fleet-console-meter__bar fleet-console-meter__bar--green" style={{ width: `${metrics.percent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="fleet-console-detail__section">
        <div className="fleet-console-section-title">Camera</div>
        <div className="fleet-console-camera-tabs">
          {printer.cameraFeeds.map((feed) => (
            <button
              className={`fleet-console-camera-tabs__button ${selectedFeedId === feed.id ? "fleet-console-camera-tabs__button--active" : ""}`}
              key={feed.id}
              onClick={() => setSelectedFeedId(feed.id)}
              type="button"
            >
              {feed.label}
            </button>
          ))}
          <button className="fleet-console-camera-tabs__button fleet-console-camera-tabs__button--chevron" type="button">
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        <div className="fleet-console-camera-stage">
          <button className="fleet-console-camera-stage__nav fleet-console-camera-stage__nav--left" type="button">
            <ChevronDown className="h-5 w-5 rotate-90" />
          </button>
          <button className="fleet-console-camera-stage__nav fleet-console-camera-stage__nav--right" type="button">
            <ChevronDown className="h-5 w-5 -rotate-90" />
          </button>
          <div className="fleet-console-camera-stage__machine" />
          <div className="fleet-console-camera-stage__print">
            <PrinterPreviewArt
              className="h-full w-full"
              kind={printer.previewKind}
              primaryColor={previewColor(printer)}
            />
          </div>
          <div className="fleet-console-camera-stage__footer">
            <div className="fleet-console-camera-stage__meta">
              <span className="fleet-console-dot fleet-console-dot--green" />
              <span>Live</span>
              <span>1080p</span>
              <span>30 FPS</span>
            </div>
            <div className="fleet-console-camera-stage__controls">
              <button className="fleet-console-detail__icon-button fleet-console-detail__icon-button--small" type="button">
                <Maximize2 className="h-4 w-4" />
              </button>
              <button className="fleet-console-detail__icon-button fleet-console-detail__icon-button--small" type="button">
                <Camera className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="fleet-console-detail__section">
        <div className="fleet-console-section-title">Controls</div>
        <div className="fleet-console-controls">
          <button className="fleet-console-controls__button fleet-console-controls__button--primary" type="button">
            <Pause className="h-4 w-4" />
            <span>Pause Print</span>
          </button>
          <button className="fleet-console-controls__button" type="button">
            <Square className="h-4 w-4" />
            <span>Stop Print</span>
          </button>
          <button className="fleet-console-controls__button" type="button">
            <Send className="h-4 w-4" />
            <span>Send File</span>
          </button>
          <button className="fleet-console-controls__button fleet-console-controls__button--icon" type="button">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </section>
    </aside>
  );
}

export function FleetPage({ user }: { user: UserProfile }) {
  const overviewQuery = useQuery({
    queryKey: ["fleet-overview"],
    queryFn: () => apiFetch<FleetOverview>("/api/fleet/overview")
  });
  const [selectedPrinterId, setSelectedPrinterId] = useState<string | null>(null);
  const [scope, setScope] = useState<(typeof scopeOptions)[number][0]>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortMode, setSortMode] = useState<"name-asc" | "progress-desc">("name-asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [detailOpen, setDetailOpen] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const deferredSearch = useDeferredValue(searchQuery.trim().toLowerCase());

  const overview = overviewQuery.data;
  const activePrinterId = selectedPrinterId ?? overview?.selectedPrinterId ?? "";
  const printerDetailQuery = useQuery({
    enabled: activePrinterId.length > 0,
    placeholderData: (previousData) =>
      previousData ?? (activePrinterId === overview?.selectedPrinterId ? overview?.selectedPrinter : undefined),
    queryKey: ["printer-detail", activePrinterId],
    queryFn: () => apiFetch<PrinterDetail>(`/api/printers/${activePrinterId}`)
  });

  if (overviewQuery.isLoading || !overview || !printerDetailQuery.data) {
    return <div className="panel m-4">Loading the fleet view…</div>;
  }

  const filteredPrinters = overview.printers
    .filter((printer) => {
      if (scope === "printers") return printer.previewKind !== "farm";
      if (scope === "farms") return printer.previewKind === "farm";
      if (scope === "offline") return printer.status === "offline";
      return true;
    })
    .filter((printer) => {
      if (deferredSearch.length === 0) return true;
      return [printer.name, printer.cameraLabel, printer.material, printer.location]
        .join(" ")
        .toLowerCase()
        .includes(deferredSearch);
    });

  const layoutOrder = new Map(overview.printers.map((printer, index) => [printer.id, index]));
  const visiblePrinters =
    sortMode === "progress-desc"
      ? [...filteredPrinters].sort((left, right) => right.progress - left.progress)
      : [...filteredPrinters].sort(
          (left, right) => (layoutOrder.get(left.id) ?? 0) - (layoutOrder.get(right.id) ?? 0)
        );

  const detailPrinter = printerDetailQuery.data;

  return (
    <div className={`fleet-console-shell ${detailOpen ? "" : "fleet-console-shell--detail-closed"} ${focusMode ? "fleet-console-shell--focus" : ""}`}>
      <aside className="fleet-console-sidebar">
        <div className="fleet-console-sidebar__brand">
          <BrandLogo className="fleet-console-sidebar__brand-logo" />
          <ChevronDown className="h-4 w-4 text-zinc-500" />
        </div>

        <nav className="fleet-console-sidebar__nav">
          {navigationItems.map((item) => (
            <NavLink
              className={({ isActive }) =>
                isActive ? "fleet-console-sidebar__link fleet-console-sidebar__link--active" : "fleet-console-sidebar__link"
              }
              key={item.to}
              to={item.to}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="fleet-console-sidebar__spacer" />

        <SidebarCard>
          <div className="fleet-console-sidebar-card__headline">
            <span className="fleet-console-dot fleet-console-dot--green" />
            <span>All Systems Operational</span>
          </div>
          <div className="fleet-console-sidebar-card__copy">12 Printers • 1 Farm • 8 Cameras</div>
          <div className="fleet-console-sidebar-card__copy">Updated just now</div>
          <div className="fleet-console-sidebar-card__sparkline" />
        </SidebarCard>

        <SidebarCard compact>
          <div className="fleet-console-sidebar-card__row">
            <div>
              <div className="fleet-console-sidebar-card__headline">Need help?</div>
              <div className="fleet-console-sidebar-card__copy">Browse docs and guides</div>
            </div>
            <ExternalLink className="h-4 w-4 text-zinc-500" />
          </div>
        </SidebarCard>

        <SidebarCard compact>
          <div className="fleet-console-sidebar-card__row">
            <div>
              <div className="fleet-console-sidebar-card__headline">Check for Updates</div>
            </div>
            <RefreshCcw className="h-4 w-4 text-zinc-500" />
          </div>
        </SidebarCard>

        <SidebarCard compact>
          <div className="fleet-console-user">
            <div className="fleet-console-user__avatar">{initials(user.name)}</div>
            <div className="fleet-console-user__copy">
              <div className="fleet-console-user__name">{user.name}</div>
              <div className="fleet-console-user__role">Administrator</div>
            </div>
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          </div>
        </SidebarCard>
      </aside>

      <main className="fleet-console-content">
        <header className="fleet-console-header">
          <div>
            <h1>Fleet</h1>
            <p>Monitor and manage your entire printer fleet.</p>
          </div>
          <div className="fleet-console-header__actions">
            <ModeToggle />
            <Link className="fleet-console-toolbar__button" to="/settings">
              <Palette className="h-4 w-4" />
              <span>Appearance</span>
            </Link>
          </div>
        </header>

        <div className="fleet-console-filters">
          <div className="fleet-console-segmented">
            {scopeOptions.map(([value, label]) => (
              <button
                className={`fleet-console-segmented__button ${scope === value ? "fleet-console-segmented__button--active" : ""}`}
                key={value}
                onClick={() => setScope(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          <label className="fleet-console-search">
            <Search className="h-4 w-4" />
            <input
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search printers, farms, cameras..."
              type="search"
              value={searchQuery}
            />
          </label>

          <div className="fleet-console-view-toggle">
            <button
              className={viewMode === "grid" ? "fleet-console-view-toggle__button fleet-console-view-toggle__button--active" : "fleet-console-view-toggle__button"}
              onClick={() => setViewMode("grid")}
              type="button"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              className={viewMode === "list" ? "fleet-console-view-toggle__button fleet-console-view-toggle__button--active" : "fleet-console-view-toggle__button"}
              onClick={() => setViewMode("list")}
              type="button"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          <label className="fleet-console-select">
            <select onChange={(event) => setSortMode(event.target.value as typeof sortMode)} value={sortMode}>
              <option value="name-asc">Name (A-Z)</option>
              <option value="progress-desc">Progress</option>
            </select>
            <ChevronDown className="h-4 w-4" />
          </label>
        </div>

        <FleetStats overview={overview} />

        <div className={`fleet-console-grid ${viewMode === "list" ? "fleet-console-grid--list" : ""}`}>
          {visiblePrinters.map((printer) => (
            <FleetCard
              isSelected={printer.id === activePrinterId}
              key={printer.id}
              onSelect={() => {
                startTransition(() => {
                  setSelectedPrinterId(printer.id);
                  setDetailOpen(true);
                  setFocusMode(false);
                });
              }}
              printer={printer}
            />
          ))}
          <AddCard />
        </div>

        {visiblePrinters.length === 0 ? (
          <section className="fleet-console-empty">
            <CircleHelp className="h-6 w-6" />
            <div>
              <div className="fleet-console-empty__title">No printers matched this filter.</div>
              <div className="fleet-console-empty__copy">
                Try another scope or search term to bring printers, farms, or offline devices back into view.
              </div>
            </div>
          </section>
        ) : null}
      </main>

      {detailOpen ? (
        <DetailPanel
          focusMode={focusMode}
          onClose={() => {
            setDetailOpen(false);
            setFocusMode(false);
          }}
          onToggleFocus={() => setFocusMode((current) => !current)}
          printer={detailPrinter}
        />
      ) : null}
    </div>
  );
}
