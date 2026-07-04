---
title: Native Install
description: How to install BambuView and BambuView Companion without Docker.
---

# Native Install

Native installers are published on GitHub Releases while BambuView is in alpha.

Use the main BambuView installer when you want the full app on one computer without Docker. Use BambuView Companion when you already have BambuView running somewhere else and need a local bridge for printers, cameras, or file handoff.

## Pick The Right Download

On each alpha release, look for two app families:

| App                 | Use it for                                                                 | Installers                     | Portable options                     |
| ------------------- | -------------------------------------------------------------------------- | ------------------------------ | ------------------------------------ |
| BambuView           | Full local app with UI, API, and SQLite database                           | `.dmg`, `.exe`, `.deb`, `.rpm` | `.zip`, `.AppImage`                  |
| BambuView Companion | Local bridge for printer telemetry, camera bridge output, and file handoff | `.dmg`, `.exe`, `.deb`, `.rpm` | Not published                        |

Docker images are published to Docker Hub. Native installers are attached to GitHub Releases only.

Zip and AppImage builds are portable app bundles, not installers. BambuView Desktop publishes them as optional portable server/app packages, while Companion stays installer-only.

## Install BambuView Desktop

1. Open the latest BambuView alpha release on GitHub.
2. Download the installer for your operating system.
3. Install and open BambuView.
4. Create the first admin account.
5. Add printers, cameras, and users the same way you would in the Docker web app.

BambuView Desktop starts a local server in the background and opens the normal BambuView interface in a native window. Its SQLite database is stored in the app's user data folder for your operating system.

## Install BambuView Companion

1. Install BambuView first, either with Docker or the native BambuView Desktop app.
2. Download and install BambuView Companion from the same GitHub release.
3. Open Companion on the computer that can reach your printers or local camera bridge.
4. In BambuView, open `Companion`.
5. Create a pairing code and follow the pairing flow.

Companion binds to `localhost` by default. That keeps the bridge local to the computer unless you intentionally change its bind mode later.

## Alpha Notes

The installers are marked as alpha until the project is ready for a stable release. Expect rough edges around signing, first-launch warnings, and native camera bridge coverage while the packaging and Companion workflows settle.
