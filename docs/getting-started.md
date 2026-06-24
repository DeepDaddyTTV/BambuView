# First-Time Setup

## What you need

Before you begin, make sure you have:

- Docker or a recent Node.js + pnpm setup
- A place to store the SQLite database file
- A plan for how users will reach the app, such as a reverse proxy or tunnel

## Start BambuView

### Option 1: Run with Docker

1. Build the image:

   ```bash
   docker build -t bambuview:local .
   ```

2. Start the container:

   ```bash
   docker run --rm \
     -e APP_ORIGIN=http://localhost:4173 \
     -e DATABASE_FILE=/data/bambuview.db \
     -v bambuview_data:/data \
     bambuview:local
   ```

### Option 2: Run natively

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

## What to expect in `0.0.15`

The screens are real, the auth flow is real, and the stored preferences are real.

The printer, farm, camera, and prepare/slice data are still mock-backed in this first release so the product shell, roles, and deployment flow can settle before live integrations are added.

For finished revisions, the recommended test target is the deployed container, not a localhost build.
