import fs from "node:fs";
import path from "node:path";

const version = process.argv[2]?.trim();
const outputPath = process.argv[3]?.trim();

if (!version || !outputPath) {
  console.error(
    "Usage: node scripts/release-notes.mjs <version> <output-path>",
  );
  process.exit(1);
}

const changelogPath = path.resolve(process.cwd(), "CHANGELOG.md");
const changelog = fs.readFileSync(changelogPath, "utf8");
const normalizedVersion = version.startsWith("v") ? version : `v${version}`;
const lines = changelog.split("\n");
const headingIndex = lines.findIndex((line) =>
  line.startsWith(`## ${normalizedVersion}`),
);

if (headingIndex === -1) {
  console.error(`Could not find changelog entry for ${normalizedVersion}.`);
  process.exit(1);
}

let endIndex = lines.length;
for (let index = headingIndex + 1; index < lines.length; index += 1) {
  if (lines[index].startsWith("## ")) {
    endIndex = index;
    break;
  }
}

const sectionBody = lines
  .slice(headingIndex + 1, endIndex)
  .join("\n")
  .trim();
const body = [`# ${normalizedVersion} Alpha`, "", sectionBody, ""].join("\n");
fs.writeFileSync(path.resolve(process.cwd(), outputPath), body, "utf8");
