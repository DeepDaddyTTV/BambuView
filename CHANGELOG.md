# Changelog

This file tracks the changes that matter when you update BambuView.
Recent and future release notes should follow the same simple format:

- `Bug Fixes & Stability`
- `Improvements & What's New`

## v0.0.38 - 2026-07-06

### Bug Fixes & Stability

- Clearer Companion Pairing Errors: BambuView Companion no longer shows the raw remote-method crash text when pairing fails, so you now get a readable message that explains what actually went wrong.
- Fixed Remote Pairing Guidance: Companion now stops you before a bad remote pair attempt when the bridge is still locked to `localhost`, instead of failing later with a vague fetch error.
- Better Remote Setup Recovery: same-machine `localhost` pairing still works, while remote and Docker-hosted pair attempts now point you straight to `LAN` bind mode and `Bind Host` when that bridge callback path is missing.

### Improvements & What's New

- Easier Cross-Machine Pairing: the Companion pairing screen now explains the full remote flow more clearly, including when to keep `localhost` and when to switch to your BambuView server's LAN URL.
- Better Beginner Docs: the Companion setup guide now walks first-time users through remote pairing step by step, including the required `LAN` bridge setting when BambuView is not running on the same computer.

## v0.0.37 - 2026-07-06

### Bug Fixes & Stability

- Neutral Companion Pairing Defaults: BambuView no longer shows the live browser origin as the default Companion server URL, so personal LAN addresses do not leak into the pairing screen.
- More Reliable Copy Actions: pairing tokens and invite links now use a browser-safe clipboard fallback so copy actions still work when direct clipboard access is blocked on LAN or local installs.
- Cleaner Pairing Guidance: the web pairing view now keeps a neutral localhost-style default while still explaining when to replace it with the real BambuView host for remote Companion installs.

### Improvements & What's New

- More Consistent Setup Screens: Companion pairing now follows the same neutral-first setup direction across the app instead of mixing live deployment values into the onboarding flow.
- Easier Companion Pairing: the Companion app now splits the server target into protocol, host, and port fields with `http`, `localhost`, and `4173` prefilled by default.
- Less Pairing Confusion: Companion now labels the bridge secret as an advanced internal credential so it is easier to tell it apart from the one-time pairing token from BambuView.

## v0.0.36 - 2026-07-06

### Bug Fixes & Stability

- Fixed Companion Pairing Guidance: the Companion app no longer defaults the server field to `localhost`, which kept causing failed pair attempts against remote BambuView servers.
- Clearer Pairing Errors: when Companion cannot reach the BambuView server, the error now explains when `localhost` is valid and when you need the server's LAN URL instead.
- Better Pairing Validation: Companion now catches blank server URLs, incomplete pairing tokens, and missing `http://` or `https://` schemes before the request is sent.

### Improvements & What's New

- Easier First-Time Pairing: the server URL field now starts blank with an inline hint that explains the correct URL to use for same-machine versus remote or Docker-hosted installs.

## v0.0.35 - 2026-07-06

### Bug Fixes & Stability

- Fixed Companion Pairing Tokens: generating a pairing token no longer fails just because the request body is empty.
- Safer API Requests: the shared web request helper now keeps custom headers intact and avoids forcing JSON headers onto form uploads.

### Improvements & What's New

- Clearer Alpha Notes: generated GitHub release notes now follow the `Changelog: Latest Updates` format with the same section layout shown inside this changelog.

## v0.0.34 - 2026-07-05

### Bug Fixes & Stability

- Fixed Companion Pairing Feedback: generating a Companion pairing token now gives immediate success or error feedback instead of feeling like a dead button.
- More Reliable Companion Updating: Companion can now download the latest installer inside the app and open it directly for a smoother update flow.

### Improvements & What's New

- Better Companion Management: the web app now keeps Companion under `Settings`, alongside Appearance, so pairing and bridge management live in one clearer place.
- In-App Update Visibility: BambuView Companion now shows its installed version, latest release status, and last update check.
- Smarter Update Checks: Companion can now check for updates on launch and keep scanning on a saved interval with a default of 30 minutes.
- Cleaner Alpha Downloads: release automation now prepares BambuView and BVCompanion downloads with the corrected installer and portable naming pattern for future releases.

## v0.0.33 - 2026-07-05

### Bug Fixes & Stability

- Reduced Download Confusion: release assets now use one predictable naming pattern so it is easier to grab the correct file for the correct machine.

### Improvements & What's New

- Cleaner Downloads: BambuView and BVCompanion release files now follow one consistent naming format.
- Easier Platform Matching: download names now clearly call out `WIN`, `LINUX`, or `MACOS`, along with whether the file is an `Installer` or `Portable` build.
- Clearer Release Notes: alpha release notes now use a more user-facing structure instead of the older purpose-and-summary format.

## v0.0.32 - 2026-07-05

### Bug Fixes & Stability

- Fixed Server Startup: resolved an issue where self-hosted servers would fail to start up properly or crash immediately upon launch.
- Smoother Updates: upgrading your self-hosted setup through Docker Compose or Portainer now works more cleanly without manual repair work.

### Improvements & What's New

- Camera & Telemetry Support: self-hosted deployments can now move forward with the latest Companion telemetry and camera bridge features on a working server package.
- Reliable Alpha Testing: GitHub alpha releases continue to include standard installers for BambuView and BambuView Companion, paired with a working self-hosted server package for easier testing.

## v0.0.31 - 2026-07-05

### Bug Fixes & Stability

- Smarter Live Fallbacks: BambuView now prefers direct LAN telemetry when available, then falls back to Companion telemetry when a paired local bridge exists.

### Improvements & What's New

- Live Companion Status: paired BambuView Companion printers can now feed real print progress and status back into Fleet when the same printer serial is saved in the main app.
- Better Bambu Connect Visibility: saved Bambu Connect profiles can now show temperatures, layers, firmware details, and AMS slot state through Companion instead of staying heavily limited.
- Linked Camera Feeds: assigned Companion cameras can now appear directly in printer detail views through BambuView's own API proxy routes.

## v0.0.30 - 2026-07-04

### Bug Fixes & Stability

- Easier Testing Access: native desktop builds are now packaged into repeatable alpha downloads so testing does not rely only on Docker.

### Improvements & What's New

- Native Downloads: GitHub alpha releases now include BambuView installers for Windows, macOS, and Linux.
- Companion Downloads: BambuView Companion now ships as a separate desktop download for supported platforms.
- More Flexible Testing: you can now test the desktop builds directly from GitHub Releases while Docker Hub continues to host the server image.

## v0.0.29 - 2026-06-30

### General Purpose

Repair the live camera experience so saved feeds show up more reliably inside Fleet and printer detail views, while tightening the surrounding live-data shell for alpha testing.

### Changes

- Better Camera Reliability: saved camera sources and linked printer feeds now recover more cleanly when live preview routing had been failing.
- Clearer Live Status: Fleet and printer views now do a better job showing whether you are seeing a live camera state or a missing-camera fallback.
- Cleaner Setup Guidance: camera and LAN-mode docs were updated so it is easier to understand how to finish a working live setup.

## v0.0.28 - 2026-06-30

### General Purpose

Expand the camera management surface so you can manage saved sources more cleanly inside BambuView instead of treating cameras as a one-time setup step.

### Changes

- Better Camera Management: camera sources can now be managed from a fuller editing surface instead of a simpler early alpha form.
- Built-In Styled Controls: camera setup now uses BambuView-styled selection controls so the page matches the rest of the shell more closely.
- Stronger Assignment Flow: linking a saved source to a printer or fleet became easier and more visible from the camera management page.

## v0.0.27 - 2026-06-29

### General Purpose

Tighten the first full camera setup flow so saved camera sources, feed labels, and assignments feel more complete during early live testing.

### Changes

- Easier Camera Setup: the Cameras page now guides source creation and feed assignment more clearly.
- Better Saved Source Handling: camera records and assignment state were cleaned up so repeat setup is less brittle.
- More Consistent UI: Fleet and Cameras received another consistency pass so the live camera workflow fits the app better.

## v0.0.26 - 2026-06-29

### General Purpose

Wire live printer and camera data into the app shell so BambuView can move beyond a pure mockup and start showing real saved devices.

### Changes

- Live Printer Plumbing: saved printer records now have stronger live routes and provider logic behind them.
- First Real Camera Layer: BambuView now includes API and database support for camera sources, feed assignments, and live camera proxying.
- Cameras Page Expansion: the camera management area became a real configuration screen instead of a static placeholder.

## v0.0.25 - 2026-06-29

### General Purpose

Expand Bambu printer profile support so more printer models and printer details can flow through the app while Prepare and Slice grows into a more intentional future workspace.

### Changes

- More Complete Bambu Profiles: saved Bambu printers now carry fuller model and capability information through the app.
- Better Printer Detail Data: Fleet and printer views can surface richer Bambu-specific status instead of minimal early placeholders.
- Prepare and Slice Direction: the Prepare route was refined so the future slicing workspace has a clearer staged foundation.

## v0.0.24 - 2026-06-29

### General Purpose

Add Bambu Connect as a first-class connection option so BambuView can support a cloud-assisted setup path alongside direct local printer access.

### Changes

- Bambu Connect Option: printers can now be configured with a Bambu Connect style connection path.
- More Flexible Setup: BambuView no longer assumes a single direct-LAN style workflow when adding supported Bambu printers.
- Clearer Docs: beginner-facing setup guidance now better explains when to use direct access versus a Connect-based setup.

## v0.0.23 - 2026-06-28

### General Purpose

Introduce multiple Bambu connection modes and publish the first public docs site so setup can be explained more clearly outside the app itself.

### Changes

- Connection Mode Choice: the app can now distinguish between different Bambu connection styles instead of treating every printer setup the same way.
- Public Docs Site: the first GitHub Pages documentation shell went live to walk new users through setup more clearly.
- Better Setup Copy: the app and docs received another pass so connection choices are easier to understand on first run.

## v0.0.22 - 2026-06-26

### General Purpose

Add a live-data mode to Fleet so the dashboard can switch between mock presentation and real saved-device behavior while the integration layer is still being built out.

### Changes

- Live Data Toggle: Fleet can now switch between placeholder presentation and live-mode behavior for testing.
- Better Empty States: when there are no saved printers, the dashboard can now present a cleaner live-mode starting point.
- Preview Improvements: the fleet preview better reflects the real shell and appearance settings while staying easier to compare during design review.

## v0.0.21 - 2026-06-24

### General Purpose

Lay down the first Bambu LAN printer connection scaffolding so real printers can begin replacing mock devices inside BambuView.

### Changes

- First LAN Printer Support: BambuView now has the first saved-connection plumbing for Bambu printers on the local network.
- Stronger Backend Foundation: the API, database, and provider layer were expanded so live printer records can be stored and queried.
- Fleet Readiness: the Fleet screen was updated so it can start hosting real saved printers instead of only static mock cards.

## v0.0.20 - 2026-06-24

### General Purpose

Refine the sidebar theming and self-hosted documentation while also adding the web-app assets needed to move BambuView closer to an installable PWA.

### Changes

- Polished Sidebar Theme: the shell styling received another pass to better match the approved straight-edge visual direction.
- PWA Foundations: BambuView now ships manifest and service-worker assets that move the web app closer to installable behavior.
- Cleaner Self-Hosting Docs: setup documentation was tightened so Docker Compose deployment reads more cleanly for new users.

## v0.0.19 - 2026-06-24

### General Purpose

Push the shell further toward the approved square-edged branding direction so the app feels less rounded and more intentional.

### Changes

- Straighter Visual Language: key shell surfaces were squared off to better match the approved art direction.
- Stronger Branding Match: the Fleet shell was adjusted so the overall look feels closer to the BambuView mockup set.
- Cleaner Page Consistency: supporting pages received styling updates so the straighter look carries across the app more evenly.

## v0.0.18 - 2026-06-23

### General Purpose

Refine the sidebar and default shell state so the main Fleet workspace gets more room and the layout feels cleaner on first launch.

### Changes

- Better Default Layout: the shell now opens in a state that gives Fleet more breathing room right away.
- Cleaner Sidebar Behavior: left-rail sizing and spacing were tightened so the navigation fits more naturally on desktop.
- Improved First Impression: the default app framing better matches the approved mockup without needing immediate manual adjustment.

## v0.0.17 - 2026-06-23

### General Purpose

Improve shell scaling and scrolling so the three-column dashboard behaves more like a real application and less like a static mockup.

### Changes

- Independent Scroll Regions: the main shell regions now behave more cleanly when panels grow taller than the viewport.
- Better Desktop Scaling: spacing and proportions were tuned so Fleet reads more naturally on large screens.
- Cleaner Layout Stability: the shell is less likely to feel cramped or drift out of proportion during navigation.

## v0.0.16 - 2026-06-23

### General Purpose

Tighten Fleet mockup fidelity by introducing richer visual assets and more accurate card presentation throughout the main dashboard.

### Changes

- Richer Mock Printer Cards: Fleet now includes stronger mock product imagery to better match the approved visual direction.
- Better Proportions: card spacing and layout details were tuned so the dashboard reads closer to the reference mockup.
- More Convincing Camera Area: the mock camera stage and related visuals were improved for better design validation.

## v0.0.15 - 2026-06-23

### General Purpose

Surface the app version inside the interface and tighten the Fleet presentation so each alpha is easier to identify during testing.

### Changes

- Visible Versioning: the current BambuView version now appears in the UI for easier alpha verification.
- Better Fleet Fidelity: layout and styling details were refined again to stay closer to the approved mockup.
- Cleaner QA Flow: testers can more easily confirm which build they are looking at without leaving the app.

## v0.0.14 - 2026-06-23

### General Purpose

Realign the Fleet shell with the approved mockup so the project starts moving from rough concept toward the chosen product direction.

### Changes

- Major Fleet Layout Refresh: the dashboard structure was rebuilt to better match the approved art direction.
- Better Typography and Spacing: the main shell received a large styling pass to feel more intentional and product-ready.
- Stronger Background Treatment: the visual atmosphere behind Fleet was improved so the app feels less flat.

## v0.0.13 - 2026-06-23

### General Purpose

Streamline revision deployment so shipping a new alpha is more repeatable from one release to the next.

### Changes

- Faster Release Flow: the repo now includes a more direct revision deployment script for recurring alpha pushes.
- Better Deployment Consistency: release handling was tightened so versioned updates are easier to run the same way each time.
- Cleaner Supporting Docs: setup and release guidance were refreshed to match the improved workflow.

## v0.0.12 - 2026-06-23

### General Purpose

Reduce styling drift and tighten the visual system after the first big shell pass so the app keeps moving toward the approved art direction.

### Changes

- Cleaner Theme Details: background art and visual treatment were simplified to better fit the chosen look.
- Better Style Consistency: the shell became more uniform after a pass on the shared art and CSS system.
- Easier Visual Review: the updated styling made it simpler to compare the live shell against the approved mockup set.

## v0.0.11 - 2026-06-23

### General Purpose

Introduce the first full BambuView logo asset set and align the shell around that branding so the project has a stronger visual identity.

### Changes

- Official Logo Assets: BambuView now includes full-logo, icon-only, and text-based SVG variants for the new brand direction.
- Better In-App Branding: the shell styling was adjusted to work more cleanly with the new logo set.
- Docs Branding Refresh: supporting docs now have the same BambuView identity applied more consistently.

## v0.0.10 - 2026-06-23

### General Purpose

Refine appearance presets and the desktop shell so theme controls feel more deliberate and the main layout is easier to review.

### Changes

- Better Appearance Presets: theme options were cleaned up so the style controls behave more consistently.
- Desktop Shell Cleanup: the app frame received another pass to reduce visual noise.
- More Predictable Styling: shared shell behavior became easier to reason about while reviewing mockup fidelity.

## v0.0.9 - 2026-06-23

### General Purpose

Tighten shell fidelity and expand the background-style treatment so the approved visual direction starts to feel richer in the live app.

### Changes

- Better Background Styles: the app gained improved visual effects that make the shell feel less flat.
- Stronger Fidelity: spacing, color treatment, and shell structure moved closer to the approved mockup.
- Cleaner Overall Polish: the desktop presentation became more consistent during side-by-side design review.

## v0.0.8 - 2026-06-23

### General Purpose

Bring the shell much closer to the approved mockup by reshaping the main navigation, layout, and shared presentation patterns.

### Changes

- Closer Mockup Match: the shell layout was updated to better follow the approved Fleet concept.
- Improved Theme Framing: appearance handling and shared shell components were refined together instead of separately.
- Better Desktop Presentation: the dashboard feels more like a cohesive app and less like a placeholder scaffold.

## v0.0.7 - 2026-06-23

### General Purpose

Improve image publishing reliability so new alpha builds are easier to pull regardless of which container registry you use during testing.

### Changes

- More Reliable Image Availability: release publishing was tightened so the server image lands in both configured registries more consistently.
- Cleaner Distribution Flow: alpha image delivery became less fragile during release automation.
- Easier Early Testing: testers are less likely to be blocked by a missing image after a fresh alpha tag.

## v0.0.6 - 2026-06-23

### General Purpose

Ship the first major Fleet refresh so the app starts resembling the approved dashboard direction instead of a bare scaffold.

### Changes

- Bigger Fleet Redesign: the Fleet screen received a major layout and styling overhaul.
- Better Shell Foundations: shared shell and appearance code were expanded so later design passes had a stronger base.
- Stronger Product Direction: BambuView began feeling more like a real dashboard and less like a raw prototype.

## v0.0.5 - 2026-06-23

### General Purpose

Make app state survive container restarts by supporting persisted SQLite storage for the early auth and settings foundation.

### Changes

- Persistent App Data: saved users, sessions, invites, and settings can now survive restarts more reliably.
- Better Self-Hosting Durability: Docker-based installs no longer feel as disposable between boots.
- Cleaner Storage Expectations: the docs and image setup now better reflect a persistent deployment.

## v0.0.4 - 2026-06-22

### General Purpose

Validate the packaged Docker image more carefully so early self-hosted installs are less likely to break after a release.

### Changes

- Safer Container Packaging: Docker image validation was tightened before release.
- Better CI Coverage: the pipeline now checks the packaged image more thoroughly during alpha prep.
- More Predictable Installs: early self-hosting became less guessy because the image build path was cleaner.

## v0.0.3 - 2026-06-22

### General Purpose

Fix the packaged container runtime so the first alpha server build can actually boot more reliably after installation.

### Changes

- Better Container Startup: the packaged server runtime was corrected so the image boots more cleanly.
- Cleaner Release Prep: release plumbing was simplified to avoid another broken runtime package.
- Improved Early Testing: testers have a more usable starting point for validating the hosted app shell.

## v0.0.2 - 2026-06-22

### General Purpose

Stabilize the first release and deployment flow so publishing a new alpha no longer depends on as much manual cleanup.

### Changes

- Better Release Prep: the release workflow was tightened after the first alpha push.
- Improved Deployment Script: Portainer-oriented deployment automation became more reliable for repeated tests.
- Clearer Docs Pass: setup and release notes were cleaned up to reduce confusion during early self-hosting.

## v0.0.1 - 2026-06-22

### General Purpose

Publish the first BambuView alpha baseline and make sure the server image is available from Docker Hub for self-hosted testing.

### Changes

- First Alpha Baseline: BambuView established its first tagged release foundation.
- Docker Hub Availability: the release image was mirrored so self-hosters could pull it from Docker Hub.
- Starting Point for Testing: this gave the project its first repeatable install target for the work that followed.
