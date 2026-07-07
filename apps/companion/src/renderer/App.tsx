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
  CompanionCapabilityFlags,
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
    sourceKind: "snapshot",
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
  { label: "HTTP Snapshot", value: "snapshot" },
  { label: "HTTP MJPEG", value: "mjpeg" },
  { label: "HLS", value: "hls" },
  { label: "RTSP", value: "rtsp" },
  { label: "Bambu Native", value: "bambu-native" },
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

function capabilityText(
  flags: CompanionCapabilityFlags,
  key: keyof CompanionCapabilityFlags,
) {
  return flags[key].replaceAll("_", " ");
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
  const [streamForm, setStreamForm] =
    useState<CompanionStreamInput>(emptyStreamForm);
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

  const activeSectionLabel =
    sections.find((section) => section.key === activeSection)?.label ??
    "Companion";

  return (
    <div
      className={`companion-shell companion-shell--${settingsForm.themeMode}`}
    >
      <aside className="companion-sidebar">
        <div className="companion-brand">
          <div className="companion-brand__mark" />
          <div>
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
              <div className="panel-card__title">Add Printer</div>
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
                              setPrinterForm(
                                printerInputFromDiscovery(printer),
                              );
                              setSuccessMessage(
                                `${printer.name} is ready in the form below. Add its access code if needed, then save it.`,
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
                  void runAction(
                    () => window.companion.createPrinter(printerForm),
                    () => {
                      setPrinterForm(emptyPrinterForm());
                      setSuccessMessage("Printer saved to Companion.");
                    },
                  );
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
                  <span>Access Code</span>
                  <input
                    onChange={(event) =>
                      setPrinterForm((current) => ({
                        ...current,
                        accessCode: event.target.value,
                      }))
                    }
                    type="password"
                    value={printerForm.accessCode ?? ""}
                  />
                </label>
                <label>
                  <span>Connection Mode</span>
                  <CompanionSelect
                    onChange={(connectionMode) =>
                      setPrinterForm((current) => ({
                        ...current,
                        connectionMode,
                      }))
                    }
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
                <button className="solid-button" disabled={busy} type="submit">
                  <Printer className="button-icon" />
                  Save Printer
                </button>
              </form>
            </article>

            <article className="panel-card">
              <div className="panel-card__title">Saved Printers</div>
              <div className="stack-list">
                {snapshot.printers.length === 0 ? (
                  <div className="empty-state">
                    No printers saved yet. Add a Bambu printer manually to start
                    local telemetry planning.
                  </div>
                ) : null}
                {snapshot.printers.map((printer) => (
                  <div className="item-card" key={printer.id}>
                    <div className="item-card__header">
                      <div>
                        <div className="item-card__title">{printer.name}</div>
                        <div className="item-card__meta">
                          {printer.model} • {printer.hostname} •{" "}
                          {printer.connectionMode}
                        </div>
                      </div>
                      <div
                        className={`status-pill status-pill--${printer.lastSeenAt ? "paired" : "warning"}`}
                      >
                        {capabilityText(printer.capabilities, "telemetry")}
                      </div>
                    </div>
                    <div className="item-card__copy">
                      {printer.capabilityNotes.telemetry}
                    </div>
                    <div className="button-row">
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
                          <span>{telemetry[printer.id].progress ?? "—"}%</span>
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
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {activeSection === "streams" ? (
          <section className="panel-grid panel-grid--two-up">
            <article className="panel-card">
              <div className="panel-card__title">Add Stream</div>
              <form
                className="stack-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAction(
                    () => window.companion.createStream(streamForm),
                    () => {
                      setStreamForm(emptyStreamForm());
                      setSuccessMessage("Stream saved to Companion.");
                    },
                  );
                }}
              >
                <label>
                  <span>Name</span>
                  <input
                    onChange={(event) =>
                      setStreamForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    value={streamForm.name}
                  />
                </label>
                <label>
                  <span>Source Kind</span>
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
                  <span>Upstream URL</span>
                  <input
                    onChange={(event) =>
                      setStreamForm((current) => ({
                        ...current,
                        upstreamUrl: event.target.value,
                      }))
                    }
                    placeholder="http://camera.local/latest.jpg"
                    value={streamForm.upstreamUrl}
                  />
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
                    value={streamForm.username ?? ""}
                  />
                </label>
                <label>
                  <span>Password</span>
                  <input
                    onChange={(event) =>
                      setStreamForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                    type="password"
                    value={streamForm.password ?? ""}
                  />
                </label>
                <label>
                  <span>Linked Printer</span>
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
                <button className="solid-button" disabled={busy} type="submit">
                  <MonitorPlay className="button-icon" />
                  Save Stream
                </button>
              </form>
            </article>

            <article className="panel-card">
              <div className="panel-card__title">Saved Streams</div>
              <div className="stack-list">
                {snapshot.streams.length === 0 ? (
                  <div className="empty-state">
                    No streams saved yet. Add MJPEG, snapshot, HLS, RTSP, or
                    native Bambu sources here.
                  </div>
                ) : null}
                {snapshot.streams.map((stream) => (
                  <div className="item-card" key={stream.id}>
                    <div className="item-card__header">
                      <div>
                        <div className="item-card__title">{stream.name}</div>
                        <div className="item-card__meta">
                          {stream.sourceKind} • {stream.outputKind} •{" "}
                          {stream.status}
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
              <div className="panel-card__title">Detected Bridge Surfaces</div>
              <div className="stack-list">
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

            <article className="panel-card">
              <div className="panel-card__title">Per-Printer Readiness</div>
              <div className="stack-list">
                {snapshot.printers.map((printer) => (
                  <div className="item-card" key={printer.id}>
                    <div className="item-card__title">{printer.name}</div>
                    <div className="telemetry-grid telemetry-grid--capabilities">
                      {Object.entries(printer.capabilities).map(
                        ([key, value]) => (
                          <div key={key}>
                            <strong>{key}</strong>
                            <span>{value.replaceAll("_", " ")}</span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                ))}
                {snapshot.printers.length === 0 ? (
                  <div className="empty-state">
                    Add a printer to see capability gating for telemetry,
                    camera, AMS, and control paths.
                  </div>
                ) : null}
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
