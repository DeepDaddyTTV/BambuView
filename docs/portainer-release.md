# Portainer Release Deploys

This page walks you through the release flow if you want GitHub tags to publish BambuView to Docker Hub and redeploy your Portainer test stack automatically.

## What the release workflow does

When you push a tag like `v0.0.1`, GitHub Actions will:

1. Install dependencies
2. Lint, typecheck, test, and build the app
3. Build and push the Docker image to Docker Hub
4. Create a GitHub Release with generated notes
5. Ask Portainer to redeploy the `bambuview` stack if the Portainer secrets are configured

## GitHub secrets to add

Add these repository secrets:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`
- `PORTAINER_URL`
- `PORTAINER_API_KEY`
- `PORTAINER_ENDPOINT_ID`
- `PORTAINER_STACK_ID`

Optional:

- `PORTAINER_IMAGE_ENV_NAME`

## Recommended Portainer stack shape

The safest pattern is to make your stack use an environment-driven image reference:

```yaml
services:
  bambuview:
    image: ${BAMBUVIEW_IMAGE:-deepdaddyttv/bambuview:latest}
```

That lets the workflow update only the image value without rewriting the rest of your stack.

You can start from [`deploy/portainer-stack.example.yml`](../deploy/portainer-stack.example.yml).

## Important limitation

The release workflow is built around editing the stack definition through the Portainer API. In practice, that is the cleanest fit for a web-editor-managed stack or a stack detached from Git.

If your Portainer stack is still tightly Git-managed inside Portainer itself, plan to switch that stack to an editor-managed deployment before you rely on automated redeploys from this repository.
