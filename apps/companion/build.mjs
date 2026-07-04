import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const companionDir = fileURLToPath(new URL("./", import.meta.url));
const repoRoot = path.resolve(companionDir, "../..");
const outDir = path.join(companionDir, "out");
const rendererOutDir = path.join(outDir, "renderer");
const rendererAssetsDir = path.join(rendererOutDir, "assets");
const rendererMetaFile = path.join(rendererOutDir, "metafile.json");
const esbuildBinaryName = process.platform === "win32" ? "esbuild.exe" : "esbuild";

function resolveEsbuildCli() {
  const directPackageBinary = path.join(
    companionDir,
    "node_modules/esbuild/bin",
    esbuildBinaryName,
  );

  if (existsSync(directPackageBinary)) {
    return directPackageBinary;
  }

  const pnpmStoreDir = path.join(repoRoot, "node_modules/.pnpm");
  const pnpmEntries = existsSync(pnpmStoreDir)
    ? readdirSync(pnpmStoreDir)
        .filter((entry) => entry.startsWith("esbuild@"))
        .sort()
        .reverse()
    : [];

  for (const entry of pnpmEntries) {
    const candidate = path.join(
      pnpmStoreDir,
      entry,
      "node_modules/esbuild/bin",
      esbuildBinaryName,
    );

    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "Unable to locate a working esbuild binary for the Companion build.",
  );
}

const esbuildCli = resolveEsbuildCli();

function run(args) {
  const result = spawnSync(esbuildCli, args, {
    cwd: companionDir,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function relativeRendererAsset(filePath) {
  return `./${path.relative(rendererOutDir, filePath).replaceAll(path.sep, "/")}`;
}

rmSync(outDir, { force: true, recursive: true });
mkdirSync(path.join(outDir, "main"), { recursive: true });
mkdirSync(path.join(outDir, "preload"), { recursive: true });
mkdirSync(rendererAssetsDir, { recursive: true });

run([
  "src/main/index.ts",
  "--bundle",
  "--format=cjs",
  "--legal-comments=none",
  "--log-level=info",
  "--outfile=out/main/index.js",
  "--packages=external",
  "--platform=node",
  "--resolve-extensions=.ts,.tsx,.mjs,.js,.json",
  "--target=node24",
  "--tsconfig=tsconfig.json",
]);

run([
  "src/preload/index.ts",
  "--bundle",
  "--format=cjs",
  "--legal-comments=none",
  "--log-level=info",
  "--outfile=out/preload/index.js",
  "--packages=external",
  "--platform=node",
  "--resolve-extensions=.ts,.tsx,.mjs,.js,.json",
  "--target=node24",
  "--tsconfig=tsconfig.json",
]);

run([
  "src/renderer/main.tsx",
  "--bundle",
  "--define:process.env.NODE_ENV=\"production\"",
  "--format=esm",
  "--jsx=automatic",
  "--legal-comments=none",
  "--log-level=info",
  `--metafile=${rendererMetaFile}`,
  "--outdir=out/renderer/assets",
  "--platform=browser",
  "--resolve-extensions=.ts,.tsx,.mjs,.js,.json",
  "--target=chrome120",
  "--tsconfig=tsconfig.json",
]);

const rendererMeta = JSON.parse(readFileSync(rendererMetaFile, "utf8"));
const rendererOutputs = Object.keys(rendererMeta.outputs);
const rendererJs = rendererOutputs.find(
  (filePath) =>
    filePath.startsWith("out/renderer/assets/") &&
    filePath.endsWith(".js") &&
    !filePath.endsWith(".js.map"),
);
const rendererCss = rendererOutputs.find(
  (filePath) =>
    filePath.startsWith("out/renderer/assets/") &&
    filePath.endsWith(".css"),
);

if (!rendererJs || !rendererCss) {
  throw new Error("Companion renderer build did not produce the expected assets.");
}

writeFileSync(
  path.join(rendererOutDir, "index.html"),
  [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    "    <title>BambuView Companion</title>",
    `    <link rel="stylesheet" href="${relativeRendererAsset(path.join(companionDir, rendererCss))}" />`,
    `    <script type="module" src="${relativeRendererAsset(path.join(companionDir, rendererJs))}"></script>`,
    "  </head>",
    "  <body>",
    '    <div id="root"></div>',
    "  </body>",
    "</html>",
    "",
  ].join("\n"),
);

rmSync(rendererMetaFile, { force: true });
