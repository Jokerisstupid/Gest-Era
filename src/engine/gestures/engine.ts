import { clamp, cursorAnchor, distance, extractFeatures } from './features';
import { filter } from './filter';
import { selectHands } from './identity';
import { thresholds } from './calibration';
import { transformStep } from './transform';
import { commandStep } from './commands';
import { isolatedTipJump,trackingSample } from './tracking-quality';
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
  const reset=()=>{state.pinching=false;state.closeFrames=0;state.candidate=undefined;state.ring=[];state.fx=state.fy=undefined;state.features=state.commandFeatures=undefined;state.lastRatio=undefined;state.eraseFrames=0;state.eraseSince=undefined;state.tracking=undefined;};
  if(frame.t<=previous.t)return{state:previous,events:[],gesture:'NONE',status:'Waiting for a new camera frame',activeHand:'None',commandReady:false};
  const identityConfig=`${settings.dominantHand}:${settings.swapHands}:${settings.calibration?.enter??.3}:${settings.calibration?.exit??.5}`;
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
  const tracking=trackingSample(hand,frame.t,frame.aspect??1),jump=isolatedTipJump(state.tracking,tracking);state.tracking=tracking;
  if(jump){end('fingertip tracking jumped',true);reset();state.tracking=tracking;state.armed=false;state.command=initialEngineState().command;return{state,events,gesture:'NONE',status:'Fingertip tracking uncertain — release and show your tips',activeHand:state.identity!.side,commandReady:false};}
  const limits=thresholds(settings.calibration);
  const ratio=features.pinch,anchor=cursorAnchor(hand,ratio,settings.calibration),margin=clamp(settings.region,.03,.32);
  const x=((settings.mirror?1-anchor.x:anchor.x)-margin)/(1-2*margin),y=(anchor.y-margin)/(1-2*margin);
  const wasPinching=state.pinching;
  if(!state.pinching){state.closeFrames=ratio<limits.enter&&features.gesture!=='FIST'?state.closeFrames+1:0;if(state.closeFrames>=2)state.pinching=true;}
  else if(ratio>=limits.exit||features.gesture==='FIST'){state.pinching=false;state.closeFrames=0;}
  // Candidate starts at the first observed sample crossing 0.6, before close confirmation.
  if(!wasPinching){if(ratio>=limits.lead){state.candidate=undefined;state.ring=[];state.armed=true;}else if(state.candidate===undefined)state.candidate=frame.t;}
  const oldX=state.fx?.value,oldY=state.fy?.value;
  state.fx=filter(x*1440,frame.t,state.fx,settings.smoothness);state.fy=filter(y*900,frame.t,state.fy,settings.smoothness);
  // Constrain just the second closing sample (the confirmation frame). Do not impose
  // a handwriting speed limit. This geometric check is independent of the pen-state flag.
  const onset=ratio<limits.enter&&(state.lastRatio??Infinity)<limits.enter&&(previous.ring.at(-2)?.ratio??Infinity)>=limits.enter;
  if(onset&&oldX!==undefined&&oldY!==undefined){const dx=state.fx.value-oldX,dy=state.fy.value-oldY,d=Math.hypot(dx,dy);if(d>8){state.fx={...state.fx,value:oldX+dx*8/d};state.fy={...state.fy,value:oldY+dy*8/d};}}
  const point:Sample={x:clamp(state.fx.value/1440),y:clamp(state.fy.value/900),t:frame.t,ratio};
  const priorRing=[...state.ring];
  state.ring.push(point);state.ring=state.ring.filter(p=>frame.t-p.t<=350).slice(-12);
  const gesture=state.pinching?'PINCH':features.gesture;
  const cursor={...point,hand:state.identity!.side,gesture,eraser:gesture==='PEACE'};
  const outside=x<0||x>1||y<0||y>1;
  // Paused means no writing or direct commands; cursor clicks can still resume tracking.
  const captured=previous.mode==='transform';
  const blocked=context.paused||(!captured&&(context.overUI||outside||context.allowInk===false));
  if(blocked){end(context.overUI?'over UI':context.paused?'paused':'outside canvas',true);if(state.pinching)state.armed=false;state.ring=[];state.candidate=undefined;}

  const second=selection.command,secondFeatures=second?extractFeatures(second,state.commandFeatures,frame.aspect??1):undefined;
  const zoomEnter=Math.min(limits.exit-.03,limits.enter+.12);
  const dualPinch=!blocked&&!!second&&second.score>.7&&features.gesture!=='FIST'&&secondFeatures?.gesture!=='FIST'&&features.pinch<(captured?limits.exit:zoomEnter)&&(secondFeatures?.pinch??Infinity)<(captured?limits.exit:zoomEnter);
  state.transformReady=dualPinch?state.transformReady+1:0;
  if(dualPinch&&state.transformReady<3){end('confirming two-hand intent',true);state.armed=false;return{state,events,cursor,gesture:'PINCH',status:'Hold both pinches — preparing zoom',activeHand:state.identity!.side,commandReady:false};}
  if(dualPinch&&state.transformReady>=3){
    end('two-hand transform');state.armed=false;
    const a=hand.landmarks[0],b=second!.landmarks[0],dist=distance(a,b),mid={x:settings.mirror?1-(a.x+b.x)/2:(a.x+b.x)/2,y:(a.y+b.y)/2};
    const transformed=transformStep(dist,mid,frame.t,state.transform);
    if(state.transform)events.push({type:'transform',scale:transformed.scale,factor:transformed.state.scale,dx:transformed.dx/(1-2*margin),dy:transformed.dy/(1-2*margin),anchor:{x:clamp((mid.x-margin)/(1-2*margin)),y:clamp((mid.y-margin)/(1-2*margin))}});
    else events.push({type:'transform-start'});
    state.transform=transformed.state;state.mode='transform';state.command.ready=0;
    return{state,events,cursor,gesture:'PINCH',status:'Two hands — zoom & pan',activeHand:state.identity!.side,commandReady:false};
  }
  if(state.mode==='transform'){state.mode='hover';state.transform=undefined;state.armed=false;}
  if(!dualPinch)state.transform=undefined;
  const command=commandStep(second,frame.t,state.command,state.mode==='ink'||state.mode==='erase'||state.pinching||!!context.paused||!!context.overUI,settings.mirror,state.commandFeatures,frame.aspect??1,settings.guardCommands!==false);
  state.command=command.state;state.commandFeatures=command.features;events.push(...command.events);

  state.eraseFrames=gesture==='PEACE'?state.eraseFrames+1:0;
  state.eraseSince=gesture==='PEACE'&&!blocked?(state.eraseSince??frame.t):undefined;
  if(!blocked&&!context.presentation){
    if(state.mode==='ink'&&!state.pinching){state.ring=priorRing;end('pinch released',true);state.ring=[point];state.candidate=undefined;}
    if(state.mode==='erase'&&gesture!=='PEACE')end('eraser released');
    if(state.pinching&&state.armed){
      if(state.mode==='erase')end('switch to ink');
      if(state.mode!=='ink'){
        const points=state.ring.filter(p=>p.t>=(state.candidate??frame.t));
        events.push({type:'begin',point:points[0]??point,points:points.length?points:[point],erase:false});state.mode='ink';
      }else events.push({type:'point',point,erase:false});
    }else if(gesture==='PEACE'&&state.armed&&state.eraseFrames>=2&&state.eraseSince!==undefined&&frame.t-state.eraseSince>=100){
      if(state.mode==='ink')end('switch to eraser',true);
      if(state.mode!=='erase'){events.push({type:'begin',point,points:[point],erase:true});state.mode='erase';}
      else events.push({type:'point',point,erase:true});
    }
  }else if(context.presentation)end('presentation pointer',true);
  state.lastRatio=ratio;
  const status=context.paused?'Paused — use Resume':context.overUI?'Over controls — pinch or dwell':context.allowInk===false?'Outside paper — move onto the canvas':outside?'Move inside the writing area':state.mode==='ink'?'Pinching — writing':state.mode==='erase'?'Peace — erasing':context.presentation?'Point — laser':!state.armed?'Release pinch before continuing':'Not pinching — move to draw or choose a control';
  return{state,events,cursor,gesture,status,activeHand:state.identity!.side,commandReady:state.command.ready>=3&&(settings.guardCommands===false||state.command.armed===true)};
}
