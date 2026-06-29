# First-Time Setup

## What you need

Before you begin, make sure you have:

- Docker or Docker Desktop
- A folder for BambuView's `/data` database
- A browser that can reach the app
- A plan for HTTPS if you expose it outside your home network

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
   - `Cloud / Normal` if you want to keep Bambu Handy and cloud behavior active while BambuView stages the printer.
   - `Bambu Connect` if you want the future supported camera, monitoring, and slicer job-handoff path.
   - `LAN Mode` if you have the printer IP or hostname and LAN access code.
   - `LAN-only Developer` if LAN-only and Developer Mode are enabled on the printer and you want the future full-control path.
4. Enter the printer name, Bambu model, serial number, and any required local network details.
5. Use `Test Connection` when you selected a LAN profile.
6. Save the printer.

The access code is stored only in the local SQLite database and is not returned to the browser after the printer is saved.

For a full printer-side walkthrough, read [Bambu Connection Modes](./lan-mode.md).

## What to expect in `0.0.24` alpha

The screens are real, the auth flow is real, and the stored preferences are real.

Saved Bambu printers now persist locally and appear in Fleet when the Fleet page is set to `Live`. Cloud / Normal profiles keep normal Bambu behavior, Bambu Connect profiles mark the supported camera/status/job-handoff path, and LAN or LAN-only Developer profiles run the current local reachability test. Switch to `Placeholder` when you want to view the mock layout while full live printer telemetry, printer controls, camera playback, and prepare/slice workflows are still staged for upcoming releases.
