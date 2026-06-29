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
- **Bambu printer setup** with Cloud / Normal, LAN Mode, and LAN-only Developer Mode profiles, local connection testing, SQLite persistence, and redacted access-code handling.
- **Camera source management** for future Frigate, direct RTSP, Bambu native, and farm overview feeds.
- **Local first-run setup** that creates the first admin account before the app opens.
- **Invite-only users** after bootstrap, with `admin`, `operator`, and `viewer` roles.
- **Per-user appearance settings** for light mode, dark mode, highlight colors, background colors, and background styles.
- **Highlight-driven UI accents** so selected colors carry through the logo, active states, progress colors, controls, and shell details.
- **Installable PWA shell** for browser-supported desktop and mobile installs.
- **Provider boundaries** for printers, cameras, and slicing so live integrations can land without rebuilding the UI.
- **Docker-friendly setup** with persistent SQLite state stored in `/data`.

## Preview

The `0.0.23` interface is centered on the approved graphite console direction: square edges, a full-bleed active sidebar rail, darker connected sidebar utility rows, BambuView branding, tighter Fleet spacing, and selectable background styles.

The first Bambu connection profiles are now in place. Fleet can temporarily switch between `Live` data and `Placeholder` data for testing, saved printers stage Bambu-native camera records, and full live telemetry parsing and real camera playback are still upcoming work.

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

## Bambu LAN-only And Developer Mode

BambuView lets you save a Bambu printer in three ways:

| Profile              | Use it when                                                                        | Result                                                                         |
| -------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `Cloud / Normal`     | You want Bambu Handy and Bambu cloud workflows to keep working.                    | The printer is saved as staged. Full local control is not expected yet.        |
| `LAN Mode`           | You want BambuView to test local reachability with an IP/hostname and access code. | The printer can be checked from your LAN and prepared for live telemetry work. |
| `LAN-only Developer` | You are ready to target full local controls in future BambuView releases.          | Requires LAN-only and Developer Mode enabled on the printer screen.            |

To enable LAN-only on the printer:

1. Stand at the printer touchscreen.
2. Open `Settings`.
3. Open the network or `WLAN` page.
4. Find `LAN Only Mode`, `LAN Mode`, or the local network access section.
5. Turn it on and wait for the printer to apply the change.
6. Write down the printer IP address or hostname.
7. Write down the LAN access code shown by the printer.

After LAN-only is enabled, treat Bambu cloud and Bambu Handy access for that printer as unavailable until you turn LAN-only off again.

To enable Developer Mode:

1. Enable `LAN Only Mode` first.
2. Stay on the printer touchscreen.
3. Open the printer settings area that contains `Developer Mode`.
4. Turn `Developer Mode` on and confirm any printer warning.
5. Use the printer IP/hostname, serial number, and access code when adding the printer in BambuView.

If Developer Mode is not visible, check Bambu's current documentation for your model and firmware.

References:

- [Bambu Lab LAN mode guide](https://wiki.bambulab.com/en/knowledge-sharing/enable-lan-mode)
- [Bambu Lab third-party integration notes](https://wiki.bambulab.com/en/software/third-party-integration)
- [SimplyPrint Bambu LAN-only and Developer Mode walkthrough](https://help.simplyprint.io/en/article/bambu-lab-lan-only-mode-and-developer-mode-how-to-enable-xa0hch/)

## Documentation

Human-facing setup docs live in the repo `docs/` folder and are published through GitHub Pages from that folder only.

- [Docker Hub](https://hub.docker.com/repository/docker/deepdaddyttv/bambuview/general)
- [GitHub Repository](https://github.com/DeepDaddyTTV/BambuView)
- [GitHub Pages Docs](https://deepdaddyttv.github.io/BambuView/)
- [First-time setup](docs/getting-started.md)
- [Bambu LAN setup](docs/lan-mode.md)
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
- `GET /api/fleet/overview?mode=live`
- `GET /api/fleet/overview?mode=placeholder`
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
