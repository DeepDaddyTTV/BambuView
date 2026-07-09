# First-Time Setup

## What you need

Before you begin, make sure you have:

- Docker or Docker Desktop
- A folder for BambuView's `/data` database
- A browser that can reach the app
- A plan for HTTPS if you expose it outside your home network

If you do not want to run Docker, use the native BambuView Desktop installer from GitHub Releases instead. It starts the same BambuView app locally and stores its SQLite database in the app's user data folder.

## Start BambuView

### Docker Compose

1. Create a `compose.yml` file:

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

2. Start BambuView:

   ```bash
   docker compose up -d
   ```

3. Open the app:

   ```text
   http://localhost:4173
   ```

### Local development

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start the app in development:

   ```bash
   pnpm dev
   ```

3. Or build it and run the production server:

   ```bash
   pnpm build
   pnpm start
   ```

### Native alpha installer

1. Open the latest alpha release on GitHub.
2. Download the BambuView installer for your operating system:
   - macOS: `.dmg`
   - Windows: `.exe`
   - Linux: `.deb` or `.rpm`
3. Install and open BambuView.
4. Create the first admin account when the app opens.

Use the BambuView Companion installer only when you want the local bridge app. Companion does not replace the main BambuView app.

## Finish the first launch

1. Open BambuView in your browser.
2. Create the very first admin account.
3. Sign in with that account.
4. Visit `Users` and create invites for anyone else who needs access.

After the first admin exists, new accounts can only be created from invites.

## Pick the look and feel

1. Open `Settings`.
2. Choose light mode or dark mode.
3. Pick highlight and background colors for each mode.
4. Choose a background style:
   - `Topo`
   - `Two-Tone`
   - `Blueprint`
   - `Sweep`
   - `Plain`

Your appearance settings are saved to your local account.

## Add your first Bambu printer

1. Open `Fleet`.
2. Select `Add Printer or Farm`.
3. Choose the connection profile:
   - `Cloud / Normal` if you want to keep Bambu Handy and cloud behavior active while saving the printer in BambuView.
   - `Bambu Connect` if you want Bambu Connect import-link handoff and future bridge support without claiming live web telemetry yet.
   - `LAN Mode` if you have the printer IP or hostname and LAN access code and want local MQTT status checks.
   - `LAN-only Developer` if LAN-only and Developer Mode are enabled on the printer and you want direct local protocols.
4. Pick the printer model. Current H2, X2, P2, A2, X1, P1, and A1 family options are included.
5. Enter the printer name, serial number, and any required local network details.
6. Use `Test Connection` to see the capability checks for that profile.
7. Save the printer.

The access code is stored only in the local SQLite database and is not returned to the browser after the printer is saved.

If you start with `Cloud / Normal` or `Bambu Connect`, you can update that same saved printer later. Open `Fleet`, select the printer, choose the connection/settings button in the detail panel, then switch the profile to `LAN Mode` or `LAN-only Developer` when you have the host and access code.

For a full printer-side walkthrough, read [Bambu Connection Modes](./lan-mode.md).

## Add Camera Sources

1. Open `Cameras`.
2. Choose the camera type:
   - `Frigate` for a Frigate MJPEG restream URL, such as `http://frigate:5000/api/workbench_left`.
   - `BambuConnect Direct` for a browser-compatible bridge URL from a Bambu Connect workflow.
   - `Bambu Network Plugin` for a local Network Plugin bridge endpoint that exposes MJPEG, HLS, or snapshot output.
   - `BambuView Companion` for a paired local bridge endpoint.
   - `Direct MJPEG` for a browser-renderable MJPEG endpoint.
   - `Direct Snapshot / HLS` for a still image, MJPEG-like HTTP endpoint, or HLS playlist.
   - `Direct RTSP` for a raw RTSP source you plan to restream through Frigate, go2rtc, or another bridge.
3. Enter credentials only if the upstream camera requires them.
4. Select `Test` to check whether BambuView can reach the source.
5. Optionally choose a printer or `Fleet Overview` in `Assign When Saved`.
6. Save the source.
7. If you did not assign it while saving, use `Assign Feed` to attach that source to a saved printer or to `Fleet Overview` as `Printer Cam`, `AMS Cam`, `Enclosure Cam`, `Studio Overview`, or `Fleet Overview`.

Frigate and HTTP-compatible feeds are proxied through BambuView so the browser does not receive upstream credentials. Use the actual Frigate restream endpoint, not the Frigate dashboard, shared page, or a URL with a `#` camera fragment. RTSP and native Bambu streams need a restreamer such as Frigate, go2rtc, a Network Plugin bridge, or BambuView Companion before a browser can play them.

If a printer has no assigned browser-compatible camera, its camera panel shows `No Camera Detected`. If that is wrong, open `Cameras`, save a Frigate/go2rtc/HTTP-compatible feed, and assign it to the printer.

For the full walkthrough, read [Camera Setup](./cameras.md).

## What to expect in `0.0.51` alpha

The screens are real, the auth flow is real, and the stored preferences are real.

Saved Bambu printers persist locally and appear in Fleet when the Fleet page is set to `Live`. LAN and Developer profiles read local MQTT status reports for print progress, layers, temperatures, active file, and filament slots when the printer is reachable. Cloud / Normal and Bambu Connect profiles are shown as limited handoff profiles instead of fake live telemetry, and you can edit an existing saved profile when you are ready to add LAN/Developer details. `Prepare & Slice` now splits the workspace into an Orca filament lane and a Prusa resin lane, while keeping the official Bambu Connect import URL flow available for sliced filament jobs that exist on the computer where Bambu Connect is installed. Companion can now discover LAN-broadcasting Bambu printers, report live local capabilities back into BambuView, and act as the bridge for direct Developer Mode commands or file handoff when that is the chosen route.
