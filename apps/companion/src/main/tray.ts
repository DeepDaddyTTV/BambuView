import { Menu, Tray, nativeImage } from "electron";

import type { CompanionSnapshot, CompanionStatusTone } from "@bambuview/contracts";

import { CompanionRuntime } from "./runtime.js";

function trayColor(status: CompanionStatusTone) {
  if (status === "streaming") return "#7ed321";
  if (status === "paired") return "#22c7d8";
  if (status === "warning") return "#f4a12d";
  if (status === "error") return "#ef4444";
  return "#7a7f87";
}

function buildIcon(status: CompanionStatusTone) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect x="5" y="5" width="22" height="22" fill="#0f1214" stroke="${trayColor(status)}" stroke-width="2"/>
      <circle cx="16" cy="16" r="4.5" fill="${trayColor(status)}"/>
    </svg>
  `;
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  );
}

export function createCompanionTray(
  runtime: CompanionRuntime,
  actions: { onOpen(): void; onQuit(): void },
) {
  const tray = new Tray(buildIcon(runtime.getHealth().status));

  const render = (snapshot?: CompanionSnapshot) => {
    const health = snapshot?.health ?? runtime.getHealth();
    tray.setImage(buildIcon(health.status));
    tray.setToolTip(`BambuView Companion • ${health.status}`);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          click: actions.onOpen,
          label: "Open BambuView Companion",
        },
        {
          enabled: false,
          label: `Bridge: ${health.bridge.baseUrl}`,
        },
        {
          enabled: false,
          label: `Status: ${health.status}`,
        },
        {
          type: "separator",
        },
        {
          click: actions.onQuit,
          label: "Quit",
        },
      ]),
    );
  };

  tray.on("click", actions.onOpen);
  runtime.on("snapshot", render);
  render();
  return tray;
}
