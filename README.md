<div align="center">

<picture>
  <source srcset="img/BambuView_Full_Logo.webp" type="image/webp" />
  <img src="img/BambuView_Full_Logo_GitHub.png" alt="BambuView logo" width="580"/>
</picture>

**Self-hosted fleet, camera, Companion, and print-progress dashboard for Bambu Lab printers**

[![Docker](https://img.shields.io/badge/docker-ready-brightgreen.svg)](https://www.docker.com/)
[![Docker Hub](https://img.shields.io/badge/image-docker.io%2Fdeepdaddyttv%2Fbambuview-2496ED)](https://hub.docker.com/repository/docker/deepdaddyttv/bambuview/general)
[![Node 24](https://img.shields.io/badge/node-24.x-5FA04E.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-11.x-F69220.svg)](https://pnpm.io/)

</div>

BambuView is a self-hosted web app for keeping an eye on Bambu Lab printers, farm groups, print progress, filament status, and camera feeds from one polished dashboard.

It is being built for people who want a clean local-first printer console with invite-only users, theme controls, PWA support, live printer integration paths, direct camera feeds, and a prepare-and-slice workspace.

## Current Features

- **Fleet dashboard** with printer cards, farm cards, live printer status, print progress, temperatures, filament state, and a detailed printer panel.
- **Fullscreen printer workspace** with camera, movement, temperature, fan, lamp, extruder, filament, and print-action controls mapped to each connection profile's supported path.
- **Bambu printer setup** with Cloud / Normal, Bambu Connect, LAN Mode, and LAN-only Developer Mode profiles, MQTT/Bambu Connect capability checks, SQLite persistence, and redacted access-code handling.
- **Current Bambu model catalog** covering H2, X2, P2, A2, X1, P1, and A1 families.
- **Prepare & Slice workspace split** with OrcaSlicer positioned as the filament/FDM fork target and PrusaSlicer reserved for resin-only workflows.
- **Camera source management** for direct browser-compatible HTTP/MJPEG/HLS feeds, Frigate/go2rtc restream URLs, and raw RTSP sources that can be restreamed before browser playback.
- **BambuView Companion foundation** with native pairing, localhost bridge auth, manual printer profiles, honest capability reporting, local telemetry hooks, and importable Companion stream sources.
- **Native alpha installers** for the full BambuView desktop app and BambuView Companion on macOS, Windows, and Linux through GitHub Releases.
- **Local first-run setup** that creates the first admin account before the app opens.
- **Invite-only users** after bootstrap, with `admin`, `operator`, and `viewer` roles.
- **Per-user appearance settings** for light mode, dark mode, highlight colors, background colors, and background styles.
- **Highlight-driven UI accents** so selected colors carry through the logo, active states, progress colors, controls, and shell details.
- **Installable PWA shell** for browser-supported desktop and mobile installs.
- **Provider boundaries** for printers, cameras, and slicing so live integrations can land without rebuilding the UI.
- **Docker-friendly setup** with persistent SQLite state stored in `/data`.

## Preview

The `0.0.33` alpha interface is centered on the approved graphite console direction: square edges, a full-bleed active sidebar rail, darker connected sidebar utility rows, BambuView branding, tighter Fleet spacing, selectable background styles, and a first Companion management surface.

The Bambu connection profiles now expose honest capability states. Cloud / Normal and Bambu Connect are saved as handoff profiles for Bambu Connect import links and bridge-aware workflows, LAN Mode reads local MQTT status telemetry, and LAN-only Developer Mode targets direct MQTT, native camera, file-transfer, and machine-control paths. Browser-renderable cameras can be assigned directly to printers or the Fleet Overview target; RTSP and native Bambu feeds should still be routed through Frigate/go2rtc, a Network Plugin bridge endpoint, or a browser-compatible Companion stream before browser playback.

Saved printer profiles can be edited from the Fleet detail panel. Use that when a printer was first added as Cloud / Normal or Bambu Connect and you are ready to add LAN/Developer host and access-code details for live telemetry.

Printers without an assigned browser-compatible camera show a black `No Camera Detected` view in the camera panel and point you back to `Cameras` for setup.

The Prepare & Slice tab now uses a real split-lane foundation instead of a single placeholder: Orca is the default filament workbench for Bambu and other FDM printers, while Prusa is held back for resin-only workflows so SLA tooling can evolve without polluting the Bambu path.

## BambuView Companion

BambuView Companion is the native/local bridge app inside this repo.

Use it when BambuView needs a trusted desktop process for local printer telemetry, local camera bridge output, or local file handoff that the browser app cannot reach directly.

The first Companion foundation in `0.0.33` includes:

- Electron + TypeScript app inside `apps/companion`
- bridge API on `http://localhost:<port>` by default
- auth token required on Companion bridge endpoints
- one-time pairing flow from the main BambuView app
- Companion management page in the web UI
- manual Bambu printer records with honest capability reporting
- local Bambu MQTT telemetry reads when LAN details are present
- importable Companion stream sources that land in `Cameras`

See the full Companion guide in [docs/companion.md](docs/companion.md).

## Install Options

BambuView can run in three ways during alpha:

- **Docker Compose** runs the self-hosted web app and is still the best option for an always-on server.
- **BambuView Desktop** runs the same web app locally without Docker by starting the bundled API and SQLite database inside a native app.
- **BambuView Companion** is the local bridge app for printer telemetry, local camera bridge output, and file handoff.

Docker images are published only to Docker Hub. Native installers are published only on GitHub Releases.

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

BambuView lets you save a Bambu printer in four ways:

| Profile              | Use it when                                                                      | Result                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `Cloud / Normal`     | You want normal Bambu behavior while still saving the printer in BambuView.      | BambuView keeps the printer in normal Bambu account flow and generates Bambu Connect file handoff links.              |
| `Bambu Connect`      | You want Bambu Connect import-link handoff and future bridge support.            | BambuView saves the profile without pretending live telemetry or cameras are available through the web container yet. |
| `LAN Mode`           | You want local status telemetry with IP/hostname and access code.                | BambuView tests MQTT status access locally and reads progress, layers, temperatures, and AMS state.                   |
| `LAN-only Developer` | You want direct local protocols and are willing to secure that network yourself. | BambuView targets MQTT, native camera stream, file transfer, and machine-control paths directly.                      |

Use `Bambu Connect` when your goal is file handoff through Bambu's supported desktop app. Use `LAN Mode` or `LAN-only Developer` when your goal is live print progress in BambuView. Use Frigate/go2rtc, a browser-compatible direct feed, a Network Plugin bridge endpoint, or later BambuView Companion when your goal is camera playback in the web app.

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
- [Bambu Connect guide](https://wiki.bambulab.com/en/software/bambu-connect)
- [Bambu Lab third-party integration notes](https://wiki.bambulab.com/en/software/third-party-integration)
- [SimplyPrint Bambu LAN-only and Developer Mode walkthrough](https://help.simplyprint.io/en/article/bambu-lab-lan-only-mode-and-developer-mode-how-to-enable-xa0hch/)

## Camera Setup

Open `Cameras`, add a source, then assign it to either a saved printer or `Fleet Overview`.

For Frigate, paste the browser-compatible MJPEG restream URL:

```text
http://frigate:5000/api/workbench_left
```

Replace `workbench_left` with the camera name from Frigate. BambuView proxies the stream through `/api/cameras/sources/:id/stream` so the browser does not receive upstream credentials directly. If BambuView can infer a standard Frigate camera name from the URL, it also exposes `/api/cameras/sources/:id/snapshot` for still previews.

Do not paste a Frigate dashboard URL, shared page, or URL with a `#` camera fragment. Those pages can load in a browser, but they are not a restream endpoint BambuView can embed.

Direct MJPEG, HTTP snapshot, HLS, Frigate, BambuConnect Direct bridge URLs, Network Plugin bridge URLs, and imported BambuView Companion endpoints can be saved as camera sources. Raw RTSP and native Bambu camera sources still need a Frigate/go2rtc/HTTP restream before a browser can play them inline.

## Documentation

Human-facing setup docs live in the repo `docs/` folder and are published through GitHub Pages from that folder only.

- [Docker Hub](https://hub.docker.com/repository/docker/deepdaddyttv/bambuview/general)
- [GitHub Repository](https://github.com/DeepDaddyTTV/BambuView)
- [GitHub Pages Docs](https://deepdaddyttv.github.io/BambuView/)
- [Changelog](CHANGELOG.md)
- [First-time setup](docs/getting-started.md)
- [Native install](docs/native-install.md)
- [Bambu connection modes](docs/lan-mode.md)
- [Camera setup](docs/cameras.md)
- [BambuView Companion](docs/companion.md)
- [Prepare & Slice](docs/prepare-slice.md)
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
- `GET /api/printers/bambu/models`
- `POST /api/printers/bambu/test`
- `POST /api/printers/bambu`
- `PUT /api/printers/bambu/:id`
- `DELETE /api/printers/bambu/:id`
- `POST /api/bambu-connect/import-url`
- `GET /api/printers/:id`
- `GET /api/cameras`
- `POST /api/cameras/sources/test`
- `POST /api/cameras/sources`
- `PUT /api/cameras/sources/:id`
- `DELETE /api/cameras/sources/:id`
- `POST /api/cameras/assignments`
- `DELETE /api/cameras/assignments/:id`
- `GET /api/cameras/sources/:id/snapshot`
- `GET /api/cameras/sources/:id/stream`
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
