import { extractFeatures } from './features';
import type { CommandState,EngineEvent,Features,Hand } from './types';
export function commandStep(hand:Hand|undefined,t:number,previous:CommandState,busy:boolean,mirror:boolean,priorFeatures?:Features,aspect=1,guarded=true){
  const state:CommandState={...previous,swipe:[...previous.swipe]};const events:EngineEvent[]=[];
  if(!hand||hand.score<=.7||busy){state.ready=0;state.openSince=state.actionSince=undefined;state.armed=false;state.action=undefined;state.fired=false;state.swipe=[];state.wrist=undefined;return{state,events};}
  const wrist=hand.landmarks[0],continuous=!!state.wrist&&t-state.lastT<150&&Math.hypot(wrist.x-state.wrist.x,wrist.y-state.wrist.y)<.20;
  state.ready=continuous?state.ready+1:1;state.lastT=t;state.wrist=wrist;const features=extractFeatures(hand,priorFeatures,aspect);
  if(!continuous){state.armed=false;state.openSince=state.actionSince=undefined;state.action=undefined;state.swipe=[];}
  if(state.ready<3||!features)return{state,events,features};
  if(features.gesture==='OPEN_PALM'){
    state.openSince??=t;if(t-state.openSince>=250)state.armed=true;
    state.actionSince=undefined;state.action=undefined;state.fired=false;
    state.swipe=state.swipe.filter(p=>t-p.t<=320);state.swipe.push({x:mirror?1-wrist.x:wrist.x,y:wrist.y,t});
    const first=state.swipe[0],last=state.swipe.at(-1)!,dx=last.x-first.x,dy=last.y-first.y,dt=last.t-first.t;
    if((!guarded||state.armed)&&dt>=80&&Math.abs(dx)>.17&&Math.abs(dy)<.10&&Math.abs(dx)/(dt/1000)>.65&&t>=state.cooldown){events.push({type:'page',direction:dx<0?1:-1});state.cooldown=t+800;state.swipe=[];}
  }else{
    state.openSince=undefined;state.swipe=[];
    const action=features.gesture==='FIST'?'undo':features.gesture==='PEACE'?'redo':undefined;
    if(action!==state.action){state.action=action;state.actionSince=action?t:undefined;state.fired=false;}
    if(action&&(!guarded||state.armed)&&!state.fired&&state.actionSince!==undefined&&t-state.actionSince>=800&&t>=state.cooldown){events.push({type:action});state.fired=true;state.armed=false;state.cooldown=t+1200;}
  }
  return{state,events,features};
}
