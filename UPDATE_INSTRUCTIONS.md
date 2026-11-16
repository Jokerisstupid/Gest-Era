# GestEra 0.4 live acceptance

Open https://gest-era.vercel.app in the same browser as your existing notebooks. The current workspace uses notebooks, sections and named pages. Old boards open in a Notes section; raw ink is retained. Export an editable backup before moving between browser origins. New schema-2 backups require the updated app to preserve organization.

## Set up the camera

Create a disposable review notebook. Start air writing, grant camera access and choose Calibrate. Show only your drawing hand and rest your wrist. Measure an open hand, then a closed thumb/index pinch. Progress reflects real valid samples. A short loss pauses; sustained loss or wrist movement restarts the current stage.

Perform three deliberate open/pinch/release cycles and choose Use verified profile. A verified label means those cycles were detected; it is not an accuracy score. Changing camera setup may require recalibration. Start with Balanced and keep Shape snap off for handwriting. Camera and recording reveals smoothness, hand swap, device selection, backend/timings and recorder controls.

## Numbered review script

1. Create a notebook, a section and two named pages. Rename/reorder/move a page, undo and redo, then reload. Check both organization and drawings survive. An empty section must show an empty view rather than allowing edits to the previous page.
2. Hover one open palm and one fist separately for ten seconds. Neither may pause, undo or change pages. Write your name, dots and loops; release and reacquire your hand. Check starts, tails, readability and disconnected strokes.
3. Briefly pass through peace, then deliberately hold peace and erase part of a long line. The brief transition must not erase. A held erase should cut the touched region and undo in one step. Try size/whole-object options.
4. Change color/thickness by dwell and pinch-click. Cross over controls while pinching; ink must stop and must not reconnect without release. Check confirmation dialogs do not inherit the original stationary dwell.
5. Choose each shape and pinch-drag it. Use Select to move it. Enable Shape snap explicitly, draw a simple shape and hold still; verify one history step. Turn snapping off and compare handwriting again.
6. Show both hands. Arm the other palm, then hold fist for Undo; reopen, hold peace for Redo. Try drawing-hand loss, overlap and hand swap. Ambiguous tracking should end ink instead of drawing a stray connection.
7. Confirm both pinches for zoom/pan. Hold still, hit the zoom limit and return. Release before drawing again. Add two pages and swipe the other armed palm. Swipes must be ignored during ink; presentation should use a red laser and the same page gate.
8. Test at phone/tablet/desktop widths, including the drawer, properties, horizontal tool rail and camera controls. /layout-review.html renders the actual app at fixed widths for review. Real phone touch, camera and performance still require a physical device.
9. Check manual drawing, autosave, PNG/PDF/editable export and import. Test camera denial, pending permission, Pause/Resume, hide/restart and Stop. Physically check the camera light turns off. A late permission grant after Stop must not leave a stream running.

## Return evidence

For failures, give steps, expected/actual behavior, repeat count, active tool, one/two hands, settings, browser/OS/camera and lighting. Record actual processed FPS, camera FPS, inference ms, pipeline ms and backend during writing and two-hand use. The old screenshots are not a benchmark of this release.

Record short labeled pose samples; choose unlabeled during transitions or explicit Free session mode. Tracking settings stay fixed while recording. Keep webcam recordings private and out of the public repository. Evaluate a separate session from the one used for tuning:

```powershell
npm.cmd run eval:gestures -- path/to/recording.json
```

Local setup uses Node 24: npm.cmd ci, npm.cmd run setup:vision, npm.cmd test, npm.cmd run build, then npm.cmd run dev -- --port 5173 --strictPort. Public clones skip private real-recording tests unless the files are supplied locally.
