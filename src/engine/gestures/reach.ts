export interface PaperArea { left:number; right:number; top:number; bottom:number }

// Reserve more hand travel for a small sheet while keeping the surrounding controls reachable.
export function paperAxis(value:number,start:number,end:number){
  const lo=Math.max(0,start),hi=Math.min(1,end),span=hi-lo;
  if(span<=0 || span>=.62 || !Number.isFinite(span))return value;
  const paperSpan=.62,outerScale=(1-paperSpan)/(1-span);
  const a=lo*outerScale,b=a+paperSpan;
  if(value<a)return value/outerScale;
  if(value>b)return hi+(value-b)/outerScale;
  return lo+(value-a)*span/paperSpan;
}

export interface HandReach { x:number; y:number; size:number }

// Capture once at pairing so a closing fist cannot change the writing gain.
export function reachBounds(hand:HandReach,aspect:number,screenRatio:number){
  const w=Math.max(.30,Math.min(1,hand.size*8));
  const h=Math.max(.34,Math.min(1,w/(screenRatio*aspect)));
  const spanX=Math.max(.27,Math.min(w,h*screenRatio*aspect));
  const left=Math.max(0,Math.min(1-spanX,hand.x-spanX/2));
  const top=Math.max(0,Math.min(1-h,hand.y-h/2));
  return {left,top,width:spanX,height:h};
}
