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
   - `Cloud / Normal` if you want to keep Bambu Handy and cloud behavior active while using Bambu Connect for authorized actions.
   - `Bambu Connect` if you want Bambu's supported camera, monitoring, controls, and slicer job-handoff path.
   - `LAN Mode` if you have the printer IP or hostname and LAN access code and want local MQTT status checks.
   - `LAN-only Developer` if LAN-only and Developer Mode are enabled on the printer and you want direct local protocols.
4. Pick the printer model. Current H2, X2, P2, A2, X1, P1, and A1 family options are included.
5. Enter the printer name, serial number, and any required local network details.
6. Use `Test Connection` to see the capability checks for that profile.
7. Save the printer.

The access code is stored only in the local SQLite database and is not returned to the browser after the printer is saved.

For a full printer-side walkthrough, read [Bambu Connection Modes](./lan-mode.md).

## What to expect in `0.0.25` alpha

The screens are real, the auth flow is real, and the stored preferences are real.

Saved Bambu printers now persist locally and appear in Fleet when the Fleet page is set to `Live`. Cloud / Normal and Bambu Connect profiles expose Bambu Connect capability checks, LAN profiles test local MQTT status access, and Developer profiles target direct local MQTT/camera/control paths. `Prepare & Slice` can generate the official Bambu Connect import URL for a sliced G-code or 3MF file that exists on the computer where Bambu Connect is installed.
