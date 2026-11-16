# GestEra 0.3 status - 16 November 2026

## Verified

| Check | Actual result |
| --- | --- |
| npm test, Node 24 | 64 passed, 0 failed |
| npm run build | Strict TypeScript and Vite production build passed |
| Original 541-frame replay | 291 hand frames; 4 old palm-pause toggles versus 0 in active engine |
| Original ink traces | 3 strokes; buffered starts; opening trims 2 / 2 / 0 |
| Artificial pen-state cursor differential | 0 in same-frame check |
| Confirmation-frame motion | 8.00 / 4.14 / 8.00 reference pixels at 1440 x 900 |
| Three newer real replays | 2,471 frames; 2,062 hand-present; 129 two-hand |
| New replay safety | Finite cursors; zero single-hand undo/redo/page events |
| Frozen v0.2 comparison | Reproducible; counts in PRACTICAL_REPLAY_RESULTS.json |
| Evaluation CLI | All 730 frames in third newer file excluded as unlabeled; precision/recall unavailable |
| Calibration, synthetic | Rejects insufficient/noisy/overlapping/false-closed samples and invalid profiles; adapts pinch thresholds |
| Eraser, synthetic | Sparse/fast swept cuts, immutable survivors, dots, shape outlines, arrowheads, text, whole-object option, history restore |
| Zoom, synthetic | Noise dead zone, spread/pan response, captured controls, release safety, anchor preservation, zoom-limit recovery |
| Commands, synthetic | Resting fist unarmed, one-shot armed undo/redo, single-hand exclusion, writing exclusion, swipe cooldown |
| Async frame gate | One in-flight job; stopped results discarded; rejection releases gate |
| Worker static contract | Pinned classic SDK exposes expected MediaPipe namespace in Node VM |

## Not verified

- Live webcam accuracy, calibrated feel, handwriting quality, comfort and ergonomics on the user's hardware.
- New live FPS, inference/pipeline latency and camera-light teardown. No 30 FPS or accuracy percentage is claimed.
- Browser worker operation, GPU/CPU startup fallback, fullscreen, downloads, dialogs or physical dwell targeting. Desktop browser access timed out. Namespace testing is not a browser smoke test.
- Real precision/recall: every supplied newer frame is unlabeled. Filenames do not establish ground truth.
- Whether the new transform in session 3 is intended zoom; no human label exists.
- Physical left/right conventions, crossings and Swap hands behavior. Unit tests cover mapping/continuity logic only.
- Full manual regression of this bundle. The user reported manual v0.1 drawing/autosave/export good, not newly observed here.

The 8 px bound uses a fixed reference viewport; layout and zoom change board-world conversion. Buffered recovery is stored historical coordinates, not measured end-to-end ink delay. Synthetic geometry tests do not establish human accuracy.

No thresholds were fitted by assigning guessed labels to recordings. Real fixtures and frozen baseline sources are not imported into browser code. Complete UPDATE_INSTRUCTIONS.md before accepting the gesture phase and starting AI integration.
