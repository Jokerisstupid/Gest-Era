# GestEra 0.4

A local notebook workspace with a gesture-controlled whiteboard. Organize subjects into notebooks, topics into sections, and notes into named pages. The organization follows OneNote's notebook / section / page model; this is not a Microsoft account or OneNote cloud connection.

Live app: https://gest-era.vercel.app

## Start locally

Node 24 is the tested runtime.

```powershell
npm.cmd ci
npm.cmd run setup:vision
npm.cmd run dev -- --port 5173 --strictPort
```

Vision setup copies the pinned SDK/WASM and downloads the official hand model. Vercel runs setup before the production build. Notes and camera processing stay on your device; moving from localhost to the deployed origin requires exporting/importing an editable backup.

## Notebook organization

Create or rename notebooks from the library. Open one to add or rename sections and pages, search page titles and typed notes, move pages between sections, reorder/duplicate pages and export a backup. Swipes and previous/next navigate the ordered pages of the current notebook. Section and page organization participates in Undo/Redo. Empty sections show an explicit empty view so another section's page cannot be edited accidentally.

Legacy board backups remain accepted. Schema 1 boards acquire a default Notes section and page titles while preserving identifiers and drawing content. New exports use schema 2 to preserve notebook organization and prevent older importers silently dropping it. Storage remains in the existing IndexedDB database. Notebook name changes autosave; history snapshots cover sections/pages and board edits.

## Calibrate before air writing

Start the camera, choose Calibrate, and measure an open hand followed by a closed thumb/index pinch. Each stage requires at least 40 valid samples and a steady capture interval. Tracking gaps pause or restart sampling, moving wrists restart the sample, and two-hand/wrong-pose inputs do not teach thresholds.

Next perform three deliberate open, pinch and release cycles. Only then choose Use verified profile. “Verified” refers to these observed cycles, not an accuracy percentage. Profiles are local and checked against camera identity/aspect. Another camera setup uses defaults with a recalibration hint. Legacy profiles are retained and can be upgraded by rerunning setup.

## Gesture controls

| Task | Interaction |
| --- | --- |
| Hover | Point or open palm; palm alone never pauses |
| Ink | Pinch thumb/index; release to stop |
| Erase | Drawing-hand peace held for at least 100 ms, or Eraser plus pinch-drag |
| Colors / width / shapes | Pinch-click or 0.8-second dwell on marked controls |
| Move object | Select tool, pinch and drag |
| Shape fitting | Enable Shape snap, draw and hold still for 0.6 seconds; off by default for new users |
| Undo / Redo | Arm other open palm, then hold fist / peace for 0.8 seconds |
| Zoom / pan | Confirm pinches with both hands, spread/close or move together |
| Page navigation | Arm other palm then swipe; or page buttons |
| Presentation | Red laser and the same page navigation gate |

One hand always draws unless recent tracking indicates that only the other hand remains; this short ambiguity window ends ink instead of immediately handing over. Direct commands require a clearly tracked second hand. A short peace transition cannot start erasing. Large isolated fingertip jumps accompanied by implausible projected bone changes end ink and require release. This is not a general writing speed cap.

Camera controls show processed FPS, camera FPS, inference and pipeline time, and Worker/Compatible GPU/CPU backend. Camera and recording expands advanced controls. Recording freezes the effective tracking settings and excludes unlabeled frames from evaluation. Pending permissions time out with guidance; cancellation also stops a camera granted late.

## Checks

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run replay:gestures -- tests/fixtures/user-session.json
npm.cmd run replay:practical -- --save
npm.cmd run eval:gestures -- path/to/recording.json
```

88 local tests passed with private real fixtures; strict TypeScript and production build passed. Public checkouts explicitly skip the real-recording cases when their private fixtures are absent. Existing recordings are unlabeled and cannot establish real precision/recall. No new hardware FPS or human accuracy percentage is claimed.

The responsive review page at /layout-review.html embeds the actual app at 320, 390, 820 or 1280 CSS-pixel widths. It is a developer review aid, not a device performance simulator. See BUILD_STATUS.md for observed UI checks and remaining physical tests; UPDATE_INSTRUCTIONS.md contains the acceptance script.

## Architecture and next phase

See NOTEBOOK_ARCHITECTURE.md. Gesture logic and calibration collection are pure TypeScript. Camera capture/inference, DOM targeting, drawing, storage and organization are separate adapters/modules. IndexedDB, PNG/PDF/editable exports and mouse/touch/pen input remain.

AI is still disconnected. Server-side AI, Microsoft/OneDrive sync, collaboration, handwriting search, infinite pages, voice, PWA, and study workflows are separate future work. Complete live gesture acceptance before adding AI.

Reference: https://support.microsoft.com/en-us/onenote/onenote-help-and-learning/navigate-your-notes-with-onenote
