import type { Features } from './types';

export interface PinchState {
  pinching:boolean;
  closeFrames:number;
  closeSince?:number;
  releaseFrames?:number;
}

export function observePinch(previous:PinchState,pose:Features,limits:{enter:number;exit:number},t:number,mobile=false):PinchState{
  const open={pinching:false,closeFrames:0,closeSince:undefined,releaseFrames:0};
  if(pose.gesture==='FIST')return open;
  if(previous.pinching){
    const releaseFrames=pose.pinch>=limits.exit?(previous.releaseFrames??0)+1:0;
    if(releaseFrames && (!mobile || pose.pinch>=limits.exit+.10 || releaseFrames>=2))return open;
    return {pinching:true,closeFrames:previous.closeFrames,closeSince:previous.closeSince,releaseFrames};
  }
  if(pose.pinch>=limits.enter)return open;
  const closeSince=previous.closeSince??t,closeFrames=previous.closeFrames+1;
  return {pinching:closeFrames>=2 && t-closeSince>=24,closeFrames,closeSince,releaseFrames:0};
}
