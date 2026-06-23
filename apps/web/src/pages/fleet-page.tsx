import {
  Ban,
  Camera,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  FileCode2,
  Grid2x2,
  LayoutGrid,
  List,
  Maximize2,
  Minimize2,
  Moon,
  MoreHorizontal,
  Palette,
  Pause,
  Plus,
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
import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import type { FleetOverview, PrinterDetail, PrinterSummary, UserProfile } from "@bambuview/contracts";

import { useAppearance } from "../app/appearance";
import { LogoMark, PrinterPreviewArt } from "../components/art";
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

function statusLine(printer: PrinterSummary) {
  if (printer.status === "idle") {
    return `${printer.statusLabel} • ${printer.layer}`;
  }

  if (printer.status === "paused") {
    return `${printer.statusLabel} • ${printer.layer}`;
  }

  if (printer.status === "offline") {
    return `${printer.statusLabel} • ${printer.layer}`;
  }

  return `${printer.statusLabel} • ${printer.layer}`;
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
      <PrinterPreviewArt className="h-full w-full" kind={printer.previewKind} />
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

function FleetCard({
  isSelected,
  onSelect,
  printer
}: {
  isSelected: boolean;
  onSelect: () => void;
  printer: PrinterSummary;
}) {
  const tone = printerTone(printer);
  const showPercent = printer.previewKind !== "farm" || printer.progress > 0;

  return (
    <button
      aria-pressed={isSelected}
      className={`fleet-console-card ${isSelected ? "fleet-console-card--selected" : ""}`}
      onClick={onSelect}
      type="button"
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
          <div className={`fleet-console-card__status ${tone.textClass}`}>{statusLine(printer)}</div>
        </div>
      </div>

      <div className={`fleet-console-card__content ${printer.status === "offline" ? "fleet-console-card__content--offline" : ""}`}>
        <FleetPreview printer={printer} />
        <div className="fleet-console-card__metrics">
          {showPercent ? <div className={`fleet-console-card__percent ${tone.textClass}`}>{printer.progress}%</div> : null}
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
              style={{ width: `${Math.max(printer.progress, printer.status === "offline" ? 0 : 12)}%` }}
            />
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
    </button>
  );
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
  const tone = printerTone(printer);
  const fans = fanMetrics(printer);

  useEffect(() => {
    startTransition(() => {
      setSelectedFeedId(printer.selectedCameraFeedId);
    });
  }, [printer.id, printer.selectedCameraFeedId]);

  return (
    <aside className="fleet-console-detail">
      <div className="fleet-console-detail__header">
        <div className="fleet-console-detail__title">{printer.name}</div>
        <div className="fleet-console-detail__actions">
          <button className="fleet-console-detail__icon-button" onClick={onToggleFocus} type="button">
            {focusMode ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
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

      <section className="fleet-console-detail__section">
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
              <div><span>Print Time</span><span>{printer.elapsed}</span></div>
              <div><span>ETA</span><span>{printer.eta}</span></div>
            </div>
            <div className="fleet-console-status__progress">
              <div className="fleet-console-status__progress-label">
                <span>Progress</span>
                <span>{printer.progress}%</span>
              </div>
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
            { label: "Nozzle", value: printer.temperatures[0]?.current ?? "—" },
            { label: "Bed", value: printer.temperatures[1]?.current ?? "—" },
            { label: "Chamber", value: printer.temperatures[2]?.current ?? "—" },
            { label: "Aux Fan", value: fans.aux },
            { label: "Part Fan", value: fans.part }
          ].map((item) => (
            <div className="fleet-console-temperature-grid__item" key={item.label}>
              <div className="fleet-console-temperature-grid__label">
                <Thermometer className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </div>
              <div className="fleet-console-temperature-grid__value">{item.value}</div>
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
          <button className="fleet-console-camera-tabs__button" type="button">
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
            <PrinterPreviewArt className="h-full w-full" kind={printer.previewKind} />
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
                <ExternalLink className="h-4 w-4" />
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
          <LogoMark className="h-11 w-11 text-[color:var(--accent)]" />
          <div className="fleet-console-sidebar__brand-text">
            Bambu<span>View</span>
          </div>
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
            <div className="fleet-console-sidebar-card__headline">Check for Updates</div>
            <div className="fleet-console-sidebar-card__copy">New builds and release notes</div>
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
