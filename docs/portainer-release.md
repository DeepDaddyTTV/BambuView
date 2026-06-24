# Local Portainer Deploys

This page walks you through the release flow if you want GitHub tags to publish BambuView to Docker Hub while keeping Portainer credentials on your own machine.

The intended testing flow is simple: finish a revision, publish it, then update the `bambuview` container and test that deployed copy instead of a localhost build.

## What the release workflow does

When you push a tag like `v0.0.15`, GitHub Actions will:

1. Install dependencies
2. Lint, typecheck, test, and build the app
3. Build and push the Docker image to Docker Hub
4. Create a GitHub Release with generated notes
5. Stop there, with no Portainer credentials stored in GitHub
6. Leave the final Portainer redeploy to your local machine

## Local environment values to add

Set these in your local shell or a local-only env file:

- `PORTAINER_URL`
- `PORTAINER_API_KEY`
- `PORTAINER_ENDPOINT_ID`
- `PORTAINER_STACK_ID`
- `COOKIE_SECURE=false` if your first test is direct HTTP instead of HTTPS
- Optional: `RELEASE_VERSION`
- Optional: `RELEASE_IMAGE_TAG`
- Optional: `DOCKER_IMAGE`

Optional:

- `PORTAINER_IMAGE_ENV_NAME`
- `PORTAINER_IMAGE_REPOSITORY`
- `PORTAINER_PULL_IMAGE=true` only if every image in the stack is safe to repull from a registry
- `DEPLOY_DRY_RUN=1` if you want to confirm the target image without changing the stack

## Recommended Portainer stack shape

The safest pattern is to make your stack use an environment-driven image reference:

```yaml
services:
  bambuview:
    image: ${BAMBUVIEW_IMAGE:-deepdaddyttv/bambuview:latest}
```

That lets the workflow update only the image value without rewriting the rest of your stack.

You can start from [`deploy/portainer-stack.example.yml`](../deploy/portainer-stack.example.yml).

## Deploy a finished revision

After you push the tagged revision, run this from your local machine:

```bash
pnpm deploy:revision
```

The helper will:

1. Read the current repo version, unless you override it
2. Wait for the matching Docker Hub tag to exist
3. Redeploy the Portainer stack to that image

If you need to target a different tag explicitly, you can still run:

```bash
DOCKER_IMAGE=deepdaddyttv/bambuview:0.0.15 pnpm deploy:portainer
```

## Important limitation

The deploy helper edits the stack definition through the Portainer API. In practice, that is the cleanest fit for a web-editor-managed stack or a stack detached from Git.

If your Portainer stack is still tightly Git-managed inside Portainer itself, plan to switch that stack to an editor-managed deployment before you rely on automated redeploys from this repository.
