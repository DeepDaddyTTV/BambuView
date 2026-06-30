---
title: Bambu Connection Modes
description: How to choose BambuView connection modes, including Bambu Connect and LAN-only Developer Mode.
---

# Bambu Connection Modes

BambuView supports four Bambu printer connection profiles. Each profile maps to a real integration path instead of a placeholder.

| Profile              | Best for                                                                               | What to expect                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cloud / Normal`     | Keeping Bambu Handy, Bambu Studio cloud workflows, and normal printer behavior active. | BambuView keeps the printer in normal Bambu account flow and generates Bambu Connect import links for file handoff.                                   |
| `Bambu Connect`      | Bambu Connect import-link handoff and future bridge support.                           | BambuView saves the profile as limited until a LAN/Developer telemetry path or browser-compatible camera bridge is configured.                        |
| `LAN Mode`           | Local status telemetry from the BambuView container to the printer.                    | Requires the printer's local host/IP and LAN access code. BambuView reads local MQTT print progress and uses Bambu Connect for restricted operations. |
| `LAN-only Developer` | Direct local telemetry, camera, file transfer, and printer-control work.               | Requires LAN-only and Developer Mode on the printer. Bambu cloud/Handy access for that printer should be treated as off while this is enabled.        |

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

The printer appears in the live Fleet view as a limited handoff profile. This keeps normal Bambu behavior intact while still giving BambuView a secure job-handoff path.

## Use Bambu Connect

Use this when you want BambuView to generate Bambu Connect import links and keep a saved profile ready for future bridge support.

1. Install and configure Bambu Connect on a machine that can reach your printer.
2. In BambuView, open `Fleet`.
3. Select `Add Printer or Farm`.
4. Choose `Bambu Connect`.
5. Enter a friendly display name, model, and serial number.
6. Leave host/IP blank unless you also want to test LAN telemetry separately.
7. Save the printer.
8. Open `Prepare & Slice` when you have a sliced file and generate a `bambu-connect://import-file` link.

Bambu Connect must be installed on the computer that opens the generated link. Bambu Connect then imports the sliced G-code or 3MF file and handles printer selection and secure sending.

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

Developer Mode is the direct local-control profile.

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
   - Hostname or IP address when using LAN or Developer Mode
   - Serial number
   - LAN access code when using raw LAN or Developer Mode
5. Select `Test Connection`.
6. Save the printer.

BambuView tests raw LAN and Developer profiles with local MQTT capability checks, then uses the same MQTT report path for live print progress, temperatures, layers, file names, and AMS slots when the printer is reachable. Bambu Connect and Cloud / Normal profiles stay limited in Fleet until a LAN/Developer telemetry path or camera bridge is configured, and the Prepare page can generate the official import-file URL for sliced jobs.

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
