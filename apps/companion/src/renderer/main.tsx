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
      ? `${event.error.name}: ${event.error.message}`
      : event.message || "Unknown renderer error.";
  renderFatalScreen("BambuView Companion could not finish loading", message);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason =
    event.reason instanceof Error
      ? `${event.reason.name}: ${event.reason.message}`
      : String(event.reason ?? "Unknown promise rejection.");
  renderFatalScreen("BambuView Companion hit a startup error", reason);
});

const root = document.getElementById("root");

if (!root) {
  renderFatalScreen(
    "BambuView Companion could not mount the app",
    "The root renderer element was not found in the packaged window.",
  );
} else if (!window.companion) {
  renderFatalScreen(
    "BambuView Companion could not load the desktop bridge",
    "The preload API was not available in the renderer. The window will not work until the shell is restarted.",
  );
} else {
  try {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  } catch (error) {
    renderFatalScreen(
      "BambuView Companion could not render the app",
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : "Unknown render failure.",
    );
  }
}
