import {
  Activity,
  Cable,
  CheckCircle2,
  ChevronDown,
  Copy,
  FileUp,
  HardDriveDownload,
  Layers3,
  LoaderCircle,
  Logs,
  MonitorPlay,
  Network,
  PlugZap,
  Printer,
  RefreshCcw,
  RotateCcw,
  Settings2,
  ShieldAlert,
  Waves,
} from "lucide-react";
import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type {
  BambuConnectionMode,
  CompanionPrinterInput,
  CompanionPrinterDiscoveryResult,
  CompanionPrinterTelemetry,
  CompanionSettings,
  CompanionSnapshot,
  CompanionStreamInput,
} from "@bambuview/contracts";
import {
  BAMBU_CONNECTION_MODE_OPTIONS,
  BAMBU_PRINTER_MODELS,
} from "@bambuview/contracts";

import type { PairCompanionInput } from "@common/electron-api";

type PairServerProtocol = "http" | "https";

type SectionKey =
  | "pairing"
  | "printers"
  | "streams"
  | "capabilities"
  | "logs"
  | "settings";

const sections: Array<{
  icon: typeof PlugZap;
  key: SectionKey;
  label: string;
}> = [
  { icon: PlugZap, key: "pairing", label: "Pairing" },
  { icon: Printer, key: "printers", label: "Printers" },
  { icon: Waves, key: "streams", label: "Streams" },
  { icon: Layers3, key: "capabilities", label: "Capabilities" },
  { icon: Logs, key: "logs", label: "Logs" },
  { icon: Settings2, key: "settings", label: "Settings" },
];

const DEFAULT_PAIR_SERVER_PROTOCOL: PairServerProtocol = "http";
const DEFAULT_PAIR_SERVER_HOST = "localhost";
const DEFAULT_PAIR_SERVER_PORT = "4173";

interface PairFormState {
  companionName: string;
  pairingToken: string;
  serverHost: string;
  serverPort: string;
  serverProtocol: PairServerProtocol;
}

function emptyPrinterForm(): CompanionPrinterInput {
  return {
    accessCode: "",
    connectionMode: "lan",
    hostname: "",
    model: "X1 Carbon",
    name: "",
    notes: "",
    provider: "bambu-lab",
    serial: "",
    streamId: null,
  };
}

function emptyStreamForm(): CompanionStreamInput {
  return {
    linkedPrinterId: null,
    name: "",
    password: "",
    sourceKind: "mjpeg",
    upstreamUrl: "",
    username: "",
  };
}

function emptyPairForm(): PairFormState {
  return {
    companionName: "BambuView Companion",
    pairingToken: "",
    serverHost: DEFAULT_PAIR_SERVER_HOST,
    serverPort: DEFAULT_PAIR_SERVER_PORT,
    serverProtocol: DEFAULT_PAIR_SERVER_PROTOCOL,
  };
}

function printerInputFromDiscovery(
  printer: CompanionPrinterDiscoveryResult["printers"][number],
): CompanionPrinterInput {
  return {
    accessCode: "",
    connectionMode: printer.connectionMode,
    hostname: printer.hostname,
    model: printer.model,
    name: printer.name,
    notes: printer.notes,
    provider: printer.provider,
    serial: printer.serial,
    streamId: printer.streamId,
  };
}

function printerInputFromSaved(
  printer: CompanionSnapshot["printers"][number],
): CompanionPrinterInput {
  return {
    accessCode: "",
    connectionMode: printer.connectionMode,
    hostname: printer.hostname,
    model: printer.model,
    name: printer.name,
    notes: printer.notes,
    provider: printer.provider,
    serial: printer.serial,
    streamId: printer.streamId,
  };
}

function parsePairServerUrl(
  serverUrl: string | null | undefined,
): Pick<PairFormState, "serverHost" | "serverPort" | "serverProtocol"> {
  if (!serverUrl) {
    return {
      serverHost: DEFAULT_PAIR_SERVER_HOST,
      serverPort: DEFAULT_PAIR_SERVER_PORT,
      serverProtocol: DEFAULT_PAIR_SERVER_PROTOCOL,
    };
  }

  try {
    const url = new URL(serverUrl);
    return {
      serverHost: url.hostname || DEFAULT_PAIR_SERVER_HOST,
      serverPort: url.port || DEFAULT_PAIR_SERVER_PORT,
      serverProtocol:
        url.protocol === "https:" ? "https" : DEFAULT_PAIR_SERVER_PROTOCOL,
    };
  } catch {
    return {
      serverHost: DEFAULT_PAIR_SERVER_HOST,
      serverPort: DEFAULT_PAIR_SERVER_PORT,
      serverProtocol: DEFAULT_PAIR_SERVER_PROTOCOL,
    };
  }
}

function buildPairInput(form: PairFormState): PairCompanionInput {
  const host = form.serverHost.trim() || DEFAULT_PAIR_SERVER_HOST;
  const port = form.serverPort.trim() || DEFAULT_PAIR_SERVER_PORT;

  return {
    companionName: form.companionName,
    pairingToken: form.pairingToken,
    serverUrl: `${form.serverProtocol}://${host}${port ? `:${port}` : ""}`,
  };
}

const pairProtocolOptions: Array<CompanionSelectOption<PairServerProtocol>> = [
  { label: "http", value: "http" },
  { label: "https", value: "https" },
];

const printerModelOptions: Array<CompanionSelectOption<string>> =
  BAMBU_PRINTER_MODELS.map((model) => ({
    description: `${model.family} Series`,
    label: model.label,
    value: model.value,
  }));

const connectionModeOptions: Array<CompanionSelectOption<BambuConnectionMode>> =
  BAMBU_CONNECTION_MODE_OPTIONS.map((mode) => ({
    description: mode.summary,
    label: mode.label,
    value: mode.value,
  }));

const streamSourceOptions: Array<
  CompanionSelectOption<CompanionStreamInput["sourceKind"]>
> = [
  { label: "Frigate / MJPEG", value: "mjpeg" },
  { label: "HTTP Snapshot", value: "snapshot" },
  { label: "HLS", value: "hls" },
  { label: "RTSP", value: "rtsp" },
  { label: "Bambu Native Override", value: "bambu-native" },
];

const bindModeOptions: Array<
  CompanionSelectOption<CompanionSettings["bindMode"]>
> = [
  { label: "localhost only", value: "localhost" },
  { label: "LAN (advanced)", value: "lan" },
];

const themeModeOptions: Array<
  CompanionSelectOption<CompanionSettings["themeMode"]>
> = [
  { label: "Dark", value: "dark" },
  { label: "Light", value: "light" },
];

function toneLabel(status: CompanionSnapshot["health"]["status"]) {
  return status.replaceAll("-", " ");
}

function CompanionBrandMark() {
  return (
    <svg
      aria-hidden="true"
      className="companion-brand__logo"
      viewBox="0 0 113.97 97.58"
    >
      <path
        d="M47.12 65.17c-.06-.5-.03-1.01-.04-1.51.06 0 .13-.03.21-.08l9.63-5.53c.17-.1.28-.14.46-.03l9.88 5.68c0 .53.04 1.01-.04 1.54v10.12l-10.04 5.85-9.92-5.78c-.1-.08-.13-.15-.14-.29v-9.97Z"
        fill="var(--companion-brand-ink)"
      />
      <path
        d="M50.11 66.48c-.04-.35-.02-.71-.02-1.06.04 0 .09-.02.15-.05l6.77-3.89c.12-.07.19-.1.32-.02l6.95 3.99c0 .37.03.71-.03 1.09v7.11l-7.06 4.11-6.97-4.06c-.07-.06-.09-.11-.1-.2v-7.01Z"
        fill="var(--companion-brand-green)"
      />
      <g fill="var(--companion-brand-ink)">
        <rect
          height="13.15"
          transform="rotate(-90 107.395 44.575)"
          width="71.87"
          x="71.46"
          y="38"
        />
        <rect
          height="21.91"
          transform="rotate(-90 89.855 15.205)"
          width="13.15"
          x="83.28"
          y="4.25"
        />
        <rect
          height="35.06"
          transform="rotate(-90 57.2 17.53)"
          width="35.06"
          x="39.67"
          y="0"
        />
        <rect
          height="13.15"
          transform="rotate(-90 6.575 44.575)"
          width="71.87"
          x="-29.36"
          y="38"
        />
        <rect
          height="21.91"
          transform="rotate(-90 24.115 15.205)"
          width="13.15"
          x="17.54"
          y="4.25"
        />
      </g>
      <g fill="var(--companion-brand-green)">
        <polygon points="66.53 37.89 57.16 47.26 47.78 37.89 66.53 37.89" />
        <polygon points="35.16 97.58 21.91 97.58 21.91 84.43 21.96 84.39 35.16 97.58" />
        <polygon points="92.05 84.39 92.05 97.58 78.86 97.58 92.05 84.39" />
        <rect
          height="21.91"
          transform="rotate(-90 10.955 90.955)"
          width="13.15"
          x="4.38"
          y="80"
        />
        <rect
          height="21.91"
          transform="rotate(-90 103.005 90.955)"
          width="13.15"
          x="96.43"
          y="80"
        />
      </g>
      <path d="M54.03 68.2c-.02-.16 0-.31-.01-.47.02 0 .04 0 .07-.02l3.01-1.73c.05-.03.09-.04.14-.01l3.09 1.77c0 .17.01.32-.01.48v3.16l-3.14 1.83-3.1-1.8s-.04-.05-.04-.09v-3.12Z" />
      <g fill="var(--companion-brand-ink)">
        <polygon points="54.15 89.3 33.05 69.55 54.08 49.86 37.51 49.86 37.48 49.83 17.76 69.55 37.48 89.27 37.48 89.3 54.15 89.3" />
        <polygon points="76.96 49.89 76.93 49.93 76.93 49.86 60.17 49.86 81.26 69.61 60.23 89.3 76.93 89.3 76.93 89.3 76.96 89.33 96.69 69.61 76.96 49.89" />
      </g>
    </svg>
  );
}

function connectionModeLabel(mode: BambuConnectionMode) {
  return (
    BAMBU_CONNECTION_MODE_OPTIONS.find((option) => option.value === mode)
      ?.label ?? mode
  );
}

function printerReadiness(printer: CompanionSnapshot["printers"][number]) {
  if (printer.capabilities.telemetry === "available") {
    return {
      label: "Local Ready",
      tone: "streaming" as const,
    };
  }

  if (printer.connectionMode === "bambu-connect") {
    return {
      label: "Bambu Connect Ready",
      tone: "paired" as const,
    };
  }

  if (printer.connectionMode === "cloud") {
    return {
      label: "Cloud Ready",
      tone: "paired" as const,
    };
  }

  return {
    label:
      printer.hostname.trim() || printer.serial.trim() || printer.accessCodeSet
        ? "Finish Local Setup"
        : "Requires Setup",
    tone: "warning" as const,
  };
}

function printerHasSavedLocalDetails(
  printer: Pick<CompanionSnapshot["printers"][number], "accessCodeSet" | "hostname" | "serial">,
) {
  return (
    printer.hostname.trim().length > 0 ||
    printer.serial.trim().length > 0 ||
    printer.accessCodeSet
  );
}

function printerFormHasLocalDetails(
  printer: Pick<CompanionPrinterInput, "accessCode" | "hostname" | "serial">,
) {
  return (
    printer.hostname.trim().length > 0 ||
    printer.serial.trim().length > 0 ||
    (printer.accessCode?.trim().length ?? 0) > 0
  );
}

function localSetupRecommended(mode: BambuConnectionMode) {
  return mode === "lan" || mode === "developer";
}

function clearPrinterLocalDetails(
  printer: CompanionPrinterInput,
): CompanionPrinterInput {
  return {
    ...printer,
    accessCode: "",
    hostname: "",
    serial: "",
  };
}

function printerMeta(printer: CompanionSnapshot["printers"][number]) {
  return [
    printer.model,
    printer.hostname.trim() || "Hostname pending",
    connectionModeLabel(printer.connectionMode),
  ].join(" • ");
}

function streamSourcePlaceholder(
  sourceKind: CompanionStreamInput["sourceKind"],
) {
  if (sourceKind === "mjpeg") {
    return "http://frigate:5000/api/workbench_left";
  }

  if (sourceKind === "snapshot") {
    return "http://camera.local/latest.jpg";
  }

  if (sourceKind === "hls") {
    return "https://camera.local/stream.m3u8";
  }

  if (sourceKind === "rtsp") {
    return "rtsp://camera.local:554/stream";
  }

  return "printer-hostname-or-rtsps-url";
}

function streamSourceHint(sourceKind: CompanionStreamInput["sourceKind"]) {
  if (sourceKind === "mjpeg") {
    return "Use this for Frigate restream URLs or any direct browser-safe MJPEG feed.";
  }

  if (sourceKind === "snapshot") {
    return "Use this for single-image snapshot URLs that refresh in BambuView.";
  }

  if (sourceKind === "hls") {
    return "Use this when the source already publishes an HLS playlist.";
  }

  if (sourceKind === "rtsp") {
    return "Use this for RTSP cameras when Companion needs to restream them for browser playback.";
  }

  return "Use this only when you need to override the automatic native Bambu camera path.";
}

interface CompanionSelectOption<TValue extends string> {
  description?: string;
  label: string;
  value: TValue;
}

function CompanionSelect<TValue extends string>({
  onChange,
  options,
  placeholder = "Select",
  value,
}: {
  onChange: (next: TValue) => void;
  options: Array<CompanionSelectOption<TValue>>;
  placeholder?: string;
  value: TValue | "";
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function moveSelection(direction: 1 | -1) {
    const currentIndex = Math.max(
      0,
      options.findIndex((option) => option.value === value),
    );
    const nextIndex =
      (currentIndex + direction + options.length) % options.length;
    const next = options[nextIndex];
    if (next) {
      onChange(next.value);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      moveSelection(1);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      moveSelection(-1);
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="companion-select" ref={wrapperRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="companion-select__button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        type="button"
      >
        <span>{selected?.label ?? placeholder}</span>
        <ChevronDown className="button-icon" />
      </button>
      {open ? (
        <div className="companion-select__menu" role="listbox">
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className={`companion-select__option ${
                option.value === value ? "companion-select__option--active" : ""
              }`}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              <span>{option.label}</span>
              {option.description ? <small>{option.description}</small> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function App() {
  const [activeSection, setActiveSection] = useState<SectionKey>("pairing");
  const [snapshot, setSnapshot] = useState<CompanionSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pairForm, setPairForm] = useState<PairFormState>(emptyPairForm);
  const [printerForm, setPrinterForm] =
    useState<CompanionPrinterInput>(emptyPrinterForm);
  const [editingPrinterId, setEditingPrinterId] = useState<string | null>(null);
  const [showLocalPrinterSetup, setShowLocalPrinterSetup] = useState(true);
  const [streamForm, setStreamForm] =
    useState<CompanionStreamInput>(emptyStreamForm);
  const [showAdvancedStreams, setShowAdvancedStreams] = useState(false);
  const [settingsForm, setSettingsForm] = useState<CompanionSettings | null>(
    null,
  );
  const [telemetry, setTelemetry] = useState<
    Record<string, CompanionPrinterTelemetry>
  >({});
  const [discoveryResult, setDiscoveryResult] =
    useState<CompanionPrinterDiscoveryResult | null>(null);

  async function refresh() {
    const next = await window.companion.getSnapshot();
    startTransition(() => {
      setSnapshot(next);
      setSettingsForm(next.settings);
      setPairForm((current) => {
        const serverState = next.pairing.serverUrl
          ? parsePairServerUrl(next.pairing.serverUrl)
          : {
              serverHost: current.serverHost,
              serverPort: current.serverPort,
              serverProtocol: current.serverProtocol,
            };

        return {
          ...current,
          companionName:
            next.pairing.companionName || next.settings.friendlyName,
          ...serverState,
        };
      });
    });
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!successMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 3200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [successMessage]);

  if (!snapshot || !settingsForm) {
    return (
      <div className="companion-shell">
        <div className="companion-loading">
          <LoaderCircle className="spin" />
          <span>Loading BambuView Companion…</span>
        </div>
      </div>
    );
  }

  async function runAction<T>(
    action: () => Promise<T>,
    after?: (value: T) => void,
  ) {
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await action();
      after?.(result);
      await refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Action failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  function resetPrinterEditor() {
    setEditingPrinterId(null);
    setPrinterForm(emptyPrinterForm());
    setShowLocalPrinterSetup(true);
  }

  function startPrinterEdit(printer: CompanionSnapshot["printers"][number]) {
    setEditingPrinterId(printer.id);
    setPrinterForm(printerInputFromSaved(printer));
    setShowLocalPrinterSetup(
      localSetupRecommended(printer.connectionMode) ||
        printerHasSavedLocalDetails(printer),
    );
    setSuccessMessage(
      `${printer.name} is ready to edit. Save it again when you are done, or skip local setup for now.`,
    );
  }

  async function submitPrinterForm(skipLocalSetup: boolean) {
    const currentSnapshot = snapshot;
    const existingPrinter =
      editingPrinterId === null || currentSnapshot === null
        ? null
        : currentSnapshot.printers.find(
            (printer) => printer.id === editingPrinterId,
          ) ?? null;

    const payloadBase = skipLocalSetup
      ? clearPrinterLocalDetails(printerForm)
      : printerForm;
    const payload: CompanionPrinterInput = {
      ...payloadBase,
      accessCode:
        editingPrinterId !== null &&
        !skipLocalSetup &&
        existingPrinter?.accessCodeSet === true &&
        (payloadBase.accessCode?.trim().length ?? 0) === 0
          ? undefined
          : payloadBase.accessCode,
    };

    await runAction(
      () =>
        editingPrinterId === null
          ? window.companion.createPrinter(payload)
          : window.companion.updatePrinter(editingPrinterId, payload),
      () => {
        const actionLabel = editingPrinterId === null ? "saved" : "updated";
        resetPrinterEditor();
        setSuccessMessage(
          skipLocalSetup
            ? `Printer ${actionLabel}. You can add local Companion details later from Edit.`
            : `Printer ${actionLabel} in Companion.`,
        );
      },
    );
  }

  const activeSectionLabel =
    sections.find((section) => section.key === activeSection)?.label ??
    "Companion";

  return (
    <div
      className={`companion-shell companion-shell--${settingsForm.themeMode}`}
    >
      <aside className="companion-sidebar">
        <div className="companion-brand">
          <CompanionBrandMark />
          <div className="companion-brand__content">
            <div className="companion-brand__name">BambuView Companion</div>
            <div className="companion-brand__copy">
              Local bridge for printers, cameras, telemetry, and file handoff
            </div>
            <div className="companion-brand__copy">
              Version {snapshot.health.appVersion}
            </div>
          </div>
        </div>

        <div className="companion-status">
          <div className={`status-pill status-pill--${snapshot.health.status}`}>
            <Activity className="status-pill__icon" />
            <span>{toneLabel(snapshot.health.status)}</span>
          </div>
          <div className="companion-status__meta">
            <div>{snapshot.health.bridge.baseUrl}</div>
            <div>
              {snapshot.health.bridge.bindMode === "lan"
                ? "LAN binding"
                : "localhost only"}
            </div>
          </div>
        </div>

        <nav className="companion-nav">
          {sections.map((section) => (
            <button
              className={
                activeSection === section.key
                  ? "companion-nav__item companion-nav__item--active"
                  : "companion-nav__item"
              }
              key={section.key}
              onClick={() => setActiveSection(section.key)}
              type="button"
            >
              <section.icon className="companion-nav__icon" />
              <span>{section.label}</span>
            </button>
          ))}
        </nav>

        <div className="companion-sidebar__footer">
          <button
            className="ghost-button"
            onClick={() => {
              void runAction(
                () => window.companion.copyBridgeUrl(),
                (url) => {
                  setSuccessMessage(`Bridge URL copied: ${url}`);
                },
              );
            }}
            type="button"
          >
            <Copy className="button-icon" />
            Copy Bridge URL
          </button>
        </div>
      </aside>

      <main className="companion-main">
        <header className="companion-header">
          <div>
            <h1>{activeSectionLabel}</h1>
            <p>
              {snapshot.pairing.paired
                ? `Paired to ${snapshot.pairing.serverUrl}`
                : "Companion is ready for its first BambuView pairing."}
            </p>
          </div>
          <div className="companion-header__actions">
            {busy ? <LoaderCircle className="spin" /> : null}
            <button
              className="ghost-button"
              onClick={() => {
                void runAction(() => refresh());
              }}
              type="button"
            >
              <RefreshCcw className="button-icon" />
              Refresh
            </button>
          </div>
        </header>

        {errorMessage ? (
          <div className="notice notice--error">
            <ShieldAlert className="button-icon" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {successMessage ? (
          <div className="notice notice--success">
            <CheckCircle2 className="button-icon" />
            <span>{successMessage}</span>
          </div>
        ) : null}

        {snapshot.health.warnings.length > 0 ? (
          <div className="notice notice--warning">
            <Cable className="button-icon" />
            <div>
              {snapshot.health.warnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          </div>
        ) : null}

        {activeSection === "pairing" ? (
          <section className="panel-grid">
            <article className="panel-card">
              <div className="panel-card__title">Pair With BambuView</div>
              <form
                className="stack-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAction(
                    () => window.companion.pair(buildPairInput(pairForm)),
                    (nextSnapshot) => {
                      setPairForm((current) => ({
                        ...current,
                        pairingToken: "",
                      }));
                      setSuccessMessage(
                        `Companion paired successfully with ${nextSnapshot.pairing.serverUrl}.`,
                      );
                    },
                  );
                }}
              >
                <div className="stack-form__row stack-form__row--server">
                  <label>
                    <span>Protocol</span>
                    <CompanionSelect
                      onChange={(serverProtocol) =>
                        setPairForm((current) => ({
                          ...current,
                          serverProtocol,
                        }))
                      }
                      options={pairProtocolOptions}
                      value={pairForm.serverProtocol}
                    />
                  </label>
                  <label className="stack-form__field--wide">
                    <span>Host</span>
                    <input
                      onChange={(event) =>
                        setPairForm((current) => ({
                          ...current,
                          serverHost: event.target.value,
                        }))
                      }
                      placeholder={DEFAULT_PAIR_SERVER_HOST}
                      required
                      value={pairForm.serverHost}
                    />
                  </label>
                  <label>
                    <span>Port</span>
                    <input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      onChange={(event) =>
                        setPairForm((current) => ({
                          ...current,
                          serverPort: event.target.value,
                        }))
                      }
                      placeholder={DEFAULT_PAIR_SERVER_PORT}
                      value={pairForm.serverPort}
                    />
                  </label>
                </div>
                <div className="field-hint">
                  Use <strong>http://localhost:4173</strong> only when BambuView
                  and Companion are running on the same computer. If BambuView
                  is running in Docker or on another device, use that
                  machine&apos;s LAN URL here and switch the Companion bridge to
                  <strong> LAN</strong> in Settings before pairing.
                </div>
                <label>
                  <span>Pairing Token</span>
                  <input
                    onChange={(event) =>
                      setPairForm((current) => ({
                        ...current,
                        pairingToken: event.target.value,
                      }))
                    }
                    placeholder="Paste the token from BambuView"
                    required
                    value={pairForm.pairingToken}
                  />
                </label>
                <label>
                  <span>Friendly Companion Name</span>
                  <input
                    onChange={(event) =>
                      setPairForm((current) => ({
                        ...current,
                        companionName: event.target.value,
                      }))
                    }
                    value={pairForm.companionName}
                  />
                </label>
                <div className="button-row">
                  <button
                    className="solid-button"
                    disabled={busy}
                    type="submit"
                  >
                    <PlugZap className="button-icon" />
                    Pair Companion
                  </button>
                  <button
                    className="ghost-button"
                    disabled={busy || !snapshot.pairing.paired}
                    onClick={() => {
                      void runAction(
                        async () => window.companion.resetPairing(),
                        () => {
                          setPairForm((current) => ({
                            ...emptyPairForm(),
                            companionName: current.companionName,
                            pairingToken: "",
                          }));
                          setSuccessMessage(
                            "Pairing was cleared on this Companion.",
                          );
                        },
                      );
                    }}
                    type="button"
                  >
                    <RotateCcw className="button-icon" />
                    Reset Pairing
                  </button>
                </div>
              </form>
            </article>

            <article className="panel-card">
              <div className="panel-card__title">Bridge Details</div>
              <dl className="data-list">
                <div>
                  <dt>Current URL</dt>
                  <dd>{snapshot.health.bridge.baseUrl}</dd>
                </div>
                <div>
                  <dt>Bind Mode</dt>
                  <dd>{snapshot.health.bridge.bindMode}</dd>
                </div>
                <div>
                  <dt>Port</dt>
                  <dd>{snapshot.health.bridge.port}</dd>
                </div>
                <div>
                  <dt>Paired Server</dt>
                  <dd>{snapshot.pairing.serverUrl ?? "Not paired"}</dd>
                </div>
              </dl>
              <div className="field-hint">
                Advanced only: the bridge secret is generated locally so
                BambuView can authenticate future bridge calls. It is separate
                from the one-time pairing token you copy from BambuView during
                setup.
              </div>
              <div className="field-hint">
                Remote pairing requires a bridge URL that BambuView can reach.
                If your server is on another machine, open Settings and change
                Bind Mode to <strong>LAN</strong>, then set Bind Host to this
                computer&apos;s LAN IP or hostname before pairing.
              </div>
              <div className="button-row">
                <button
                  className="ghost-button"
                  onClick={() => {
                    void runAction(
                      async () => window.companion.regenerateBridgeToken(),
                      (result) => {
                        setSuccessMessage(
                          `Bridge secret rotated successfully. New token: ${result.token}`,
                        );
                      },
                    );
                  }}
                  type="button"
                >
                  <Network className="button-icon" />
                  Rotate Bridge Secret
                </button>
              </div>
            </article>
          </section>
        ) : null}

        {activeSection === "printers" ? (
          <section className="panel-grid panel-grid--two-up">
            <article className="panel-card">
              <div className="panel-card__title">
                {editingPrinterId ? "Edit Printer" : "Add Printer"}
              </div>
              <div className="button-row panel-card__actions">
                <button
                  className="ghost-button"
                  disabled={busy}
                  onClick={() => {
                    void runAction(
                      () => window.companion.discoverPrinters(),
                      (result) => {
                        setDiscoveryResult(result);
                        setSuccessMessage(
                          result.printers.length > 0
                            ? `Found ${result.printers.length} Bambu printer${result.printers.length === 1 ? "" : "s"} on the LAN.`
                            : "Discovery finished. No LAN-broadcasting Bambu printers answered this pass.",
                        );
                      },
                    );
                  }}
                  type="button"
                >
                  <RefreshCcw className="button-icon" />
                  Discover Printers
                </button>
              </div>
              {discoveryResult ? (
                <div className="stack-list discovery-list">
                  <div className="field-hint">{discoveryResult.detail}</div>
                  {discoveryResult.printers.length > 0 ? (
                    discoveryResult.printers.map((printer) => (
                      <div className="item-card" key={printer.id}>
                        <div className="item-card__header">
                          <div>
                            <div className="item-card__title">
                              {printer.name}
                            </div>
                            <div className="item-card__meta">
                              {printer.model} • {printer.hostname} •{" "}
                              {printer.connectionMode}
                            </div>
                          </div>
                          <button
                            className="ghost-button"
                            onClick={() => {
                              setEditingPrinterId(null);
                              setPrinterForm(printerInputFromDiscovery(printer));
                              setShowLocalPrinterSetup(
                                localSetupRecommended(printer.connectionMode) ||
                                  printer.hostname.trim().length > 0 ||
                                  printer.serial.trim().length > 0,
                              );
                              setSuccessMessage(
                                `${printer.name} is ready below. Save it now, or skip local Companion setup and finish telemetry details later.`,
                              );
                            }}
                            type="button"
                          >
                            <Copy className="button-icon" />
                            Use Profile
                          </button>
                        </div>
                        <div className="item-card__copy">
                          {printer.capabilityNotes.discovery ??
                            "Discovered over the local Bambu LAN broadcast."}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">
                      No printers answered the LAN discovery broadcast yet.
                    </div>
                  )}
                </div>
              ) : null}
              <form
                className="stack-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitPrinterForm(false);
                }}
              >
                <label>
                  <span>Name</span>
                  <input
                    onChange={(event) =>
                      setPrinterForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    value={printerForm.name}
                  />
                </label>
                <label>
                  <span>Model</span>
                  <CompanionSelect
                    onChange={(model) =>
                      setPrinterForm((current) => ({
                        ...current,
                        model,
                      }))
                    }
                    options={printerModelOptions}
                    value={printerForm.model}
                  />
                </label>
                <label>
                  <span>Connection Mode</span>
                  <CompanionSelect
                    onChange={(connectionMode) => {
                      setPrinterForm((current) => ({
                        ...current,
                        connectionMode,
                      }));
                      setShowLocalPrinterSetup(
                        showLocalPrinterSetup ||
                          localSetupRecommended(connectionMode) ||
                          printerFormHasLocalDetails(printerForm),
                      );
                    }}
                    options={connectionModeOptions}
                    value={printerForm.connectionMode}
                  />
                </label>
                <label>
                  <span>Notes</span>
                  <textarea
                    onChange={(event) =>
                      setPrinterForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    rows={4}
                    value={printerForm.notes ?? ""}
                  />
                </label>
                <div className="notice notice--warning">
                  <Cable className="button-icon" />
                  <span>
                    Local Companion setup is optional. Add the printer host,
                    serial number, and LAN access code now if you want
                    Companion to handle local telemetry, native camera
                    restreaming, AMS state, and direct controls. Otherwise, you
                    can skip it and fill those in later from Edit.
                  </span>
                </div>
                <div className="button-row">
                  <button
                    className={
                      showLocalPrinterSetup ? "ghost-button" : "solid-button"
                    }
                    onClick={() => setShowLocalPrinterSetup(true)}
                    type="button"
                  >
                    <Cable className="button-icon" />
                    Add Local Setup
                  </button>
                  <button
                    className={
                      !showLocalPrinterSetup ? "solid-button" : "ghost-button"
                    }
                    onClick={() => {
                      setShowLocalPrinterSetup(false);
                      setPrinterForm((current) =>
                        clearPrinterLocalDetails(current),
                      );
                    }}
                    type="button"
                  >
                    <CheckCircle2 className="button-icon" />
                    Skip For Now
                  </button>
                </div>
                {showLocalPrinterSetup ? (
                  <div className="stack-form stack-form--nested">
                    <label>
                      <span>Hostname / IP</span>
                      <input
                        onChange={(event) =>
                          setPrinterForm((current) => ({
                            ...current,
                            hostname: event.target.value,
                          }))
                        }
                        placeholder="printer.local"
                        value={printerForm.hostname}
                      />
                    </label>
                    <label>
                      <span>Serial Number</span>
                      <input
                        onChange={(event) =>
                          setPrinterForm((current) => ({
                            ...current,
                            serial: event.target.value,
                          }))
                        }
                        value={printerForm.serial}
                      />
                    </label>
                    <label>
                      <span>
                        Access Code
                        {editingPrinterId &&
                        snapshot.printers.find(
                          (printer) => printer.id === editingPrinterId,
                        )?.accessCodeSet
                          ? " (leave blank to keep the saved one)"
                          : ""}
                      </span>
                      <input
                        onChange={(event) =>
                          setPrinterForm((current) => ({
                            ...current,
                            accessCode: event.target.value,
                          }))
                        }
                        placeholder={
                          editingPrinterId &&
                          snapshot.printers.find(
                            (printer) => printer.id === editingPrinterId,
                          )?.accessCodeSet
                            ? "Stored locally"
                            : ""
                        }
                        type="password"
                        value={printerForm.accessCode ?? ""}
                      />
                    </label>
                  </div>
                ) : null}
                <div className="button-row">
                  <button className="solid-button" disabled={busy} type="submit">
                    <Printer className="button-icon" />
                    {editingPrinterId ? "Update Printer" : "Save Printer"}
                  </button>
                  <button
                    className="ghost-button"
                    disabled={busy}
                    onClick={() => {
                      void submitPrinterForm(true);
                    }}
                    type="button"
                  >
                    <CheckCircle2 className="button-icon" />
                    Save And Skip Local Setup
                  </button>
                  {editingPrinterId ? (
                    <button
                      className="ghost-button"
                      disabled={busy}
                      onClick={() => resetPrinterEditor()}
                      type="button"
                    >
                      <RotateCcw className="button-icon" />
                      Cancel Edit
                    </button>
                  ) : null}
                </div>
              </form>
            </article>

            <article className="panel-card">
              <div className="panel-card__title">Saved Printers</div>
              <div className="stack-list">
                {snapshot.printers.length === 0 ? (
                  <div className="empty-state">
                    No printers saved yet. Save a printer profile first, then
                    come back later to finish any optional local Companion
                    setup.
                  </div>
                ) : null}
                {snapshot.printers.map((printer) => {
                  const readiness = printerReadiness(printer);

                  return (
                    <div className="item-card" key={printer.id}>
                      <div className="item-card__header">
                        <div>
                          <div className="item-card__title">{printer.name}</div>
                          <div className="item-card__meta">
                            {printerMeta(printer)}
                          </div>
                        </div>
                        <div
                          className={`status-pill status-pill--${readiness.tone}`}
                        >
                          {readiness.label}
                        </div>
                      </div>
                      <div className="item-card__copy">
                        {printer.capabilityNotes.telemetry}
                      </div>
                      <div className="button-row">
                        <button
                          className="ghost-button"
                          onClick={() => startPrinterEdit(printer)}
                          type="button"
                        >
                          <Settings2 className="button-icon" />
                          Edit
                        </button>
                        <button
                          className="ghost-button"
                          onClick={() => {
                            void runAction(
                              () => window.companion.testPrinter(printer.id),
                              (result) => {
                                setSuccessMessage(result.message);
                              },
                            );
                          }}
                          type="button"
                        >
                          <HardDriveDownload className="button-icon" />
                          Test
                        </button>
                        <button
                          className="ghost-button"
                          onClick={() => {
                            void runAction(
                              () => window.companion.readTelemetry(printer.id),
                              (result) =>
                                setTelemetry((current) => ({
                                  ...current,
                                  [printer.id]: result,
                                })),
                            );
                          }}
                          type="button"
                        >
                          <Activity className="button-icon" />
                          Telemetry
                        </button>
                        <button
                          className="ghost-button ghost-button--danger"
                          onClick={() => {
                            void runAction(() =>
                              Promise.resolve(
                                window.companion.deletePrinter(printer.id),
                              ),
                            );
                          }}
                          type="button"
                        >
                          <RotateCcw className="button-icon" />
                          Remove
                        </button>
                      </div>
                      {telemetry[printer.id] ? (
                        <div className="telemetry-grid">
                          <div>
                            <strong>{telemetry[printer.id].state}</strong>
                            <span>{telemetry[printer.id].message}</span>
                          </div>
                          <div>
                            <strong>Progress</strong>
                            <span>
                              {telemetry[printer.id].progress ?? "—"}%
                            </span>
                          </div>
                          <div>
                            <strong>File</strong>
                            <span>{telemetry[printer.id].fileName ?? "—"}</span>
                          </div>
                          <div>
                            <strong>Nozzle</strong>
                            <span>
                              {telemetry[printer.id].nozzleTemperature ?? "—"}°C
                            </span>
                          </div>
                        </div>
                      ) : null}
                      {!printerHasSavedLocalDetails(printer) ? (
                        <div className="field-hint">
                          This printer profile is saved without local Companion
                          details. Edit it later if you want native camera
                          restreaming, live telemetry, AMS state, or direct
                          local controls from this machine.
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </article>
          </section>
        ) : null}

        {activeSection === "streams" ? (
          <section className="panel-grid panel-grid--two-up">
            <article className="panel-card">
              <div className="panel-card__title">Automatic Native Cameras</div>
              <div className="empty-state empty-state--inline">
                BambuView Companion now treats saved Bambu printers as the
                default camera path. If a printer has the local details it
                needs, the native Bambu feed is exposed automatically without a
                separate manual stream entry.
              </div>
              <div className="button-row">
                <button
                  className="ghost-button"
                  onClick={() => setActiveSection("printers")}
                  type="button"
                >
                  <Printer className="button-icon" />
                  Review Printers
                </button>
                <button
                  className={
                    showAdvancedStreams ? "solid-button" : "ghost-button"
                  }
                  onClick={() => setShowAdvancedStreams((current) => !current)}
                  type="button"
                >
                  <Settings2 className="button-icon" />
                  {showAdvancedStreams
                    ? "Hide Advanced Sources"
                    : "Advanced Sources"}
                </button>
              </div>
              <div className="field-hint">
                Use Advanced Sources only for Frigate restreams, RTSP cameras,
                snapshots, HLS playlists, or a manual native override.
              </div>

              {showAdvancedStreams ? (
                <form
                  className="stack-form stack-form--nested"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void runAction(
                      () => window.companion.createStream(streamForm),
                      () => {
                        setStreamForm(emptyStreamForm());
                        setSuccessMessage(
                          "Advanced stream saved to Companion.",
                        );
                      },
                    );
                  }}
                >
                  <label>
                    <span>Source Name</span>
                    <input
                      onChange={(event) =>
                        setStreamForm((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Workshop Left"
                      value={streamForm.name}
                    />
                  </label>
                  <label>
                    <span>Connection Type</span>
                    <CompanionSelect
                      onChange={(sourceKind) =>
                        setStreamForm((current) => ({
                          ...current,
                          sourceKind,
                        }))
                      }
                      options={streamSourceOptions}
                      value={streamForm.sourceKind}
                    />
                  </label>
                  <label>
                    <span>Source Address</span>
                    <input
                      onChange={(event) =>
                        setStreamForm((current) => ({
                          ...current,
                          upstreamUrl: event.target.value,
                        }))
                      }
                      placeholder={streamSourcePlaceholder(
                        streamForm.sourceKind,
                      )}
                      value={streamForm.upstreamUrl}
                    />
                    <div className="field-hint">
                      {streamSourceHint(streamForm.sourceKind)}
                    </div>
                  </label>
                  <label>
                    <span>Username</span>
                    <input
                      onChange={(event) =>
                        setStreamForm((current) => ({
                          ...current,
                          username: event.target.value,
                        }))
                      }
                      placeholder="Optional"
                      value={streamForm.username ?? ""}
                    />
                  </label>
                  <label>
                    <span>Password / Access Code</span>
                    <input
                      onChange={(event) =>
                        setStreamForm((current) => ({
                          ...current,
                          password: event.target.value,
                        }))
                      }
                      placeholder="Stored locally"
                      type="password"
                      value={streamForm.password ?? ""}
                    />
                  </label>
                  <label>
                    <span>Assign To Printer</span>
                    <CompanionSelect
                      onChange={(linkedPrinterId) =>
                        setStreamForm((current) => ({
                          ...current,
                          linkedPrinterId:
                            linkedPrinterId === "__none__"
                              ? null
                              : linkedPrinterId,
                        }))
                      }
                      options={[
                        { label: "No printer linked", value: "__none__" },
                        ...snapshot.printers.map((printer) => ({
                          label: printer.name,
                          value: printer.id,
                        })),
                      ]}
                      value={streamForm.linkedPrinterId ?? "__none__"}
                    />
                  </label>
                  <button
                    className="solid-button"
                    disabled={busy}
                    type="submit"
                  >
                    <MonitorPlay className="button-icon" />
                    Save Advanced Source
                  </button>
                </form>
              ) : null}
            </article>

            <article className="panel-card">
              <div className="panel-card__title">Saved Streams</div>
              <div className="stack-list">
                {snapshot.streams.length === 0 ? (
                  <div className="empty-state">
                    No advanced sources saved yet. Native Bambu cameras are
                    handled automatically from saved printer profiles.
                  </div>
                ) : null}
                {snapshot.streams.map((stream) => (
                  <div className="item-card" key={stream.id}>
                    <div className="item-card__header">
                      <div>
                        <div className="item-card__title">{stream.name}</div>
                        <div className="item-card__meta">
                          {streamSourceOptions.find(
                            (option) => option.value === stream.sourceKind,
                          )?.label ?? stream.sourceKind}{" "}
                          • {stream.outputKind} • {stream.status}
                        </div>
                      </div>
                      <div
                        className={`status-pill status-pill--${stream.status === "online" ? "streaming" : stream.status === "degraded" ? "warning" : "error"}`}
                      >
                        {stream.status}
                      </div>
                    </div>
                    <div className="item-card__copy">{stream.details}</div>
                    <div className="item-card__meta">{stream.upstreamUrl}</div>
                    <div className="button-row">
                      {stream.snapshotPath || stream.mjpegPath ? (
                        <button
                          className="ghost-button"
                          onClick={() => {
                            void runAction(async () =>
                              window.companion
                                .copyBridgeUrl()
                                .then((url) =>
                                  window.companion.openExternal(
                                    `${url}${stream.snapshotPath ?? stream.mjpegPath}`,
                                  ),
                                ),
                            );
                          }}
                          type="button"
                        >
                          <MonitorPlay className="button-icon" />
                          Preview
                        </button>
                      ) : null}
                      <button
                        className="ghost-button ghost-button--danger"
                        onClick={() => {
                          void runAction(() =>
                            Promise.resolve(
                              window.companion.deleteStream(stream.id),
                            ),
                          );
                        }}
                        type="button"
                      >
                        <RotateCcw className="button-icon" />
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {activeSection === "capabilities" ? (
          <section className="panel-grid">
            <article className="panel-card">
              <div className="panel-card__title">Global Capability Report</div>
              <div className="capability-grid">
                {Object.entries(snapshot.health.capabilities).map(
                  ([key, value]) => (
                    <div className="capability-card" key={key}>
                      <strong>{key}</strong>
                      <span>{value.replaceAll("_", " ")}</span>
                      <p>
                        {
                          snapshot.health.capabilityNotes[
                            key as keyof typeof snapshot.health.capabilityNotes
                          ]
                        }
                      </p>
                    </div>
                  ),
                )}
              </div>
            </article>

            <article className="panel-card">
              <div className="panel-card__title">Local Bambu Bridge Surfaces</div>
              <div className="stack-list">
                {snapshot.health.bridgeSources.length === 0 ? (
                  <div className="empty-state">
                    Companion only shows local Bambu bridge surfaces here.
                    Server-owned slicer integrations stay in BambuView.
                  </div>
                ) : null}
                {snapshot.health.bridgeSources.map((surface) => (
                  <div className="item-card" key={surface.id}>
                    <div className="item-card__header">
                      <div>
                        <div className="item-card__title">{surface.label}</div>
                        <div className="item-card__meta">
                          {surface.kind} • {surface.status}
                        </div>
                      </div>
                      <div
                        className={`status-pill status-pill--${
                          surface.status === "configured"
                            ? "paired"
                            : surface.status === "detected"
                              ? "warning"
                              : "error"
                        }`}
                      >
                        {surface.status}
                      </div>
                    </div>
                    <div className="item-card__copy">{surface.detail}</div>
                    <div className="item-card__meta">
                      {surface.location ??
                        "No local install or config path detected"}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {activeSection === "logs" ? (
          <section className="panel-card">
            <div className="panel-card__title">Recent Logs</div>
            <div className="stack-list">
              {snapshot.logs.length === 0 ? (
                <div className="empty-state">No logs yet.</div>
              ) : null}
              {snapshot.logs.map((entry) => (
                <div className="item-card item-card--log" key={entry.id}>
                  <div className="item-card__header">
                    <div className="item-card__title">{entry.level}</div>
                    <div className="item-card__meta">{entry.createdAt}</div>
                  </div>
                  <div className="item-card__copy">{entry.message}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {activeSection === "settings" ? (
          <section className="panel-grid panel-grid--two-up">
            <article className="panel-card">
              <div className="panel-card__title">Bridge Settings</div>
              <form
                className="stack-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAction(
                    () => window.companion.saveSettings(settingsForm),
                    () => {
                      setSuccessMessage("Companion settings saved.");
                    },
                  );
                }}
              >
                <label>
                  <span>Friendly Name</span>
                  <input
                    onChange={(event) =>
                      setSettingsForm((current) =>
                        current
                          ? { ...current, friendlyName: event.target.value }
                          : current,
                      )
                    }
                    value={settingsForm.friendlyName}
                  />
                </label>
                <label>
                  <span>Bind Mode</span>
                  <CompanionSelect
                    onChange={(bindMode) =>
                      setSettingsForm((current) =>
                        current
                          ? {
                              ...current,
                              bindMode,
                              host:
                                bindMode === "lan" ? current.host : "localhost",
                            }
                          : current,
                      )
                    }
                    options={bindModeOptions}
                    value={settingsForm.bindMode}
                  />
                </label>
                <label>
                  <span>Bind Host</span>
                  <input
                    disabled={settingsForm.bindMode === "localhost"}
                    onChange={(event) =>
                      setSettingsForm((current) =>
                        current
                          ? { ...current, host: event.target.value }
                          : current,
                      )
                    }
                    value={settingsForm.host}
                  />
                </label>
                <label>
                  <span>Port</span>
                  <input
                    min={1024}
                    onChange={(event) =>
                      setSettingsForm((current) =>
                        current
                          ? {
                              ...current,
                              port: Number(event.target.value || current.port),
                            }
                          : current,
                      )
                    }
                    type="number"
                    value={settingsForm.port}
                  />
                </label>
                <label>
                  <span>Theme</span>
                  <CompanionSelect
                    onChange={(themeMode) =>
                      setSettingsForm((current) =>
                        current ? { ...current, themeMode } : current,
                      )
                    }
                    options={themeModeOptions}
                    value={settingsForm.themeMode}
                  />
                </label>
                <label>
                  <span>Check for updates on launch</span>
                  <input
                    checked={settingsForm.checkForUpdatesOnLaunch}
                    onChange={(event) =>
                      setSettingsForm((current) =>
                        current
                          ? {
                              ...current,
                              checkForUpdatesOnLaunch: event.target.checked,
                            }
                          : current,
                      )
                    }
                    type="checkbox"
                  />
                </label>
                <label>
                  <span>Update check interval (minutes)</span>
                  <input
                    min={5}
                    onChange={(event) =>
                      setSettingsForm((current) =>
                        current
                          ? {
                              ...current,
                              updateCheckIntervalMinutes: Number(
                                event.target.value ||
                                  current.updateCheckIntervalMinutes,
                              ),
                            }
                          : current,
                      )
                    }
                    type="number"
                    value={settingsForm.updateCheckIntervalMinutes}
                  />
                </label>
                <button className="solid-button" disabled={busy} type="submit">
                  <Settings2 className="button-icon" />
                  Save Settings
                </button>
              </form>
            </article>

            <article className="panel-card">
              <div className="panel-card__title">Current State</div>
              <dl className="data-list">
                <div>
                  <dt>Bridge URL</dt>
                  <dd>{snapshot.health.bridge.baseUrl}</dd>
                </div>
                <div>
                  <dt>Pairing State</dt>
                  <dd>{snapshot.pairing.paired ? "Paired" : "Not paired"}</dd>
                </div>
                <div>
                  <dt>Active Printers</dt>
                  <dd>{snapshot.printers.length}</dd>
                </div>
                <div>
                  <dt>Active Streams</dt>
                  <dd>{snapshot.streams.length}</dd>
                </div>
                <div>
                  <dt>Current Version</dt>
                  <dd>v{snapshot.health.appVersion}</dd>
                </div>
                <div>
                  <dt>Latest Release</dt>
                  <dd>
                    {snapshot.update.latestVersion
                      ? `v${snapshot.update.latestVersion}`
                      : "Not checked yet"}
                  </dd>
                </div>
                <div>
                  <dt>Update Status</dt>
                  <dd>{snapshot.update.message ?? "Idle"}</dd>
                </div>
                <div>
                  <dt>Last Checked</dt>
                  <dd>{snapshot.update.lastCheckedAt ?? "Never"}</dd>
                </div>
              </dl>
              <div className="button-row">
                <button
                  className="ghost-button"
                  disabled={busy}
                  onClick={() => {
                    void runAction(() => window.companion.checkForUpdates());
                  }}
                  type="button"
                >
                  <RefreshCcw className="button-icon" />
                  Check Now
                </button>
                <button
                  className="ghost-button"
                  disabled={busy || !snapshot.update.releaseUrl}
                  onClick={() => {
                    void runAction(() => window.companion.openUpdateDownload());
                  }}
                  type="button"
                >
                  <HardDriveDownload className="button-icon" />
                  {snapshot.update.available
                    ? "Download Installer"
                    : "Open Release"}
                </button>
              </div>
              <div className="notice notice--warning">
                <FileUp className="button-icon" />
                <span>
                  LAN binding is advanced and opt-in. Only enable it when
                  BambuView cannot reach the Companion bridge through localhost
                  on the same trusted machine.
                </span>
              </div>
            </article>
          </section>
        ) : null}
      </main>
    </div>
  );
}
