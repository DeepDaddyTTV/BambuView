# BambuView

BambuView is a graphite-and-green web app for monitoring Bambu Lab printers, farms, and camera feeds from one place.

Version `0.0.1` ships the real product foundation:

- React + Vite + TypeScript frontend with PWA support
- Fastify + TypeScript API that serves the built app
- SQLite + Drizzle for local auth, invites, sessions, and appearance settings
- Mock printer, farm, camera, and prepare/slice provider boundaries for future live integrations
- Docker image release automation to Docker Hub
- Portainer redeploy automation for a test stack named `bambuview`

## Current product surface

- `Fleet`: printer cards, farm cards, printer detail, and fullscreen printer workspace
- `Cameras`: mock source management for Frigate, direct RTSP, Bambu, and overview feeds
- `Users`: real invite-only local auth management with `admin`, `operator`, and `viewer` roles
- `Settings`: per-user light/dark appearance controls with `Topo`, `Two-Tone`, `Blueprint`, `Sweep`, and `Plain` backgrounds
- `Prepare & Slice`: a staged route that preserves the future Orca/Prusa-derived workspace

## Quick start

### Local development

```bash
pnpm install
pnpm dev
```

- Web app: `http://localhost:5173`
- API + local production shell: `http://localhost:4173`

### Local production-style run

```bash
pnpm build
pnpm start
```

The first launch prompts you to create the initial admin account. After that, registration is invite-only.

## Environment

Copy `.env.example` and adjust the values for your environment.

| Variable | Purpose |
| --- | --- |
| `APP_ORIGIN` | Public app origin used when building invite URLs |
| `HOST` | Fastify bind host |
| `PORT` | Fastify port |
| `DATABASE_FILE` | SQLite database path |
| `SESSION_COOKIE_NAME` | Cookie name for local auth sessions |

## Docker

Build locally:

```bash
docker build -t bambuview:local .
```

Run locally:

```bash
docker run --rm \
  -e APP_ORIGIN=http://localhost:4173 \
  -e DATABASE_FILE=/data/bambuview.db \
  -v bambuview_data:/data \
  bambuview:local
```

The container serves the full app from the API process, so self-hosting is a single container in `0.0.1`.

## Portainer release deploys

The release workflow can redeploy an existing Portainer stack after pushing a `v0.0.x` tag.

Set these GitHub repository secrets before tagging:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`
- `PORTAINER_URL`
- `PORTAINER_API_KEY`
- `PORTAINER_ENDPOINT_ID`
- `PORTAINER_STACK_ID`
- Optional: `PORTAINER_IMAGE_ENV_NAME`

Recommended stack pattern:

- Keep your Portainer stack managed in the web editor or detached from Git
- Use `image: ${BAMBUVIEW_IMAGE:-deepdaddyttv/bambuview:latest}` for the `bambuview` service
- See [deploy/portainer-stack.example.yml](deploy/portainer-stack.example.yml) for a clean starting point

The workflow updates the image by changing the `BAMBUVIEW_IMAGE` environment value when available, or by replacing the existing `deepdaddyttv/bambuview:*` image reference in the stack file.

## Docs

Human-facing first-time docs live in [`docs/`](docs). They are intentionally written as walkthroughs and will become the GitHub Pages-only docs site once the visual style is locked in.

## Release contract

- Docker Hub only receives the container image
- GitHub Releases are the home for release notes now and native installers later
- Desktop installers are intentionally deferred beyond `0.0.1`
