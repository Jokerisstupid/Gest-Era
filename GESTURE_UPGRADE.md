# Gesture upgrade evidence — v0.2

Input: the user's `gestera-landmarks (1).json`, normalized into the regression fixture without its unused visibility fields. 541 frames, 291 hand-present frames, duration 24.1279 s. The separate 168-frame recording has zero hands and was excluded. Neither file provides human pose labels.

## Root causes confirmed

1. Frozen v0.1 CameraPanel logic reproduces four open-palm pause toggles. A natural one-hand hover was also treated as a command hand.
2. The old pen pipeline combines three-frame gesture stabilization with two skipped follow-up samples. The first dot is stored at pen-down, but the next line segment is delayed by 165.9–203.5 ms in this replay. This distinction matters: it is not correct to say that literally no sample existed until after both skipped points.
3. The old cursor switches from index tip to thumb/index midpoint on pen-down. The three actual replay starts have geometric offsets of 17.22, 24.89 and 26.05 old board pixels. Other reported 26–100 px figures were not reproduced under this exact start-frame definition and are not presented as our measurements.
4. The old video loop has its own slow-inference gate in addition to scheduling overhead. The new loop removes that gate and uses media frame timestamps. Its new live FPS is unmeasured here.
5. Handedness inversion cannot be established from a session containing only one hand. Current MediaPipe Tasks documentation refers to the subject's side and says mirrored *inference input* inverts the output; CSS preview mirroring is separate. The new selector uses that distinction, a Swap hands preference and sticky wrist matching, rather than blindly applying the legacy Hands convention.

## Same-session before/after

| Measurement | v0.1 replay | v0.2 replay |
| --- | --- | --- |
| Automatic pause toggles | 4 | 0 |
| Undo / page commands | 0 / 0 | 0 / 0 |
| Ink stroke count | 3 | 3 |
| Artificial mode-change anchor offset | 17.22–26.05 board px | 0 in same-frame state differential |
| Two follow-up samples skipped after pen-down | Yes | No |
| Opening samples trimmed on release, per stroke | None | 2 / 2 / 0 |
| First stored sample compared with old replay | Baseline | 174.3 / 239.4 / 256.2 ms earlier |

New confirmation-frame cursor displacements are 8.00 / 4.14 / 8.00 px in a fixed **1440 × 900 reference viewport**. The transient guard applies on confirmation, not as a general writing-speed limit. A responsive canvas, current zoom, and screen dimensions change the conversion to board-world coordinates. No universal <=8 board-pixel claim at all zooms is made.

The buffered first samples are 121.9 / 183.9 / 195.0 ms before their new confirmation events. These are restored historical coordinates delivered once the two-frame close is confirmed. They are not a claim of zero visual delay or measured end-to-end latency.

The hand-present adjacent-frame interval distribution has median 16.31 FPS and p05 13.70 FPS. The user's screenshots separately show instantaneous 20 FPS and 39–50 ms inference time. Those observations describe the old recording/build; they do not benchmark the new callback loop.

## What actually ran

- `npm test`: 39 passed, 0 failed. The original 8 tests remain; old gesture helper tests are explicitly identified as baseline-only.
- `npm run build`: strict TypeScript and Vite production build passed.
- `npm run replay:gestures -- tests/fixtures/user-session.json`: before/after state, events and retained sample timestamps generated the adjacent JSON report.
- `npm run eval:gestures -- tests/fixtures/user-session.json`: printed a confusion matrix and correctly reported precision/recall unavailable because labeled support is zero.

Synthetic unit inputs test joint angles, hand identity, command gating, two-hand scale/pan, swipes, peace erasing, onset buffering, release trimming, lost-frame/teleport boundaries, dwell latching and shape geometry. They are explicitly labeled synthetic and do not establish real-world pose accuracy.

## Manual validation still required

Use UPDATE_INSTRUCTIONS.md. In particular, live cursor targeting, the newly requested camera rate, confidence across pose transitions, left/right conventions with two physical hands, shape snapping, native browser exports/fullscreen, and camera shutdown need hardware/browser verification. The camera source still performs synchronous model inference; removing the additional throttle cannot guarantee 30 FPS when inference itself takes 40–50 ms.

References used for implementation:

- [MediaPipe Tasks output and handedness](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker#task-output)
- [Video frame callback timing](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)

Full per-stroke timestamps and definitions: `GESTURE_REPLAY_RESULTS.json`.
