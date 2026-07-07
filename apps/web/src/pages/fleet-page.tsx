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
  Trash2,
  Users2,
  X,
} from "lucide-react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Link, NavLink } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  BambuPrinterDiscoveryResult,
  BambuPrinterModel,
  BambuConnectionMode,
  BambuConnectionTestResult,
  BambuPrinterConnectionInput,
  FleetDataMode,
  FleetOverview,
  PrinterCommandRequest,
  PrinterCommandResponse,
  PrinterConnectionRecord,
  PrinterDetail,
  PrinterFileSendRequest,
  PrinterFileSendResponse,
  PrinterSummary,
  UserProfile,
} from "@bambuview/contracts";
import {
  BAMBU_CONNECTION_MODE_OPTIONS,
  BAMBU_PRINTER_MODELS,
} from "@bambuview/contracts";

import { useAppearance } from "../app/appearance";
import { APP_VERSION } from "../app/version";
import { BrandLogo, PrinterPreviewArt } from "../components/art";
import {
  StyledSelect,
  type StyledSelectOption,
} from "../components/styled-select";
import { apiFetch } from "../lib/api";

const navigationItems = [
  { icon: Grid2x2, label: "Fleet", to: "/fleet" },
  { icon: FileCode2, label: "Prepare & Slice", to: "/prepare" },
  { icon: Camera, label: "Cameras", to: "/cameras" },
  { icon: Users2, label: "Users", to: "/users" },
  { icon: Settings, label: "Settings", to: "/settings/appearance" },
] as const;

const scopeOptions = [
  ["all", "All"],
  ["printers", "Printers"],
  ["farms", "Farms"],
  ["offline", "Offline"],
] as const;

const detailTabs = [
  "Overview",
  "Jobs",
  "History",
  "Maintenance",
  "Config",
] as const;
const controlTabs = [
  ["printer-parts", "Printer Parts"],
  ["print-options", "Print Options"],
  ["calibration", "Calibration"],
] as const;
const sortOptions: Array<StyledSelectOption<"name-asc" | "progress-desc">> = [
  {
    label: "Name (A-Z)",
    value: "name-asc",
  },
  {
    label: "Progress",
    value: "progress-desc",
  },
];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function printerTone(
  printer: Pick<PrinterSummary, "status" | "telemetryState">,
) {
  if (printer.telemetryState === "limited") {
    return {
      dotClass: "fleet-console-dot--green",
      progressClass: "fleet-console-meter__bar--green",
      textClass: "fleet-console-text--green",
    };
  }

  if (printer.status === "paused") {
    return {
      dotClass: "fleet-console-dot--amber",
      progressClass: "fleet-console-meter__bar--amber",
      textClass: "fleet-console-text--amber",
    };
  }

  if (printer.status === "idle") {
    return {
      dotClass: "fleet-console-dot--blue",
      progressClass: "fleet-console-meter__bar--blue",
      textClass: "fleet-console-text--blue",
    };
  }

  if (printer.status === "offline") {
    return {
      dotClass: "fleet-console-dot--red",
      progressClass: "fleet-console-meter__bar--muted",
      textClass: "fleet-console-text--muted",
    };
  }

  return {
    dotClass: "fleet-console-dot--green",
    progressClass: "fleet-console-meter__bar--green",
    textClass: "fleet-console-text--green",
  };
}

function slotMetrics(printer: PrinterDetail, index: number) {
  if (printer.id === "x1-carbon-office") {
    return [
      { weight: "612g", percent: 72 },
      { weight: "411g", percent: 51 },
      { weight: "256g", percent: 32 },
      { weight: "812g", percent: 90 },
    ][index];
  }

  if (printer.status === "offline") {
    return [
      { weight: "812g", percent: 90 },
      { weight: "480g", percent: 52 },
      { weight: "198g", percent: 24 },
      { weight: "126g", percent: 14 },
    ][index];
  }

  if (printer.previewKind === "farm") {
    return [
      { weight: "12", percent: 100 },
      { weight: "8", percent: 68 },
      { weight: "6", percent: 51 },
      { weight: "4", percent: 34 },
    ][index];
  }

  return [
    { weight: "428g", percent: 63 },
    { weight: "311g", percent: 46 },
    { weight: "198g", percent: 31 },
    { weight: "612g", percent: 76 },
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
  return (
    printer.slots.find((slot) => slot.active)?.color ?? printer.slots[0]?.color
  );
}

function FleetPreview({
  printer,
  large = false,
}: {
  large?: boolean;
  printer: PrinterSummary;
}) {
  if (printer.status === "offline") {
    return (
      <div
        className={`fleet-console-preview ${large ? "fleet-console-preview--large" : ""}`}
      >
        <div className="fleet-console-preview__offline">
          <Ban className="h-10 w-10" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fleet-console-preview ${large ? "fleet-console-preview--large" : ""}`}
    >
      <PrinterPreviewArt
        className="h-full w-full"
        kind={printer.previewKind}
        primaryColor={previewColor(printer)}
      />
    </div>
  );
}

function selectedCameraFeed(printer: PrinterDetail, selectedFeedId: string) {
  return (
    printer.cameraFeeds.find((feed) => feed.id === selectedFeedId) ??
    printer.cameraFeeds[0] ??
    null
  );
}

export function CameraFeedFrame({
  className = "",
  feed,
  printer,
}: {
  className?: string;
  feed: PrinterDetail["cameraFeeds"][number] | null;
  printer: PrinterDetail;
}) {
  const sourceUrl =
    feed?.streamKind === "hls"
      ? feed.streamUrl
      : (feed?.snapshotUrl ?? feed?.streamUrl);
  const [loadFailed, setLoadFailed] = useState(false);
  const canRender =
    feed?.status === "online" &&
    sourceUrl &&
    ["mjpeg", "snapshot", "hls"].includes(feed.streamKind);

  useEffect(() => {
    setLoadFailed(false);
  }, [sourceUrl]);

  if (canRender && feed.streamKind === "hls" && !loadFailed) {
    return (
      <video
        className={`h-full w-full bg-black object-cover ${className}`}
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
        alt={`${printer.name} ${feed.label}`}
        className={`h-full w-full bg-black object-cover ${className}`}
        onError={() => setLoadFailed(true)}
        src={sourceUrl}
      />
    );
  }

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-black ${className}`}
    >
      <div className="absolute inset-0 grid place-items-center px-6 text-center">
        <div>
          <Camera className="mx-auto mb-4 h-10 w-10 text-zinc-500" />
          <div className="text-base font-semibold text-white">
            {loadFailed
              ? "Camera Preview Unavailable"
              : feed?.status === "degraded"
                ? "Camera Source Needs Attention"
                : "No Camera Detected"}
          </div>
          <div className="mt-2 max-w-md text-xs leading-5 text-zinc-300">
            {loadFailed
              ? "The source is assigned, but the browser could not render the feed. Check the stream URL or use a Frigate/go2rtc MJPEG, HLS, or snapshot restream."
              : feed?.status === "degraded"
                ? "If this is in error, configure cameras in Cameras with a browser-compatible restream URL."
                : feed?.streamKind === "rtsp" ||
                    feed?.streamKind === "bambu-native"
                  ? "If this is in error, configure cameras in Cameras with a Frigate/go2rtc restream."
                  : "If this is in error, configure cameras in Cameras."}
          </div>
        </div>
      </div>
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
      mode,
    });
  }

  return (
    <div className="fleet-console-toolbar__group">
      {(
        [
          { icon: Moon, key: "dark", label: "Dark" },
          { icon: SunMedium, key: "light", label: "Light" },
        ] as const
      ).map((mode) => (
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
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section
      className={`fleet-console-sidebar-card ${compact ? "fleet-console-sidebar-card--compact" : ""}`}
    >
      {children}
    </section>
  );
}

function FleetStats({ overview }: { overview: FleetOverview }) {
  const items = [
    { label: "PRINTERS", value: overview.stats.printers, sublabel: "Online" },
    {
      label: "ACTIVE PRINTS",
      value: overview.stats.activePrints,
      sublabel: "Printing",
    },
    {
      label: "COMPLETED",
      value: overview.stats.completedToday,
      sublabel: "Today",
    },
    {
      label: "FARM GROUPS",
      value: overview.stats.farmGroups,
      sublabel: "Online",
    },
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
  printer,
}: {
  isSelected: boolean;
  onSelect: () => void;
  printer: PrinterSummary;
}) {
  const tone = printerTone(printer);
  const hasLimitedTelemetry = printer.telemetryState === "limited";
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
        <div className="fleet-console-card__actions">
          {printer.id === "x1-carbon-office" ? (
            <Star className="h-4 w-4" />
          ) : null}
          <Camera className="h-4 w-4" />
          <span className={`fleet-console-dot ${tone.dotClass}`} />
        </div>
      </div>

      <div
        className={`fleet-console-card__content ${
          printer.status === "offline"
            ? "fleet-console-card__content--offline"
            : hasLimitedTelemetry
              ? "fleet-console-card__content--limited"
              : ""
        }`}
      >
        <FleetPreview printer={printer} />

        {printer.status === "offline" ? (
          <div className="fleet-console-card__offline-copy">
            <div className="fleet-console-card__offline-title">
              Printer is offline
            </div>
            <div className="fleet-console-card__offline-body">
              Check the connection and power.
            </div>
          </div>
        ) : hasLimitedTelemetry ? (
          <div className="fleet-console-card__metrics">
            <div className={`fleet-console-card__percent ${tone.textClass}`}>
              {printer.progress}%
            </div>
            <div className="fleet-console-card__time">
              <div>{printer.elapsed}</div>
              <div>{printer.eta}</div>
            </div>
            <div className="fleet-console-card__file">
              Live data not connected
            </div>
            <div className="fleet-console-card__meta-line">
              <span>{printer.material}</span>
              <span>&bull;</span>
              <span>{printer.location}</span>
              <span>&bull;</span>
              <span>Use LAN/Developer telemetry</span>
            </div>
            <div className="fleet-console-meter">
              <div
                className={`fleet-console-meter__bar ${tone.progressClass}`}
                style={{ width: "12%" }}
              />
            </div>
          </div>
        ) : printer.status === "idle" ? (
          <div className="fleet-console-card__idle-copy">
            <div className="fleet-console-card__idle-topline">
              <div className="fleet-console-card__idle-body">
                <div className="fleet-console-card__idle-title">
                  No active print
                </div>
                <div className="fleet-console-card__idle-subtitle">
                  Send a print job to get started.
                </div>
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
              <div
                className={`fleet-console-meter__bar ${tone.progressClass}`}
                style={{ width: "14%" }}
              />
            </div>
          </div>
        ) : (
          <div className="fleet-console-card__metrics">
            <div className={`fleet-console-card__percent ${tone.textClass}`}>
              {printer.progress}%
            </div>
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
        <div className="fleet-console-card__footer-material">
          {printer.material}
        </div>
        <div className="fleet-console-card__slot-row">
          {printer.slots.map((slot) => (
            <span className="fleet-console-card__slot-chip" key={slot.slot}>
              <span>{slot.label}</span>
              <span
                className="fleet-console-card__slot-swatch"
                style={{ backgroundColor: slot.color }}
              />
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
  printer,
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
        <div className="fleet-console-card__title-row">
          <div>
            <h3>{printer.name}</h3>
            <div className="fleet-console-card__status fleet-console-text--green">
              4 Printers • 2 Printing
            </div>
          </div>
        </div>
        <div className="fleet-console-card__actions">
          <Star className="h-4 w-4" />
          <span className="fleet-console-dot fleet-console-dot--muted" />
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
              <span className="fleet-console-card__farm-pill fleet-console-card__farm-pill--green">
                2 Printing
              </span>
              <span className="fleet-console-card__farm-pill fleet-console-card__farm-pill--amber">
                1 Paused
              </span>
              <span className="fleet-console-card__farm-pill fleet-console-card__farm-pill--muted">
                1 Idle
              </span>
              <span className="fleet-console-card__farm-pill fleet-console-card__farm-pill--red">
                0 Offline
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="fleet-console-card__footer">
        <div className="fleet-console-card__footer-material">
          {printer.material}
        </div>
        <div className="fleet-console-card__slot-row">
          {printer.slots.map((slot) => (
            <span className="fleet-console-card__slot-chip" key={slot.slot}>
              <span>{slot.label}</span>
              <span
                className="fleet-console-card__slot-swatch"
                style={{ backgroundColor: slot.color }}
              />
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

const bambuModelOptions = BAMBU_PRINTER_MODELS;
const bambuModelFamilies: Array<BambuPrinterModel["family"]> = [
  "H2",
  "X2",
  "P2",
  "A2",
  "X1",
  "P1",
  "A1",
];
const bambuModelFamilyLabels = {
  A1: "A1 Series",
  A2: "A2 Series",
  H2: "H2 Series",
  P1: "P1 Series",
  P2: "P2 Series",
  X1: "X1 Series",
  X2: "X2 Series",
} as const satisfies Record<BambuPrinterModel["family"], string>;
const bambuModelsByFamily = bambuModelFamilies.map((family) => ({
  family,
  label: bambuModelFamilyLabels[family],
  models: bambuModelOptions.filter((model) => model.family === family),
}));
const bambuModelSelectOptions: Array<StyledSelectOption<string>> =
  bambuModelsByFamily.flatMap((group) =>
    group.models.map((model) => ({
      description: group.label,
      label: model.label,
      value: model.value,
    })),
  );

const connectionCheckLabels = {
  "action-required": "Action required",
  available: "Available",
  failed: "Failed",
  "not-supported": "Not supported",
  passed: "Passed",
} as const;

const bambuConnectionModes = BAMBU_CONNECTION_MODE_OPTIONS.map((mode) => ({
  description: mode.description,
  key: mode.value,
  label: mode.label,
  summary: mode.summary,
})) satisfies Array<{
  description: string;
  key: BambuConnectionMode;
  label: string;
  summary: string;
}>;

function requiresRawLanDetails(mode: BambuConnectionMode) {
  return mode === "lan" || mode === "developer";
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function commandArgsFromMovementLabel(label: string) {
  switch (label) {
    case "Home":
      return null;
    case "Y +10":
      return { axis: "Y", distance: 10, feedrate: 4800 };
    case "Y -10":
      return { axis: "Y", distance: -10, feedrate: 4800 };
    case "X -10":
      return { axis: "X", distance: -10, feedrate: 4800 };
    case "X +10":
      return { axis: "X", distance: 10, feedrate: 4800 };
    case "Z +10":
      return { axis: "Z", distance: 10, feedrate: 1800 };
    case "Z +1":
      return { axis: "Z", distance: 1, feedrate: 1200 };
    case "Bed -1":
      return { axis: "Z", distance: -1, feedrate: 1200 };
    case "Bed -10":
      return { axis: "Z", distance: -10, feedrate: 1800 };
    default:
      return null;
  }
}

function AddCard({ onClick }: { onClick: () => void }) {
  return (
    <button className="fleet-console-add-card" onClick={onClick} type="button">
      <div className="fleet-console-add-card__icon">
        <Plus className="h-7 w-7" />
      </div>
      <div>
        <div className="fleet-console-add-card__title">Add Printer or Farm</div>
        <div className="fleet-console-add-card__copy">
          Connect a Bambu Lab printer or create a farm to manage multiple
          printers.
        </div>
      </div>
    </button>
  );
}

function printerConnectionToForm(
  connection?: PrinterConnectionRecord | null,
): BambuPrinterConnectionInput {
  return {
    accessCode: "",
    connectionMode: connection?.connectionMode ?? "cloud",
    host: connection?.host ?? "",
    model: connection?.model ?? "H2D",
    name: connection?.name ?? "",
    serial: connection?.serial ?? "",
  };
}

function AddPrinterDialog({
  initialConnection = null,
  onClose,
  onDeleted,
  onSaved,
}: {
  initialConnection?: PrinterConnectionRecord | null;
  onClose: () => void;
  onDeleted?: () => void;
  onSaved: (printerId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BambuPrinterConnectionInput>(
    printerConnectionToForm(initialConnection),
  );
  const [testResult, setTestResult] =
    useState<BambuConnectionTestResult | null>(null);
  const [discoveryResult, setDiscoveryResult] =
    useState<BambuPrinterDiscoveryResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isEditing = Boolean(initialConnection);

  useEffect(() => {
    setForm(printerConnectionToForm(initialConnection));
    setTestResult(null);
    setDiscoveryResult(null);
    setConfirmDelete(false);
    setErrorMessage(null);
  }, [initialConnection]);

  const testMutation = useMutation({
    mutationFn: (payload: BambuPrinterConnectionInput) =>
      apiFetch<{ test: BambuConnectionTestResult }>(
        "/api/printers/bambu/test",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      ),
  });
  const saveMutation = useMutation({
    mutationFn: (payload: BambuPrinterConnectionInput) =>
      apiFetch<{
        printer: PrinterConnectionRecord;
        test: BambuConnectionTestResult;
      }>(
        initialConnection
          ? `/api/printers/bambu/${initialConnection.id}`
          : "/api/printers/bambu",
        {
          method: initialConnection ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
      ),
  });
  const discoverMutation = useMutation({
    mutationFn: () =>
      apiFetch<BambuPrinterDiscoveryResult>("/api/printers/discover"),
  });
  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetch(
        initialConnection
          ? `/api/printers/bambu/${initialConnection.id}`
          : "/api/printers/bambu",
        {
          method: "DELETE",
        },
      ),
  });

  function updateField(
    field: keyof BambuPrinterConnectionInput,
    value: string,
  ) {
    setErrorMessage(null);
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function invalidatePrinterData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["fleet-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["cameras"] }),
      queryClient.invalidateQueries({ queryKey: ["printer-connections"] }),
    ]);
  }

  async function testConnection() {
    setErrorMessage(null);
    try {
      const response = await testMutation.mutateAsync(form);
      setTestResult(response.test);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not test this printer.",
      );
    }
  }

  async function discoverPrinters() {
    setErrorMessage(null);
    try {
      const result = await discoverMutation.mutateAsync();
      setDiscoveryResult(result);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not scan the network.",
      );
    }
  }

  function applyDiscoveredPrinter(
    printer: BambuPrinterDiscoveryResult["printers"][number],
  ) {
    setErrorMessage(null);
    setForm((current) => ({
      ...current,
      host: printer.host,
      model: printer.model,
      name: current.name.trim().length > 0 ? current.name : printer.name,
      serial: printer.serial,
    }));
  }

  async function savePrinter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    try {
      const response = await saveMutation.mutateAsync(form);
      setTestResult(response.test);
      await invalidatePrinterData();
      onSaved(response.printer.id);
      onClose();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not save this printer.",
      );
    }
  }

  async function deletePrinter() {
    if (!initialConnection) {
      return;
    }

    setErrorMessage(null);
    try {
      await deleteMutation.mutateAsync();
      await invalidatePrinterData();
      onDeleted?.();
      onClose();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not delete this printer.",
      );
    }
  }

  const isBusy =
    discoverMutation.isPending ||
    testMutation.isPending ||
    saveMutation.isPending ||
    deleteMutation.isPending;
  const accessCodeRequired =
    requiresRawLanDetails(form.connectionMode) &&
    !(isEditing && initialConnection?.accessCodeSet && !form.accessCode);
  const hasAvailableIntegration = testResult
    ? Object.values(testResult.checks).some(
        (check) => check.status === "available" || check.status === "passed",
      )
    : false;

  return (
    <div className="fleet-console-modal-backdrop" role="presentation">
      <div
        aria-labelledby="add-bambu-printer-title"
        aria-modal="true"
        className="fleet-console-modal"
        role="dialog"
      >
        <div className="fleet-console-modal__header">
          <div>
            <div className="fleet-console-modal__kicker">Bambu printer</div>
            <h2 id="add-bambu-printer-title">
              {isEditing ? "Edit Bambu Printer" : "Add Bambu Printer"}
            </h2>
          </div>
          <button
            aria-label="Close add printer dialog"
            className="fleet-console-detail__icon-button"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="fleet-console-modal__copy">
          Choose how BambuView should treat this printer today. Use Bambu
          Connect for handoff-only profiles, or switch an existing profile to
          LAN / Developer mode when you have the host and access code ready for
          live progress.
        </p>

        {!isEditing ? (
          <div className="fleet-console-connection-result">
            <div className="fleet-console-connection-result__headline">
              Network discovery
            </div>
            <div className="fleet-console-sidebar-card__copy">
              Scan the LAN for Bambu printers that are advertising over the
              local network, then click one to prefill the form.
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="fleet-console-controls__button"
                disabled={isBusy}
                onClick={() => {
                  void discoverPrinters();
                }}
                type="button"
              >
                Scan Network
              </button>
            </div>
            {discoveryResult ? (
              <div className="mt-4 space-y-3">
                <div className="fleet-console-sidebar-card__copy">
                  {discoveryResult.detail}
                </div>
                {discoveryResult.printers.length > 0 ? (
                  <div className="grid gap-2">
                    {discoveryResult.printers.map((printer) => (
                      <button
                        className="fleet-console-controls__button justify-between"
                        key={`${printer.serial}:${printer.host}`}
                        onClick={() => applyDiscoveredPrinter(printer)}
                        type="button"
                      >
                        <span>
                          {printer.name} • {printer.model}
                        </span>
                        <span className="text-zinc-500">
                          {printer.host}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="fleet-console-sidebar-card__copy">
                    No printers answered during the current scan window.
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        <form className="fleet-console-printer-form" onSubmit={savePrinter}>
          <fieldset className="fleet-console-printer-form__mode">
            <legend>Connection mode</legend>
            <div className="fleet-console-printer-form__mode-grid">
              {bambuConnectionModes.map((mode) => (
                <button
                  className={`fleet-console-mode-card ${form.connectionMode === mode.key ? "fleet-console-mode-card--active" : ""}`}
                  key={mode.key}
                  onClick={() => updateField("connectionMode", mode.key)}
                  type="button"
                >
                  <strong>{mode.label}</strong>
                  <span>{mode.summary}</span>
                  <small>{mode.description}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <label>
            <span>Display name</span>
            <input
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="Office X1 Carbon"
              required
              type="text"
              value={form.name}
            />
          </label>

          <label>
            <span>Model</span>
            <StyledSelect
              onChange={(model) => updateField("model", model)}
              options={bambuModelSelectOptions}
              value={form.model}
            />
          </label>

          <label>
            <span>Hostname or IP</span>
            <input
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(event) => updateField("host", event.target.value)}
              placeholder={
                requiresRawLanDetails(form.connectionMode)
                  ? "printer.local or 192.0.2.20"
                  : "printer.local, bridge host, or leave blank"
              }
              required={requiresRawLanDetails(form.connectionMode)}
              type="text"
              value={form.host}
            />
          </label>

          <label>
            <span>Serial number</span>
            <input
              autoCapitalize="characters"
              autoCorrect="off"
              onChange={(event) => updateField("serial", event.target.value)}
              placeholder="Printer serial"
              required
              type="text"
              value={form.serial}
            />
          </label>

          <label className="fleet-console-printer-form__wide">
            <span>
              LAN access code
              {accessCodeRequired
                ? ""
                : isEditing && initialConnection?.accessCodeSet
                  ? " (saved - leave blank to keep)"
                  : " (optional)"}
            </span>
            <input
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(event) =>
                updateField("accessCode", event.target.value)
              }
              placeholder={
                requiresRawLanDetails(form.connectionMode)
                  ? "Local access code"
                  : "Optional unless your bridge requires it"
              }
              required={accessCodeRequired}
              type="password"
              value={form.accessCode}
            />
          </label>

          {testResult ? (
            <div
              className={`fleet-console-connection-result ${testResult.reachable || hasAvailableIntegration ? "fleet-console-connection-result--ok" : "fleet-console-connection-result--warn"}`}
            >
              <div className="fleet-console-connection-result__headline">
                {testResult.message}
              </div>
              {Object.values(testResult.checks).map((check) => (
                <div
                  className="fleet-console-connection-result__check"
                  key={check.label}
                >
                  <span>{check.label}</span>
                  <strong>{connectionCheckLabels[check.status]}</strong>
                  <small>{check.detail}</small>
                </div>
              ))}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="fleet-console-form-error">{errorMessage}</div>
          ) : null}

          {isEditing ? (
            <div className="fleet-console-printer-form__danger">
              {confirmDelete ? (
                <div>
                  <strong>Delete this printer profile?</strong>
                  <p>
                    This removes its camera assignments from BambuView. It does
                    not change the printer itself.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="fleet-console-controls__button"
                      disabled={isBusy}
                      onClick={() => setConfirmDelete(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="fleet-console-controls__button fleet-console-controls__button--danger"
                      disabled={isBusy}
                      onClick={() => {
                        void deletePrinter();
                      }}
                      type="button"
                    >
                      Delete Printer
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="fleet-console-controls__button fleet-console-controls__button--danger"
                  disabled={isBusy}
                  onClick={() => setConfirmDelete(true)}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete Printer</span>
                </button>
              )}
            </div>
          ) : null}

          <div className="fleet-console-modal__actions">
            <button
              className="fleet-console-controls__button"
              disabled={isBusy}
              onClick={() => {
                void testConnection();
              }}
              type="button"
            >
              Test Connection
            </button>
            <button
              className="fleet-console-controls__button fleet-console-controls__button--primary"
              disabled={isBusy}
              type="submit"
            >
              {isEditing ? "Update Printer" : "Save Printer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FocusControlDeck({
  autoRefillEnabled,
  commandsEnabled,
  commandPending,
  controlTab,
  fanPower,
  lampEnabled,
  movementLabel,
  onExtruder,
  onLampToggle,
  onMovement,
  printer,
  selectedSlot,
  setAutoRefillEnabled,
  setControlTab,
  setFanPower,
  setLampEnabled,
  setSelectedSlot,
}: {
  autoRefillEnabled: boolean;
  commandsEnabled: boolean;
  commandPending: boolean;
  controlTab: "printer-parts" | "print-options" | "calibration";
  fanPower: number;
  lampEnabled: boolean;
  movementLabel: string;
  onExtruder: (distance: number) => void;
  onLampToggle: (next: boolean) => void;
  onMovement: (label: string) => void;
  printer: PrinterDetail;
  selectedSlot: string;
  setAutoRefillEnabled: (next: boolean) => void;
  setControlTab: (
    next: "printer-parts" | "print-options" | "calibration",
  ) => void;
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
              <div className="fleet-console-focus-temp" key={temperature.label}>
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
                disabled={!commandsEnabled || commandPending}
                onClick={() => {
                  const next = !lampEnabled;
                  setLampEnabled(next);
                  onLampToggle(next);
                }}
                type="button"
              >
                <LampDesk className="h-4 w-4" />
                Lamp
              </button>
            </div>
          </div>

          <div className="fleet-console-focus-surface">
            <div className="text-sm uppercase tracking-[0.22em] text-zinc-500">
              Motion
            </div>
            <div className="mt-5 grid place-items-center">
              <div className="motion-pad">
                <button
                  className="motion-pad__home"
                  disabled={!commandsEnabled || commandPending}
                  onClick={() => onMovement("Home")}
                  type="button"
                >
                  <Move3d className="h-5 w-5" />
                </button>
                <button
                  className="motion-pad__north"
                  disabled={!commandsEnabled || commandPending}
                  onClick={() => onMovement("Y +10")}
                  type="button"
                >
                  Y
                </button>
                <button
                  className="motion-pad__south"
                  disabled={!commandsEnabled || commandPending}
                  onClick={() => onMovement("Y -10")}
                  type="button"
                >
                  -Y
                </button>
                <button
                  className="motion-pad__west"
                  disabled={!commandsEnabled || commandPending}
                  onClick={() => onMovement("X -10")}
                  type="button"
                >
                  -X
                </button>
                <button
                  className="motion-pad__east"
                  disabled={!commandsEnabled || commandPending}
                  onClick={() => onMovement("X +10")}
                  type="button"
                >
                  X
                </button>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-4 gap-3">
              {[
                { icon: <ArrowUp className="h-4 w-4" />, label: "Z +10" },
                { icon: <ArrowUp className="h-4 w-4" />, label: "Z +1" },
                { icon: <ArrowDown className="h-4 w-4" />, label: "Bed -1" },
                { icon: <ArrowDown className="h-4 w-4" />, label: "Bed -10" },
              ].map(({ icon, label }) => (
                <button
                  className="fleet-console-focus-step"
                  disabled={!commandsEnabled || commandPending}
                  key={label}
                  onClick={() => onMovement(label)}
                  type="button"
                >
                  <span>{icon}</span>
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4 text-sm text-zinc-500">
              Last command: {movementLabel}
            </div>
          </div>

          <div className="fleet-console-focus-surface fleet-console-focus-surface--extruder">
            <div className="text-sm uppercase tracking-[0.22em] text-zinc-500">
              Extruder
            </div>
            <button
              className="fleet-console-focus-extruder-button"
              disabled={!commandsEnabled || commandPending}
              onClick={() => onExtruder(5)}
              type="button"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
            <div className="fleet-console-focus-extruder-core">
              <Flame className="h-6 w-6" />
            </div>
            <button
              className="fleet-console-focus-extruder-button"
              disabled={!commandsEnabled || commandPending}
              onClick={() => onExtruder(-5)}
              type="button"
            >
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
                  <div className="mt-6 text-2xl font-semibold text-white">
                    {slot.material}
                  </div>
                  <div className="mt-2 text-sm text-zinc-300">
                    {selectedSlot === slot.slot ? "Loaded" : "Ready"}
                  </div>
                </button>
              ))}
            </div>

            <div className="fleet-console-focus-slot-detail">
              <div className="text-sm uppercase tracking-[0.22em] text-zinc-500">
                Selected filament
              </div>
              <div className="mt-4 text-3xl font-semibold text-white">
                {selectedSlot}
              </div>
              <div className="mt-2 text-sm text-zinc-400">
                {
                  printer.slots.find((slot) => slot.slot === selectedSlot)
                    ?.material
                }{" "}
                spool routed to the extruder path.
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button className="fleet-console-focus-action" type="button">
                  Unload
                </button>
                <button
                  className="fleet-console-focus-action fleet-console-focus-action--primary"
                  type="button"
                >
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
  actionFeedback,
  autoRefillEnabled,
  commandsEnabled,
  commandPending,
  controlTab,
  fanPower,
  lampEnabled,
  movementLabel,
  onCommand,
  onExtruder,
  onFocusModeChange,
  onLampToggle,
  onMovement,
  printer,
  selectedFeedId,
  selectedSlot,
  onSendFile,
  setAutoRefillEnabled,
  setControlTab,
  setFanPower,
  setLampEnabled,
  setSelectedFeedId,
  setSelectedSlot,
}: {
  actionFeedback: string | null;
  autoRefillEnabled: boolean;
  commandsEnabled: boolean;
  commandPending: boolean;
  controlTab: "printer-parts" | "print-options" | "calibration";
  fanPower: number;
  lampEnabled: boolean;
  movementLabel: string;
  onCommand: (payload: PrinterCommandRequest) => void;
  onExtruder: (distance: number) => void;
  onFocusModeChange: (next: boolean) => void;
  onLampToggle: (next: boolean) => void;
  onMovement: (label: string) => void;
  onSendFile: () => void;
  printer: PrinterDetail;
  selectedFeedId: string;
  selectedSlot: string;
  setAutoRefillEnabled: (next: boolean) => void;
  setControlTab: (
    next: "printer-parts" | "print-options" | "calibration",
  ) => void;
  setFanPower: (next: number) => void;
  setLampEnabled: (next: boolean) => void;
  setSelectedFeedId: (next: string) => void;
  setSelectedSlot: (next: string) => void;
}) {
  const activeFeed = selectedCameraFeed(printer, selectedFeedId);

  return (
    <aside className="detail-panel detail-panel--focus">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm uppercase tracking-[0.22em] text-zinc-500">
            Fullscreen printer workspace
          </div>
          <h2 className="mt-2 text-[42px] font-semibold leading-none text-white">
            {printer.name}
          </h2>
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
                    onClick={() =>
                      startTransition(() => setSelectedFeedId(feed.id))
                    }
                    type="button"
                  >
                    {feed.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="camera-stage mt-5">
              <div className="camera-stage__top">
                <div className="text-sm text-zinc-300">
                  {activeFeed?.label ?? printer.cameraLabel}
                </div>
                <div className="camera-stage__meta">
                  <span
                    className={`fleet-console-dot ${
                      activeFeed?.status === "offline"
                        ? "fleet-console-dot--red"
                        : activeFeed?.status === "degraded"
                          ? "fleet-console-dot--amber"
                          : "fleet-console-dot--green"
                    }`}
                  />
                  <span>{activeFeed?.status ?? "unassigned"}</span>
                  <span>{activeFeed?.streamKind ?? "none"}</span>
                </div>
              </div>
              <div className="camera-stage__viewport camera-stage__viewport--full">
                <CameraFeedFrame feed={activeFeed} printer={printer} />
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-white/8 px-4 py-3 text-sm text-zinc-400">
                <div className="flex items-center gap-2">
                  <span className="fleet-console-dot fleet-console-dot--green" />
                  {activeFeed?.sourceId
                    ? "Assigned camera source"
                    : "Default printer camera slot"}
                </div>
                <div>Last move: {movementLabel}</div>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="text-sm uppercase tracking-[0.22em] text-zinc-500">
              Printing Progress
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-[120px_1fr]">
              <PrinterPreviewArt
                className="h-[112px]"
                kind={printer.previewKind}
                primaryColor={previewColor(printer)}
              />
              <div>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-2xl font-semibold text-white">
                      {printer.fileName}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                      <span className={printerTone(printer).textClass}>
                        {printer.statusLabel}
                      </span>
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
                  <div
                    className={`text-4xl font-semibold ${printerTone(printer).textClass}`}
                  >
                    {printer.progress}%
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      className="icon-button text-amber-400"
                      disabled={!commandsEnabled || commandPending}
                      onClick={() => onCommand({ action: "pause" })}
                      type="button"
                    >
                      <Pause className="h-4 w-4" />
                    </button>
                    <button
                      className="icon-button text-red-400"
                      disabled={!commandsEnabled || commandPending}
                      onClick={() => onCommand({ action: "stop" })}
                      type="button"
                    >
                      <Square className="h-4 w-4" />
                    </button>
                    <button
                      className="icon-button text-[color:var(--accent)]"
                      onClick={onSendFile}
                      type="button"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <FocusControlDeck
          autoRefillEnabled={autoRefillEnabled}
          commandsEnabled={commandsEnabled}
          commandPending={commandPending}
          controlTab={controlTab}
          fanPower={fanPower}
          lampEnabled={lampEnabled}
          movementLabel={movementLabel}
          onExtruder={onExtruder}
          onLampToggle={onLampToggle}
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
      {actionFeedback ? (
        <div className="mt-5 text-sm text-zinc-400">{actionFeedback}</div>
      ) : null}
    </aside>
  );
}

function DetailPanel({
  focusMode,
  onEditConnection,
  onClose,
  onToggleFocus,
  printer,
}: {
  focusMode: boolean;
  onEditConnection: () => void;
  onClose: () => void;
  onToggleFocus: () => void;
  printer: PrinterDetail;
}) {
  const [selectedFeedId, setSelectedFeedId] = useState(
    printer.selectedCameraFeedId,
  );
  const [controlTab, setControlTab] = useState<
    "printer-parts" | "print-options" | "calibration"
  >("printer-parts");
  const [fanPower, setFanPower] = useState(100);
  const [lampEnabled, setLampEnabled] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState(
    printer.slots.find((slot) => slot.active)?.slot ??
      printer.slots[0]?.slot ??
      "A1",
  );
  const [autoRefillEnabled, setAutoRefillEnabled] = useState(true);
  const [movementLabel, setMovementLabel] = useState("Home");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const tone = printerTone(printer);
  const fans = fanMetrics(printer);
  const activeFeed = selectedCameraFeed(printer, selectedFeedId);
  const hasLimitedTelemetry = printer.telemetryState === "limited";
  const commandsEnabled = isUuidLike(printer.id);
  const commandMutation = useMutation({
    mutationFn: (payload: PrinterCommandRequest) =>
      apiFetch<{ command: PrinterCommandResponse }>(
        `/api/printers/${printer.id}/command`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      ),
  });
  const fileMutation = useMutation({
    mutationFn: (payload: PrinterFileSendRequest) =>
      apiFetch<{ handoff: PrinterFileSendResponse }>(
        `/api/printers/${printer.id}/files`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      ),
  });

  async function runPrinterCommand(payload: PrinterCommandRequest) {
    if (!commandsEnabled) {
      setActionFeedback(
        "Placeholder printers do not accept live commands. Switch back to Live mode after saving a real printer.",
      );
      return;
    }

    try {
      const response = await commandMutation.mutateAsync(payload);
      setActionFeedback(response.command.detail);
    } catch (error) {
      setActionFeedback(
        error instanceof Error
          ? error.message
          : "BambuView could not send that command.",
      );
    }
  }

  async function sendPrinterFile() {
    const path = window.prompt(
      "Enter the absolute path to a sliced .3mf or .gcode.3mf file on the BambuView host:",
    );
    if (!path?.trim()) {
      return;
    }

    if (!commandsEnabled) {
      setActionFeedback(
        "Placeholder printers cannot accept live file handoff. Save a real printer first.",
      );
      return;
    }

    try {
      const response = await fileMutation.mutateAsync({
        action: "send",
        path: path.trim(),
      });
      setActionFeedback(response.handoff.detail);
    } catch (error) {
      setActionFeedback(
        error instanceof Error
          ? error.message
          : "BambuView could not send that file.",
      );
    }
  }

  function handleMovement(label: string) {
    setMovementLabel(label);

    if (label === "Home") {
      void runPrinterCommand({ action: "home" });
      return;
    }

    const args = commandArgsFromMovementLabel(label);
    if (!args) {
      return;
    }

    void runPrinterCommand({
      action: "move",
      args,
    });
  }

  useEffect(() => {
    startTransition(() => {
      setSelectedFeedId(printer.selectedCameraFeedId);
      setControlTab("printer-parts");
      setFanPower(100);
      setLampEnabled(true);
      setSelectedSlot(
        printer.slots.find((slot) => slot.active)?.slot ??
          printer.slots[0]?.slot ??
          "A1",
      );
      setAutoRefillEnabled(true);
      setMovementLabel("Home");
      setActionFeedback(null);
    });
  }, [printer]);

  if (focusMode) {
    return (
      <FocusWorkspace
        actionFeedback={actionFeedback}
        autoRefillEnabled={autoRefillEnabled}
        commandsEnabled={commandsEnabled}
        commandPending={commandMutation.isPending || fileMutation.isPending}
        controlTab={controlTab}
        fanPower={fanPower}
        lampEnabled={lampEnabled}
        movementLabel={movementLabel}
        onCommand={(payload) => {
          void runPrinterCommand(payload);
        }}
        onExtruder={(distance) => {
          void runPrinterCommand({
            action: "extruder",
            args: { distance, feedrate: 900 },
          });
        }}
        onFocusModeChange={(next) => {
          if (!next) {
            onToggleFocus();
          }
        }}
        onLampToggle={(next) => {
          void runPrinterCommand({
            action: "lamp",
            args: { enabled: next },
          });
        }}
        onMovement={handleMovement}
        onSendFile={() => {
          void sendPrinterFile();
        }}
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
          <button
            aria-label="Edit printer connection"
            className="fleet-console-detail__icon-button"
            onClick={onEditConnection}
            type="button"
          >
            <Settings className="h-5 w-5" />
          </button>
          <button
            className="fleet-console-detail__icon-button fleet-console-detail__icon-button--focus"
            onClick={onToggleFocus}
            type="button"
          >
            <Maximize2 className="h-5 w-5" />
          </button>
          <button
            className="fleet-console-detail__icon-button"
            onClick={onClose}
            type="button"
          >
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
        <div className="fleet-console-status">
          <div className="fleet-console-status__copy">
            <div className="fleet-console-section-title">Status</div>
            <div className={`fleet-console-status__state ${tone.textClass}`}>
              <span className={`fleet-console-dot ${tone.dotClass}`} />
              <span>{printer.statusLabel}</span>
            </div>
            <div className="fleet-console-status__rows">
              {hasLimitedTelemetry ? (
                <>
                  <div>
                    <span>Mode</span>
                    <span>{printer.location}</span>
                  </div>
                  <div>
                    <span>Live Data</span>
                    <span>Not connected</span>
                  </div>
                  <div>
                    <span>Camera</span>
                    <span>
                      {activeFeed?.sourceId ? "Assigned" : "Unassigned"}
                    </span>
                  </div>
                  <div>
                    <span>Next Step</span>
                    <span>Use LAN/Developer or assign a restream</span>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span>File</span>
                    <span>{printer.fileName}</span>
                  </div>
                  <div>
                    <span>Layer</span>
                    <span>{printer.layer}</span>
                  </div>
                  <div>
                    <span>Progress</span>
                    <span>{printer.progress}%</span>
                  </div>
                  <div>
                    <span>Print Time</span>
                    <span>{printer.elapsed}</span>
                  </div>
                  <div>
                    <span>ETA</span>
                    <span>{printer.eta}</span>
                  </div>
                </>
              )}
            </div>
            {!hasLimitedTelemetry ? (
              <div className="fleet-console-status__progress">
                <div className="fleet-console-meter">
                  <div
                    className={`fleet-console-meter__bar ${tone.progressClass}`}
                    style={{ width: `${printer.progress}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
          <FleetPreview large printer={printer} />
        </div>
      </section>

      <section className="fleet-console-detail__section">
        <div className="fleet-console-section-title">Temperatures</div>
        <div className="fleet-console-temperature-grid">
          {[
            {
              label: "Nozzle",
              value: printer.temperatures[0]?.current ?? "—",
              target: printer.temperatures[0]?.target ?? "—",
            },
            {
              label: "Bed",
              value: printer.temperatures[1]?.current ?? "—",
              target: printer.temperatures[1]?.target ?? "—",
            },
            {
              label: "Chamber",
              value: printer.temperatures[2]?.current ?? "—",
              target: printer.temperatures[2]?.target ?? "—",
            },
            { label: "Aux Fan", value: fans.aux, target: fans.aux },
            { label: "Part Fan", value: fans.part, target: fans.part },
          ].map((item) => (
            <div
              className="fleet-console-temperature-grid__item"
              key={item.label}
            >
              <div className="fleet-console-temperature-grid__label">
                <Thermometer className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </div>
              <div className="fleet-console-temperature-grid__value">
                {item.value}
              </div>
              <div className="fleet-console-temperature-grid__target">
                {item.target}
              </div>
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
                    {slot.active ? (
                      <span className="fleet-console-dot fleet-console-dot--green" />
                    ) : null}
                  </div>
                </div>
                <div className="fleet-console-filament-card__body">
                  <div
                    className="fleet-console-filament-card__swatch"
                    style={{ backgroundColor: slot.color }}
                  />
                  <div>
                    <div className="fleet-console-filament-card__material">
                      {slot.material}
                    </div>
                    <div className="fleet-console-filament-card__color">
                      {slot.colorName ?? printer.materialColor}
                    </div>
                  </div>
                </div>
                <div className="fleet-console-filament-card__metrics">
                  <span>{metrics.weight}</span>
                  <span>{metrics.percent}%</span>
                </div>
                <div className="fleet-console-meter">
                  <div
                    className="fleet-console-meter__bar fleet-console-meter__bar--green"
                    style={{ width: `${metrics.percent}%` }}
                  />
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
          <button
            className="fleet-console-camera-tabs__button fleet-console-camera-tabs__button--chevron"
            type="button"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        <div className="fleet-console-camera-stage">
          <CameraFeedFrame
            className="fleet-console-camera-stage__image"
            feed={activeFeed}
            printer={printer}
          />
        </div>
        <div className="fleet-console-camera-stage__footer">
          <div className="fleet-console-camera-stage__meta">
            <span
              className={`fleet-console-dot ${
                activeFeed?.status === "offline"
                  ? "fleet-console-dot--red"
                  : activeFeed?.status === "degraded"
                    ? "fleet-console-dot--amber"
                    : "fleet-console-dot--green"
              }`}
            />
            <span>{activeFeed?.status ?? "unassigned"}</span>
            <span>{activeFeed?.streamKind ?? "none"}</span>
          </div>
          <div className="fleet-console-camera-stage__controls">
            {activeFeed?.sourceId ? "Assigned" : "Default"}
          </div>
        </div>
      </section>

      <section className="fleet-console-detail__section">
        <div className="fleet-console-section-title">Controls</div>
        <div className="fleet-console-controls">
          <button
            className="fleet-console-controls__button fleet-console-controls__button--primary"
            disabled={!commandsEnabled || commandMutation.isPending}
            onClick={() => {
              void runPrinterCommand({ action: "pause" });
            }}
            type="button"
          >
            <Pause className="h-4 w-4" />
            <span>Pause Print</span>
          </button>
          <button
            className="fleet-console-controls__button"
            disabled={!commandsEnabled || commandMutation.isPending}
            onClick={() => {
              void runPrinterCommand({ action: "stop" });
            }}
            type="button"
          >
            <Square className="h-4 w-4" />
            <span>Stop Print</span>
          </button>
          <button
            className="fleet-console-controls__button"
            disabled={fileMutation.isPending}
            onClick={() => {
              void sendPrinterFile();
            }}
            type="button"
          >
            <Send className="h-4 w-4" />
            <span>Send File</span>
          </button>
          <button
            className="fleet-console-controls__button fleet-console-controls__button--icon"
            type="button"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
        {actionFeedback ? (
          <div className="mt-3 text-sm text-zinc-400">{actionFeedback}</div>
        ) : null}
      </section>
    </aside>
  );
}

export function FleetPage({ user }: { user: UserProfile }) {
  const [fleetDataMode, setFleetDataMode] = useState<FleetDataMode>("live");
  const overviewQuery = useQuery({
    queryKey: ["fleet-overview", fleetDataMode],
    queryFn: () =>
      apiFetch<FleetOverview>(`/api/fleet/overview?mode=${fleetDataMode}`),
  });
  const printerConnectionsQuery = useQuery({
    queryKey: ["printer-connections"],
    queryFn: () =>
      apiFetch<{ printers: PrinterConnectionRecord[] }>(
        "/api/printers/connections",
      ),
  });
  const [selectedPrinterId, setSelectedPrinterId] = useState<string | null>(
    null,
  );
  const [scope, setScope] = useState<(typeof scopeOptions)[number][0]>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortMode, setSortMode] = useState<"name-asc" | "progress-desc">(
    "name-asc",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [addPrinterOpen, setAddPrinterOpen] = useState(false);
  const [editingPrinterId, setEditingPrinterId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(searchQuery.trim().toLowerCase());

  const overview = overviewQuery.data;
  const activePrinterId =
    selectedPrinterId ?? overview?.selectedPrinterId ?? "";
  const printerDetailQuery = useQuery({
    enabled: detailOpen && activePrinterId.length > 0,
    placeholderData: (previousData) =>
      previousData ??
      (activePrinterId === overview?.selectedPrinterId
        ? (overview?.selectedPrinter ?? undefined)
        : undefined),
    queryKey: ["printer-detail", fleetDataMode, activePrinterId],
    queryFn: () =>
      apiFetch<PrinterDetail>(
        `/api/printers/${activePrinterId}?mode=${fleetDataMode}`,
      ),
  });

  if (overviewQuery.isLoading || !overview) {
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
      return [
        printer.name,
        printer.cameraLabel,
        printer.material,
        printer.location,
      ]
        .join(" ")
        .toLowerCase()
        .includes(deferredSearch);
    });

  const layoutOrder = new Map(
    overview.printers.map((printer, index) => [printer.id, index]),
  );
  const visiblePrinters =
    sortMode === "progress-desc"
      ? [...filteredPrinters].sort(
          (left, right) => right.progress - left.progress,
        )
      : [...filteredPrinters].sort(
          (left, right) =>
            (layoutOrder.get(left.id) ?? 0) - (layoutOrder.get(right.id) ?? 0),
        );

  const detailPrinter = printerDetailQuery.data;
  const editingConnection =
    printerConnectionsQuery.data?.printers.find(
      (printer) => printer.id === editingPrinterId,
    ) ?? null;
  const liveModeIsEmpty =
    fleetDataMode === "live" && overview.printers.length === 0;

  function changeFleetDataMode(nextMode: FleetDataMode) {
    if (nextMode === fleetDataMode) {
      return;
    }

    startTransition(() => {
      setFleetDataMode(nextMode);
      setSelectedPrinterId(null);
      setDetailOpen(false);
      setFocusMode(false);
    });
  }

  return (
    <div
      className={`fleet-console-shell ${detailOpen ? "" : "fleet-console-shell--detail-closed"} ${focusMode ? "fleet-console-shell--focus" : ""}`}
    >
      <aside className="fleet-console-sidebar">
        <div className="fleet-console-sidebar__brand">
          <BrandLogo className="fleet-console-sidebar__brand-logo" />
        </div>

        <nav className="fleet-console-sidebar__nav">
          {navigationItems.map((item) => (
            <NavLink
              className={({ isActive }) =>
                isActive
                  ? "fleet-console-sidebar__link fleet-console-sidebar__link--active"
                  : "fleet-console-sidebar__link"
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
          <div className="fleet-console-sidebar-card__copy">
            12 Printers • 1 Farm • 8 Cameras
          </div>
          <div className="fleet-console-sidebar-card__copy">
            Updated just now
          </div>
          <div className="fleet-console-sidebar-card__sparkline" />
        </SidebarCard>

        <SidebarCard compact>
          <div className="fleet-console-sidebar-card__row">
            <div>
              <div className="fleet-console-sidebar-card__headline">
                Need help?
              </div>
              <div className="fleet-console-sidebar-card__copy">
                Browse docs and guides
              </div>
            </div>
            <ExternalLink className="h-4 w-4 text-zinc-500" />
          </div>
        </SidebarCard>

        <SidebarCard compact>
          <div className="fleet-console-sidebar-card__row">
            <div>
              <div className="fleet-console-sidebar-card__headline">
                Check for Updates
              </div>
              <div className="fleet-console-sidebar-card__copy">
                BambuView v{APP_VERSION}
              </div>
            </div>
            <RefreshCcw className="h-4 w-4 text-zinc-500" />
          </div>
        </SidebarCard>

        <SidebarCard compact>
          <div className="fleet-console-user">
            <div className="fleet-console-user__avatar">
              {initials(user.name)}
            </div>
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
            <div
              aria-label="Fleet data source"
              className="fleet-console-data-toggle"
              role="group"
            >
              {(
                [
                  ["live", "Live"],
                  ["placeholder", "Placeholder"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  className={`fleet-console-data-toggle__button ${fleetDataMode === mode ? "fleet-console-data-toggle__button--active" : ""}`}
                  key={mode}
                  onClick={() => changeFleetDataMode(mode)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <ModeToggle />
            <Link
              className="fleet-console-toolbar__button"
              to="/settings/appearance"
            >
              <Palette className="h-4 w-4" />
              <span>Settings</span>
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
              className={
                viewMode === "grid"
                  ? "fleet-console-view-toggle__button fleet-console-view-toggle__button--active"
                  : "fleet-console-view-toggle__button"
              }
              onClick={() => setViewMode("grid")}
              type="button"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              className={
                viewMode === "list"
                  ? "fleet-console-view-toggle__button fleet-console-view-toggle__button--active"
                  : "fleet-console-view-toggle__button"
              }
              onClick={() => setViewMode("list")}
              type="button"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          <div className="fleet-console-select fleet-console-select--styled">
            <StyledSelect
              onChange={(nextSortMode) => setSortMode(nextSortMode)}
              options={sortOptions}
              value={sortMode}
            />
          </div>
        </div>

        <FleetStats overview={overview} />

        <div
          className={`fleet-console-grid ${viewMode === "list" ? "fleet-console-grid--list" : ""}`}
        >
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
          <AddCard onClick={() => setAddPrinterOpen(true)} />
        </div>

        {visiblePrinters.length === 0 ? (
          <section className="fleet-console-empty">
            <CircleHelp className="h-6 w-6" />
            <div>
              <div className="fleet-console-empty__title">
                {liveModeIsEmpty
                  ? "No live printers connected yet."
                  : "No printers matched this filter."}
              </div>
              <div className="fleet-console-empty__copy">
                {liveModeIsEmpty
                  ? "Add a Bambu printer to start testing real fleet and camera data, or switch to Placeholder for the mock layout."
                  : "Try another scope or search term to bring printers, farms, or offline devices back into view."}
              </div>
            </div>
          </section>
        ) : null}
      </main>

      {detailOpen && detailPrinter ? (
        <DetailPanel
          focusMode={focusMode}
          onEditConnection={() => setEditingPrinterId(detailPrinter.id)}
          onClose={() => {
            setDetailOpen(false);
            setFocusMode(false);
          }}
          onToggleFocus={() => setFocusMode((current) => !current)}
          printer={detailPrinter}
        />
      ) : null}

      {addPrinterOpen ? (
        <AddPrinterDialog
          onClose={() => setAddPrinterOpen(false)}
          onSaved={(printerId) => {
            startTransition(() => {
              setFleetDataMode("live");
              setSelectedPrinterId(printerId);
              setDetailOpen(true);
              setFocusMode(false);
            });
          }}
        />
      ) : null}

      {editingPrinterId && editingConnection ? (
        <AddPrinterDialog
          initialConnection={editingConnection}
          onClose={() => setEditingPrinterId(null)}
          onDeleted={() => {
            startTransition(() => {
              setSelectedPrinterId(null);
              setDetailOpen(false);
              setFocusMode(false);
              setEditingPrinterId(null);
            });
          }}
          onSaved={(printerId) => {
            startTransition(() => {
              setFleetDataMode("live");
              setSelectedPrinterId(printerId);
              setDetailOpen(true);
              setFocusMode(false);
              setEditingPrinterId(null);
            });
          }}
        />
      ) : null}
    </div>
  );
}
