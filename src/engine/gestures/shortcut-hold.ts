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
