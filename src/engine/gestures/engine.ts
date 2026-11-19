import { observePinch } from './pinch';
import { clamp, cursorAnchor, extractFeatures } from './features';
import {holdStep,shortcutPose} from './shortcut-hold';
import { paperAxis } from './reach';
import { filter } from './filter';
import { selectHands } from './identity';
import { thresholds } from './calibration';
import { transformStep } from './transform';
import { commandStep } from './commands';
import { isolatedTipJump,trackingSample } from './tracking-quality';
import { initialEngineState, type Context, type Cursor, type EngineEvent, type EngineOutput, type EngineState, type Frame, type GestureSettings, type Sample } from './types';

export function releaseCutoff(samples:Sample[]):number|undefined {
  // Only the final two opening samples can be removed. Normal movement is not trimmed.
  let cut=samples.length-1;
  for(let i=samples.length-1;i>0&&i>=samples.length-2;i--){
    if(samples[i].ratio>samples[i-1].ratio+.025)cut=i-1;else break;
  }
  return cut<samples.length-1?samples[cut].t:undefined;
}
export function step(frame:Frame,previous:EngineState,settings:GestureSettings,context:Context={},route?:(cursor:Cursor)=>Pick<Context,'overUI'|'allowInk'>):EngineOutput {
  const events:EngineEvent[]=[];
  const state:EngineState={...previous,ring:[...previous.ring],command:{...previous.command,swipe:[...previous.command.swipe]}};
  const end=(reason:string,trim=false)=>{
    if(state.mode==='ink'||state.mode==='erase'){
      const cutoff=trim && state.mode==='ink'?releaseCutoff(state.ring):undefined;
      events.push({type:'end',reason,...(cutoff!==undefined?{trimAfter:cutoff}:{})});
    }
    state.mode='hover';
  };
  const reset=()=>{
    if(state.shortcut)state.shortcut=holdStep(state.shortcut,'missing',frame.t).state;
    state.pinching=false;state.closeFrames=0;state.closeSince=undefined;state.releaseFrames=0;
    state.heldThroughLoss=false;state.candidate=undefined;state.ring=[];
    state.fx=state.fy=undefined;state.features=state.commandFeatures=undefined;
    state.eraseFrames=0;state.eraseSince=undefined;state.tracking=undefined;
    state.transform=undefined;state.transformReady=0;
    state.command={...initialEngineState().command,cooldown:state.command.cooldown};
  };
  if(frame.t<=previous.t)return{state:previous,events:[],gesture:'NONE',status:'Waiting for a new camera frame',activeHand:'None',commandReady:false};
  const width=Math.max(1,frame.viewport?.width??1440),height=Math.max(1,frame.viewport?.height??900);
  const identityConfig=`${settings.dominantHand}:${settings.swapHands}:${width}x${height}:${settings.mirror}:${settings.region}:${settings.calibration?.enter??.3}:${settings.calibration?.exit??.5}`;
  if(previous.identityConfig!==identityConfig){end('hand preference changed');state.identity=undefined;reset();if(previous.identityConfig)state.armed=false;}
  const presentation=!!context.presentation;
  if(previous.presentation!==undefined && previous.presentation!==presentation){
    end('presentation mode changed',true);reset();state.armed=false;
  }
  state.presentation=presentation;
  state.identityConfig=identityConfig;
  const maxGap=frame.mobile?320:150;
  const discontinuity=frame.t-previous.t>maxGap;
  if(discontinuity){end('camera frame gap',true);reset();state.identity=frame.t-previous.t>300?undefined:state.identity;state.armed=previous.armed&&!previous.pinching;}
  state.t=frame.t;
  const selection=frame.pairedRoles ? {...selectHands({...frame,hands:frame.hands.slice(0,1)},undefined,settings),command:frame.hands[1]} : selectHands(frame,state.identity,settings);
  const hand=selection.draw;
  const lossGrace=frame.mobile?230:frame.pairedRoles?140:0;
  if(!hand && state.shortcut)state.shortcut=holdStep(state.shortcut,'missing',frame.t).state;
  if(!hand && !context.paused && !context.dialog && !context.shortcuts?.locked && lossGrace>0 && !selection.ambiguous && state.mode==='ink' && state.identity && frame.t-state.identity.t<=lossGrace) {
    state.heldThroughLoss=true;
    return {state,events,gesture:'NONE',status:'Hand briefly out of view',activeHand:'None',commandReady:false};
  }
  if(!hand){end('hand lost',true);reset();state.armed=previous.armed&&!previous.pinching;return{state,events,gesture:'NONE',status:selection.ambiguous?'Hands overlap — separate them':'Hand lost — bring it into view',activeHand:'None',commandReady:false};}
  if(state.identity&&frame.t-state.identity.t<150&&Math.hypot(hand.landmarks[0].x-state.identity.wrist.x,hand.landmarks[0].y-state.identity.wrist.y)>.22){end('tracking position jumped',true);reset();state.armed=false;}
  const previousIdentity=state.identity;
  state.identity=selection.identity;
  const features=extractFeatures(hand,discontinuity?undefined:state.features,frame.aspect??1);
  if(!features){end('invalid landmarks',true);reset();state.armed=false;return{state,events,gesture:'NONE',status:'Tracking uncertain — show your whole hand',activeHand:state.identity!.side,commandReady:false};}
  state.features=features;
  const tracking=trackingSample(hand,frame.t,frame.aspect??1),jump=isolatedTipJump(state.tracking,tracking);state.tracking=tracking;
  if(jump){end('fingertip tracking jumped',true);reset();state.tracking=tracking;state.armed=false;return{state,events,gesture:'NONE',status:'Fingertip tracking uncertain — release and show your tips',activeHand:state.identity!.side,commandReady:false};}
  const limits=thresholds(settings.calibration,frame.mobile);
  const policy=context.shortcuts;
  if(policy && frame.pairedRoles){
    const reserved=context.paused || context.dialog || policy.waitingForPalm;
    const continuingContact=state.pinching && features.pinch<limits.exit && !policy.locked;
    const pose=reserved?'missing':continuingContact?'neutral':shortcutPose(hand,features,frame.aspect??1,settings.mirror,policy);
    const held=holdStep(state.shortcut,pose,frame.t);
    if(policy.locked || policy.waitingForPalm || (pose!=='missing' && pose!=='neutral')){
      end('board shortcut',true);reset();state.armed=false;
      state.features=features;state.tracking=tracking;state.shortcut=held.state;
      if(held.action==='lock')events.push({type:'toggle-lock'});
      else if(held.action)events.push({type:'page',direction:held.action==='next'?1:-1});
      const status=policy.waitingForPalm?'Open your drawing palm to start':pose==='lock'?'Hold pinky to toggle board lock':
        policy.locked?'Board locked':pose==='next'?'Hold thumb right for next page':'Hold thumb left for previous page';
      return {state,events,gesture:'NONE',status,activeHand:state.identity!.side,commandReady:false};
    }
    state.shortcut=held.state;
  }
  const ratio=features.pinch,anchor=cursorAnchor(hand,ratio,settings.calibration,frame.mobile),margin=clamp(settings.region,.03,.32);
  const normalize=(n:number)=>(n-margin)/(1-2*margin);
  const mapX=(n:number)=>frame.paper?paperAxis(normalize(n),frame.paper.left,frame.paper.right):normalize(n);
  const mapY=(n:number)=>frame.paper?paperAxis(normalize(n),frame.paper.top,frame.paper.bottom):normalize(n);
  const x=mapX(settings.mirror?1-anchor.x:anchor.x),y=mapY(anchor.y);
  if(state.heldThroughLoss && previousIdentity) {
    const wrist=hand.landmarks[0], tip=hand.landmarks[8];
    const moved=Math.hypot(wrist.x-previousIdentity.wrist.x,wrist.y-previousIdentity.wrist.y);
    const jumped=previous.tracking && Math.hypot(tip.x-previous.tracking.tips[0].x,tip.y*(frame.aspect??1)-previous.tracking.tips[0].y)>.11;
    if(frame.t-previousIdentity.t>lossGrace || moved>.07 || jumped || ratio>=limits.exit || features.gesture==='FIST') {
      end('hand returned in a different position or pose',true);
      state.armed=false;
    }
    state.heldThroughLoss=false;
  }
  const wasPinching=state.pinching;
  Object.assign(state,observePinch(state,features,limits,frame.t,frame.mobile));
  // Candidate starts at the first observed sample crossing 0.6, before close confirmation.
  if(!wasPinching){if(frame.mobile && ratio>=limits.exit && features.gesture!=='FIST')state.armed=true;if(ratio>=limits.lead){state.candidate=undefined;state.ring=[];state.armed=true;}else if(state.candidate===undefined)state.candidate=frame.t;}
  const oldX=state.fx?.value,oldY=state.fy?.value;
  state.fx=filter(x*width,frame.t,state.fx,settings.smoothness,maxGap);state.fy=filter(y*height,frame.t,state.fy,settings.smoothness,maxGap);
  // Limit cursor displacement on the confirmation frame, in CSS pixels.
  const onset=state.pinching&&!wasPinching;
  if(onset&&oldX!==undefined&&oldY!==undefined){const dx=state.fx.value-oldX,dy=state.fy.value-oldY,d=Math.hypot(dx,dy);if(d>8){state.fx={...state.fx,value:oldX+dx*8/d};state.fy={...state.fy,value:oldY+dy*8/d};}}
  const point:Sample={x:clamp(state.fx.value/width),y:clamp(state.fy.value/height),t:frame.t,ratio};
  const priorRing=[...state.ring];
  state.ring.push(point);state.ring=state.ring.filter(p=>frame.t-p.t<=350).slice(-12);
  const gesture=state.pinching?'PINCH':features.gesture;
  const outside=x<0||x>1||y<0||y>1;
  const cursor={...point,inBounds:!outside,hand:state.identity!.side,gesture,eraser:gesture==='PEACE'};
  if(route)context={...context,...route(cursor)};
  // Paused means no writing or direct commands; cursor clicks can still resume tracking.
  const captured=previous.mode==='transform';
  const blocked=context.paused||context.dialog||(!captured&&(context.overUI||outside||context.allowInk===false));
  if(blocked){end(context.overUI?'over UI':context.paused?'paused':'outside canvas',true);if(state.pinching || state.closeFrames>0)state.armed=false;state.ring=[];state.candidate=undefined;}

  const second=selection.command,secondFeatures=second?extractFeatures(second,state.commandFeatures,frame.aspect??1):undefined;
  state.commandFeatures=secondFeatures;
  const zoomEnter=Math.min(limits.exit-.03,limits.enter+.12);
  const dualPinch=!blocked&&(captured||state.transformReady>0||state.armed)&&!!second&&(frame.pairedRoles||second.score>.7)&&features.gesture!=='FIST'&&secondFeatures?.gesture!=='FIST'&&features.pinch<(captured?limits.exit:zoomEnter)&&(secondFeatures?.pinch??Infinity)<(captured?limits.exit:zoomEnter);
  state.transformReady=dualPinch?state.transformReady+1:0;
  if(dualPinch&&state.transformReady<3){end('confirming two-hand intent',true);state.armed=false;return{state,events,cursor,gesture:'PINCH',status:'Hold both pinches — preparing zoom',activeHand:state.identity!.side,commandReady:false};}
  if(dualPinch&&state.transformReady>=3){
    end('two-hand transform');state.armed=false;
    const a=hand.landmarks[0],b=second!.landmarks[0],dist=Math.hypot(a.x-b.x,(a.y-b.y)*(frame.aspect??1)),mid={x:settings.mirror?1-(a.x+b.x)/2:(a.x+b.x)/2,y:(a.y+b.y)/2};
    const screenMid={x:mapX(mid.x),y:mapY(mid.y)};
    const transformed=transformStep(dist,screenMid,frame.t,state.transform);
    if(state.transform)events.push({type:'transform',scale:transformed.scale,factor:transformed.state.scale,dx:transformed.dx,dy:transformed.dy,anchor:{x:clamp(screenMid.x),y:clamp(screenMid.y)}});
    else events.push({type:'transform-start'});
    state.transform=transformed.state;state.mode='transform';state.command.ready=0;
    return{state,events,cursor,gesture:'PINCH',status:'Two hands — zoom & pan',activeHand:state.identity!.side,commandReady:false};
  }
  if(state.mode==='transform'){state.mode='hover';state.transform=undefined;state.armed=false;}
  if(!dualPinch)state.transform=undefined;
  const slideHand=context.presentation?hand:second;
  const command=commandStep(slideHand,frame.t,state.command,state.mode==='ink'||state.mode==='erase'||state.pinching||!!context.paused||!!context.dialog||!!context.overUI||(!context.presentation&&gesture==='PEACE'),settings.mirror,context.presentation?features:secondFeatures,settings.guardCommands!==false,frame.mobile,frame.pairedRoles);
  state.command=command.state;
  const commands=command.events.filter(e=>!context.presentation||e.type==='page');
  if(commands.length){
    events.push(...commands);state.ring=[];state.candidate=undefined;state.armed=false;
    return {state,events,gesture,status:commands[0].type==='page'?'Changing page':'Board command',activeHand:state.identity!.side,commandReady:false};
  }

  state.eraseFrames=gesture==='PEACE'?state.eraseFrames+1:0;
  state.eraseSince=gesture==='PEACE'&&!blocked?(state.eraseSince??frame.t):undefined;
  if(!blocked&&!context.presentation){
    const approach=previous.ring.at(-2),contact=previous.ring.at(-1);
    if(context.allowDot && previous.armed && state.armed && previous.closeFrames===1 && !wasPinching && ratio>=limits.exit && !second && state.mode==='hover' &&
      contact && approach && approach.ratio>=limits.enter && approach.ratio<limits.lead && contact.ratio<limits.enter*.72 &&
      frame.t-approach.t<=300 && Math.hypot((contact.x-approach.x)*width,(contact.y-approach.y)*height)<8 &&
      Math.hypot((point.x-contact.x)*width,(point.y-contact.y)*height)<10){
      events.push({type:'begin',point:contact,points:[contact],erase:false},{type:'end',reason:'short pinch dot'});
    }
    if(state.mode==='ink'&&!state.pinching){state.ring=priorRing;end('pinch released',true);state.ring=[point];state.candidate=undefined;}
    if(state.mode==='erase'&&gesture!=='PEACE')end('eraser released');
    if(state.pinching&&state.armed){
      if(state.mode==='erase')end('switch to ink');
      if(state.mode!=='ink'){
        // Limit lead-in ink to the recent approach near confirmed contact.
        const earliest=Math.max(state.candidate??frame.t,frame.t-180);
        let first=state.ring.length-1;
        while(first>0){
          const prior=state.ring[first-1];
          if(prior.t<earliest || Math.hypot((point.x-prior.x)*width,(point.y-prior.y)*height)>45)break;
          first--;
        }
        const points=state.ring.slice(first);
        events.push({type:'begin',point:points[0]??point,points:points.length?points:[point],erase:false});state.mode='ink';
      }else events.push({type:'point',point,erase:false});
    }else if(gesture==='PEACE'&&state.armed&&state.eraseFrames>=2&&state.eraseSince!==undefined&&frame.t-state.eraseSince>=100){
      if(state.mode==='ink')end('switch to eraser',true);
      if(state.mode!=='erase'){events.push({type:'begin',point,points:[point],erase:true});state.mode='erase';}
      else events.push({type:'point',point,erase:true});
    }
  }else if(context.presentation)end('presentation pointer',true);
  const status=context.paused?'Paused — use Resume':context.overUI?'Over controls — pinch or dwell':context.allowInk===false?'Outside paper — move onto the canvas':outside?'Move inside the writing area':state.mode==='ink'?'Pinching — writing':state.mode==='erase'?'Peace — erasing':context.presentation?'Point — laser':!state.armed?'Release pinch before continuing':'Not pinching — move to draw or choose a control';
  return{state,events,cursor,gesture,status,activeHand:state.identity!.side,commandReady:state.command.ready>=3&&(settings.guardCommands===false||state.command.armed===true)};
}
