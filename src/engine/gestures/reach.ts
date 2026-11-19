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
