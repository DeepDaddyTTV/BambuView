---
title: Bambu Connection Modes
description: How to choose BambuView connection modes, including Bambu Connect and LAN-only Developer Mode.
---

# Bambu Connection Modes

BambuView supports four Bambu printer connection profiles so you can start safely and move toward fuller local control when you are ready.

| Profile              | Best for                                                                               | What to expect                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cloud / Normal`     | Keeping Bambu Handy, Bambu Studio cloud workflows, and normal printer behavior active. | BambuView saves the printer as a no-change profile.                                                                                            |
| `Bambu Connect`      | Camera/live view, printer status, and slicer job handoff through Bambu's bridge.       | BambuView stages this printer for the future local Bambu Connect companion bridge.                                                             |
| `LAN Mode`           | Testing local reachability from the BambuView container to the printer.                | Requires the printer's local host/IP and LAN access code. Cloud behavior may be limited depending on printer model and firmware.               |
| `LAN-only Developer` | Future full direct local telemetry, camera, and printer-control work.                  | Requires LAN-only and Developer Mode on the printer. Bambu cloud/Handy access for that printer should be treated as off while this is enabled. |

## Before You Start

Make sure:

- The printer and BambuView are on the same trusted home network or VLAN.
- You can reach the printer from the machine running the BambuView container.
- You are near the printer touchscreen if you plan to enable LAN-only or Developer Mode.
- You have the printer serial number and local access code.

You generally should not expose a Bambu printer directly to the internet. If you want remote access, expose BambuView through your normal reverse proxy, tunnel, or VPN instead.

## Add A Printer Without LAN-only

Use this when you want the printer saved in BambuView but do not want to interrupt Bambu cloud features yet.

1. Open BambuView.
2. Go to `Fleet`.
3. Select `Add Printer or Farm`.
4. Choose `Cloud / Normal`.
5. Enter a friendly display name, model, and serial number.
6. Leave the host/IP and LAN access code blank unless you already have them.
7. Save the printer.

The printer appears in the live Fleet view as a staged cloud profile. This is useful for preparing assignments and UI work, but it is not the path for full local printer control.

## Use Bambu Connect

Use this when you want BambuView to target Bambu's supported bridge for camera/live view, print status, and sending jobs from slicer workflows.

1. Install and configure Bambu Connect on a machine that can reach your printer.
2. In BambuView, open `Fleet`.
3. Select `Add Printer or Farm`.
4. Choose `Bambu Connect`.
5. Enter a friendly display name, model, and serial number.
6. Optionally enter the machine or bridge host where Bambu Connect will be reachable later.
7. Save the printer.

BambuView does not include the companion bridge yet, so this profile is currently a clear intent marker. It lets us attach the future camera, monitoring, and job-handoff work to the right kind of printer connection.

## Enable LAN-only Mode

Use this when you are ready to test local Bambu access.

The exact menu wording can vary by model and firmware, but the flow is usually:

1. On the printer touchscreen, open `Settings`.
2. Open the printer's network or `WLAN` page.
3. Find `LAN Only Mode`, `LAN Mode`, or the local network access section.
4. Turn the mode on.
5. Wait for the printer to apply the change. Some models may reconnect or restart network services.
6. Write down the printer IP address or hostname.
7. Write down the LAN access code shown by the printer.

After LAN-only is enabled, expect Bambu cloud features for that printer to stop or become unavailable until you turn LAN-only off again.

## Enable Developer Mode

Developer Mode is the profile BambuView is preparing to use for fuller local controls.

1. Enable `LAN Only Mode` first.
2. Stay on the printer touchscreen.
3. Open the printer's settings area that contains `Developer Mode`.
4. Turn `Developer Mode` on.
5. Confirm any warning shown by the printer.
6. Keep the printer IP/hostname, serial number, and access code handy.

If you do not see Developer Mode, update the printer firmware if appropriate for your fleet, then check Bambu's current documentation for your exact model.

## Save The Printer In BambuView

1. Open `Fleet`.
2. Select `Add Printer or Farm`.
3. Choose `Bambu Connect`, `LAN Mode`, or `LAN-only Developer`.
4. Enter:
   - Display name
   - Model
   - Hostname, IP address, or future bridge host
   - Serial number
   - LAN access code when using raw LAN or Developer Mode
5. Select `Test Connection` when using raw LAN or Developer Mode.
6. Save the printer.

BambuView currently tests whether raw LAN and Developer profiles accept the local LAN control connection. Bambu Connect camera playback, status monitoring, slicer job handoff, full telemetry parsing, and print-control commands are still being wired in.

## If The Test Fails

Check these in order:

1. Confirm BambuView and the printer are on the same network.
2. Confirm the host/IP has no `http://` or `https://` prefix.
3. Confirm LAN-only or Developer Mode is enabled on the printer if you selected one of those profiles.
4. Confirm the access code was copied from the printer's local network settings.
5. Restart the printer's network connection if the printer was just switched into LAN-only.
6. If BambuView runs in Docker, confirm the container can reach your LAN and is not blocked by a firewall or VLAN rule.

## References

- [Bambu Lab LAN mode guide](https://wiki.bambulab.com/en/knowledge-sharing/enable-lan-mode)
- [Bambu Connect guide](https://wiki.bambulab.com/en/software/bambu-connect)
- [Bambu Lab third-party integration notes](https://wiki.bambulab.com/en/software/third-party-integration)
- [SimplyPrint Bambu LAN-only and Developer Mode walkthrough](https://help.simplyprint.io/en/article/bambu-lab-lan-only-mode-and-developer-mode-how-to-enable-xa0hch/)
