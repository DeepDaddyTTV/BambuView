import net from "node:net";

import type {
  BambuConnectionMode,
  BambuConnectionTestResult,
  BambuPrinterConnectionInput,
  PrinterConnectionCheck,
} from "@bambuview/contracts";

const BAMBU_LAN_CONTROL_PORT = 8883;
const CONNECTION_TIMEOUT_MS = 3000;

function elapsed(startedAt: number): number {
  return Math.max(1, Math.round(performance.now() - startedAt));
}

async function testTcpConnection(
  host: string,
  port: number,
): Promise<PrinterConnectionCheck> {
  const startedAt = performance.now();

  return new Promise((resolve) => {
    const socket = net.createConnection({
      host,
      port,
    });

    const finish = (check: PrinterConnectionCheck) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(check);
    };

    socket.setTimeout(CONNECTION_TIMEOUT_MS);
    socket.once("connect", () => {
      finish({
        detail: "The printer accepted a local LAN control connection.",
        label: "Bambu LAN control",
        latencyMs: elapsed(startedAt),
        status: "passed",
      });
    });
    socket.once("timeout", () => {
      finish({
        detail:
          "The connection timed out. Confirm the printer is on this network and LAN/developer mode is enabled.",
        label: "Bambu LAN control",
        latencyMs: elapsed(startedAt),
        status: "failed",
      });
    });
    socket.once("error", () => {
      finish({
        detail: "The printer did not accept a local LAN control connection.",
        label: "Bambu LAN control",
        latencyMs: elapsed(startedAt),
        status: "failed",
      });
    });
  });
}

function skippedCheck(label: string, detail: string): PrinterConnectionCheck {
  return {
    detail,
    label,
    latencyMs: null,
    status: "skipped",
  };
}

function modeLabel(mode: BambuConnectionMode): string {
  if (mode === "developer") {
    return "LAN-only Developer Mode";
  }

  if (mode === "lan") {
    return "LAN Mode";
  }

  if (mode === "bambu-connect") {
    return "Bambu Connect";
  }

  return "Cloud / Normal Mode";
}

export async function testBambuLanConnection(
  input: BambuPrinterConnectionInput,
): Promise<BambuConnectionTestResult> {
  const checkedAt = new Date().toISOString();
  const connectionMode = input.connectionMode;
  const trimmedHost = input.host.trim();
  const shouldCheckLan =
    (connectionMode === "lan" || connectionMode === "developer") &&
    trimmedHost.length > 0;
  const lanControl = shouldCheckLan
    ? await testTcpConnection(trimmedHost, BAMBU_LAN_CONTROL_PORT)
    : skippedCheck(
        "Bambu LAN control",
        connectionMode === "bambu-connect"
          ? "Bambu Connect uses Bambu's supported bridge path for camera, monitoring, and job handoff. Raw LAN control is separate."
          : "Cloud / Normal Mode keeps the printer connected to Bambu cloud services. Raw local control is staged until LAN Mode or LAN-only Developer Mode is selected.",
      );
  const reachable = lanControl.status === "passed";

  const cameraStream: PrinterConnectionCheck = {
    detail:
      connectionMode === "bambu-connect"
        ? "Bambu Connect is expected to provide the supported camera/live-view path. BambuView still needs the companion bridge implementation before playback is live."
        : "Camera validation is staged for the next camera-assignment pass after live printer telemetry is wired.",
    label: "Bambu native camera",
    latencyMs: null,
    status: "skipped",
  };
  const bambuConnectBridge =
    connectionMode === "bambu-connect"
      ? skippedCheck(
          "Bambu Connect bridge",
          "BambuView will use this profile for supported Bambu Connect camera, monitoring, and send-job workflows once the local companion bridge is implemented.",
        )
      : skippedCheck(
          "Bambu Connect bridge",
          "Select Bambu Connect when you want Bambu's supported camera/status/job handoff path instead of direct LAN protocol work.",
        );
  const developerMode =
    connectionMode === "developer"
      ? skippedCheck(
          "Developer Mode",
          "BambuView cannot remotely flip the printer into Developer Mode yet. Enable it on the printer, then use this profile for full local-control work.",
        )
      : skippedCheck(
          "Developer Mode",
          "Full local printer controls require the LAN-only Developer Mode profile. This mode keeps Bambu cloud behavior unchanged but limits local control.",
        );

  return {
    checkedAt,
    checks: {
      bambuConnectBridge,
      cameraStream,
      developerMode,
      lanControl,
    },
    connectionMode,
    message: reachable
      ? `${modeLabel(connectionMode)} is reachable over the local network. The printer can be saved for live telemetry work.`
      : connectionMode === "bambu-connect"
        ? "Bambu Connect is saved as the supported camera, monitoring, and send-job profile. Add the future companion bridge to make those features live."
        : connectionMode === "cloud"
          ? "Cloud / Normal Mode is saved for normal Bambu cloud behavior. Use Bambu Connect for supported camera/status/job handoff, or Developer Mode for direct local control."
          : `${modeLabel(connectionMode)} was not reachable. You can still save the printer, but it will show as offline until the connection succeeds.`,
    reachable,
  };
}
