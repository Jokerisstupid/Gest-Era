import type { Hand } from './types';
export interface TrackingSample {t:number;palm:number;wrist:{x:number;y:number};tips:{x:number;y:number;bone:number}[];}
export function trackingSample(hand:Hand,t:number,aspect=1):TrackingSample {const p=(i:number)=>({x:hand.landmarks[i].x,y:hand.landmarks[i].y*aspect});const wrist=p(0),knuckle=p(9);return{t,wrist,palm:Math.hypot(knuckle.x-wrist.x,knuckle.y-wrist.y),tips:[8,4].map(i=>{const tip=p(i),base=p(i-1);return{...tip,bone:Math.hypot(tip.x-base.x,tip.y-base.y)};})};}
export function isolatedTipJump(previous:TrackingSample|undefined,current:TrackingSample){
  if(!previous||current.t-previous.t>150)return false;
  const wrist=Math.hypot(current.wrist.x-previous.wrist.x,current.wrist.y-previous.wrist.y);
  // On a wide camera a corrupted joint can cross an entire distant palm in a few pixels.
  const threshold=Math.max(.035,Math.min(.14,previous.palm*.9));
  return current.tips.some((tip,i)=>{const old=previous.tips[i],motion=Math.hypot(tip.x-old.x,tip.y-old.y),ratio=Math.max(.005,tip.bone)/Math.max(.005,old.bone);return motion>threshold&&wrist<motion*.25&&(ratio>1.8||ratio<.55);});
}
