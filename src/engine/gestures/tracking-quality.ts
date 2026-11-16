import type { Hand } from './types';
export interface TrackingSample {t:number;wrist:{x:number;y:number};tips:{x:number;y:number;bone:number}[];}
export function trackingSample(hand:Hand,t:number,aspect=1):TrackingSample {const p=(i:number)=>({x:hand.landmarks[i].x,y:hand.landmarks[i].y*aspect});return{t,wrist:p(0),tips:[8,4].map(i=>{const tip=p(i),base=p(i-1);return{...tip,bone:Math.hypot(tip.x-base.x,tip.y-base.y)};})};}
export function isolatedTipJump(previous:TrackingSample|undefined,current:TrackingSample){
  if(!previous||current.t-previous.t>150)return false;
  const wrist=Math.hypot(current.wrist.x-previous.wrist.x,current.wrist.y-previous.wrist.y);
  return current.tips.some((tip,i)=>{const old=previous.tips[i],motion=Math.hypot(tip.x-old.x,tip.y-old.y),ratio=Math.max(.005,tip.bone)/Math.max(.005,old.bone);return motion>.14&&wrist<motion*.25&&(ratio>1.8||ratio<.55);});
}
