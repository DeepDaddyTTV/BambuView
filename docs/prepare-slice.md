---
title: Prepare & Slice
description: How BambuView splits Orca for filament work and Prusa for resin-only workflows.
---

# Prepare & Slice

The `Prepare & Slice` tab is no longer treated like one generic slicer page.

BambuView now splits this workspace into two lanes:

1. `Orca` for filament and FDM printer work
2. `Prusa` for resin and SLA printer work only

That split matters because these jobs are different in real life. Filament printers need plate layout, nozzle and material presets, and Bambu-friendly handoff paths. Resin printers need their own support, profile, and export flow without dragging those controls into the filament experience.

## Orca For Filament

Use the Orca lane when you are preparing jobs for:

- Bambu printers
- Farms made from filament printers
- Other FDM-style printers that belong in the same prep flow

The Orca lane is where BambuView is headed for:

- Plate layout
- Object transforms
- Filament and printer presets
- Slice queue tracking
- Bambu Connect handoff for sliced jobs
- Future direct local upload paths

Today, the live action in that lane is still the official Bambu Connect import-link handoff for already sliced files.

## Prusa For Resin

Use the Prusa lane only when the target printer is a resin or SLA printer.

This lane is intentionally separate. BambuView should not mix resin export logic into the filament workspace just because both are called "slicing."

The Prusa resin lane is where BambuView is headed for:

- Resin printer preset routing
- Resin-specific support and exposure profiles
- Resin export staging
- Future resin queue and validation steps

Bambu Connect is not used for this resin lane.

## Why The Split Exists

This is the honest version of the product:

- Orca is the best fit for the Bambu and filament side.
- Prusa is reserved for resin-only work.
- The web app should reflect that split now, even before the deeper fork integration is finished.

That way, the UI, API contracts, and future native helper work can grow in the right shape instead of pretending one generic slicer surface fits every printer type.

## What Works Right Now

Right now, the tab gives you:

- A real Orca filament lane
- A real Prusa resin lane
- A shared prepare pipeline view
- Workflow-aware accepted file types
- Official Bambu Connect link generation for sliced filament jobs

## What Is Still Coming

The deeper fork work is still ahead:

- Native Orca fork integration
- Native Prusa resin fork integration
- Slice job orchestration
- Queue management
- Direct local upload paths
- Deeper printer-aware preset routing

The important part is that the app now knows which slicer belongs to which workflow, and the UI is built around that decision already.
