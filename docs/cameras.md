---
title: Camera Setup
description: Beginner-friendly camera setup for direct feeds, Frigate restreams, and future companion app support.
---

# Camera Setup

BambuView can show camera feeds in a few practical ways right now:

1. A direct browser-compatible camera URL.
2. A Frigate or go2rtc restream URL.
3. A browser-compatible bridge endpoint exposed by BambuConnect Direct, the Bambu Network Plugin, or a paired BambuView Companion helper.

The future companion app will be the beginner-friendly fallback for Bambu native camera streams that a normal browser cannot play directly.

## Why Bambu Studio And Orca Can See Bambu Cameras

Bambu Studio, OrcaSlicer, and Bambu Connect run as desktop software. That gives them access to native printer networking, local plugins, and video decoders that browsers do not have.

BambuView is a web app running in a browser and container, so it needs a normal web video format. That usually means MJPEG, JPEG snapshot, HLS, or a bridge endpoint that BambuView can proxy safely.

For Bambu printer cameras, the practical setup is:

- Use Frigate, go2rtc, a Network Plugin bridge, or a companion endpoint to restream the printer camera into a browser-friendly URL.
- Add that restream URL to BambuView.
- Assign the camera to a printer or to Fleet Overview.

Later, BambuView Companion can make this easier by running beside your printers, reading supported local/native camera streams, and exposing a safe local web feed back to BambuView.

## Option 1: Direct Camera Feed

Use this if your camera already gives you a browser-friendly URL.

Good examples:

```text
http://camera.local/video.mjpg
http://camera.local/snapshot.jpg
http://camera.local/live.m3u8
```

Steps:

1. Open BambuView.
2. Go to `Cameras`.
3. Choose `Direct MJPEG` for an MJPEG stream.
4. Choose `Direct Snapshot / HLS` for a snapshot URL, HTTP video URL, or `.m3u8` HLS playlist.
5. Paste the camera URL into `Stream URL`.
6. Add a username and password only if the camera requires them.
7. Select `Test`.
8. If the test is successful, select `Save Source`.
9. In `Assign Feed`, choose the printer or `Fleet Overview`.
10. Choose the saved source.
11. Set a friendly feed label, such as `Printer Cam`, `AMS Cam`, `Enclosure Cam`, or `Fleet Overview`.
12. Select `Assign`.

After assignment, open `Fleet` and select the printer. The camera panel should show the assigned feed.

If the printer camera panel says `No Camera Detected`, that printer does not have a browser-compatible camera assigned yet.

## Option 2: Frigate Or go2rtc Restream

Use this when your camera is RTSP, Bambu native, or otherwise not browser-friendly.

Frigate commonly uses go2rtc behind the scenes. The goal is to turn the original camera stream into a URL like this:

```text
http://frigate:5000/api/workbench_left
```

Replace `workbench_left` with your Frigate camera name.

Use the restream endpoint itself. Do not use the Frigate dashboard, a shared camera page, or a URL with a `#` camera fragment. Those pages are meant for humans, not for embedding as a raw camera feed.

### Add The Camera To Frigate

1. Open your Frigate configuration.
2. Add the camera stream under `go2rtc`.
3. Add a matching camera entry under `cameras`.
4. Restart Frigate.
5. Confirm the camera appears in the Frigate web interface.

Example Frigate configuration:

```yaml
go2rtc:
  streams:
    workbench_left:
      - rtsp://camera.example.local/stream1

cameras:
  workbench_left:
    ffmpeg:
      inputs:
        - path: rtsp://127.0.0.1:8554/workbench_left
          roles:
            - detect
```

If you are restreaming a Bambu printer camera, use the working input supported by your printer model and firmware, then let Frigate/go2rtc expose the browser-friendly restream.

### Add The Frigate Restream To BambuView

1. Open BambuView.
2. Go to `Cameras`.
3. Choose `Frigate`.
4. Enter a friendly name, such as `Workbench Left`.
5. Paste the Frigate restream URL:

   ```text
   http://frigate:5000/api/workbench_left
   ```

6. Add credentials only if your Frigate endpoint requires them.
7. Select `Test`.
8. Select `Save Source`.
9. In `Assign Feed`, choose the printer or `Fleet Overview`.
10. Choose the saved Frigate source.
11. Set the feed label.
12. Select `Assign`.

BambuView proxies the Frigate stream so browser clients do not receive the upstream credentials directly.

## Option 3: BambuConnect Direct Or Network Plugin Bridge

Use this when another local tool exposes a browser-friendly URL for a Bambu camera or printer view.

1. Open BambuView.
2. Go to `Cameras`.
3. Choose `BambuConnect Direct` or `Bambu Network Plugin`.
4. Enter a friendly name.
5. Paste the bridge URL. It should return MJPEG, HLS, or a JPEG snapshot that a browser can render.
6. Select `Test`.
7. If the test says `Online`, save the source.
8. Assign it to the printer or to `Fleet Overview`.

If the test says `Degraded`, the endpoint responded but did not look browser-renderable. That usually means the bridge is returning a control page, JSON, or a native stream instead of MJPEG/HLS/snapshot media.

## Option 4: BambuView Companion Later

The companion app is planned as the beginner-friendly fallback for cameras that are hard to restream manually.

The goal is:

1. Install BambuView Companion on a computer or small server on the same network as the printers.
2. Let Companion connect to supported local printer camera paths.
3. Let Companion expose a browser-friendly local feed.
4. Add that feed to BambuView like any other direct camera source.

This is not required for direct MJPEG/HLS cameras or Frigate/go2rtc restreams.

## Troubleshooting

- If `Test` fails, make sure the BambuView container can reach the camera URL.
- If the camera works from your laptop but not in BambuView, the container may be on a different network.
- If a Frigate source shows `Degraded`, confirm you pasted a restream URL like `http://frigate:5000/api/workbench_left`, not the Frigate web UI or a shared dashboard link.
- If the URL starts with `rtsp://`, use Frigate/go2rtc first. Browsers cannot play raw RTSP by themselves.
- If the camera card says `Online` but the preview is black or unavailable, check whether the endpoint returns MJPEG, HLS, or a JPEG image instead of an HTML page or API response.
- If the source saves but the Fleet page says `No Camera Detected`, assign the source to that printer from `Cameras`.
- If you use HTTPS for BambuView, avoid plain HTTP camera feeds exposed across the internet. Keep camera traffic local or proxy it safely.
