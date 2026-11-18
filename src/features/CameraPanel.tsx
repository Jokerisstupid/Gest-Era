import { useEffect, useRef, useState } from 'react';
import { Camera, Download, Hand, LoaderCircle, Pause, Play, Settings2, VideoOff, X } from 'lucide-react';
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
export default function CameraPanel({onClose,onInput,onStatus,presentation=false,boardContains,tool,sessionKey}:{onClose:()=>void;onInput:(event:EngineEvent)=>void;onStatus:(status:string)=>void;presentation?:boolean;boardContains:(x:number,y:number)=>boolean;tool:string;sessionKey:string}){
  const video=useRef<HTMLVideoElement>(null),overlay=useRef<HTMLCanvasElement>(null),cursor=useRef<HandCursorHandle>(null);
  const settings=useSettings(),currentSettings=useRef(settings),callbacks=useRef({onInput,onStatus,boardContains,presentation,tool,sessionKey});
  currentSettings.current=settings;callbacks.current={onInput,onStatus,boardContains,presentation,tool,sessionKey};
  const [calibrationOpen,setCalibrationOpen]=useState(false),calibrationRef=useRef(false),calibrationFeed=useRef<CalibrationFeed|null>(null);calibrationRef.current=calibrationOpen;
  const [folded,setFolded]=useState(()=>window.innerWidth<=600);
  const [advanced,setAdvanced]=useState(false);
  const activeSettings=useRef<GestureSettings>(settings),recordSettings=useRef<GestureSettings|undefined>(undefined);
  const [freeRecording,setFreeRecording]=useState(false);
  const [preview,setPreview]=useState(()=>window.innerWidth>600);
  const [error,setError]=useState(''),[loading,setLoading]=useState(true),[paused,setPaused]=useState(false),pauseRef=useRef(false);
  const [metrics,setMetrics]=useState({fps:0,captureFPS:0,pipeline:0,backend:'Starting',inference:0,hands:0,gesture:'NONE',activeHand:'None',state:'HOVER',lowLight:false,compatible:true});
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[device,setDevice]=useState(''),[retry,setRetry]=useState(0);
  const [recording,setRecording]=useState(false),recordRef=useRef(false),records=useRef<(Frame&{label:string})[]>([]);
  const [label,setLabel]=useState<string>('unlabeled'),labelRef=useRef(label);labelRef.current=label;
  recordRef.current=recording;pauseRef.current=paused;
  useEffect(()=>{
    if(!video.current)return;
    let state=initialEngineState(),dwell=initialDwellState(),lastUI=-Infinity,loaded=false,alive=true,key=callbacks.current.sessionKey;
    const finish=(reason:string)=>{callbacks.current.onInput({type:'end',reason});state=initialEngineState();state.armed=false;dwell=initialDwellState();cursor.current?.update({x:0,y:0,visible:false,pinching:false,eraser:false,progress:0,overUI:false,label:''});};
    const tracker=new CameraTracker(video.current,(hands,m)=>{
      if(!alive)return;if(key!==callbacks.current.sessionKey){finish('page changed');key=callbacks.current.sessionKey;}
      if(!loaded){loaded=true;setLoading(false);void navigator.mediaDevices.enumerateDevices().then(ds=>{if(alive)setDevices(ds.filter(d=>d.kind==='videoinput'));}).catch(()=>{});}
      const frame:Frame={t:m.t,hands,inputMirrored:m.inputMirrored,aspect:m.aspect,viewport:{width:window.innerWidth,height:window.innerHeight}},compatible=profileMatches(currentSettings.current.calibration,m.cameraId,m.aspect,drawingHand(currentSettings.current)),s:GestureSettings=recordRef.current&&recordSettings.current?recordSettings.current:{...currentSettings.current,calibration:compatible?currentSettings.current.calibration:undefined};activeSettings.current=s;
      if(recordRef.current&&records.current.length<5400)records.current.push({...frame,label:labelRef.current});
      const common:Context={paused:pauseRef.current||calibrationRef.current,presentation:callbacks.current.presentation};
      const captured=state.mode==='transform';
      let x=0,y=0,target:ReturnType<typeof gestureTarget>;
      const output=step(frame,state,s,common,cursor=>{
        x=cursor.x*window.innerWidth;y=cursor.y*window.innerHeight;
        target=captured||!cursor.inBounds?undefined:gestureTarget(x,y);
        const dialog=!!document.querySelector('dialog[open]');
        return {overUI:!!target||dialog,allowInk:captured||(!target&&!dialog&&callbacks.current.boardContains(x,y))};
      });
      calibrationFeed.current?.({t:m.t,ratio:output.state.features?.pinch,wrist:output.state.identity?.wrist,hands:hands.length,lowLight:m.lowLight,cameraId:m.cameraId,aspect:m.aspect});
      state=output.state;
      // End drawing before dispatching a control. A toolbar pinch is never pen-down.
      output.events.forEach(e=>callbacks.current.onInput(e));
      const ui=dwellStep(dwell,{target:target?.element,x,y,t:m.t,pinching:state.pinching,typingKey:!!target?.element.closest('.note-keyboard'),allowDwell:!captured&&(output.gesture==='POINT'||output.gesture==='OPEN_PALM')});
      dwell=ui.state;
      if(ui.click&&target){callbacks.current.onInput({type:'end',reason:'UI click'});target.element.click();}
      cursor.current?.update({x,y,visible:!!output.cursor,pinching:state.pinching,radius:currentSettings.current.eraserRadius,eraser:(output.cursor?.eraser??false)||callbacks.current.tool==='eraser',progress:ui.progress,overUI:!!target,laser:(callbacks.current.presentation||callbacks.current.tool==='laser')&&!target,label:target?.element.getAttribute('aria-label')??(output.cursor?.eraser?'Erase':output.gesture==='PINCH'?'Pinch':'')});
      const ctx=overlay.current?.offsetHeight?overlay.current.getContext('2d'):null;if(ctx){ctx.clearRect(0,0,320,240);hands.forEach(h=>{ctx.fillStyle='#66ddc1';h.landmarks.forEach(p=>{ctx.beginPath();ctx.arc((s.mirror?1-p.x:p.x)*320,p.y*240,2,0,7);ctx.fill();});});}
      if(m.t-lastUI>160){
        setMetrics({...m,hands:hands.length,gesture:output.gesture,activeHand:output.activeHand,state:state.mode.toUpperCase(),compatible});
        callbacks.current.onStatus(m.lowLight?'Low light - brighten your drawing hand':output.status);lastUI=m.t;
      }
    },message=>{if(alive){finish('camera error');setFolded(false);setPreview(true);setError(message);setLoading(false);callbacks.current.onStatus('Camera stopped — mouse and touch ready');}});
    void tracker.start(device||undefined);
    const visibility=()=>{if(document.hidden){tracker.stop();finish('tab hidden');setFolded(false);setError('Camera stopped while this tab was hidden. Restart when ready.');setLoading(false);}};
    document.addEventListener('visibilitychange',visibility);
    return()=>{alive=false;tracker.stop();finish('camera closed');document.removeEventListener('visibilitychange',visibility);};
  },[device,retry]);
  const saveRecording=()=>{setRecording(false);download(new Blob([JSON.stringify({source:'real-camera',version:2,metadata:{sdk:'@mediapipe/tasks-vision',inputMirrored:false,settings:recordSettings.current??activeSettings.current,labels:'user-selected per-frame; unlabeled frames excluded from accuracy scores'},frames:records.current})],{type:'application/json'}),'gestera-labeled-landmarks.json');records.current=[];};
  return <><HandCursor ref={cursor}/><section className={`camera-panel gesture-camera ${folded && !error?'is-folded':''}`} aria-label="Gesture control"><div className="camera-head"><span><span className={error?'status-dot warning':'status-dot'}/>{loading?'Starting camera':'Gesture control'}</span><button data-gesture className="camera-fold" aria-expanded={!folded} onClick={()=>setFolded(v=>!v)}>{folded?"Expand":"Hide"}</button><button data-gesture aria-label="Stop camera" onClick={onClose}><X size={17}/></button></div><div className={error?'camera-view has-error':preview?'camera-view':'camera-view preview-hidden'}><video ref={video} muted playsInline style={{transform:settings.mirror?'scaleX(-1)':'none'}}/><canvas ref={overlay} width={320} height={240}/><div className="camera-region" style={{inset:settings.region*100+'%'}}/>{loading&&<div className="camera-message"><LoaderCircle className="spin" size={24}/><span>Starting camera and hand tracking</span></div>}{error&&<div className="camera-message"><VideoOff size={24}/><p>{error}</p><button data-gesture className="btn primary" onClick={()=>{setError('');setLoading(true);setRetry(n=>n+1);}}>Restart camera</button></div>}{!error&&!loading&&metrics.hands===0&&<span className="camera-nohand"><Hand size={15}/>Show your drawing hand</span>}</div>{!error&&<><div className="camera-metrics"><span>{metrics.hands} hands</span><span>{Math.round(metrics.fps)} fps</span><span>{Math.round(metrics.inference)} ms</span></div><div className="camera-state">{paused?'PAUSED':metrics.state} · {metrics.activeHand} · {metrics.gesture}</div>{!loading&&(metrics.lowLight||metrics.fps>0&&metrics.fps<24)&&<p className="camera-hint">Add front lighting for steadier tracking. Performance depends on the camera and device.</p>}{!metrics.compatible&&<p className="camera-hint">The saved profile belongs to another camera setup. Recalibrate here.</p>}<div className="camera-primary-actions"><button data-gesture onClick={()=>setPaused(p=>!p)}>{paused?<Play size={16}/>:<Pause size={16}/>} {paused?'Resume':'Pause'}</button><button data-gesture disabled={loading||recording} onClick={()=>setCalibrationOpen(true)}><Settings2 size={16}/>Calibrate</button></div><div className="camera-profile-state">{settings.calibration?.version===2&&metrics.compatible?'Verified personal profile':settings.calibration&&metrics.compatible?'Personal profile · verify with new setup':'Default pinch settings'}</div></>}<button data-gesture className="camera-settings-toggle" aria-expanded={advanced} onClick={()=>setAdvanced(v=>!v)}><Settings2 size={16}/>{advanced?'Hide controls':'Camera and recording'}</button>{advanced&&<div className="camera-advanced"><p className="camera-pipeline">{metrics.backend}<br/>Camera {Math.round(metrics.captureFPS)} fps · Pipeline {Math.round(metrics.pipeline)} ms</p><div className="camera-quick"><button data-gesture onClick={()=>setPreview(v=>!v)}>{preview?'Hide preview':'Show preview'}</button><button data-gesture disabled={recording} onClick={()=>settings.update({swapHands:!settings.swapHands})}>{settings.swapHands?'Hands swapped':'Swap hands'}</button><button data-gesture disabled={recording} onClick={()=>settings.update({smoothness:settings.smoothness==='precise'?'balanced':settings.smoothness==='balanced'?'fast':'precise'})}>Smoothness: {settings.smoothness}</button><button data-gesture onClick={()=>settings.update({calibration:undefined})} disabled={recording||!settings.calibration}>Reset profile</button></div>{devices.length>1&&<label className="camera-select"><Camera size={14}/><select aria-label="Choose camera" disabled={recording} value={device} onChange={e=>{setLoading(true);setError('');setDevice(e.target.value);}}><option value="">Default camera</option>{devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}</select></label>}<button data-gesture className="camera-label-cycle" onClick={()=>setLabel(labels[(labels.indexOf(label as typeof labels[number])+1)%labels.length])}>Pose: {label} · change</button><button data-gesture className="free-recording" aria-pressed={freeRecording} onClick={()=>setFreeRecording(v=>!v)}>Free session: {freeRecording?'on':'off'}</button><button data-gesture className="camera-record-button" disabled={!recording&&label==='unlabeled'&&!freeRecording} onClick={()=>recording?saveRecording():(records.current=[],recordSettings.current={...activeSettings.current},setRecording(true))}><Download size={16}/>{recording?'Save recording':'Start labeled recording'}</button><p className="camera-hint">Choose the actual pose. Use unlabeled during transitions. Tracking settings stay fixed while recording. Recordings stay local.</p></div>}<div className="camera-private">Camera frames stay on your device.</div></section>{calibrationOpen&&<GestureCalibration feed={calibrationFeed} onSave={profile=>settings.update({calibration:{...profile,drawingHand:drawingHand(currentSettings.current)}})} onClose={()=>setCalibrationOpen(false)}/>}</>;
}
