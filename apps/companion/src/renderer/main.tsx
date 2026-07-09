import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import "./styles.css";

const fallbackStyle = `
  min-height: 100vh;
  margin: 0;
  background: #101315;
  color: #f5f7fa;
  display: grid;
  place-items: center;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
`;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function describeError(value: unknown): string {
  if (value instanceof Error) {
    return value.stack?.trim() || `${value.name}: ${value.message}`;
  }

  return String(value ?? "Unknown error.");
}

function reportRendererEvent(
  level: "info" | "warn" | "error",
  message: string,
  context?: unknown,
  source: "renderer" | "renderer-boundary" | "renderer-startup" = "renderer",
) {
  try {
    window.companion?.logRendererEvent({
      context,
      level,
      message,
      source,
    });
  } catch {
    // The fallback screen still renders even if the bridge is not available.
  }
}

function FatalScreen(props: { detail: string; title: string }) {
  return (
    <main
      style={{
        background: "#171c20",
        border: "1px solid #2a3137",
        boxSizing: "border-box",
        padding: "32px",
        width: "min(640px, calc(100vw - 48px))",
      }}
    >
      <h1 style={{ fontSize: "32px", lineHeight: 1.1, margin: "0 0 14px" }}>
        {props.title}
      </h1>
      <p
        style={{
          color: "#b9c0c8",
          fontSize: "16px",
          lineHeight: 1.65,
          margin: "0 0 18px",
        }}
      >
        Companion opened, but the interface hit a startup problem. Quit it from
        the tray and reopen after updating.
      </p>
      <code
        style={{
          background: "#0f1316",
          border: "1px solid #303840",
          color: "#9ee86d",
          display: "block",
          fontSize: "13px",
          lineHeight: 1.6,
          padding: "16px",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {props.detail}
      </code>
    </main>
  );
}

interface RendererErrorBoundaryState {
  detail: string | null;
}

class RendererErrorBoundary extends React.Component<
  React.PropsWithChildren,
  RendererErrorBoundaryState
> {
  state: RendererErrorBoundaryState = {
    detail: null,
  };

  static getDerivedStateFromError(error: unknown): RendererErrorBoundaryState {
    return {
      detail: describeError(error),
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    reportRendererEvent(
      "error",
      "Renderer component tree crashed.",
      {
        componentStack: info.componentStack,
        error: describeError(error),
      },
      "renderer-boundary",
    );
  }

  render() {
    if (this.state.detail) {
      return (
        <FatalScreen
          detail={this.state.detail}
          title="BambuView Companion hit a renderer error"
        />
      );
    }

    return this.props.children;
  }
}

function renderFatalScreen(title: string, detail: string) {
  document.body.setAttribute("style", fallbackStyle);
  document.body.innerHTML = `
    <main style="width:min(640px, calc(100vw - 48px)); border:1px solid #2a3137; background:#171c20; padding:32px; box-sizing:border-box;">
      <h1 style="margin:0 0 14px; font-size:32px; line-height:1.1;">${escapeHtml(title)}</h1>
      <p style="margin:0 0 18px; color:#b9c0c8; font-size:16px; line-height:1.65;">
        Companion opened, but the interface hit a startup problem. Quit it from the tray and reopen after updating.
      </p>
      <code style="display:block; white-space:pre-wrap; word-break:break-word; border:1px solid #303840; background:#0f1316; color:#9ee86d; padding:16px; font-size:13px; line-height:1.6;">${escapeHtml(detail)}</code>
    </main>
  `;
}

window.addEventListener("error", (event) => {
  const message =
    event.error instanceof Error
      ? describeError(event.error)
      : event.message || "Unknown renderer error.";
  reportRendererEvent(
    "error",
    "Renderer window error event fired.",
    {
      colno: event.colno,
      error: message,
      filename: event.filename,
      lineno: event.lineno,
    },
    "renderer-startup",
  );
  console.error(message);
  renderFatalScreen("BambuView Companion could not finish loading", message);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = describeError(event.reason);
  reportRendererEvent(
    "error",
    "Renderer unhandled promise rejection fired.",
    {
      reason,
    },
    "renderer-startup",
  );
  console.error(reason);
  renderFatalScreen("BambuView Companion hit a startup error", reason);
});

const root = document.getElementById("root");
reportRendererEvent("info", "Renderer bootstrap started.", {
  hasCompanionBridge: Boolean(window.companion),
  hasRootElement: Boolean(root),
  userAgent: navigator.userAgent,
});

if (!root) {
  reportRendererEvent(
    "error",
    "Renderer root element was missing.",
    undefined,
    "renderer-startup",
  );
  renderFatalScreen(
    "BambuView Companion could not mount the app",
    "The root renderer element was not found in the packaged window.",
  );
} else if (!window.companion) {
  reportRendererEvent(
    "error",
    "Renderer preload bridge was unavailable.",
    undefined,
    "renderer-startup",
  );
  renderFatalScreen(
    "BambuView Companion could not load the desktop bridge",
    "The preload API was not available in the renderer. The window will not work until the shell is restarted.",
  );
} else {
  try {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <RendererErrorBoundary>
          <App />
        </RendererErrorBoundary>
      </React.StrictMode>,
    );
    reportRendererEvent(
      "info",
      "Renderer root mounted.",
      undefined,
      "renderer-startup",
    );
  } catch (error) {
    reportRendererEvent(
      "error",
      "Renderer failed during initial React render.",
      {
        error: describeError(error),
      },
      "renderer-startup",
    );
    renderFatalScreen(
      "BambuView Companion could not render the app",
      describeError(error),
    );
  }
}
