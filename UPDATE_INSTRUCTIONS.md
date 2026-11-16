# Install the GestEra 0.3 gesture update

1. In the running VS Code terminal, press **Ctrl+C** to stop the old dev server.
2. Extract the updated archive and replace matching project files in your existing `GestEra-core` folder. The project root is the folder containing `package.json`. Include the updated `public`, `scripts`, `src` and `tests` folders, especially `public/mediapipe/hand-worker.js` and `vision_bundle.js`. Keep your existing `node_modules` and `public/mediapipe/hand_landmarker.task`; dependency versions did not change. The `tests` folder is required for `npm test`. Export an editable backup of important boards before testing.
3. In that folder's terminal, run:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run dev -- --port 5173 --strictPort
```

Fresh extraction without dependencies: run `npm.cmd ci` first. If you need the self-hosted camera model, run `npm.cmd run setup:vision` with internet access.

4. Open **http://127.0.0.1:5173** in the same browser used previously. Refresh the tab. Keeping the same origin lets the existing browser-stored boards remain available.

# Numbered manual camera test

Use a blank page and start air writing. Choose **Balanced**, then **Calibrate pinch** in the camera panel. Record an open hand, record a closed thumb/index pinch, and choose **Use my profile**. Retry if the wizard reports overlap/noise; no drawing or commands should occur during setup. Turn Shape snap off while comparing handwriting. Use front lighting. Check the HUD names the pose, state, active hand, and reason it is not writing. Compact preview reduces the panel size. The camera panel scrolls if your window is short; mouse/trackpad can reach setup options.

1. **Write your name.** With only one hand visible, hover with an open palm for 10 seconds: it should never pause or undo. Point to the paper, pinch and write “Atta Muhammad,” then release. Repeat small loops and dots. Check the first letter starts correctly, releases do not leave a long tail, and lifting/leaving the frame never joins disconnected strokes. Try Precise and Fast and compare the measured FPS/inference readouts; do not treat the requested 30 FPS as a measured result.
2. **Erase and restore.** Draw a long line, hold up index and middle fingers (peace), and cross its middle. In Precise cuts mode only the touched section should disappear; surviving fragments remain. Try 12/24/40 px and Whole object in properties. Lower the fingers: erasing stops. A single Undo should restore the entire held erase; Redo reapplies it. With two hands visible, relax the drawing hand, show the other open palm briefly, then hold its fist for 0.8 seconds for Undo. Reopen it, then hold peace for Redo. A resting fist must never undo on its own. The rail Eraser plus pinch-drag should work too.
3. **Change color by dwell.** Open tool properties with the color-circle button. Move the hand cursor to a color and hold it there for 0.8 seconds. Watch the progress ring complete once. Move back to the paper, release any pinch, and draw in the new color. Repeat with a pinch-click and change thickness using the large +/− buttons. Verify hovering over controls never leaves ink.
4. **Draw a rectangle.** Choose Shapes, then Rectangle in properties. Pinch on the paper, move diagonally, release. Choose Select, pinch the shape and move it. Then choose Pen, draw a rough closed rectangle, hold still for 0.6 seconds and release: if its fit is accepted it becomes one shape. Undo should remove that single new shape. Try line, arrow, ellipse and triangle. Complex handwriting should remain ink; turn snapping off in Settings for the name-writing comparison if needed.
5. **Zoom with two hands.** Show both hands clearly and pinch both briefly until the HUD says zoom/pan. Spread/close; move both together to pan. Hold stationary and watch for unwanted drift. Reach 300%, then return your hands to their starting distance: the zoom should return to its session starting value. Move across a control while captured: it should continue the transform without clicking. Release both before drawing again. Use Fit to restore the viewport. If the wrong hand is selected, change Drawing hand or Swap hands; crossing and reordering must not silently swap roles during ink.
6. **Swipe pages.** Add a second page first. Keep the drawing hand open and still; show the other open palm briefly until commands are armed, then swipe it horizontally. Check one page change per swipe and the cooldown. Swipe while writing: it should be ignored. With one hand, use large previous/next buttons. In Present, verify red laser and the same slide gate, then Exit.
7. **Other controls and regression.** Reach Undo/Redo, Zoom +/−, Fit, Pages, Export and Present by hand cursor. Clear must open a confirmation and must not automatically confirm from the same stationary dwell. Test Cancel and then an intentional confirm. Refresh to check autosave. Export PNG/PDF and an editable backup. Check mouse/touch tools still work.
8. **Camera and performance.** Pause/Resume using its button. Hide the tab and return: camera should stop and request Restart. Close the camera and leave the board; physically verify its light is off. Test denial and hand loss. Record the backend (Worker or Compatible, GPU or CPU), processed FPS, camera FPS, inference ms and pipeline ms. These checks were not observed live in this environment; report the actual values rather than assuming the worker reached 30 FPS.

# Record labeled evidence

The three newer supplied files contain 2,471 frames, all marked **unlabeled**. Their filenames do not provide ground truth. Recording now requires a pose label, or explicit **Free session** when labels are not wanted. Use the dropdown or large Pose button. Pick **unlabeled** during transitions. For stable poses, select the actual label and hold several seconds. Record separate samples for palm, point, pinch, peace and fist; use both hands for swipe and two-hand pinch. Save and run in a second terminal:

```powershell
npm.cmd run eval:gestures -- "C:\path\to\gestera-labeled-landmarks.json"
```

The command uses the recording's saved profile/settings and prints confusion matrix and support/precision/recall. Unlabeled frames are excluded. Swipe is event-gated, so frame recall is not episode success. Keep a separate evaluation session. No accuracy percentage or live FPS improvement was verified here.

When reporting a failure, include the active tool, selected label, Smoothness preset, whether one or two hands were visible, FPS/inference, and the saved recording. That makes the next fix reproducible instead of guesswork.
