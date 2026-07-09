import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  type Dirent,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  CompanionBridgeSurface,
  CompanionBridgeSurfaceKind,
  CompanionPrinter,
} from "@bambuview/contracts";

import {
  cameraBridgeReady,
  nativeBambuBridgeSupport,
} from "./camera-bridge.js";

const MAX_SCAN_DEPTH = 4;
const MAX_SCAN_FILES = 180;
const MAX_SCAN_BYTES = 1_048_576;

interface PrinterCandidateRecord {
  accessCodeSet: boolean;
  connectionMode: CompanionPrinter["connectionMode"];
  hostname: string;
  model: string;
  name: string;
  notes: string;
  serial: string;
  sourceKind: CompanionBridgeSurfaceKind;
}

interface SurfaceDefinition {
  configLocations: string[];
  detail: string;
  installLocations: string[];
  kind: CompanionBridgeSurfaceKind;
  label: string;
  matchPatterns?: RegExp[];
}

export interface LocalBridgeInventory {
  printers: CompanionPrinter[];
  surfaces: CompanionBridgeSurface[];
}

function expandHome(inputPath: string): string {
  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  return inputPath;
}

function existingPath(paths: string[]): string | null {
  for (const candidate of paths) {
    const resolved = expandHome(candidate);
    if (existsSync(resolved)) {
      return resolved;
    }
  }

  return null;
}

function dedupePaths(paths: string[]): string[] {
  return [...new Set(paths.map((candidate) => expandHome(candidate)))];
}

function desktopConfigLocations(home: string, names: string[]): string[] {
  return names.flatMap((name) => [
    path.join(home, "Library/Application Support", name),
    path.join(home, "AppData/Roaming", name),
    path.join(home, ".config", name),
  ]);
}

function platformSurfaceDefinitions(): SurfaceDefinition[] {
  const home = os.homedir();
  const common = {
    bambuConnectConfig: desktopConfigLocations(home, [
      "Bambu Connect",
      "BambuConnect",
    ]),
    bambuStudioConfig: desktopConfigLocations(home, [
      "Bambu Studio",
      "BambuStudio",
    ]),
    orcaConfig: desktopConfigLocations(home, ["OrcaSlicer", "Orca Slicer"]),
  };

  const mac = process.platform === "darwin";
  const win = process.platform === "win32";
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 =
    process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

  return [
    {
      configLocations: common.bambuConnectConfig,
      detail:
        "Bambu Connect is the local desktop handoff path for secure job import workflows.",
      installLocations: mac
        ? ["/Applications/Bambu Connect.app", "/Applications/BambuConnect.app"]
        : win
          ? [
              path.join(programFiles, "Bambu Connect"),
              path.join(programFiles, "BambuConnect"),
              path.join(programFilesX86, "Bambu Connect"),
              path.join(programFilesX86, "BambuConnect"),
            ]
          : ["/opt/bambu-connect", "/usr/bin/bambu-connect"],
      kind: "bambu-connect",
      label: "Bambu Connect",
    },
    {
      configLocations: common.bambuStudioConfig,
      detail:
        "Bambu Studio can contribute saved printer profiles and desktop bridge files on the same machine.",
      installLocations: mac
        ? ["/Applications/Bambu Studio.app", "/Applications/BambuStudio.app"]
        : win
          ? [
              path.join(programFiles, "Bambu Studio"),
              path.join(programFiles, "BambuStudio"),
              path.join(programFilesX86, "Bambu Studio"),
              path.join(programFilesX86, "BambuStudio"),
            ]
          : ["/opt/bambu-studio", "/usr/bin/bambu-studio"],
      kind: "bambu-studio",
      label: "Bambu Studio",
    },
    {
      configLocations: [
        ...common.bambuStudioConfig,
        ...common.orcaConfig,
        ...(!mac && !win ? ["/opt/OrcaSlicer", "/usr/bin/orca-slicer"] : []),
        ...(mac
          ? [
              "/Applications/Bambu Studio.app/Contents/Resources",
              "/Applications/BambuStudio.app/Contents/Resources",
              "/Applications/OrcaSlicer.app/Contents/Resources",
              "/Applications/Orca Slicer.app/Contents/Resources",
            ]
          : win
            ? [
                path.join(programFiles, "Bambu Studio"),
                path.join(programFiles, "BambuStudio"),
                path.join(programFilesX86, "Bambu Studio"),
                path.join(programFilesX86, "BambuStudio"),
                path.join(programFiles, "OrcaSlicer"),
                path.join(programFilesX86, "OrcaSlicer"),
                path.join(programFiles, "Orca Slicer"),
                path.join(programFilesX86, "Orca Slicer"),
              ]
            : ["/opt/bambu-studio"]),
      ],
      detail:
        "A local Bambu Network Plugin or libBambuSource build can expose additional camera and bridge surfaces on this machine.",
      installLocations: mac
        ? [
            "/Applications/Bambu Studio.app/Contents/Resources",
            "/Applications/BambuStudio.app/Contents/Resources",
            "/Applications/OrcaSlicer.app/Contents/Resources",
            "/Applications/Orca Slicer.app/Contents/Resources",
          ]
        : win
          ? [
              path.join(programFiles, "Bambu Studio"),
              path.join(programFiles, "BambuStudio"),
              path.join(programFilesX86, "Bambu Studio"),
              path.join(programFilesX86, "BambuStudio"),
              path.join(programFiles, "OrcaSlicer"),
              path.join(programFilesX86, "OrcaSlicer"),
              path.join(programFiles, "Orca Slicer"),
              path.join(programFilesX86, "Orca Slicer"),
            ]
          : ["/opt/bambu-studio", "/opt/OrcaSlicer", "/usr/lib/bambu-studio"],
      kind: "network-plugin",
      label: "Bambu Network Plugin",
      matchPatterns: [
        /network.?plugin/i,
        /bblnetworkplugin/i,
        /libbambusource/i,
        /bambusource\.(dll|dylib|so)/i,
      ],
    },
  ];
}

function collectScanFiles(
  root: string,
  patterns: RegExp[] | undefined,
): string[] {
  const results: string[] = [];
  const queue: Array<{ depth: number; location: string }> = [
    { depth: 0, location: root },
  ];

  while (queue.length > 0 && results.length < MAX_SCAN_FILES) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    let entries: Dirent<string>[];
    try {
      entries = readdirSync(current.location, {
        encoding: "utf8",
        withFileTypes: true,
      });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const nextLocation = path.join(current.location, entry.name);
      if (entry.isDirectory()) {
        if (current.depth < MAX_SCAN_DEPTH) {
          queue.push({
            depth: current.depth + 1,
            location: nextLocation,
          });
        }
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      const shouldKeep =
        extension === ".json" ||
        extension === ".conf" ||
        extension === ".cfg" ||
        extension === ".ini" ||
        extension === ".txt" ||
        patterns?.some((pattern) => pattern.test(entry.name)) === true;

      if (shouldKeep) {
        results.push(nextLocation);
      }

      if (results.length >= MAX_SCAN_FILES) {
        break;
      }
    }
  }

  return results;
}

function readCandidateString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function normalizeSerial(value: string | null): string {
  return value?.trim().toUpperCase() ?? "";
}

function normalizeHost(value: string | null): string {
  if (!value) {
    return "";
  }

  const candidate = value.trim();
  if (
    /^[a-z0-9.-]+$/i.test(candidate) ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(candidate)
  ) {
    return candidate;
  }

  return "";
}

function normalizeModel(value: string | null): string {
  if (!value) {
    return "Bambu Printer";
  }

  const trimmed = value.trim();
  return trimmed.replace(/^3dprinter[-_\s]*/i, "").replace(/-ams\d*$/i, "");
}

function candidateConnectionMode(
  surfaceKind: CompanionBridgeSurfaceKind,
  _host: string,
  _accessCodeSet: boolean,
): CompanionPrinter["connectionMode"] {
  if (surfaceKind === "bambu-connect") {
    return "bambu-connect";
  }

  return "cloud";
}

function capabilityEnvelope(input: {
  accessCodeSet: boolean;
  connectionMode: CompanionPrinter["connectionMode"];
  host: string;
  model: string;
  note: string;
}): Pick<CompanionPrinter, "capabilities" | "capabilityNotes"> {
  const localTelemetryReady =
    input.host.trim().length > 0 && input.accessCodeSet === true;
  const nativeCameraSupport = nativeBambuBridgeSupport(input.model);

  return {
    capabilities: {
      ams: localTelemetryReady ? "available" : "requires_setup",
      camera:
        localTelemetryReady &&
        nativeCameraSupport.supported &&
        cameraBridgeReady()
          ? "available"
          : nativeCameraSupport.supported
            ? "requires_setup"
            : "requires_restream",
      controls: localTelemetryReady ? "available" : "requires_setup",
      discovery: "available",
      fileUpload:
        input.connectionMode === "bambu-connect" ||
        input.connectionMode === "cloud" ||
        localTelemetryReady
          ? "available"
          : "requires_setup",
      slicingAssist:
        input.connectionMode === "bambu-connect" ||
        input.connectionMode === "cloud" ||
        localTelemetryReady
          ? "available"
          : "requires_setup",
      telemetry: localTelemetryReady ? "available" : "requires_setup",
    },
    capabilityNotes: {
      ams: localTelemetryReady
        ? "A saved host and access code can unlock live AMS state on this machine."
        : input.note,
      camera:
        localTelemetryReady &&
        nativeCameraSupport.supported &&
        cameraBridgeReady()
          ? "Companion can restream the native Bambu feed directly when the saved host and access code still match."
          : nativeCameraSupport.detail,
      controls: localTelemetryReady
        ? "Companion can attempt direct local controls with the saved host and access code from this desktop profile."
        : "Save the printer host and LAN access code to enable Companion-side controls.",
      discovery: input.note,
      fileUpload:
        input.connectionMode === "bambu-connect" ||
        input.connectionMode === "cloud"
          ? "This desktop surface can still hand jobs to Bambu Connect locally, even before local upload is configured."
          : "Companion can route prepared jobs through this imported printer profile once the local path is confirmed.",
      slicingAssist:
        input.connectionMode === "bambu-connect" ||
        input.connectionMode === "cloud"
          ? "Prepared jobs can stage through this detected desktop bridge profile."
          : "Prepared jobs can target this printer profile once the local export path is confirmed.",
      telemetry: localTelemetryReady
        ? "This detected desktop profile already includes enough local host data for telemetry attempts."
        : "This desktop profile still needs a printer host and LAN access code for live telemetry.",
    },
  };
}

function recordFromObject(
  surfaceKind: CompanionBridgeSurfaceKind,
  record: Record<string, unknown>,
): PrinterCandidateRecord | null {
  const serial = normalizeSerial(
    readCandidateString(record, [
      "serial",
      "dev_id",
      "devId",
      "device_id",
      "deviceId",
      "sn",
      "printer_serial",
    ]),
  );
  const host = normalizeHost(
    readCandidateString(record, [
      "host",
      "hostname",
      "ip",
      "ipAddress",
      "address",
      "printer_ip",
      "dev_ip",
    ]),
  );
  const model = normalizeModel(
    readCandidateString(record, [
      "model",
      "machine_model",
      "printer_model",
      "dev_model",
      "machineType",
    ]),
  );
  const name =
    readCandidateString(record, [
      "name",
      "printer_name",
      "dev_name",
      "nickname",
      "alias",
    ]) ?? (serial ? `${model} ${serial.slice(-4)}` : model);
  const accessCodeSet = Boolean(
    readCandidateString(record, [
      "access_code",
      "accessCode",
      "lan_code",
      "password",
      "lanAccessCode",
    ]),
  );

  if (!serial || (!host && !name)) {
    return null;
  }

  return {
    accessCodeSet,
    connectionMode: candidateConnectionMode(surfaceKind, host, accessCodeSet),
    hostname: host,
    model,
    name,
    notes: `Imported from detected ${surfaceKind.replace(/-/g, " ")} desktop data on this machine.`,
    serial,
    sourceKind: surfaceKind,
  };
}

function visitJsonCandidates(
  surfaceKind: CompanionBridgeSurfaceKind,
  value: unknown,
  results: PrinterCandidateRecord[],
) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      visitJsonCandidates(surfaceKind, entry, results);
    }
    return;
  }

  const record = value as Record<string, unknown>;
  const candidate = recordFromObject(surfaceKind, record);
  if (candidate) {
    results.push(candidate);
  }

  for (const nested of Object.values(record)) {
    if (nested && typeof nested === "object") {
      visitJsonCandidates(surfaceKind, nested, results);
    }
  }
}

function discoverProfileCandidates(
  surfaceKind: CompanionBridgeSurfaceKind,
  locations: string[],
): PrinterCandidateRecord[] {
  const results: PrinterCandidateRecord[] = [];

  for (const root of dedupePaths(locations)) {
    if (!existsSync(root)) {
      continue;
    }

    const files = collectScanFiles(root, undefined);
    for (const file of files) {
      let size = 0;
      try {
        size = statSync(file).size;
      } catch {
        continue;
      }

      if (size <= 0 || size > MAX_SCAN_BYTES) {
        continue;
      }

      let contents = "";
      try {
        contents = readFileSync(file, "utf8");
      } catch {
        continue;
      }

      if (
        !contents.trim().startsWith("{") &&
        !contents.trim().startsWith("[")
      ) {
        continue;
      }

      try {
        const parsed = JSON.parse(contents) as unknown;
        visitJsonCandidates(surfaceKind, parsed, results);
      } catch {
        continue;
      }
    }
  }

  return results;
}

function detectSurface(definition: SurfaceDefinition): CompanionBridgeSurface {
  const installLocation = existingPath(definition.installLocations);
  const configLocation = existingPath(definition.configLocations);
  let matchedPluginLocation: string | null = null;

  if (!installLocation && !configLocation && definition.matchPatterns) {
    for (const location of dedupePaths(definition.configLocations)) {
      if (!existsSync(location)) {
        continue;
      }

      const files = collectScanFiles(location, definition.matchPatterns);
      matchedPluginLocation =
        files.find((candidate) =>
          definition.matchPatterns?.some((pattern) => pattern.test(candidate)),
        ) ?? null;
      if (matchedPluginLocation) {
        break;
      }
    }
  } else if (definition.matchPatterns) {
    for (const location of [installLocation, configLocation].filter(
      (value): value is string => Boolean(value),
    )) {
      const files = collectScanFiles(location, definition.matchPatterns);
      matchedPluginLocation =
        files.find((candidate) =>
          definition.matchPatterns?.some((pattern) => pattern.test(candidate)),
        ) ?? null;
      if (matchedPluginLocation) {
        break;
      }
    }
  }

  const location = matchedPluginLocation || installLocation || configLocation;
  const hasInstall = Boolean(installLocation || matchedPluginLocation);
  const hasConfig = Boolean(configLocation);
  const status =
    hasInstall && hasConfig
      ? "configured"
      : hasInstall || hasConfig
        ? "detected"
        : "missing";

  return {
    detail:
      status === "missing"
        ? `${definition.label} was not detected on this machine yet.`
        : definition.detail,
    id: definition.kind,
    kind: definition.kind,
    label: definition.label,
    location: location ?? null,
    status,
  };
}

function cameraBridgeSurface(): CompanionBridgeSurface {
  return {
    detail: cameraBridgeReady()
      ? "The bundled ffmpeg camera bridge is available for native Bambu and RTSP restreams."
      : "The bundled ffmpeg camera bridge is not available on this machine yet.",
    id: "camera-bridge",
    kind: "camera-bridge",
    label: "Camera Bridge",
    location: cameraBridgeReady() ? "bundled" : null,
    status: cameraBridgeReady() ? "configured" : "missing",
  };
}

function asDiscoveredPrinter(
  attemptedAt: string,
  input: PrinterCandidateRecord,
): CompanionPrinter {
  return {
    accessCodeSet: input.accessCodeSet,
    ...capabilityEnvelope({
      accessCodeSet: input.accessCodeSet,
      connectionMode: input.connectionMode,
      host: input.hostname,
      model: input.model,
      note: input.notes,
    }),
    connectionMode: input.connectionMode,
    createdAt: attemptedAt,
    hostname: input.hostname,
    id: `bridge:${input.sourceKind}:${input.serial}:${input.hostname || "unknown"}`,
    lastSeenAt: attemptedAt,
    lastTestedAt: null,
    model: input.model,
    name: input.name,
    notes: input.notes,
    provider: "bambu-lab",
    serial: input.serial,
    streamId: null,
    updatedAt: attemptedAt,
  };
}

export function inspectLocalBridgeInventory(): LocalBridgeInventory {
  const attemptedAt = new Date().toISOString();
  const definitions = platformSurfaceDefinitions();
  const surfaces = [...definitions.map(detectSurface), cameraBridgeSurface()];
  const printersByKey = new Map<string, CompanionPrinter>();

  for (const definition of definitions) {
    const candidates = discoverProfileCandidates(
      definition.kind,
      definition.configLocations,
    );
    for (const candidate of candidates) {
      const key = `${candidate.serial}:${candidate.hostname || definition.kind}`;
      if (!printersByKey.has(key)) {
        printersByKey.set(key, asDiscoveredPrinter(attemptedAt, candidate));
      }
    }
  }

  return {
    printers: [...printersByKey.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    surfaces,
  };
}
