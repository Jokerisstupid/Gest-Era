# GestEra 0.3 - Practical gesture controls

Local-first whiteboard with camera, mouse, touch, and pen input. This release adds personal pinch calibration, precise erasing, guarded Undo/Redo, steadier two-hand zoom/pan, and a worker inference path. AI remains a later phase.

## Run

Node.js 24 is the tested runtime. From the folder containing package.json:

```powershell
npm.cmd ci
npm.cmd run setup:vision
npm.cmd run dev -- --port 5173 --strictPort
```

Use the same browser and origin as before to access existing IndexedDB boards. setup:vision copies pinned SDK/WASM assets and downloads the official model. If the model is absent, the loader uses Google's hosted model and needs internet. Frames are processed on your device.

Existing installation: replace matching files including public, scripts and tests; keep node_modules and the downloaded model. Dependency versions are unchanged. See **UPDATE_INSTRUCTIONS.md**.

**Start the camera, then choose Calibrate pinch.** Record an open hand and a closed thumb/index pinch and save your profile. The wizard uses actual frames, rejects overlapping/noisy samples, and persists valid thresholds locally. Calibration adapts geometry; it does not estimate accuracy.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run replay:gestures -- tests/fixtures/user-session.json
npm.cmd run replay:practical -- --save
npm.cmd run eval:gestures -- "C:\path\to\gestera-labeled-landmarks.json"
```

## Controls

| Action | Gesture or hand-cursor control |
| --- | --- |
| Hover | Open palm or index point; no palm-triggered Pause |
| Write / draw | Thumb and index pinch; release to stop |
| Precise erase | Drawing-hand peace; or choose Eraser and pinch-drag |
| Eraser size / whole-object mode | Tool properties, large buttons |
| Color / thickness / paper | Tool properties, pinch-click or 0.8-second dwell |
| Rectangle / ellipse / triangle / line / arrow | Choose Shapes and shape, then pinch-drag |
| Shape fitting | Enable Shape snap, draw, hold still 0.6 seconds, release |
| Move an object | Select tool, pinch object and drag |
| Undo | Open other palm briefly to arm, then hold its fist for 0.8 seconds |
| Redo | Open other palm briefly to arm, then hold its peace for 0.8 seconds |
| Zoom / pan | Pinch both hands, spread/close or move together |
| Previous / next page | Open other palm briefly, then swipe horizontally; or page buttons |
| Pause / Resume / Export / Present / Clear | Marked controls; Clear requires a separate confirmation |

One hand always draws and can reach commands through the whole-window cursor. Direct commands require a clearly tracked second hand. Guarded commands are enabled by default: a resting fist never arms Undo; reopen the other palm for another hold. Swipes are blocked during writing with an 800 ms cooldown. Presentation uses a red laser and the same swipe gate.

## What changed

- Personal thresholds complement two-frame close confirmation, immediate release hysteresis, buffered beginnings and opening-tail trimming. Hover and ink share a continuous cursor anchor. Tracking loss, jumps and UI crossings end ink safely.
- Precise erasing cuts touched portions of freehand strokes, including between sparse samples. Surviving fragments remain editable. One held erase is one undo step. Shapes erase by outline contact; text remains a complete object. Whole-object mode is available.
- Two-hand zoom confirms intent, filters distance/midpoint and ignores small noise. Capture continues over controls. Absolute session scale prevents drift when reaching a zoom limit.
- Inference attempts a classic worker, GPU then CPU, with a compatible main-thread startup fallback. Only one frame is in flight. Stopped results are discarded; a stalled worker requests restart.
- Diagnostics show processed FPS, camera FPS, inference time, pipeline time and actual backend. Requesting 30 FPS is not a performance guarantee.
- Recording requires a pose label or explicit Free session selection. Every frame saves its label and settings/profile. Evaluation uses recorded settings and excludes unlabeled frames.

## Evidence and limits

Verified here: **64 tests**, strict TypeScript, production build, original 541-frame regression and three newer real-session replays totaling **2,471 frames**, including 129 two-hand frames.

The original session reproduces four old palm-pause toggles versus zero in the active engine. Same-frame pen-state cursor differential is zero; confirmation motion is 8.00 / 4.14 / 8.00 reference pixels at 1440 x 900; release trimming removes 2 / 2 / 0 samples. These are defined replay measurements, not zero perceived latency or universal board-pixel bounds.

Every newer frame is **unlabeled** despite the filenames. The first two event traces match v0.2. The third emits one transform session instead of one short ink trace. That is an observed change, not proof of intended zoom. PRACTICAL_REPLAY_RESULTS.json and frozen tests/baseline-v02 sources make the comparison reproducible.

Not verified here: physical accuracy, new live FPS/latency, browser worker operation, camera light shutdown, visual UI interactions and ergonomics. Desktop browser access timed out. Synthetic tests are explicitly identified and are not real accuracy evidence. Test fixtures are not imported into the browser bundle.

See **BUILD_STATUS.md**, **PRACTICAL_GESTURES.md**, and the historical **GESTURE_UPGRADE.md**.

## Existing board and next phase

Dashboard, templates, IndexedDB autosave, history, PNG/PDF/editable export and manual input are retained. Old board files remain accepted. The user reported v0.1 manual drawing/autosave/export working; the updated bundle still needs a fresh manual pass.

No AI requests are sent. Complete live gesture acceptance before server-side AI integration.

## Code map

src/engine/gestures: pure features, identity, filters, calibration, command gates, shape fitting and frame-state transitions. erase.ts: swept cuts. vision.ts, vision-backend.ts, frameGate.ts and public/mediapipe/hand-worker.js: capture/inference/cleanup. CameraPanel, HandCursor, GestureCalibration and gestureUI: routing and feedback.

## Deploy to Vercel

Import Jokerisstupid/Gest-Era with the Vite preset, repository root, npm run build and dist output. vercel.json handles board deep links without rewriting model/WASM assets. No API keys are needed. Raw camera fixtures are excluded from Git; their regression cases explicitly skip without local copies. Saved localhost boards do not automatically move to the deployment origin; export/import editable backups to transfer them.
