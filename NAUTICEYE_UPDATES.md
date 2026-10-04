# NauticEye frontend update

This build adds the second-pass prototype improvements requested for the SIH demonstration.

## Investigation workflow
- Connected incident selection, vessel selection, track highlighting and replay controls.
- Added a four-card evidence strip for SAR, vessel correlation, closest approach and evidence posture.
- Added an investigation progression/status rail.
- Added a one-click Replay Investigation action that selects the current top-ranked vessel, rewinds to the beginning of the 56-hour window and runs the existing replay engine.
- Added a replay-stage banner over the map.

## Analyst presentation
- Added vessel operational details: last AIS time, vessel type and flag.
- Added an illustrative Drift Analysis panel with explicit disclosure that it is placeholder data and not an origin model.
- Added system health indicators showing SAR/AIS/correlation/map services and a simulation data-pipeline label.
- Kept the responsibility disclaimer: correlation is an investigative lead, not proof.
- Preserved the existing HTML/JSON/CSV/GeoJSON export workflow.

## Existing requested fixes retained
- 1x/2x/3x playback.
- Low-bandwidth naming and return navigation.
- Removed satellite layer control from the map layer list.
- Acquisition + changed to x.
- Green resolved status.
- Wider initial India/Arabian Sea view.
- Arabian Sea label positioning.
- Detection time in incident metrics.
- Working key-vessel/highlight/closest-approach controls.
- Higher-authority alert simulation.

## Verification
The source was syntax-checked with the available TypeScript compiler. A full Next.js production build could not be run in this environment because the project dependencies were not installed and the environment could not reach the npm registry. Run `pnpm install` and then `pnpm build` locally/CI before deployment.

## Smoothness pass
- Added `public/ship.png` (top-down container ship) and switched the vessel marker to use it.
- Ship no longer disappears after step 2: it stays on the map, and after the sinking it fades to a ghosted "last AIS position" marker with a slow ripple.
- Map layers are now updated in place by a requestAnimationFrame loop that eases toward the playback clock, so the ship, track and oil glide instead of jumping.
- Oil drift rebuilt: persistent particles (no per-tick rebuild), continuous plume with a leading edge, gentle turbulence and shimmer, and a smooth growth curve instead of three fixed scales.
- SAR acquisition ring/label now actually appears during step 3 (it was previously gated behind step 4).
- Track, oil, SAR ring and incident footprint fade in/out instead of popping at stage boundaries.
- Playback pauses briefly at each stage, then continues automatically (`STAGE_DWELL_MS` in `console.tsx`; set to 0 for the old manual-press behavior).
- Tick rate raised to 20 Hz on full-capability devices.
- Not built locally: run `pnpm install && pnpm build` to verify.

## Public-facing polish pass
- Ship is much smaller and scales with map zoom; new white/navy hull artwork reads clearly on the light map.
- Brighter ocean basemap, bold place labels, high-contrast scale bar and warmer, more saturated oil/detection colours.
- SAR scan is now a radar-style sweep with expanding pulse rings, a progress bar and a cross-fading caption. It contracts (lock-on) onto the slick and settles into a persistent, breathing detection zone with corner brackets.
- Spill: ripples from the wreck point, soft-edged oil body, constantly drifting particles (moves even while paused), animated dashed footprint that grows in.

## SAR feed polish + detection highlight + location dashboard
- SAR view (`components/nauticeye/sar-view.tsx`) now redraws its backscatter texture once a second so the feed reads as a live sensor instead of a static frame (skipped for miniatures, lightweight mode, and `prefers-reduced-motion`). The deterministic contour/footprint is untouched.
- SAR view flashes a one-shot "OIL SLICK DETECTED" highlight the moment the panel shows the segmentation/mask view — on first mount and whenever `VIEW RAW` is toggled back to `SHOW MASK`.
- Map scan effect (`components/nauticeye/intelligence-map.tsx`): the settled detection zone now has a continuous once-per-second sonar-tick ring for the same "live instrument" feel, plus a one-shot bright flash on the zone and the "OIL SLICK DETECTED" tag text the instant that stage is reached during replay (re-arms if you scrub back past it and forward again).
- New Location accuracy dashboard (`LocationDashboard` in `components/nauticeye/investigation-hud.tsx`, wired into the Analysis panel's Details tab): shows the AI-detected SAR coordinate side-by-side with a simulated "verified reference" coordinate, the offset distance/bearing between them, and an agreement badge. The verified point is a deterministic simulated offset (`verifiedLocation` in `lib/nauticeye/engine.ts`) since the dataset only carries one location per spill — there is no second real sensor in this demo.
- Not built locally: dependencies aren't installed in this environment (no network access), so run `pnpm install && pnpm build` to verify before shipping.

## Route + camera fix
- Ship track now stays offshore (it previously started over the Kerala mainland).
- Oil/track layers freeze while Leaflet is zooming, and resize is deferred until the zoom ends. This removes the flicker/jump when the map zooms at the final steps.
- The camera only moves for deliberate navigation, no longer when playback or scrubbing auto-selects the vessel.

## Ship stays visible + no text over the vessel
- Cause: the incident pin ("01" in an opaque circle) sat exactly on the wreck point, which is where the ship stops, and was layered above it, so the ship looked like it vanished when the spill appeared.
- Ship now always renders above every overlay (pin, SAR scan, spill ripples) and is only lightly ghosted after the sinking.
- Incident pin is offset up-right of the wreck with a short leader line, so its text never covers the hull.
- Incident card placement now uses its exact rectangle, re-checks on zoom, and moves if a ship would be under it.
- SAR caption flips above/below the detection zone if the ship or incident card is in the way; map place names fade out if the ship passes under them.
- Not built locally (no node_modules/network): run `pnpm install && pnpm build`.
