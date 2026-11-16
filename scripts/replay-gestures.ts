import fs from 'node:fs';
import { step } from '../src/engine/gestures/engine';

import { defaultGestureSettings, initialEngineState } from '../src/engine/gestures/types';
import { replayBaseline, type Recording } from './gesture-baseline';
const percentile=(values:number[],p:number)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.floor((sorted.length-1)*p)]:null;};
export function replay(recording:Recording){
  let state=initialEngineState();const events:{type:string;t:number}[]=[],strokes:{points:{x:number;y:number;t:number}[];started:number;confirmed:number;trimmed:number}[]=[];
  let current:typeof strokes[number]|undefined;const confirmationMotion:number[]=[];let lastCursor:{x:number;y:number}|undefined;const displacements:number[]=[],recovery:number[]=[],endTrim:number[]=[];
  for(const frame of recording.frames){const output=step(frame,state,defaultGestureSettings);const prior=state;state=output.state;
    for(const event of output.events){events.push({type:event.type,t:frame.t});if(event.type==='begin'&&!event.erase){current={points:[...event.points],started:event.points[0].t,confirmed:frame.t,trimmed:0};strokes.push(current);const up=step(frame,{...prior,pinching:false},defaultGestureSettings).cursor,down=step(frame,{...prior,pinching:true},defaultGestureSettings).cursor;if(up&&down)displacements.push(Math.hypot((up.x-down.x)*1440,(up.y-down.y)*900));if(lastCursor&&output.cursor)confirmationMotion.push(Math.hypot((output.cursor.x-lastCursor.x)*1440,(output.cursor.y-lastCursor.y)*900));recovery.push(frame.t-event.points[0].t);}
      else if(event.type==='point'&&current&&!event.erase)current.points.push(event.point);
      else if(event.type==='end'&&current){if(event.trimAfter!==undefined){const n=current.points.length;current.points=current.points.filter(p=>p.t<=event.trimAfter!);current.trimmed=n-current.points.length;}endTrim.push(current.trimmed);current=undefined;}}lastCursor=output.cursor;
  }
  return{events,strokes,modeSwitchJumps:displacements,confirmationMotion,recoveredStartMs:recovery,trimmedSamples:endTrim};
}
export function comparison(recording:Recording){
  const before=replayBaseline(recording),after=replay(recording),frames=recording.frames,handFrames=frames.filter(f=>f.hands.length);
  const gaps=frames.slice(1).flatMap((f,i)=>f.hands.length&&frames[i].hands.length?[1000/(f.t-frames[i].t)]:[]);
  return{
    evidence:{source:recording.source,frames:frames.length,handFrames:handFrames.length,durationSeconds:(frames.at(-1)!.t-frames[0].t)/1000,processedFPS:{median:percentile(gaps,.5),p05:percentile(gaps,.05)},labeledFrames:frames.filter(f=>f.label&&f.label!=='unlabeled').length},
    before:{commands:before.actions,strokeCount:before.strokes.length,modeSwitchOffsetBoardPx:before.jumps,strokeTimes:before.strokes.map(p=>({first:p[0].t,last:p.at(-1)!.t,firstSegment:p[1]?.t}))},
    after:{commands:after.events.filter(e=>['pause-toggle','undo','page'].includes(e.type)),strokeCount:after.strokes.length,recoveredStartMs:after.recoveredStartMs,modeSwitchOffsetBoardPx:after.modeSwitchJumps,confirmationFrameDisplacementReferencePx:after.confirmationMotion,trimmedOpeningSamples:after.trimmedSamples,strokeTimes:after.strokes.map(s=>({first:s.started,confirmed:s.confirmed,last:s.points.at(-1)?.t,trimmed:s.trimmed}))},
    definitions:{modeSwitchOffset:'Before: tip-to-midpoint geometric offset. After: same-frame engine cursor difference with the previous pinch flag changed. Reference dimensions 1440x900. This does not bound all hand motion.',confirmationFrameDisplacement:'Consecutive cursor displacement on the three confirmation frames, in a 1440x900 reference viewport. Responsive board zoom and screen dimensions change its world-space size.',recoveredStartMs:'Confirmation time minus the time of the buffered first ink sample. This is recovered history, not zero visual confirmation latency.',fps:'Offline recording frame intervals with hands present. Not a measurement of the new live camera loop.',groundTruth:'The supplied session is unlabeled. It cannot establish gesture precision/recall or intended handwriting accuracy.'}
  };
}
if(process.argv[1]?.includes('replay-gestures')){const file=process.argv.slice(2).find(v=>!v.startsWith('--'))??'tests/fixtures/user-session.json';const result=comparison(JSON.parse(fs.readFileSync(file,'utf8')));if(process.argv.includes('--save'))fs.writeFileSync('GESTURE_REPLAY_RESULTS.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));}
