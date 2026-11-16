import type { Frame, GestureSettings, Hand, Identity } from './types';
export function physicalSide(hand:Hand,inputMirrored=false){return inputMirrored?(hand.side==='Left'?'Right':hand.side==='Right'?'Left':hand.side):hand.side;}
// Tasks API labels refer to the subject. CSS preview mirroring does not transform inference input.
// https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker#task-output
export function selectHands(frame:Frame,previous:Identity|undefined,settings:GestureSettings){
  const hands=frame.hands.filter(h=>h.landmarks.length===21&&h.landmarks.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  if(!hands.length)return{};
  let draw:Hand|undefined;
  const desired=settings.swapHands?(settings.dominantHand==='Right'?'Left':'Right'):settings.dominantHand;
  if(hands.length===1)draw=hands[0];
  else if(previous&&frame.t-previous.t<300){const dt=Math.min(100,frame.t-previous.t),prediction={x:previous.wrist.x+previous.velocity.x*dt,y:previous.wrist.y+previous.velocity.y*dt};
    const ranked=hands.map(h=>({hand:h,d:Math.hypot(h.landmarks[0].x-prediction.x,h.landmarks[0].y-prediction.y)})).sort((a,b)=>a.d-b.d);
    // Ambiguous crossings fail closed rather than swapping drawing and command hands.
    if(ranked[0].d<.24&&(ranked.length===1||ranked[1].d-ranked[0].d>.025))draw=ranked[0].hand;
    else return{ambiguous:true};
  }else draw=hands.find(h=>physicalSide(h,frame.inputMirrored)===desired)??[...hands].sort((a,b)=>b.score-a.score)[0];
  const wrist=draw.landmarks[0],dt=previous?frame.t-previous.t:0;
  const identity:Identity={wrist:{...wrist},velocity:previous&&dt>0&&dt<150?{x:(wrist.x-previous.wrist.x)/dt,y:(wrist.y-previous.wrist.y)/dt}:{x:0,y:0},t:frame.t,side:physicalSide(draw,frame.inputMirrored)};
  return{draw,command:hands.find(h=>h!==draw),identity};
}
