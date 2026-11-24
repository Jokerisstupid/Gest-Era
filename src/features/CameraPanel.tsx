import type { Drill } from './HandDemo';
import { PracticeMotion } from './practiceMotion';
import { useEffect, useRef, useState } from 'react';
import { Camera, Download, Hand, LoaderCircle, Pause, Play, Settings2, VideoOff, X } from 'lucide-react';
import { palmOf, matchPalm, PresenterHands, type HandRole } from '../engine/gestures/presenter';
import { HandCyclePairing } from '../engine/gestures/hand-shortcuts';
import { presenterRegion, type CameraRegion } from '../engine/gesture-crop';
import type { Hand as DetectedHand } from '../engine/gestures/types';
import { CameraTracker } from '../engine/vision';
import { profileMatches } from '../engine/gestures/calibration';
import { step } from '../engine/gestures/engine';
import { initialEngineState, type Context, type EngineEvent, type Frame, type GestureSettings } from '../engine/gestures/types';
import { useSettings } from '../store/settings';
import { download } from '../engine/board';
import HandCursor, { type HandCursorHandle } from './HandCursor';
import GestureCalibration,{type CalibrationFeed} from './CalibrationWizard';
import { dwellStep, gestureTarget, initialDwellState } from './gestureUI';
export type HandInput=EngineEvent;
function drawingHand(settings:GestureSettings){return settings.swapHands?(settings.dominantHand==='Left'?'Right':'Left'):settings.dominantHand;}
const labels=['unlabeled','open palm','point','pinch','peace','fist','swipe','two-hand pinch'] as const;
export default function CameraPanel({drill,onRecognized,onPracticeHint,onClose,onInput,onStatus,presentation=false,boardContains,tool,sessionKey,locked,onToggleLock,paperArea}:{drill?:Drill|'done';onRecognized:()=>void;onPracticeHint:(text:string)=>void;paperArea:()=>Frame['paper'];locked:boolean;onToggleLock:()=>void;onClose:()=>void;onInput:(event:EngineEvent)=>void;onStatus:(status:string)=>void;presentation?:boolean;boardContains:(x:number,y:number)=>boolean;tool:string;sessionKey:string}){
  const video=useRef<HTMLVideoElement>(null),overlay=useRef<HTMLCanvasElement>(null),cursor=useRef<HandCursorHandle>(null);
  const settings=useSettings(),currentSettings=useRef(settings),callbacks=useRef({drill,onRecognized,onPracticeHint,onInput,onStatus,boardContains,presentation,tool,sessionKey,locked,onToggleLock,paperArea});
  currentSettings.current=settings;callbacks.current={drill,onRecognized,onPracticeHint,onInput,onStatus,boardContains,presentation,tool,sessionKey,locked,onToggleLock,paperArea};
  const [calibrationOpen,setCalibrationOpen]=useState(false),calibrationRef=useRef(false),calibrationFeed=useRef<CalibrationFeed|null>(null);calibrationRef.current=calibrationOpen;
  const [folded,setFolded]=useState(false);
  const owner=useRef(new PresenterHands()),selecting=useRef<HandRole|null>('draw');
  const focusRegion=useRef<CameraRegion|undefined>(undefined);
  const reach=useRef<Frame['reach']>(undefined);
  const neutralRequired=useRef(false);
  const pairedSide=useRef<'Left'|'Right'|undefined>(undefined);
  const cyclePairing=useRef(new HandCyclePairing());
  const latest=useRef({hands:[] as DetectedHand[],t:-Infinity,aspect:1,drawing:undefined as DetectedHand|undefined});
  const [markers,setMarkers]=useState<NonNullable<ReturnType<typeof palmOf>>[]>([]);
  const [selection,setSelection]=useState<HandRole|null>('draw');
  const resetInput=useRef(()=>{});
  const chooseRole=(role:HandRole)=>{
    cyclePairing.current.reset();focusRegion.current=undefined;
    if(role==='draw'){reach.current=undefined;pairedSide.current=undefined;owner.current.clear();setCalibrationOpen(false);}
    selecting.current=role;setSelection(role);setPreview(true);setFolded(false);setMarkers([]);resetInput.current();
  };
  const pair=(marker:NonNullable<ReturnType<typeof palmOf>>)=>{
    const {hands,aspect,t}=latest.current,role=selecting.current;
    if(callbacks.current.locked || pauseRef.current || !role || performance.now()-t>500 || (role==='command'&&!latest.current.drawing))return;
    const match=matchPalm(marker,hands,aspect,t);
    if(match && owner.current.pair(role,match.hand,aspect,t)){
      if(role==='draw'){
        // The cursor follows the index finger. Anchor reach near its resting position
        // using the knuckle so tapping a number with a curled finger works too.
        const wrist=match.hand.landmarks[0],knuckle=match.hand.landmarks[5];
        reach.current={x:knuckle.x+.7*(knuckle.x-wrist.x),y:knuckle.y+.7*(knuckle.y-wrist.y),size:match.palm.size};
      }
      neutralRequired.current=false;cyclePairing.current.reset();if(role==='draw')pairedSide.current=match.hand.side==='Left'||match.hand.side==='Right'?match.hand.side:undefined;
      focusRegion.current=undefined;selecting.current=null;setSelection(null);setMarkers([]);resetInput.current();
      if(window.innerWidth<=600)setFolded(true);
    }
  };
  const [advanced,setAdvanced]=useState(false);
  const activeSettings=useRef<GestureSettings>(settings),recordSettings=useRef<GestureSettings|undefined>(undefined);
  const [freeRecording,setFreeRecording]=useState(false);
  const [preview,setPreview]=useState(true);
  const [error,setError]=useState(''),[loading,setLoading]=useState(true),[paused,setPaused]=useState(false),pauseRef=useRef(false);
  const [metrics,setMetrics]=useState({fps:0,captureFPS:0,aspect:.75,pipeline:0,backend:'Starting',inference:0,hands:0,gesture:'NONE',activeHand:'None',state:'HOVER',lowLight:false,glare:false,width:0,height:0,compatible:true});
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[device,setDevice]=useState(''),[retry,setRetry]=useState(0);
  const [recording,setRecording]=useState(false),recordRef=useRef(false),records=useRef<(Frame&{label:string})[]>([]);
  const [label,setLabel]=useState<string>('unlabeled'),labelRef=useRef(label);labelRef.current=label;
  recordRef.current=recording;pauseRef.current=paused;
  useEffect(()=>{
    if(!video.current)return;
    let state=initialEngineState(),dwell=initialDwellState(),lastUI=-Infinity,loaded=false,alive=true,key=callbacks.current.sessionKey;
    const finish=(reason:string)=>{callbacks.current.onInput({type:'end',reason});state=initialEngineState();state.armed=false;dwell=initialDwellState();cursor.current?.update({x:0,y:0,visible:false,pinching:false,eraser:false,progress:0,overUI:false,label:''});};
    reach.current=undefined;owner.current.clear();pairedSide.current=undefined;focusRegion.current=undefined;selecting.current='draw';setSelection('draw');setMarkers([]);setFolded(false);setPreview(true);
    resetInput.current=()=>finish('presenter selection changed');
    cyclePairing.current.reset();
    let practiceMotion=new PracticeMotion(),lastDrill:Drill|'done'|undefined;
    let lastPage=-Infinity,aspect=0;
    const tracker=new CameraTracker(video.current,(hands,m)=>{
      if(!alive)return;if(key!==callbacks.current.sessionKey){const latch=state.shortcut,swipe=state.pageSwipe;finish('page changed');if(swipe?.fired)state.pageSwipe=swipe;if(latch)state.shortcut={...latch,pose:'missing',last:m.t,since:m.t};key=callbacks.current.sessionKey;}
      if(!loaded){loaded=true;setLoading(false);void navigator.mediaDevices.enumerateDevices().then(ds=>{if(alive)setDevices(ds.filter(d=>d.kind==='videoinput'));}).catch(()=>{});}
      if(aspect && Math.abs(m.aspect-aspect)>.035)chooseRole('draw');
      aspect=m.aspect;
      const owned=owner.current.follow(hands,m.aspect,m.t);
      const lastFrame=latest.current;
      latest.current={hands,aspect:m.aspect,t:m.t,drawing:owned.draw};
      if(!owner.current.paired && selecting.current!=='draw')chooseRole('draw');
      if(selecting.current && !callbacks.current.locked && !pauseRef.current){
        const eligible=selecting.current==='draw'?hands:hands.filter(h=>h!==owned.draw);
        const palm=cyclePairing.current.observe(eligible,m.aspect,m.t);
        if(palm)pair(palm);
      }
      const active=owned.draw && !selecting.current?[owned.draw,...(owned.command?[owned.command]:[])]:[];
      tracker.trackingMissing=owner.current.paired&&!owned.draw;
      tracker.scanDetail=selecting.current==='draw'&&!focusRegion.current;
      tracker.fixedRegion=selecting.current==='draw'&&!!focusRegion.current;
      if(owned.draw){
        const palm=palmOf(owned.draw,m.aspect,m.t)!;
        const size=Math.min(.55,Math.max(.10,palm.size*2.4/Math.min(1,m.aspect)));
        const origin=(v:number)=>Math.max(0,Math.min(1-size,v-size/2));
        tracker.meterRegion={x:origin(palm.x),y:origin(palm.y),size};
      }else if(selecting.current==='draw')tracker.meterRegion=undefined;
      if(selecting.current)tracker.region=selecting.current==='draw'?focusRegion.current:undefined;
      else if(owner.current.hasCommand)tracker.region=undefined;
      else if(owned.draw){
        const before=lastFrame.drawing?.landmarks[0],now=owned.draw.landmarks[0],dt=m.t-lastFrame.t;
        const lead=(delta:number)=>Math.max(-.10,Math.min(.10,delta*Math.min(1.5,90/dt)));
        const motion=before&&dt>0&&dt<200?{x:lead(now.x-before.x),y:lead(now.y-before.y)}:undefined;
        tracker.region=presenterRegion(owned.draw,tracker.region,motion);
      }
      const frame:Frame={t:m.t,reach:reach.current,hands:active,pairedRoles:true,paper:callbacks.current.paperArea(),inputMirrored:m.inputMirrored,aspect:m.aspect,fps:m.fps,mobile:/Android|iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1),viewport:{width:window.innerWidth,height:window.innerHeight}},compatible=profileMatches(currentSettings.current.calibration,m.cameraId,m.aspect,pairedSide.current??drawingHand(currentSettings.current)),s:GestureSettings=recordRef.current&&recordSettings.current?recordSettings.current:{...currentSettings.current,calibration:compatible?currentSettings.current.calibration:undefined};activeSettings.current=s;
      if(recordRef.current&&records.current.length<5400)records.current.push({...frame,label:labelRef.current});
      const dialog=!!document.querySelector('dialog[open]');
      const drill=callbacks.current.drill;
      if(drill!==lastDrill){finish('practice changed');practiceMotion=new PracticeMotion();lastDrill=drill;}
      const practicing=!!drill && !pauseRef.current && !dialog && !calibrationRef.current;
      const common:Context={
        allowDot:!!drill||callbacks.current.tool==='pen',paused:pauseRef.current||calibrationRef.current,
        presentation:!drill&&callbacks.current.presentation,dialog,
        shortcuts:{locked:callbacks.current.locked,waitingForPalm:neutralRequired.current,
          thumbPages:!!drill||currentSettings.current.thumbPages,editing:!!document.activeElement?.matches('input,textarea,[contenteditable=true]')}
      };
      const captured=state.mode==='transform';
      let x=0,y=0,target:ReturnType<typeof gestureTarget>;
      const output=step(frame,state,s,common,cursor=>{
        x=cursor.x*window.innerWidth;y=cursor.y*window.innerHeight;
        target=captured||!cursor.inBounds?undefined:gestureTarget(x,y);
        if(drill && !target?.element.hasAttribute('data-practice-target'))target=undefined;
        if(pauseRef.current && !target?.element.hasAttribute('data-resume'))target=undefined;
        return {overUI:!!target||dialog,allowInk:practicing||captured||(!target&&!dialog&&callbacks.current.boardContains(x,y))};
      });
      calibrationFeed.current?.({t:m.t,ratio:output.state.features?.pinch,wrist:output.state.identity?.wrist,hands:owned.draw?1:0,lowLight:m.lowLight,cameraId:m.cameraId,aspect:m.aspect,mobile:frame.mobile});
      state=output.state;
      if(active[0] && state.features?.gesture==='OPEN_PALM')neutralRequired.current=false;
      if(practicing && ((drill==='pair'&&owned.draw)||(drill==='second'&&owned.command)||(drill==='aim'&&output.gesture==='POINT'&&output.cursor?.inBounds)||(drill==='laser'&&target&&output.gesture==='POINT')))callbacks.current.onRecognized();
      // End drawing before dispatching a control. A toolbar pinch is never pen-down.
      output.events.forEach(e=>{
        if(drill){
          if(practicing && drill!=='done'){
            if(practiceMotion.accepts(drill,e,output.gesture==='OPEN_PALM'))callbacks.current.onRecognized();
            else if(e.type==='page'&&(drill==='left'||drill==='right')){
              callbacks.current.onPracticeHint(output.gesture==='OPEN_PALM'
                ?'Other direction detected. Pause for a second, then sweep '+drill+'.'
                :'Open your whole palm for this step.');
            }
          }
          return;
        }
        if(e.type==='toggle-lock'){callbacks.current.onToggleLock();return;}
        if(e.type==='page'){if(m.t-lastPage<360)return;lastPage=m.t;}
        callbacks.current.onInput(e);
      });
      if(!output.cursor){target=undefined;dwell=initialDwellState();}
      const ui=dwellStep(dwell,{target:target?.element,x,y,t:m.t,pinching:state.pinching,typingKey:!!target?.element.closest('.note-keyboard'),allowDwell:!captured&&(output.gesture==='POINT'||output.gesture==='OPEN_PALM')});
      dwell=ui.state;
      if(ui.click&&target&&drill){if(practicing&&(drill==="select"||drill==="color"||drill==="text"))callbacks.current.onRecognized();}
      else if(ui.click&&target){callbacks.current.onInput({type:'end',reason:'UI click'});target.element.click();}
      cursor.current?.update({x,y,visible:!!output.cursor,pinching:state.pinching,radius:currentSettings.current.eraserRadius,eraser:(output.cursor?.eraser??false)||callbacks.current.tool==='eraser',progress:ui.progress,overUI:!!target,laser:(callbacks.current.presentation||callbacks.current.tool==='laser')&&!target,label:target?.element.getAttribute('aria-label')??(output.cursor?.eraser?'Erase':output.gesture==='PINCH'?'Pinch':'')});
      const ctx=overlay.current?.offsetHeight?overlay.current.getContext('2d'):null;if(ctx){ctx.clearRect(0,0,320,240);hands.forEach(h=>{ctx.fillStyle=active.includes(h)?'#66ddc1':'#9aaac3';ctx.beginPath();for(const p of h.landmarks){const x=(s.mirror?1-p.x:p.x)*320,y=p.y*240;ctx.moveTo(x+2,y);ctx.arc(x,y,2,0,Math.PI*2);}ctx.fill();});}
      if(m.t-lastUI>160){
        if(selecting.current)setMarkers(hands.filter(h=>selecting.current==='draw'||h!==owned.draw).flatMap(h=>palmOf(h,m.aspect,m.t)??[]));
        setMetrics({...m,hands:hands.length,gesture:output.gesture,activeHand:output.activeHand,state:state.mode.toUpperCase(),compatible});
        callbacks.current.onStatus(selecting.current?'Close and open your hand 3 times, or tap its number':callbacks.current.locked?'Board locked':neutralRequired.current?'Open your drawing palm to start':tracker.trackingMissing?'Finding your paired hand':output.status);lastUI=m.t;
      }
    },message=>{if(alive){finish('camera error');setFolded(false);setPreview(true);setMetrics(m=>({...m,hands:0,fps:0,captureFPS:0}));setError(message);setLoading(false);callbacks.current.onStatus('Camera stopped — mouse and touch ready');}},()=>{
      if(!alive)return;
      chooseRole('draw');finish('camera recovering');setFolded(false);setPreview(true);setLoading(true);loaded=false;
      setMetrics(m=>({...m,hands:0,fps:0,captureFPS:0}));
      callbacks.current.onStatus('Reconnecting camera');
    });
    void tracker.start(device||undefined);
    const visibility=()=>{if(document.hidden){tracker.stop();finish('tab hidden');setFolded(false);setError('Camera stopped while this tab was hidden. Restart when ready.');setLoading(false);}};
    document.addEventListener('visibilitychange',visibility);
    return()=>{alive=false;tracker.stop();finish('camera closed');document.removeEventListener('visibilitychange',visibility);};
  },[device,retry]);
  const saveRecording=()=>{setRecording(false);download(new Blob([JSON.stringify({source:'real-camera',version:2,metadata:{sdk:'@mediapipe/tasks-vision',inputMirrored:false,settings:recordSettings.current??activeSettings.current,labels:'user-selected per-frame; unlabeled frames excluded from accuracy scores'},frames:records.current})],{type:'application/json'}),'gestera-labeled-landmarks.json');records.current=[];};
  return <><HandCursor ref={cursor}/><section className={`camera-panel gesture-camera ${folded && !error?'is-folded':''}`} aria-label="Gesture control"><div className="camera-head"><span><span className={error?'status-dot warning':'status-dot'}/>{error?'Camera unavailable':loading?'Starting camera':neutralRequired.current?'Open palm to start':folded?Math.round(metrics.fps)+' fps | '+metrics.hands+' hands':'Gesture control'}</span><button data-gesture className="camera-fold" aria-expanded={!folded} onClick={()=>setFolded(v=>!v)}>{folded?"Expand":"Hide"}</button><button data-gesture aria-label="Stop camera" onClick={onClose}><X size={17}/></button></div><div className={error?'camera-view has-error':preview?'camera-view':'camera-view preview-hidden'}><div className="camera-feed" style={{aspectRatio:1/metrics.aspect}}><video ref={video} muted autoPlay playsInline style={{transform:settings.mirror?'scaleX(-1)':'none'}}/><canvas ref={overlay} width={320} height={240}/>{selection==='draw' && <button className="focus-hand" aria-label="Focus detection on a part of the camera preview" onClick={e=>{
        const box=e.currentTarget.getBoundingClientRect();
        const x=e.detail?(e.clientX-box.left)/box.width:.5,y=e.detail?(e.clientY-box.top)/box.height:.5;
        const size=.52,origin=(n:number)=>Math.min(1-size,Math.max(0,n-size/2));
        focusRegion.current={x:origin(settings.mirror?1-x:x),y:origin(y),size};setMarkers([]);
      }}/>}
      {selection==='draw' && focusRegion.current && <div aria-hidden="true" className="focus-frame" style={{left:100*(settings.mirror?1-focusRegion.current.x-focusRegion.current.size:focusRegion.current.x)+'%',top:100*focusRegion.current.y+'%',width:100*focusRegion.current.size+'%',height:100*focusRegion.current.size+'%'}}/>}
      {selection && markers.map((marker,i)=><button key={i} type="button" className="pair-hand" aria-label={'Pair hand '+(i+1)+' at '+Math.round((settings.mirror?1-marker.x:marker.x)*100)+' percent across preview'} style={{left:(settings.mirror?1-marker.x:marker.x)*100+'%',top:marker.y*100+'%'}} onClick={()=>pair(marker)}>{i+1}</button>)}<div className="camera-region" style={{inset:settings.region*100+'%'}}/></div>{loading&&<div className="camera-message"><LoaderCircle className="spin" size={24}/><span>Starting camera and hand tracking</span></div>}{error&&<div className="camera-message" role="alert"><VideoOff size={24}/><p>{error}</p><button data-gesture className="btn primary" onClick={()=>{setError('');setLoading(true);setRetry(n=>n+1);}}>Restart camera</button></div>}{!error&&!loading&&!folded&&preview&&metrics.hands===0&&<span className="camera-nohand"><Hand size={15}/>Show your drawing hand</span>}</div>{!error&&<><div className="camera-metrics"><span>{metrics.hands} hands</span><span>{Math.round(metrics.fps)} fps</span><span>{Math.round(metrics.inference)} ms</span></div><div className="camera-state">{paused?'PAUSED':metrics.state} · {metrics.activeHand} · {metrics.gesture}</div>{!loading&&metrics.lowLight&&<p className="camera-hint">Move toward a front light so the camera can see your fingertips.</p>}{!loading&&metrics.glare&&<p className="camera-hint">Strong backlight detected. Keep the light in front of your hand.</p>}{!metrics.compatible&&<p className="camera-hint">The saved profile belongs to another camera setup. Recalibrate here.</p>}<div className="presenter-pair"><strong>{selection?'Choose your '+(selection==='draw'?'drawing':'second')+' hand':owner.current.hasCommand?'2 hands paired':'1 writing hand paired'}</strong>{!selection&&neutralRequired.current&&<p>Open your drawing palm to start.</p>}{selection?<><p>Close your fist and open your hand three times, or tap the number on your hand in the preview.</p><span aria-live="polite">{cyclePairing.current.cycles} / 3 cycles</span></>:<div><button onClick={()=>chooseRole('draw')}>Change presenter</button><button onClick={()=>chooseRole('command')}>{owner.current.hasCommand?'Change second hand':'Pair second hand'}</button>{owner.current.hasCommand&&<button onClick={()=>{owner.current.releaseCommand();resetInput.current();setMetrics(v=>({...v}));}}>Use writing hand only</button>}</div>}{selection==='draw' && focusRegion.current && <button onClick={()=>{focusRegion.current=undefined;setMarkers([]);}}>Use full camera</button>}{selection==='command'&&<button onClick={()=>{cyclePairing.current.reset();selecting.current=null;setSelection(null);}}>Cancel</button>}</div><div className="camera-primary-actions"><button data-gesture data-resume={paused?true:undefined} onClick={()=>setPaused(p=>!p)}>{paused?<Play size={16}/>:<Pause size={16}/>} {paused?'Resume':'Pause'}</button><button data-gesture disabled={loading||recording||!!selection||locked} onClick={()=>setCalibrationOpen(true)}><Settings2 size={16}/>Calibrate</button></div><div className="camera-profile-state">{settings.calibration?.version===2&&metrics.compatible?'Verified personal profile':settings.calibration&&metrics.compatible?'Personal profile · verify with new setup':'Default pinch settings'}</div></>}<button data-gesture className="camera-settings-toggle" aria-expanded={advanced} onClick={()=>setAdvanced(v=>!v)}><Settings2 size={16}/>{advanced?'Hide controls':'Camera and recording'}</button>{advanced&&<div className="camera-advanced"><p className="camera-pipeline">{metrics.backend}<br/>{metrics.width} × {metrics.height} camera · {Math.round(metrics.captureFPS)} fps · Pipeline {Math.round(metrics.pipeline)} ms</p><div className="camera-quick"><button data-gesture onClick={()=>setPreview(v=>!v)}>{preview?'Compact preview':'Full preview'}</button><button data-gesture aria-pressed={settings.region<=.07} onClick={()=>settings.update({region:settings.region<=.07?.16:.05})}>{settings.region<=.07?'Use compact reach':'Use wider reach'}</button><button data-gesture disabled={recording} onClick={()=>settings.update({smoothness:settings.smoothness==='precise'?'balanced':settings.smoothness==='balanced'?'fast':'precise'})}>Smoothness: {settings.smoothness}</button><button data-gesture onClick={()=>settings.update({calibration:undefined})} disabled={recording||!settings.calibration}>Reset profile</button></div>{devices.length>1&&<label className="camera-select"><Camera size={14}/><select aria-label="Choose camera" disabled={recording} value={device} onChange={e=>{setLoading(true);setError('');setDevice(e.target.value);}}><option value="">Default camera</option>{devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||'Camera '+(devices.indexOf(d)+1)}</option>)}</select></label>}<button data-gesture className="camera-label-cycle" onClick={()=>setLabel(labels[(labels.indexOf(label as typeof labels[number])+1)%labels.length])}>Pose: {label} · change</button><button data-gesture className="free-recording" aria-pressed={freeRecording} onClick={()=>setFreeRecording(v=>!v)}>Free session: {freeRecording?'on':'off'}</button><button data-gesture className="camera-record-button" disabled={!recording&&label==='unlabeled'&&!freeRecording} onClick={()=>recording?saveRecording():(records.current=[],recordSettings.current={...activeSettings.current},setRecording(true))}><Download size={16}/>{recording?'Save recording':'Start labeled recording'}</button><p className="camera-hint">Choose the actual pose. Use unlabeled during transitions. Tracking settings stay fixed while recording. Recordings stay local.</p></div>}<div className="camera-private">Camera frames stay on your device.</div></section>{calibrationOpen&&<GestureCalibration feed={calibrationFeed} onSave={profile=>settings.update({calibration:{...profile,drawingHand:pairedSide.current??drawingHand(currentSettings.current)}})} onClose={()=>setCalibrationOpen(false)}/>}</>;
}
