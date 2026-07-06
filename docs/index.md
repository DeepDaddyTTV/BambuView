# BambuView Docs

These docs are written for someone setting up BambuView for the first time.

Start here:

- [First-time setup](./getting-started.md)
- [Native install](./native-install.md)
- [Bambu connection modes](./lan-mode.md)
- [Camera setup](./cameras.md)
- [BambuView Companion](./companion.md)
- [Prepare & Slice](./prepare-slice.md)

What BambuView `0.0.38` alpha includes:

- A local first-run admin setup flow
- Invite-only account creation after bootstrap
- A fleet dashboard with a mockup-aligned shell, connected sidebar utility stack, tighter spacing, fullscreen printer focus mode, and temporary live/placeholder data switching
- Bambu printer setup with Cloud / Normal, Bambu Connect, LAN Mode, and LAN-only Developer Mode profiles
- Edit and delete actions for saved Bambu printer profiles, including switching an existing profile into LAN or Developer mode when you are ready for live telemetry
- Current Bambu model options for H2, X2, P2, A2, X1, P1, and A1 families
- A Prepare & Slice workspace that now splits Orca filament work from Prusa resin work
- Bambu Connect import-link generation for sliced G-code and 3MF handoff, with limited Fleet state instead of fake live telemetry
- Local MQTT status polling for Bambu LAN and Developer profiles
- BambuView Companion pairing, Companion connection tests, cached capability reporting, cached local printer visibility, importable Companion stream sources, and in-app update checks
- Camera source setup for Frigate restream URLs, BambuConnect Direct bridge URLs, Bambu Network Plugin bridge URLs, BambuView Companion endpoints, direct HTTP/MJPEG/HLS feeds, and raw RTSP feeds that will be restreamed before browser playback
- Printer and Fleet Overview camera assignment with proxied playback for browser-renderable camera sources
- Clear degraded-state warnings when a saved camera source is reachable metadata or a dashboard URL instead of browser-renderable media
- Docker Compose-first setup with persistent SQLite state
- Native alpha installers for BambuView Desktop and BambuView Companion on macOS, Windows, and Linux
- Appearance controls that let each user tune light mode, dark mode, background art, and the shared highlight color used across the UI

Still being built:

- Deep Orca and Prusa fork integration beyond the current scaffolded split-lane workspace
- Broader Companion control, direct upload, and native video restream support
