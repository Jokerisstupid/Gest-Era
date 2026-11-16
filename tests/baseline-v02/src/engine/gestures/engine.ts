import { clamp, cursorAnchor, distance, extractFeatures } from './features';
import { filter } from './filter';
import { selectHands } from './identity';
import { commandStep } from './commands';
import { initialEngineState, type Context, type EngineEvent, type EngineOutput, type EngineState, type Frame, type GestureSettings, type Sample } from './types';

export function releaseCutoff(samples:Sample[]):number|undefined {
  // Only the final two opening samples can be removed. Normal movement is not trimmed.
  let cut=samples.length-1;
  for(let i=samples.length-1;i>0&&i>=samples.length-2;i--){
    if(samples[i].ratio>samples[i-1].ratio+.025)cut=i-1;else break;
  }
  return cut<samples.length-1?samples[cut].t:undefined;
}
export function step(frame:Frame,previous:EngineState,settings:GestureSettings,context:Context={}):EngineOutput {
  const events:EngineEvent[]=[];
  const state:EngineState={...previous,ring:[...previous.ring],pending:[...previous.pending],command:{...previous.command,swipe:[...previous.command.swipe]}};
  const end=(reason:string,trim=false)=>{if(state.mode==='ink'||state.mode==='erase')events.push({type:'end',reason,...(trim&&state.mode==='ink'?{trimAfter:releaseCutoff(state.ring)}:{})});state.mode='hover';state.pending=[];};
  const reset=()=>{state.pinching=false;state.closeFrames=0;state.candidate=undefined;state.ring=[];state.fx=state.fy=undefined;state.features=state.commandFeatures=undefined;state.lastRatio=undefined;state.eraseFrames=0;};
  if(frame.t<=previous.t)return{state:previous,events:[],gesture:'NONE',status:'Waiting for a new camera frame',activeHand:'None',commandReady:false};
  const identityConfig=`${settings.dominantHand}:${settings.swapHands}`;
  if(previous.identityConfig!==identityConfig){end('hand preference changed');state.identity=undefined;reset();}
  state.identityConfig=identityConfig;
  const discontinuity=frame.t-previous.t>150;
  if(discontinuity){end('camera frame gap',true);reset();state.identity=frame.t-previous.t>300?undefined:state.identity;state.armed=previous.armed&&!previous.pinching;}
  state.t=frame.t;
  const selection=selectHands(frame,state.identity,settings),hand=selection.draw;
  if(!hand){end('hand lost',true);reset();state.armed=previous.armed&&!previous.pinching;state.command={...initialEngineState().command,cooldown:state.command.cooldown};return{state,events,gesture:'NONE',status:selection.ambiguous?'Hands overlap — separate them':'Hand lost — bring it into view',activeHand:'None',commandReady:false};}
  if(state.identity&&frame.t-state.identity.t<150&&Math.hypot(hand.landmarks[0].x-state.identity.wrist.x,hand.landmarks[0].y-state.identity.wrist.y)>.22){end('tracking position jumped',true);reset();state.armed=false;}
  state.identity=selection.identity;
  const features=extractFeatures(hand,discontinuity?undefined:state.features,frame.aspect??1);
  if(!features){end('invalid landmarks',true);reset();state.armed=false;return{state,events,gesture:'NONE',status:'Tracking uncertain — show your whole hand',activeHand:state.identity!.side,commandReady:false};}
  state.features=features;
  const ratio=features.pinch,anchor=cursorAnchor(hand,ratio),margin=clamp(settings.region,.03,.32);
  const x=((settings.mirror?1-anchor.x:anchor.x)-margin)/(1-2*margin),y=(anchor.y-margin)/(1-2*margin);
  const wasPinching=state.pinching;
  if(!state.pinching){state.closeFrames=ratio<.30&&features.gesture!=='FIST'?state.closeFrames+1:0;if(state.closeFrames>=2)state.pinching=true;}
  else if(ratio>=.50||features.gesture==='FIST'){state.pinching=false;state.closeFrames=0;}
  // Candidate starts at the first observed sample crossing 0.6, before close confirmation.
  if(!wasPinching){if(ratio>=.60){state.candidate=undefined;state.ring=[];state.armed=true;}else if(state.candidate===undefined)state.candidate=frame.t;}
  const oldX=state.fx?.value,oldY=state.fy?.value;
  state.fx=filter(x*1440,frame.t,state.fx,settings.smoothness);state.fy=filter(y*900,frame.t,state.fy,settings.smoothness);
  // Constrain just the second closing sample (the confirmation frame). Do not impose
  // a handwriting speed limit. This geometric check is independent of the pen-state flag.
  const onset=ratio<.30&&(state.lastRatio??Infinity)<.30&&(previous.ring.at(-2)?.ratio??Infinity)>=.30;
  if(onset&&oldX!==undefined&&oldY!==undefined){const dx=state.fx.value-oldX,dy=state.fy.value-oldY,d=Math.hypot(dx,dy);if(d>8){state.fx={...state.fx,value:oldX+dx*8/d};state.fy={...state.fy,value:oldY+dy*8/d};}}
  const point:Sample={x:clamp(state.fx.value/1440),y:clamp(state.fy.value/900),t:frame.t,ratio};
  const priorRing=[...state.ring];
  state.ring.push(point);state.ring=state.ring.filter(p=>frame.t-p.t<=350).slice(-12);
  const gesture=state.pinching?'PINCH':features.gesture;
  const cursor={...point,hand:state.identity!.side,gesture,eraser:gesture==='PEACE'};
  const outside=x<0||x>1||y<0||y>1;
  // Paused means no writing or direct commands; cursor clicks can still resume tracking.
  const blocked=context.paused||context.overUI||outside||context.allowInk===false;
  if(blocked){end(context.overUI?'over UI':context.paused?'paused':'outside canvas',true);if(state.pinching)state.armed=false;state.ring=[];state.candidate=undefined;}

  const second=selection.command,secondFeatures=second?extractFeatures(second,state.commandFeatures,frame.aspect??1):undefined;
  const dualPinch=!blocked&&!!second&&second.score>.7&&features.gesture!=='FIST'&&secondFeatures?.gesture!=='FIST'&&features.pinch<.50&&(secondFeatures?.pinch??Infinity)<.30;
  state.transformReady=dualPinch?state.transformReady+1:0;
  if(dualPinch&&state.transformReady>=2){
    end('two-hand transform');state.armed=false;
    const a=hand.landmarks[0],b=second!.landmarks[0],dist=distance(a,b),mid={x:settings.mirror?1-(a.x+b.x)/2:(a.x+b.x)/2,y:(a.y+b.y)/2};
    if(state.transform&&dist>.035){events.push({type:'transform',scale:clamp(dist/state.transform.distance,.82,1.22),dx:(mid.x-state.transform.midpoint.x)/(1-2*margin),dy:(mid.y-state.transform.midpoint.y)/(1-2*margin),anchor:{x:clamp((mid.x-margin)/(1-2*margin)),y:clamp((mid.y-margin)/(1-2*margin))}});}
    state.transform={distance:dist,midpoint:mid};state.mode='transform';state.command.ready=0;
    return{state,events,cursor,gesture:'PINCH',status:'Two hands — zoom & pan',activeHand:state.identity!.side,commandReady:false};
  }
  if(state.mode==='transform'){state.mode='hover';state.transform=undefined;state.armed=false;}
  if(!dualPinch)state.transform=undefined;
  const command=commandStep(second,frame.t,state.command,state.mode==='ink'||state.mode==='erase'||state.pinching||!!context.paused||!!context.overUI,settings.mirror,state.commandFeatures,frame.aspect??1);
  state.command=command.state;state.commandFeatures=command.features;events.push(...command.events);

  state.eraseFrames=gesture==='PEACE'?state.eraseFrames+1:0;
  if(!blocked&&!context.presentation){
    if(state.mode==='ink'&&!state.pinching){state.ring=priorRing;end('pinch released',true);state.ring=[point];state.candidate=undefined;}
    if(state.mode==='erase'&&gesture!=='PEACE')end('eraser released');
    if(state.pinching&&state.armed){
      if(state.mode==='erase')end('switch to ink');
      if(state.mode!=='ink'){
        const points=state.ring.filter(p=>p.t>=(state.candidate??frame.t));
        events.push({type:'begin',point:points[0]??point,points:points.length?points:[point],erase:false});state.mode='ink';
      }else events.push({type:'point',point,erase:false});
    }else if(gesture==='PEACE'&&state.eraseFrames>=2){
      if(state.mode==='ink')end('switch to eraser',true);
      if(state.mode!=='erase'){events.push({type:'begin',point,points:[point],erase:true});state.mode='erase';}
      else events.push({type:'point',point,erase:true});
    }
  }else if(context.presentation)end('presentation pointer',true);
  state.lastRatio=ratio;
  const status=context.paused?'Paused — use Resume':context.overUI?'Over controls — pinch or dwell':context.allowInk===false?'Outside paper — move onto the canvas':outside?'Move inside the writing area':state.mode==='ink'?'Pinching — writing':state.mode==='erase'?'Peace — erasing':context.presentation?'Point — laser':!state.armed?'Release pinch before continuing':'Not pinching — move to draw or choose a control';
  return{state,events,cursor,gesture,status,activeHand:state.identity!.side,commandReady:state.command.ready>=3};
}
