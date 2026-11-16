import fs from 'node:fs';
import { step } from '../src/engine/gestures/engine';
import { initialEngineState,defaultGestureSettings } from '../src/engine/gestures/types';
import type { Recording } from './gesture-baseline';
import { validCalibration } from '../src/engine/gestures/calibration';
const path=process.argv[2];if(!path){console.error('Usage: npm run eval:gestures -- <recording.json>');process.exit(1);}
const recording=JSON.parse(fs.readFileSync(path,'utf8')) as Recording;
if(!Array.isArray(recording.frames)||recording.source!=='real-camera'){console.error('Expected a real-camera recording with a frames array. Synthetic test poses are not evaluation data.');process.exit(1);}
const classes=['OPEN_PALM','POINT','PINCH','PEACE','FIST','SWIPE','TWO_HAND_PINCH','NONE'];
const normalize=(v:string)=>v.toUpperCase().replaceAll(' ','_');
const matrix=Object.fromEntries(classes.map(a=>[a,Object.fromEntries(classes.map(b=>[b,0]))]));
let state=initialEngineState(),labeled=0,unlabeled=0;
const saved=recording.metadata?.settings,settings={...defaultGestureSettings,...saved,calibration:validCalibration(saved?.calibration)?saved.calibration:undefined};
for(const frame of recording.frames){const output=step(frame,state,settings);state=output.state;
  const actual=normalize(frame.label??'unlabeled');if(!classes.includes(actual)){unlabeled++;continue;}
  const predicted=state.mode==='transform'?'TWO_HAND_PINCH':output.events.some(e=>e.type==='page')?'SWIPE':output.gesture;
  matrix[actual][predicted]++;labeled++;
}
console.log(`Source: ${recording.source}; labeled frames: ${labeled}; excluded unlabeled frames: ${unlabeled}`);
console.log(`Profile: ${settings.calibration?'recorded personal calibration':'default thresholds'}; smoothness: ${settings.smoothness}; guarded commands: ${settings.guardCommands!==false}`);
console.log('Rows = recorded label; columns = prediction');console.table(matrix);
if(!labeled){console.log('Precision/recall: not available. Record labeled examples first; no ground truth was inferred.');process.exit(0);}
const metrics=classes.map(label=>{const tp=matrix[label][label],support=Object.values(matrix[label]).reduce((a,b)=>a+b,0),predicted=classes.reduce((n,a)=>n+matrix[a][label],0);return{gesture:label,support,precision:predicted?+(tp/predicted).toFixed(3):'N/A',recall:support?+(tp/support).toFixed(3):'N/A'};});
console.table(metrics);
console.log('These are frame-level scores, not a balanced accuracy guarantee. Swipe is a cooldown-gated event, so frame recall is not episode recall. Use separate labeled sessions to evaluate generalization.');
