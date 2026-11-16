import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { step as previousStep } from '../tests/baseline-v02/src/engine/gestures/engine';
import { initialEngineState as previousInitial,defaultGestureSettings as previousSettings } from '../tests/baseline-v02/src/engine/gestures/types';
import { step } from '../src/engine/gestures/engine';
import { initialEngineState,defaultGestureSettings,type EngineOutput } from '../src/engine/gestures/types';
import type { Recording } from './gesture-baseline';

function replay(recording:Recording,old:boolean){
  // The archived v0.2 types are intentionally independent from the current runtime.
  let state:any=old?previousInitial():initialEngineState();
  const counts:Record<string,number>={},ends:Record<string,number>={};let nonFiniteCursors=0,singleHandCommands=0,peakHandMotion=0,previous:{x:number;y:number}|undefined;
  for(const frame of recording.frames){
    const output=(old?previousStep:step)(frame,state,{...(old?previousSettings:defaultGestureSettings),...recording.metadata?.settings}) as EngineOutput;state=output.state;
    if(output.cursor){if(!Number.isFinite(output.cursor.x)||!Number.isFinite(output.cursor.y))nonFiniteCursors++;if(previous)peakHandMotion=Math.max(peakHandMotion,Math.hypot((output.cursor.x-previous.x)*1440,(output.cursor.y-previous.y)*900));}previous=output.cursor;
    for(const event of output.events){const name=event.type==='begin'?(event.erase?'erase begins':'ink begins'):event.type;counts[name]=(counts[name]??0)+1;if(event.type==='end')ends[event.reason]=(ends[event.reason]??0)+1;if(frame.hands.length<2&&['undo','redo','page'].includes(event.type))singleHandCommands++;}
  }
  return{events:counts,endReasons:ends,nonFiniteCursors,singleHandCommands,peakObservedCursorMotionReferencePx:+peakHandMotion.toFixed(3)};
}
const sessions=[0,1,2].map(i=>{
  const bytes=fs.readFileSync(new URL(`../tests/fixtures/session-v03-${i}.json`,import.meta.url)),recording=JSON.parse(bytes.toString()) as Recording&{provenance:{id:string;name:string}};
  return{file:recording.provenance.name,sourceId:recording.provenance.id,normalizedFixtureSHA256:createHash('sha256').update(bytes).digest('hex'),frames:recording.frames.length,withHands:recording.frames.filter(f=>f.hands.length).length,twoHands:recording.frames.filter(f=>f.hands.length>1).length,labeled:recording.frames.filter(f=>f.label&&f.label!=='unlabeled').length,before:replay(recording,true),after:replay(recording,false)};
});
const report={comparison:'Frozen GestEra 0.2 engine versus 0.3 engine',run:'Offline Node replay, not live webcam or rendering',sessions,limitations:['All supplied newer frames are unlabeled. Event counts do not establish user intent, true/false positives, or classification accuracy.','Peak observed cursor movement includes actual hand movement and tracking reacquisition. It is not the same-frame mode-switch offset tested separately.','Calibration thresholds were not fitted to unlabeled recordings. Replays use recorded settings with default pinch thresholds when no saved profile exists.','Worker scheduling, browser interactions, measured live FPS, camera teardown and human ergonomics require live manual testing.']};
if(process.argv.includes('--save'))fs.writeFileSync('PRACTICAL_REPLAY_RESULTS.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
