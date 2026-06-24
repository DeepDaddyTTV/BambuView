import net from "node:net";

import type {
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

export async function testBambuLanConnection(
  input: BambuPrinterConnectionInput,
): Promise<BambuConnectionTestResult> {
  const checkedAt = new Date().toISOString();
  const lanControl = await testTcpConnection(
    input.host.trim(),
    BAMBU_LAN_CONTROL_PORT,
  );
  const reachable = lanControl.status === "passed";

  const cameraStream: PrinterConnectionCheck = {
    detail:
      "Camera validation is staged for the next camera-assignment pass after live printer telemetry is wired.",
    label: "Bambu native camera",
    latencyMs: null,
    status: "skipped",
  };

  return {
    checkedAt,
    checks: {
      cameraStream,
      lanControl,
    },
    message: reachable
      ? "Bambu LAN control is reachable. The printer can be saved for live telemetry work."
      : "Bambu LAN control was not reachable. You can still save the printer, but it will show as offline until the connection succeeds.",
    reachable,
  };
}
