# BambuView Companion

BambuView Companion is the native helper app for BambuView.

Use it when the browser app or Docker container cannot directly reach the local thing you need, such as printer telemetry, browser-compatible camera bridge output, or trusted-machine file handoff.

Companion listens on `http://localhost:<port>` by default and requires a Companion auth token on every bridge endpoint.

## What Companion Can Do Today

- Pair with BambuView using a one-time pairing token
- Keep the local bridge on `localhost` by default
- Warn on busy ports and let you choose another port
- Discover LAN-broadcasting Bambu printers and prefill local profiles from the detected host, model, and serial details
- Detect local Bambu Connect, Bambu Studio, OrcaSlicer, PrusaSlicer, Network Plugin, and camera-bridge surfaces on the same trusted machine
- Surface cached desktop bridge printer profiles from those local apps back into BambuView discovery
- Save local Bambu printer profiles manually with the same shared model list and connection-mode labels used by the main BambuView app
- Read live Bambu telemetry over the local MQTT report path when hostname, serial number, and access code are present
- Run direct machine commands for saved local Bambu profiles, with the deepest motion and extrusion path still best in `LAN-only Developer Mode`
- Upload and send sliced files directly over the local LAN or Developer Mode FTPS path when the printer profile supports it
- Open Bambu Connect handoff workflows on the trusted machine for `Cloud / Normal` and `Bambu Connect` printer profiles
- Save local stream sources such as MJPEG, HTTP snapshot, HLS, RTSP, and native Bambu camera targets
- Expose browser-compatible Companion stream endpoints for saved MJPEG and snapshot sources
- Restream supported native Bambu camera targets through the bundled local camera bridge when the saved printer profile includes the required local details
- Let BambuView import Companion streams as `BambuView Companion` camera sources
- Keep reporting capabilities honestly instead of pretending unavailable features work
- Check for updates, show the installed version, and open the latest installer from inside Companion

## What Still Needs A Browser-Safe Bridge

- Raw RTSP feeds still need an MJPEG, snapshot, or HLS bridge path before a browser can show them inside BambuView.
- Native Bambu camera targets can be saved honestly today, but some printer families still need a browser-safe restream path before the web app can preview them inline.
- Companion is a bridge and handoff app. It does not own slicing by itself; BambuView's `Prepare & Slice` workspace stays responsible for that side.

## Install

Published alpha release artifacts:

- macOS: `.dmg`
- Windows: `.exe`
- Linux: `.deb`
- Linux: `.rpm`

Install the build for your platform, launch `BambuView Companion`, and keep it running on the trusted machine that can reach your printer or camera sources.

## Pair Companion With BambuView

1. In BambuView, open `Settings`, then choose `Companion`.
2. Generate a one-time pairing token.
3. Copy the BambuView server URL shown there.
4. Open BambuView Companion.
5. Paste the BambuView server URL.
6. Leave the default `http://localhost:4173` only when BambuView and Companion are running on the same computer.
7. If BambuView is running in Docker or on another device, enter that machine's LAN URL instead.
8. If BambuView is remote, open Companion `Settings`, switch `Bind Mode` to `LAN`, and set `Bind Host` to this computer's LAN IP or hostname before pairing.
9. Paste the pairing token.
10. Set a friendly Companion name.
11. Finish pairing and wait for the success banner inside Companion.

If you see `Companion auth token required.` while testing the address in a browser or during pairing, that almost always means you opened the Companion bridge instead of the BambuView server. Go back and enter the BambuView web app URL instead.

After pairing, BambuView stores the Companion base URL and bridge token server-side.

## Keep Companion Updated

1. Open `Settings` in Companion.
2. Leave `Check for updates on launch` enabled if you want Companion to look for new alpha builds every time it opens.
3. Set `Update check interval (minutes)` to how often Companion should scan in the background. The default is `30`.
4. Use `Check Now` any time you want an immediate update check.
5. When a new build is ready, choose `Download Installer` to download the latest release and open the installer for your platform.

Companion always shows its current version in the sidebar so you can quickly confirm what is installed before testing a new server release.

## Add A Printer Through Companion

1. Open `Printers` in Companion.
2. If the printer is already advertising on the LAN, choose `Discover Printers` first and use the detected profile to prefill the form.
3. Save the printer name, model, hostname or IP, serial number, and LAN access code.
4. Choose the connection mode:
   `Cloud / Normal`, `Bambu Connect`, `LAN Mode`, or `LAN-only Developer Mode`
5. Run the printer test if you want a quick connection check.
6. Request telemetry after save to confirm the printer is answering.
7. Use the same saved printer later for direct machine controls and direct file upload when that printer is running in `LAN-only Developer Mode`.

If telemetry is unavailable, Companion tells you whether the printer needs LAN details, Developer Mode, or a restream path.

## What Companion Sends Back To BambuView

- Cached local printer profiles and discovery results
- Live telemetry reads for supported local Bambu profiles
- Browser-safe stream imports for MJPEG and snapshot sources
- Direct command routing for `LAN-only Developer Mode` printers
- Direct FTPS upload/send handoff for supported local printers
- Honest capability reports so BambuView can show what is live, limited, or still needs setup

## Add A Bambu Camera Through Companion

For a Bambu native camera source:

1. Open `Streams` in Companion.
2. Add a `Bambu Native` stream target.
3. Save the native target so Companion can report it honestly.
4. If you need browser playback today, add a browser-compatible MJPEG or snapshot bridge path instead and link that to the printer.

## Add An RTSP Camera Through Companion

1. Open `Streams` in Companion.
2. Add a new stream with source kind `RTSP`.
3. Save the RTSP URL.
4. If you want browser playback in BambuView right now, expose an MJPEG, snapshot, or HLS bridge path and save that as the imported stream source instead.

## Assign Companion Feeds In BambuView

1. Open `Settings`, then `Companion`, in BambuView.
2. Select the paired Companion.
3. Test the connection to pull the latest streams.
4. Import the desired Companion stream as a camera source.
5. Open `Cameras`.
6. Assign that `BambuView Companion` source to a printer or `Fleet Overview`.

If a printer still has no working camera, Fleet shows:

- Camera icon
- `No Camera Detected`
- `If this is in error, configure cameras in Cameras.`

## Troubleshooting

### localhost connection issues

- Make sure Companion is running on the same trusted machine BambuView expects to reach.
- If BambuView runs in Docker or on another device, do not leave the Companion pair target on `localhost`.
- When BambuView is remote, open Companion `Settings`, switch `Bind Mode` to `LAN`, set `Bind Host` to this computer's LAN IP or hostname, save, and then pair again.
- Test the Companion from BambuView again after changing bind mode or port.

### busy ports

- Companion warns if the configured port is already in use.
- Use the suggested alternate port, save settings, and pair again if the bridge token changed.

### firewall prompts

- On macOS, Windows, and Linux, let the app keep listening on the local machine.
- Only allow wider network access when you intentionally enabled LAN binding.

### camera bridge limits

- This alpha does bundle the local camera bridge now, but browser playback still depends on the saved source resolving into a browser-safe output.
- Unsupported native Bambu families and raw RTSP-only paths may still need Frigate, go2rtc, or another browser-safe bridge layer before they preview cleanly in the web app.

### black or missing camera screens

- Confirm the imported Companion stream exposes MJPEG, snapshot, or HLS output.
- Re-test the Companion connection from BambuView.
- Reassign the imported source on `Cameras` if the printer still points at an older feed.
