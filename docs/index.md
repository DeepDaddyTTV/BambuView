# BambuView Docs

These docs are written for someone setting up BambuView for the first time.

Start here:

- [First-time setup](./getting-started.md)
- [Bambu connection modes](./lan-mode.md)

What BambuView `0.0.26` alpha includes:

- A local first-run admin setup flow
- Invite-only account creation after bootstrap
- A fleet dashboard with a mockup-aligned shell, connected sidebar utility stack, tighter spacing, fullscreen printer focus mode, and temporary live/placeholder data switching
- Bambu printer setup with Cloud / Normal, Bambu Connect, LAN Mode, and LAN-only Developer Mode profiles
- Current Bambu model options for H2, X2, P2, A2, X1, P1, and A1 families
- Bambu Connect import-link generation for sliced G-code and 3MF handoff
- Local MQTT status polling for Bambu LAN and Developer profiles
- Camera source setup for Frigate, direct HTTP/MJPEG/HLS, direct RTSP, and Bambu native feeds
- Printer camera assignment with proxied playback for browser-renderable camera sources
- Docker Compose-first setup with persistent SQLite state
- Appearance controls that let each user tune light mode, dark mode, background art, and the shared highlight color used across the UI

Still being built:

- The in-browser prepare and slice workspace
- Native desktop installers
