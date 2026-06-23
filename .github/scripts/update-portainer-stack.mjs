function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function request(baseUrl, path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  const data = text.length > 0 ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      `Portainer request failed for ${path}: ${response.status} ${response.statusText}\n${text}`
    );
  }

  return data;
}

async function main() {
  const baseUrl = requireEnv("PORTAINER_URL").replace(/\/$/, "");
  const apiKey = requireEnv("PORTAINER_API_KEY");
  const endpointId = requireEnv("PORTAINER_ENDPOINT_ID");
  const stackId = requireEnv("PORTAINER_STACK_ID");
  const dockerImage = requireEnv("DOCKER_IMAGE");
  const imageEnvName = process.env.PORTAINER_IMAGE_ENV_NAME || "BAMBUVIEW_IMAGE";
  const imageRepository =
    process.env.PORTAINER_IMAGE_REPOSITORY || "deepdaddyttv/bambuview";

  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-API-Key": apiKey
  };

  const stack = await request(baseUrl, `/api/stacks/${encodeURIComponent(stackId)}`, {
    headers
  });
  const stackFile = await request(
    baseUrl,
    `/api/stacks/${encodeURIComponent(stackId)}/file`,
    { headers }
  );

  const env = Array.isArray(stack.Env)
    ? [...stack.Env]
    : Array.isArray(stack.env)
      ? [...stack.env]
      : [];

  const originalContent =
    stackFile.StackFileContent ?? stackFile.stackFileContent ?? "";

  if (typeof originalContent !== "string" || originalContent.trim().length === 0) {
    throw new Error("Portainer did not return stack file content to update.");
  }

  let stackFileContent = originalContent;

  if (
    originalContent.includes(`\${${imageEnvName}`) ||
    originalContent.includes(`$${imageEnvName}`)
  ) {
    const nextEntry = { name: imageEnvName, value: dockerImage };
    const entryIndex = env.findIndex((entry) => entry.name === imageEnvName);

    if (entryIndex >= 0) {
      env[entryIndex] = nextEntry;
    } else {
      env.push(nextEntry);
    }
  } else {
    const imagePattern = new RegExp(
      `(^\\s*image:\\s*)${escapeRegExp(imageRepository)}(?::[^\\s'"]+)?(\\s*$)`,
      "gm"
    );

    stackFileContent = originalContent.replace(
      imagePattern,
      `$1${dockerImage}$2`
    );

    if (stackFileContent === originalContent) {
      throw new Error(
        `Could not find ${imageRepository} in the current stack file. Add ${imageEnvName} to the stack or update the image repository secret.`
      );
    }
  }

  await request(
    baseUrl,
    `/api/stacks/${encodeURIComponent(stackId)}?endpointId=${encodeURIComponent(endpointId)}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        env,
        prune: true,
        pullImage: true,
        repullImageAndRedeploy: true,
        stackFileContent
      })
    }
  );

  console.log(
    `Updated Portainer stack ${stackId} on endpoint ${endpointId} to ${dockerImage}.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
