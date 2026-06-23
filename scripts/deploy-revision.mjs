import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parsePositiveInteger(rawValue, fallback) {
  if (!rawValue) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Expected a positive integer, received: ${rawValue}`);
  }

  return value;
}

function sleep(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function parseImageRepository(repository) {
  const parts = repository.split("/").filter(Boolean);

  if (parts.length !== 2) {
    throw new Error(
      `Expected PORTAINER_IMAGE_REPOSITORY to look like <namespace>/<name>, received: ${repository}`
    );
  }

  return {
    namespace: parts[0],
    name: parts[1]
  };
}

async function dockerHubTagExists(repository, tag) {
  const { namespace, name } = parseImageRepository(repository);
  const response = await fetch(
    `https://hub.docker.com/v2/repositories/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/tags/${encodeURIComponent(tag)}`
  );

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `Docker Hub tag lookup failed for ${repository}:${tag}: ${response.status} ${response.statusText}\n${body}`
    );
  }

  return true;
}

async function waitForDockerImage({ repository, tag, timeoutMs, pollMs }) {
  const startedAt = Date.now();
  let attempt = 0;

  while (Date.now() - startedAt < timeoutMs) {
    attempt += 1;
    const exists = await dockerHubTagExists(repository, tag);

    if (exists) {
      const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
      console.log(
        `Docker image ${repository}:${tag} is available after ${elapsedSeconds}s.`
      );
      return;
    }

    console.log(
      `Waiting for Docker image ${repository}:${tag} to publish (attempt ${attempt})...`
    );
    await sleep(pollMs);
  }

  throw new Error(
    `Timed out waiting for Docker image ${repository}:${tag} after ${Math.round(timeoutMs / 1000)}s.`
  );
}

function runDeployScript(scriptPath, env) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [scriptPath], {
      env,
      stdio: "inherit"
    });

    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(`Portainer deploy helper exited with status ${code ?? "unknown"}.`)
      );
    });
  });
}

async function readPackageVersion(packageJsonPath) {
  const rawPackageJson = await readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(rawPackageJson);

  if (typeof packageJson.version !== "string" || packageJson.version.trim().length === 0) {
    throw new Error(`Could not read a version from ${packageJsonPath}.`);
  }

  return packageJson.version;
}

async function main() {
  const scriptsDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(scriptsDir, "..");
  const deployScriptPath = resolve(scriptsDir, "deploy-portainer.mjs");
  const packageJsonPath = resolve(repoRoot, "package.json");

  requireEnv("PORTAINER_URL");
  requireEnv("PORTAINER_API_KEY");
  requireEnv("PORTAINER_ENDPOINT_ID");
  requireEnv("PORTAINER_STACK_ID");

  const repository =
    process.env.PORTAINER_IMAGE_REPOSITORY || "deepdaddyttv/bambuview";
  const version =
    process.env.RELEASE_VERSION ||
    process.argv[2] ||
    (await readPackageVersion(packageJsonPath));
  const tag =
    process.env.RELEASE_IMAGE_TAG ||
    process.env.DOCKER_IMAGE?.split(":").at(-1) ||
    version;
  const dockerImage = process.env.DOCKER_IMAGE || `${repository}:${tag}`;
  const timeoutMs = parsePositiveInteger(
    process.env.RELEASE_WAIT_TIMEOUT_MS,
    10 * 60 * 1000
  );
  const pollMs = parsePositiveInteger(
    process.env.RELEASE_WAIT_POLL_MS,
    10 * 1000
  );
  const dryRun = process.env.DEPLOY_DRY_RUN === "1";

  console.log(`Revision target: ${version}`);
  console.log(`Waiting for image: ${dockerImage}`);

  await waitForDockerImage({
    pollMs,
    repository,
    tag,
    timeoutMs
  });

  if (dryRun) {
    console.log(
      `Dry run only. The Portainer stack would now redeploy to ${dockerImage}.`
    );
    return;
  }

  await runDeployScript(deployScriptPath, {
    ...process.env,
    DOCKER_IMAGE: dockerImage
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
