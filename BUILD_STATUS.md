# GestEra 0.4 validation status

Date: 16 November 2026. This status describes implementation and observed checks, not a claim of perfect real-world accuracy.

## Verified

- 88 automated tests passed locally with the private fixtures present; strict TypeScript and Vite production build passed.
- Legacy notebook normalization, schema-1 import compatibility, schema-2 round trips, section/page references, move/reorder/duplicate, last-page guards, search and history snapshots have unit coverage.
- Calibration has synthetic tests for valid accumulation, settling, missing frames, long gaps, wrong/two-hand poses, moving wrists, three-cycle verification and camera/aspect compatibility.
- Gesture tests cover brief peace exclusion, isolated fingertip discontinuities, whole-hand movement, short draw-hand handover ambiguity, and the existing onset, release, command, transform and UI timing regressions.
- Camera request tests cover successful permission, cancellation with a late grant, and permission deadline with late-stream cleanup.
- Original 541-frame replay still produces no automatic pause/undo/page actions. Additional three real sessions still replay with finite cursors and no single-hand undo/redo/page events. No human labels were inferred.
- Live browser checks observed notebook creation, adding/renaming a section/page, manual shape drawing, page move, undo of move, persisted content after reload, section switching and empty-section feedback.
- The actual app was rendered in 320, 390 and 820 CSS-pixel review frames with matching document/scroll widths; desktop layout was inspected at the browser's 1280-pixel viewport. These are browser layout checks, not physical-device tests.
- Camera Start/Stop UI was exercised while permission remained pending. Tracking FPS and actual webcam inference were not observed.

## Needs live acceptance

- Physical pinch writing accuracy, eraser intent, peace/fist/swipe classification, hand crossings, occlusion and fatigue across users.
- New camera/processed FPS, inference/pipeline latency, actual worker/GPU/CPU behavior and camera-light shutdown on hardware.
- End-to-end calibration with real poses and the final three verification cycles.
- Physical mobile touch/stylus use and a broader browser/accessibility pass; responsive review frames do not establish device compatibility.
- Native export/fullscreen behavior across browsers and sustained large-notebook performance.

Existing recordings are unlabeled: no precision/recall or accuracy percentage is available. Synthetic tests are explicitly labeled and are not substituted for real evidence. Camera rate remains an ideal request, not a 30 FPS guarantee. Private fixtures are excluded from Git and are not bundled into the browser app.

Complete UPDATE_INSTRUCTIONS.md before accepting gestures and moving to AI. The Vercel production deployment and current commit are available through the project/GitHub history; deployment status must be checked independently of these local test results.
