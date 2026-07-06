# Changelog

This file tracks the purpose of each alpha release and the changes that matter when you update BambuView.

## v0.0.33 - 2026-07-05

### General Purpose

Standardize the published BambuView and BVCompanion release asset filenames so every installer and portable build follows one predictable naming format, and simplify changelog sections so releases read more cleanly.

### Changes

- Cleaner Downloads: BambuView and BVCompanion release files now follow one consistent naming format, so it is easier to spot the right installer or portable package at a glance.
- Easier Platform Matching: download names now clearly call out `WIN`, `LINUX`, or `MACOS`, along with whether the file is an `Installer` or `Portable` build.
- Clearer Release Notes: changelog entries and generated GitHub alpha release notes now use a simpler `Changes` section focused on user-facing updates.

## v0.0.32 - 2026-07-05

### General Purpose

Correct the production container startup path so the Docker image and Portainer deployment can boot successfully with the live Companion telemetry and camera bridge changes introduced in the prior alpha.

### Changes

- Fixed Server Startup: self-hosted servers now start correctly instead of crashing during launch.
- Smoother Updates: updating through Docker Compose or Portainer now works cleanly without manual workarounds just to get the server online.
- Camera and Telemetry Support: self-hosted installs can now move forward to the Companion telemetry and camera bridge build with a working server package.
- Reliable Alpha Testing: GitHub alpha releases continue to include standard installers for BambuView and BambuView Companion alongside a working self-hosted server image for easier testing.

## v0.0.31 - 2026-07-05

### General Purpose

Bridge live printer telemetry and linked camera feeds from BambuView Companion into the main BambuView Fleet and printer-detail APIs so saved printers can show real status even when the server container cannot reach the printer directly over LAN MQTT.

### Changes

- Live Companion Status: paired BambuView Companion printers can now feed real print progress and status back into Fleet when the same printer serial is saved in the main app.
- Better Bambu Connect Visibility: saved Bambu Connect style printer profiles can now show temperatures, layers, firmware details, and AMS slot state through Companion instead of staying heavily limited.
- Linked Camera Feeds: assigned Companion cameras can now appear directly in printer detail views through BambuView's own API proxy routes.
- Smarter Live Fallbacks: BambuView now prefers direct LAN telemetry when available, then falls back to Companion telemetry when a paired local bridge exists.
