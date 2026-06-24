<div align="center">

<img src="img/BambuView_Full_Logo.svg" alt="BambuView logo" width="520"/>

**Self-hosted fleet, camera, and print-progress dashboard for Bambu Lab printers**

[![Docker](https://img.shields.io/badge/docker-ready-brightgreen.svg)](https://www.docker.com/)
[![Docker Hub](https://img.shields.io/badge/image-docker.io%2Fdeepdaddyttv%2Fbambuview-2496ED)](https://hub.docker.com/repository/docker/deepdaddyttv/bambuview/general)
[![Node 24](https://img.shields.io/badge/node-24.x-5FA04E.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-11.x-F69220.svg)](https://pnpm.io/)

</div>

BambuView is a self-hosted web app for keeping an eye on Bambu Lab printers, farm groups, print progress, filament status, and camera feeds from one polished dashboard.

It is being built for people who want a clean local-first printer console with invite-only users, theme controls, PWA support, and room to grow into live printer integrations, direct camera feeds, and a future prepare-and-slice workspace.

## Current Features

- **Fleet dashboard** with printer cards, farm cards, live-style status data, and a detailed printer panel.
- **Fullscreen printer workspace** with staged camera, movement, temperature, fan, lamp, extruder, filament, and print-action controls.
- **Bambu LAN printer setup** with local connection testing, SQLite persistence, and redacted access-code handling.
- **Camera source management** for future Frigate, direct RTSP, Bambu native, and farm overview feeds.
- **Local first-run setup** that creates the first admin account before the app opens.
- **Invite-only users** after bootstrap, with `admin`, `operator`, and `viewer` roles.
- **Per-user appearance settings** for light mode, dark mode, highlight colors, background colors, and background styles.
- **Highlight-driven UI accents** so selected colors carry through the logo, active states, progress colors, controls, and shell details.
- **Installable PWA shell** for browser-supported desktop and mobile installs.
- **Provider boundaries** for printers, cameras, and slicing so live integrations can land without rebuilding the UI.
- **Docker-friendly setup** with persistent SQLite state stored in `/data`.

## Preview

The `0.0.21` interface is centered on the approved graphite console direction: square edges, a full-bleed active sidebar rail, darker connected sidebar utility rows, BambuView branding, and selectable background styles.

The first Bambu LAN connection path is now in place. Saved printers appear in Fleet and stage Bambu-native camera records, while live telemetry parsing and real camera playback are still upcoming work.

## Getting Started

BambuView is easiest to run with Docker Compose.

You will need:

- Docker or Docker Desktop
- A folder for BambuView's `/data` database
- A browser that can reach the app
- A plan for HTTPS if you expose it outside your home network

Create a `compose.yml` file:

```yaml
services:
  bambuview:
    image: deepdaddyttv/bambuview:latest
    container_name: bambuview
    environment:
      TZ: UTC
      APP_ORIGIN: http://localhost:4173
      COOKIE_SECURE: "false"
      DATABASE_FILE: /data/bambuview.db
    ports:
      - "4173:4173"
    volumes:
      - ./data:/data
    restart: unless-stopped
```

Start it:

```bash
docker compose up -d
```

Open BambuView:

```text
http://localhost:4173
```

The first time you open the app, BambuView walks you through creating the first admin account. After that, new accounts are created by invite only from the `Users` page.

## Documentation

Human-facing setup docs live in the repo `docs/` folder and will move to the GitHub Pages docs site when the app style is locked.

- [Docker Hub](https://hub.docker.com/repository/docker/deepdaddyttv/bambuview/general)
- [GitHub Repository](https://github.com/DeepDaddyTTV/BambuView)
- [First-time setup](docs/getting-started.md)
- [Docs home](docs/index.md)

## Public Deployment Notes

If you expose BambuView outside your home network, put it behind a reverse proxy, tunnel, or similar edge layer.

Recommended basics:

- Use HTTPS.
- Set `APP_ORIGIN` to the real public URL.
- Set `COOKIE_SECURE=true` when the app is served over HTTPS.
- Keep `/data` mounted so users, sessions, invites, and appearance settings survive updates.
- Do not expose the raw container port directly to the internet if you can avoid it.
- Use rate limiting and any extra auth protections provided by your proxy or tunnel.

## API

BambuView includes a small API for health checks, local auth, appearance settings, fleet data, camera sources, users, and prepare/slice status.

The quickest health check is:

```text
/api/health
```

Core routes currently include:

- `POST /api/auth/bootstrap`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/fleet/overview`
- `GET /api/printers/connections`
- `POST /api/printers/bambu/test`
- `POST /api/printers/bambu`
- `GET /api/printers/:id`
- `GET /api/cameras`
- `GET /api/settings/appearance`
- `PUT /api/settings/appearance`
- `GET /api/prepare/status`

## Local Development

```bash
pnpm install
pnpm dev
```

Run the production-style local server:

```bash
pnpm build
pnpm start
```

Run checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Support

Bug reports and feature requests can be submitted through GitHub Issues.
