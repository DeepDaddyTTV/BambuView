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

## What to expect in `0.0.20`

The screens are real, the auth flow is real, and the stored preferences are real.

The printer, farm, camera, and prepare/slice data are still mock-backed in this first release so the product shell, roles, and Docker Compose path can settle before live integrations are added.
