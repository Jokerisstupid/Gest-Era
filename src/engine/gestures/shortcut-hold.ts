import { thumbDirection } from './hand-shortcuts';
import type { Features, Hand } from './types';

export type HeldAction='lock'|'next'|'previous';
type Pose=HeldAction|'neutral'|'missing';
export interface ShortcutHold { pose:Pose; since:number; last:number; latched:boolean }
export interface ShortcutContext { locked:boolean; waitingForPalm:boolean; thumbPages:boolean; editing:boolean }

// All held shortcuts share a latch. A different command needs a visible release.
export function holdStep(previous:ShortcutHold|undefined,pose:Pose,t:number){
  const continuous=previous?.pose===pose && t-previous.last<=250;
  const state:ShortcutHold={pose,since:continuous?previous.since:t,last:t,latched:previous?.latched??false};
  const elapsed=t-state.since;
  let action:HeldAction|undefined;
  if(pose==='neutral' && elapsed>=220)state.latched=false;
  if(pose!=='neutral' && pose!=='missing' && !state.latched && elapsed>=(pose==='lock'?850:550)){
    state.latched=true;action=pose;
  }
  return {state,action};
}

export function shortcutPose(hand:Hand,features:Features,aspect:number,mirror:boolean,policy:ShortcutContext):Pose {
  const [index,middle,ring,pinky]=features.extended;
  if(pinky && !index && !middle && !ring)return 'lock';
  if(policy.locked || policy.editing || !policy.thumbPages)return 'neutral';
  const direction=thumbDirection(hand,features,aspect,mirror);
  return direction===1?'next':direction===-1?'previous':'neutral';
}

export interface PageSwipe { x:number; y:number; since:number; fired:boolean }

// Use the palm center so bending or extending a fingertip cannot turn a page.
export function pageSwipeStep(previous:PageSwipe|undefined,hand:Hand,t:number,aspect:number,mirror:boolean){
  const palm=[0,5,9,13,17].map(i=>hand.landmarks[i]);
  const x=palm.reduce((sum,p)=>sum+p.x,0)/5;
  const y=palm.reduce((sum,p)=>sum+p.y,0)*aspect/5;
  const fresh={x,y,since:t,fired:false};
  if(!previous)return {state:fresh};
  if(previous.fired)return {state:previous};
  const dx=(x-previous.x)*(mirror?-1:1),dy=Math.abs(y-previous.y);
  const elapsed=t-previous.since;
  if(elapsed>650 || dy>.10)return {state:fresh};
  if(elapsed>=100 && Math.abs(dx)>=.14 && Math.abs(dx)>dy*2.2)
    return {state:{...previous,fired:true},direction:dx>0?1 as const:-1 as const};
  return {state:previous};
}
