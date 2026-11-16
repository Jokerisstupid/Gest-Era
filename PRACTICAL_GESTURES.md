> Historical 0.3 notes. For the current notebook and verified calibration flow, use README.md and UPDATE_INSTRUCTIONS.md.

# Practical gesture upgrade - 0.3

## Personal setup

Choose **Calibrate pinch** in the camera panel. Show a relaxed open hand, then touch thumb/index tips. Each stage gives a short pose-change grace period and collects real frame samples, at least 24 per pose. Overlapping/noisy measurements request a retry and leave the previous profile intact.

The profile controls writing thresholds, anchor blending and two-hand entry/release. It stays local and is included in recording metadata. Reset or recalibrate if the camera position changes substantially. Calibration cannot compensate for obscured fingertips or establish accuracy.

Choose Balanced first. Precise steadies small writing; Fast follows movement more closely. Rest an elbow and use front lighting. Turn off Shape snap when comparing handwriting.

## Recoverable editing

Pinch-click or dwell 0.8 seconds on marked controls. A control crossing stops ink; held pinch cannot reconnect without release. Dwell movement latching prevents a new Delete confirmation inheriting a stationary dwell.

For Undo/Redo, relax the drawing hand. Open the other palm for roughly 0.35 seconds including visibility confirmation, then hold its fist (Undo) or peace (Redo) for 0.8 seconds. Reopen to arm another hold. A resting fist or single-hand fist cannot trigger Undo. Single-hand users reach large Undo/Redo buttons.

An armed other palm can swipe pages. Swipes are suppressed while writing, paused or over UI, with 800 ms cooldown. Add a second page before testing. Presentation uses the same gate.

## Erasing

Peace on the drawing hand is temporary erase. Choosing Eraser then pinching is an alternative. Properties offer 12/24/40 screen-pixel radii and Precise cuts / Whole object modes.

Precise mode splits freehand strokes at swept capsule intersections and erases between hand samples, preserving surviving fragments. A held erase records one history step. Shape outlines/arrowheads are checked separately; empty space inside an outline does not delete it. Text and geometric shapes erase as complete objects. Curve rendering and eraser intersections use sampled geometry, so very sharp smoothed corners may show a small discrepancy.

## Two-hand zoom

Pinch both visible hands and hold briefly. Three observations confirm intent. Entry is more forgiving than writing entry; release uses hysteresis. The capture follows wrists, filters distance/midpoint and ignores small stationary noise.

Spread/close to zoom; move together to pan. Absolute session scale prevents accumulated scale error after hitting 300%. Capture continues over controls. Release either hand to end; release remaining pinch before drawing again.

## Capture diagnostics

The camera requests ideal 30 FPS and uses video-frame callbacks with media timestamps. Inference attempts a worker with GPU, then CPU, before compatible main-thread startup fallback. The pinned classic SDK is self-hosted. One in-flight inference prevents stale queues. Late stopped results are ignored; cleanup stops tracks. A stalled worker requests restart.

Processed fps, camera fps, model ms and full pipeline ms are separate measurements. Pipeline includes bitmap preparation, inference, transport and result receipt. Backend shows Worker GPU/CPU or Compatible GPU/CPU. Moving inference to a worker can reduce UI blocking; it does not make slow model computation intrinsically faster. Live values are unmeasured here.

## Reproducible evidence

| Recording | Frames | Hand frames | Two-hand frames | Human-labeled |
| --- | ---: | ---: | ---: | ---: |
| gestera-labeled-landmarks.json | 1,210 | 935 | 0 | 0 |
| gestera-labeled-landmarks (1).json | 531 | 480 | 1 | 0 |
| gestera-labeled-landmarks (2).json | 730 | 647 | 128 | 0 |

npm run replay:practical -- --save compares archived v0.2 with active source. The first two event traces are unchanged with default thresholds. In the third, ink starts change from 10 to 9 and one two-hand session emits transform-start plus an update. No single-hand commands or non-finite cursors appear. These are event observations, not labeled success rates.

Original 541-frame regression also passes. GESTURE_REPLAY_RESULTS.json compares with v0.1. Peak full-session hand movement in the practical report is not the same as the pen-state-induced anchor offset.

The recorder now requires a pose label or explicit Free session selection. Use unlabeled during transitions. Record separate stable holds and clearly defined swipe/zoom episodes. Evaluate a separate session with npm run eval:gestures -- <file>. The CLI uses saved calibration/settings and prints frame confusion matrix and support/precision/recall; swipe frame recall is not episode success.

64 tests and production build passed. Physical accuracy, worker compatibility, live FPS, visual browser interactions and ergonomics remain unverified. Complete the manual test before accepting gestures or starting AI.
