# Changelog

This file tracks the purpose of each alpha release and the user-facing changes that matter when you update BambuView.

## v0.0.32 - 2026-07-05

### General Purpose

Correct the production container startup path so the Docker image and Portainer deployment can boot successfully with the live Companion telemetry and camera bridge changes introduced in the prior alpha.

### User-Facing Changes

- The self-hosted Docker image now starts the packaged API server correctly instead of crashing on boot.
- Portainer and Docker Compose deployments can move forward to the Companion telemetry and camera bridge build without manual image surgery.
- GitHub Alpha releases continue to include the same BambuView and BambuView Companion installer assets, now paired with a working container image for server testing.

### Notes

- This release supersedes the broken `0.0.31` container startup image.
- This release is still Alpha.
- Docker Hub continues to publish only the container image.
- GitHub Releases continue to publish the native BambuView and BambuView Companion installers as Alpha assets.

## v0.0.31 - 2026-07-05

### General Purpose

Bridge live printer telemetry and linked camera feeds from BambuView Companion into the main BambuView Fleet and printer-detail APIs so saved printers can show real status even when the server container cannot reach the printer directly over LAN MQTT.

### User-Facing Changes

- Paired BambuView Companion printers can now supply live Fleet telemetry when the same printer serial is saved in the main app.
- `Bambu Connect` and similar saved printer profiles can now show real print progress, temperatures, layers, firmware version, and AMS slot state through Companion instead of staying limited.
- Linked Companion camera feeds can now appear directly in printer detail responses through BambuView's own API proxy routes.
- Live Fleet responses now prefer direct LAN telemetry when available, then fall back to Companion telemetry when a paired local bridge exists.

### Notes

- This release is still Alpha.
- Docker Hub continues to publish only the container image.
- GitHub Releases continue to publish the native BambuView and BambuView Companion installers as Alpha assets.
