# BambuView Companion

BambuView Companion is the native helper app for BambuView.

Use it when the browser app or Docker container cannot directly reach the local thing you need, such as printer telemetry, browser-compatible camera bridge output, or trusted-machine file handoff.

Companion listens on `http://localhost:<port>` by default and requires a Companion auth token on every bridge endpoint.

## What Companion Can Do Today

- Pair with BambuView using a one-time pairing token
- Keep the local bridge on `localhost` by default
- Warn on busy ports and let you choose another port
- Save local Bambu printer profiles manually
- Read live Bambu telemetry over the local MQTT report path when hostname, serial number, and access code are present
- Save local stream sources such as MJPEG, HTTP snapshot, HLS, RTSP, and native Bambu camera targets
- Expose browser-compatible Companion stream endpoints for saved MJPEG and snapshot sources
- Let BambuView import Companion streams as `BambuView Companion` camera sources
- Report capabilities honestly instead of pretending unavailable features work

## What Companion Does Not Do Yet

- auto-discover Bambu printers
- direct machine-control commands
- direct printer file upload
- native Bambu video restream without an existing browser-compatible bridge path
- slicing or slice-assist execution

## Install

Planned release artifacts:

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
11. Finish pairing.

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
2. Save the printer name, model, hostname or IP, serial number, and LAN access code.
3. Choose the connection mode:
   `Cloud / Normal`, `Bambu Connect`, `LAN Mode`, or `LAN-only Developer Mode`
4. Run the printer test if you want a quick connection check.
5. Request telemetry after save to confirm the printer is answering.

If telemetry is unavailable, Companion tells you whether the printer needs LAN details, Developer Mode, or a restream path.

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

### missing ffmpeg

- This alpha does not rely on bundled ffmpeg yet.
- Save RTSP and native Bambu camera targets honestly, then provide a browser-compatible bridge output for playback.

### black or missing camera screens

- Confirm the imported Companion stream exposes MJPEG, snapshot, or HLS output.
- Re-test the Companion connection from BambuView.
- Reassign the imported source on `Cameras` if the printer still points at an older feed.
