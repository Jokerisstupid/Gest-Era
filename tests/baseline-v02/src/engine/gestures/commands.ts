import { extractFeatures } from './features';
import type { CommandState, EngineEvent, Features, Hand } from './types';
export function commandStep(hand:Hand|undefined,t:number,previous:CommandState,busy:boolean,mirror:boolean,priorFeatures?:Features,aspect=1){
  const state:CommandState={...previous,swipe:[...previous.swipe]};const events:EngineEvent[]=[];
  if(!hand||hand.score<=.7||busy){state.ready=0;state.fistSince=undefined;state.fired=false;state.swipe=[];state.wrist=undefined;return{state,events};}
  const wrist=hand.landmarks[0],continuous=!!state.wrist&&t-state.lastT<150&&Math.hypot(wrist.x-state.wrist.x,wrist.y-state.wrist.y)<.20;
  state.ready=continuous?state.ready+1:1;state.lastT=t;state.wrist=wrist;const features=extractFeatures(hand,priorFeatures,aspect);
  if(state.ready<3||!features){state.fistSince=undefined;state.swipe=[];return{state,events,features};}
  if(features.gesture==='FIST'){
    state.fistSince??=t;
    if(t-state.fistSince>=800&&!state.fired&&t>=state.cooldown){events.push({type:'undo'});state.fired=true;state.cooldown=t+1200;}
  }else{state.fistSince=undefined;state.fired=false;}
  if(features.gesture==='OPEN_PALM'){
    state.swipe=state.swipe.filter(p=>t-p.t<=320);state.swipe.push({x:mirror?1-wrist.x:wrist.x,y:wrist.y,t});
    const first=state.swipe[0],last=state.swipe.at(-1)!,dx=last.x-first.x,dy=last.y-first.y,dt=last.t-first.t;
    if(dt>=80&&Math.abs(dx)>.17&&Math.abs(dy)<.10&&Math.abs(dx)/(dt/1000)>.65&&t>=state.cooldown){events.push({type:'page',direction:dx<0?1:-1});state.cooldown=t+800;state.swipe=[];}
  }else state.swipe=[];
  return{state,events,features};
}
