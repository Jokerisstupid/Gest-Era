import type { Hand } from './gestures/types';

export interface CameraRegion { x:number; y:number; size:number }
export function presenterRegion(hand:Hand, previous?:CameraRegion):CameraRegion|undefined {
  const xs=hand.landmarks.map(p=>p.x), ys=hand.landmarks.map(p=>p.y);
  const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  const span=Math.max(right-left,bottom-top);
  if(previous && span>previous.size*.20 && left>=previous.x+.12*previous.size && right<=previous.x+.88*previous.size &&
    top>=previous.y+.12*previous.size && bottom<=previous.y+.88*previous.size)return previous;
  const size=Math.min(1,Math.max(.36,span*2.1));
  if(size>=.98)return;
  const origin=(mid:number)=>Math.min(1-size,Math.max(0,mid-size/2));
  return {x:origin((left+right)/2),y:origin((top+bottom)/2),size};
}
export function fullFrameHand(hand:Hand, region:CameraRegion):Hand {
  return {...hand,landmarks:hand.landmarks.map(p=>({...p,x:region.x+p.x*region.size,
    y:region.y+p.y*region.size,z:p.z===undefined?undefined:p.z*region.size}))};
}
