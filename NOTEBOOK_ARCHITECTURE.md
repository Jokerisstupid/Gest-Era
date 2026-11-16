# Notebook and gesture architecture

## Organization model

| Concept | Implementation | Persistence |
| --- | --- | --- |
| Notebook | Existing Project entity and notebook library | Existing IndexedDB projects store |
| Section | Ordered id/name/color metadata within a notebook | Project.sections |
| Page | Named canvas, section reference, paper and objects | Project.pages |
| Content | Pen/highlighter strokes, shapes and text | Page.objects |
| History | Immutable sections/pages snapshots | In memory while notebook is open |
| Personal gesture profile | Measured thresholds plus camera/aspect binding | Browser settings; recording metadata when used |

The OneNote reference is the organizational model, not Microsoft software internals or a Graph API integration. No Microsoft sign-in, OneDrive sync or cross-device collaboration is implemented. Pages keep the existing 1440 by 900 drawing world and pan/zoom; they are not infinite OneNote pages.

## Compatibility and state

normalizeNotebook adds stable default organization to schema 1 boards without touching object coordinates or object identities. Reads normalize in memory; saving writes schema 2. The database name/store remain unchanged. Import validation accepts old boards and validates unique page/section ids, section references and bounded counts. New backups retain titles and sections; older schema-1-only importers reject the new version.

Section/page mutations live in engine/notebooks.ts. The editor records sections and pages together, commits any active edit before history/navigation, and preserves page identity across move/reorder/undo. Empty section views block the former canvas. Clearing an entire notebook still requires an explicit UI confirmation.

## Input pipeline

1. CameraTracker requests video and tracks lifecycle. Pending permissions have a deadline and late grants are stopped after cancellation.
2. The inference backend attempts a classic MediaPipe worker with initialization fallbacks. FrameGate allows one in-flight job and discards stopped results.
3. Pure feature extraction uses normalized landmarks/joint angles. Identity matches wrists, including a short ambiguity gate when the draw hand disappears but the other remains.
4. The pure step function applies intent hysteresis, continuous anchoring, timestamp filtering, buffering, release trimming, tracking guards and command gates.
5. CameraPanel routes the whole-window cursor to marked DOM controls or the actual canvas transform. Page changes reset intent without restarting camera acquisition.
6. Board draws midpoint-smoothed ink and commits to the current page. Precise swept erasing and viewport transforms have independent geometry modules.

## Calibration pipeline

calibration-session.ts collects only valid single-hand pose samples after settling. A brief missing frame pauses accumulation; a longer loss or a changed wrist position resets the sample. At least 40 samples plus a valid interval are needed per pose. calibration.ts rejects noisy or overlapping distributions and calculates hysteresis thresholds. A second pure state machine checks three confirmed open/pinch/release cycles before the UI can save a version-2 profile.

A verified profile is matched to the camera/aspect. Existing legacy profiles remain usable; changing camera setup falls back to defaults and displays a recalibration hint. Calibration does not estimate gesture accuracy, learn peace/fist poses or promise a target FPS.

## Responsive interaction

Desktop uses a persistent notebook pane when space allows. Narrow layouts use a section/page drawer, horizontal tool rail, compact camera panel and scrollable properties. Hidden mobile navigation is inert. Main icon controls have accessible names, and marked gesture targets retain large hit areas. New users start with shape snapping off to protect handwriting intent.

The separate layout-review.html page renders the real app in fixed-width frames for browser QA. It does not mock the app or benchmark physical devices.

## Current boundary

The release is a local notebook and gesture whiteboard. AI integration remains behind the acceptance milestone. The source contains an assistant setup placeholder, not a working AI provider, math checker or quiz generator.
