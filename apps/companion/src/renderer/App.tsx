import {
  Activity,
  Cable,
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
import { startTransition, useEffect, useState } from "react";

import type {
  CompanionCapabilityFlags,
  CompanionPrinterInput,
  CompanionPrinterTelemetry,
  CompanionSettings,
  CompanionSnapshot,
  CompanionStreamInput,
} from "@bambuview/contracts";

import type { PairCompanionInput } from "@common/electron-api";

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

function emptyPairForm(): PairCompanionInput {
  return {
    companionName: "BambuView Companion",
    pairingToken: "",
    serverUrl: "",
  };
}

function toneLabel(status: CompanionSnapshot["health"]["status"]) {
  return status.replaceAll("-", " ");
}

function capabilityText(
  flags: CompanionCapabilityFlags,
  key: keyof CompanionCapabilityFlags,
) {
  return flags[key].replaceAll("_", " ");
}

export function App() {
  const [activeSection, setActiveSection] = useState<SectionKey>("pairing");
  const [snapshot, setSnapshot] = useState<CompanionSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pairForm, setPairForm] = useState<PairCompanionInput>(emptyPairForm);
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

  async function refresh() {
    const next = await window.companion.getSnapshot();
    startTransition(() => {
      setSnapshot(next);
      setSettingsForm(next.settings);
      setPairForm((current) => ({
        ...current,
        companionName: next.pairing.companionName || next.settings.friendlyName,
        serverUrl: next.pairing.serverUrl ?? current.serverUrl,
      }));
    });
  }

  useEffect(() => {
    void refresh();
  }, []);

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
              void runAction(() => window.companion.copyBridgeUrl());
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
                  void runAction(() => window.companion.pair(pairForm));
                }}
              >
                <label>
                  <span>BambuView Server URL</span>
                  <input
                    onChange={(event) =>
                      setPairForm((current) => ({
                        ...current,
                        serverUrl: event.target.value,
                      }))
                    }
                    placeholder="http://192.168.1.50:4173"
                    value={pairForm.serverUrl}
                  />
                  <div className="field-hint">
                    Use <strong>http://localhost:4173</strong> only when
                    BambuView and Companion are running on the same computer.
                    If BambuView is running in Docker or on another device, use
                    that machine&apos;s LAN URL instead.
                  </div>
                </label>
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
                            ...current,
                            pairingToken: "",
                          }));
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
              <div className="button-row">
                <button
                  className="ghost-button"
                  onClick={() => {
                    void runAction(async () => {
                      const result =
                        await window.companion.regenerateBridgeToken();
                      alert(`New bridge token generated:\n\n${result.token}`);
                      return result;
                    });
                  }}
                  type="button"
                >
                  <Network className="button-icon" />
                  Regenerate Bridge Token
                </button>
              </div>
            </article>
          </section>
        ) : null}

        {activeSection === "printers" ? (
          <section className="panel-grid panel-grid--two-up">
            <article className="panel-card">
              <div className="panel-card__title">Add Printer</div>
              <form
                className="stack-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAction(
                    () => window.companion.createPrinter(printerForm),
                    () => setPrinterForm(emptyPrinterForm()),
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
                  <input
                    onChange={(event) =>
                      setPrinterForm((current) => ({
                        ...current,
                        model: event.target.value,
                      }))
                    }
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
                  <select
                    onChange={(event) =>
                      setPrinterForm((current) => ({
                        ...current,
                        connectionMode: event.target
                          .value as CompanionPrinterInput["connectionMode"],
                      }))
                    }
                    value={printerForm.connectionMode}
                  >
                    <option value="cloud">Cloud / Normal</option>
                    <option value="bambu-connect">Bambu Connect</option>
                    <option value="lan">LAN Mode</option>
                    <option value="developer">LAN-only Developer Mode</option>
                  </select>
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
                            (result) => alert(result.message),
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
                    () => setStreamForm(emptyStreamForm()),
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
                  <select
                    onChange={(event) =>
                      setStreamForm((current) => ({
                        ...current,
                        sourceKind: event.target
                          .value as CompanionStreamInput["sourceKind"],
                      }))
                    }
                    value={streamForm.sourceKind}
                  >
                    <option value="snapshot">HTTP Snapshot</option>
                    <option value="mjpeg">HTTP MJPEG</option>
                    <option value="hls">HLS</option>
                    <option value="rtsp">RTSP</option>
                    <option value="bambu-native">Bambu Native</option>
                  </select>
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
                  <select
                    onChange={(event) =>
                      setStreamForm((current) => ({
                        ...current,
                        linkedPrinterId: event.target.value || null,
                      }))
                    }
                    value={streamForm.linkedPrinterId ?? ""}
                  >
                    <option value="">No printer linked</option>
                    {snapshot.printers.map((printer) => (
                      <option key={printer.id} value={printer.id}>
                        {printer.name}
                      </option>
                    ))}
                  </select>
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
                      {stream.snapshotPath ? (
                        <button
                          className="ghost-button"
                          onClick={() => {
                            void runAction(async () =>
                              window.companion
                                .copyBridgeUrl()
                                .then((url) =>
                                  window.companion.openExternal(
                                    `${url}${stream.snapshotPath}`,
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
                  void runAction(() =>
                    window.companion.saveSettings(settingsForm),
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
                  <select
                    onChange={(event) =>
                      setSettingsForm((current) =>
                        current
                          ? {
                              ...current,
                              bindMode: event.target
                                .value as CompanionSettings["bindMode"],
                              host:
                                event.target.value === "lan"
                                  ? current.host
                                  : "localhost",
                            }
                          : current,
                      )
                    }
                    value={settingsForm.bindMode}
                  >
                    <option value="localhost">localhost only</option>
                    <option value="lan">LAN (advanced)</option>
                  </select>
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
                  <select
                    onChange={(event) =>
                      setSettingsForm((current) =>
                        current
                          ? {
                              ...current,
                              themeMode: event.target
                                .value as CompanionSettings["themeMode"],
                            }
                          : current,
                      )
                    }
                    value={settingsForm.themeMode}
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
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
