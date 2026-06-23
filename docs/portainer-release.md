# Local Portainer Deploys

This page walks you through the release flow if you want GitHub tags to publish BambuView to Docker Hub while keeping Portainer credentials on your own machine.

## What the release workflow does

When you push a tag like `v0.0.4`, GitHub Actions will:

1. Install dependencies
2. Lint, typecheck, test, and build the app
3. Build and push the Docker image to Docker Hub
4. Create a GitHub Release with generated notes
5. Stop there, with no Portainer credentials stored in GitHub

## Local environment values to add

Set these in your local shell or a local-only env file:

- `PORTAINER_URL`
- `PORTAINER_API_KEY`
- `PORTAINER_ENDPOINT_ID`
- `PORTAINER_STACK_ID`
- `DOCKER_IMAGE`
- `COOKIE_SECURE=false` if your first test is direct HTTP instead of HTTPS

Optional:

- `PORTAINER_IMAGE_ENV_NAME`
- `PORTAINER_IMAGE_REPOSITORY`
- `PORTAINER_PULL_IMAGE=true` only if every image in the stack is safe to repull from a registry

## Recommended Portainer stack shape

The safest pattern is to make your stack use an environment-driven image reference:

```yaml
services:
  bambuview:
    image: ${BAMBUVIEW_IMAGE:-deepdaddyttv/bambuview:latest}
```

That lets the workflow update only the image value without rewriting the rest of your stack.

You can start from [`deploy/portainer-stack.example.yml`](../deploy/portainer-stack.example.yml).

## Deploy after the image is published

Once the Docker image exists on Docker Hub, run this from your local machine:

```bash
DOCKER_IMAGE=deepdaddyttv/bambuview:0.0.4 pnpm deploy:portainer
```

## Important limitation

The deploy helper edits the stack definition through the Portainer API. In practice, that is the cleanest fit for a web-editor-managed stack or a stack detached from Git.

If your Portainer stack is still tightly Git-managed inside Portainer itself, plan to switch that stack to an editor-managed deployment before you rely on automated redeploys from this repository.
