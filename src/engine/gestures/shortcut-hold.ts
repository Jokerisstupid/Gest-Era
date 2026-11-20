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

interface PalmSample { x:number; y:number; t:number }
export interface PageSwipe { samples:PalmSample[]; fired:boolean; releaseSince?:number; rest?:PalmSample; origin?:PalmSample }

export function pageSwipeStep(previous:PageSwipe|undefined,hand:Hand,t:number,aspect:number,mirror:boolean){

  const palm=[0,5,9,13,17].map(i=>hand.landmarks[i]);
  const x=palm.reduce((sum,p)=>sum+p.x,0)/5;
  const y=palm.reduce((sum,p)=>sum+p.y,0)*aspect/5;
  if(previous?.fired){
    const last=previous.samples.at(-1);
    const anchor=previous.rest;
    const still=anchor && Math.hypot(x-anchor.x,y-anchor.y)<.022 && last && t-last.t<=250;
    const rest=still?anchor:{x,y,t};
    const origin=previous.origin;
    const returned=origin && Math.hypot(x-origin.x,y-origin.y)<.035;
    if(!returned||t-rest.t<230)return {state:{samples:[{x,y,t}],rest,origin,fired:true}};
    return {state:{samples:[{x,y,t}],fired:false}};
  }
  const samples=(previous?.samples??[]).filter(p=>t-p.t<=900);
  samples.push({x,y,t});
  const state:PageSwipe={samples,fired:false};
  const wrist=hand.landmarks[0],middle=hand.landmarks[9];
  const palmSize=Math.hypot(middle.x-wrist.x,(middle.y-wrist.y)*aspect);
  const minTravel=Math.max(.045,Math.min(.115,palmSize*.70));
  // A moving window lets a sweep start after any length of stationary hover.
  let path=0,minY=y,maxY=y;
  for(let i=samples.length-2;i>=0;i--){
    const p=samples[i],next=samples[i+1];
    path+=Math.abs(next.x-p.x);
    minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);
    const dx=x-p.x,travel=Math.abs(dx),elapsed=t-p.t;
    const sparseSweep=samples.length-i===2 && elapsed>=100 && elapsed<=300 && travel>=minTravel*1.35;
    if((samples.length-i<3 && !sparseSweep) || elapsed<60 || travel<minTravel || travel/elapsed<minTravel/850)continue;
    if(travel<path*.77 || travel<(maxY-minY)*1.55)continue;
    state.fired=true;
    state.origin=p;
    return {state,direction:(mirror?-dx:dx)>0?1 as const:-1 as const};
  }
  return {state};
}
