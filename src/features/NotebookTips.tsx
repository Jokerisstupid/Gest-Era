import { useState } from 'react';
import { Modal } from '../ui/common';

const lessons = {
  manual: [
    ['Organize your notebook', 'Open notebook navigation to switch sections and pages. Choose Add page for a fresh sheet.'],
    ['Write and highlight', 'On Draw, choose Pen or Highlight, then drag with a finger, mouse, or stylus. Open Ink & paper for color and thickness.'],
    ['Erase and undo', 'Choose Erase and move across ink. Use its properties to change eraser size or erase whole strokes. Undo reverses your last edit.'],
    ['Add shapes and text', 'Choose Shapes and drag across the paper to size a shape. Choose Text and tap the paper to type a note.'],
    ['Select and move', 'Use Select for one object or draw around several with Lasso. Drag the selection to move it.'],
    ['Navigate and present', 'Pan moves your view. Use View to adjust zoom, or Present to show the current page. Laser points without adding ink.'],
    ['Share your work', 'Your notebook saves on this device. Use Export for a copy to share. Start air writing opens the separate gesture walkthrough.']
  ],
  gesture: [
    ['Connect your hand', 'Allow camera access. Tap the number beside your hand in the preview, or close and open that hand three times.'],
    ['Aim, write, and lift', 'Point your index finger at the paper. Touch thumb to index and move to write. Separate them to lift the pen. A short stationary pinch makes a dot.'],
    ['Erase and change tools', 'Raise index and middle fingers together and move over ink to erase. Point at a toolbar control and hold still or pinch to select it.'],
    ['Turn the page', 'With two or more pages, sweep your paired open palm right for next or left for previous. Pause for a second at either end before reversing.'],
    ['Zoom with two hands', 'Choose Pair second hand in the camera panel and connect it. Pinch with both hands and spread them to zoom in or bring them together to zoom out.'],
    ['Lock or pause', 'Hold up only your pinky to lock the board. Lower it and repeat to unlock. Use Pause in the camera panel for a break.'],
    ['Improve tracking', 'Keep your fingertips in the camera preview. If pinches feel unreliable, open Calibrate in the camera panel. Open ? to revisit either tour.']
  ]
};
export type TourMode = keyof typeof lessons;
const seen = new Set<TourMode>();
const key = (mode:TourMode) => 'gestera:tour:v1:'+mode;
export function sawTour(mode:TourMode){
  try{return seen.has(mode)||localStorage.getItem(key(mode))==='done';}catch{return seen.has(mode);}
}
export function NotebookTips({mode,onClose,onPractice}:{mode:TourMode;onClose:()=>void;onPractice:()=>void}){
  const [index,setIndex]=useState(0);
  const steps=lessons[mode], [title,tip]=steps[index];
  function finish(){
    seen.add(mode);
    try{localStorage.setItem(key(mode),'done');}catch{/* Keep the session preference. */}
    onClose();
  }
  return <Modal title={mode==='manual'?'Notebook tools':'Gesture controls'} onClose={finish}>
    <div className="tour-copy" aria-live="polite"><small>Tip {index+1} of {steps.length}</small><h3>{title}</h3><p>{tip}</p></div>
    {mode==="gesture" && index===3 && <button className="btn secondary" onClick={()=>{finish();onPractice();}}>Practice both swipes</button>}
    <div className="tour-actions">
      <button data-gesture className="btn secondary" onClick={finish}>Skip tour</button>
      <button data-gesture className="btn secondary" disabled={index===0} onClick={()=>setIndex(index-1)}>Back</button>
      <button data-gesture className="btn primary" onClick={()=>index===steps.length-1?finish():setIndex(index+1)}>{index===steps.length-1?'Done':'Next'}</button>
    </div>
  </Modal>;
}
