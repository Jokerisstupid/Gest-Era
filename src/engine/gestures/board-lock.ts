export interface PinkyHold { since?:number; last?:number; fired:boolean; released?:number }
export function pinkyStep(previous:PinkyHold, raised:boolean, t:number){
  const continuous=previous.last!==undefined && t-previous.last<=250;
  let state={...previous,last:t},toggle=false;
  if(!raised){
    state.since=undefined;
    state.released=continuous?(state.released??t):t;
    if(t-state.released>=220)state.fired=false;
  }else{
    state.released=undefined;
    state.since=continuous?(state.since??t):t;
    if(!state.fired && t-state.since>=850){toggle=true;state.fired=true;}
  }
  return {state,toggle};
}
