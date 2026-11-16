import { useEffect, useRef, useState } from 'react';
import { Camera, Circle, Download, Hand, LoaderCircle, Pause, Play, VideoOff, X } from 'lucide-react';
import { CameraTracker } from '../engine/vision';
import { step } from '../engine/gestures/engine';
import { initialEngineState, type Context, type EngineEvent, type Frame, type GestureSettings } from '../engine/gestures/types';
import { useSettings } from '../store/settings';
import { download } from '../engine/board';
import HandCursor, { type HandCursorHandle } from './HandCursor';
import GestureCalibration,{type CalibrationFeed} from './GestureCalibration';
import { dwellStep, gestureTarget, initialDwellState } from './gestureUI';
export type HandInput=EngineEvent;
const labels=['unlabeled','open palm','point','pinch','peace','fist','swipe','two-hand pinch'] as const;
export default function CameraPanel({onClose,onInput,onStatus,presentation=false,boardContains,tool}:{onClose:()=>void;onInput:(event:EngineEvent)=>void;onStatus:(status:string)=>void;presentation?:boolean;boardContains:(x:number,y:number)=>boolean;tool:string}){
  const video=useRef<HTMLVideoElement>(null),overlay=useRef<HTMLCanvasElement>(null),cursor=useRef<HandCursorHandle>(null);
  const settings=useSettings(),currentSettings=useRef(settings),callbacks=useRef({onInput,onStatus,boardContains,presentation,tool});
  currentSettings.current=settings;callbacks.current={onInput,onStatus,boardContains,presentation,tool};
  const [calibrationOpen,setCalibrationOpen]=useState(false),calibrationRef=useRef(false),calibrationFeed=useRef<CalibrationFeed|null>(null);calibrationRef.current=calibrationOpen;
  const [freeRecording,setFreeRecording]=useState(false);
  const [preview,setPreview]=useState(true);
  const [error,setError]=useState(''),[loading,setLoading]=useState(true),[paused,setPaused]=useState(false),pauseRef=useRef(false);
  const [metrics,setMetrics]=useState({fps:0,captureFPS:0,pipeline:0,backend:'Starting',inference:0,hands:0,gesture:'NONE',activeHand:'None',state:'HOVER',lowLight:false});
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[device,setDevice]=useState(''),[retry,setRetry]=useState(0);
  const [recording,setRecording]=useState(false),recordRef=useRef(false),records=useRef<(Frame&{label:string})[]>([]);
  const [label,setLabel]=useState<string>('unlabeled'),labelRef=useRef(label);labelRef.current=label;
  recordRef.current=recording;pauseRef.current=paused;
  useEffect(()=>{
    if(!video.current)return;
    let state=initialEngineState(),dwell=initialDwellState(),lastUI=-Infinity,loaded=false,alive=true;
    const finish=(reason:string)=>{callbacks.current.onInput({type:'end',reason});state=initialEngineState();dwell=initialDwellState();cursor.current?.update({x:0,y:0,visible:false,pinching:false,eraser:false,progress:0,overUI:false,label:''});};
    const tracker=new CameraTracker(video.current,(hands,m)=>{
      if(!alive)return;
      if(!loaded){loaded=true;setLoading(false);void navigator.mediaDevices.enumerateDevices().then(ds=>{if(alive)setDevices(ds.filter(d=>d.kind==='videoinput'));}).catch(()=>{});}
      const frame:Frame={t:m.t,hands,inputMirrored:m.inputMirrored,aspect:m.aspect},s:GestureSettings=currentSettings.current;
      if(recordRef.current&&records.current.length<5400)records.current.push({...frame,label:labelRef.current});
      const common:Context={paused:pauseRef.current||calibrationRef.current,presentation:callbacks.current.presentation};
      // Probe is pure: resolve the current filtered cursor before routing this frame to UI or ink.
      const probe=step(frame,state,s,{...common,overUI:true});
      const x=(probe.cursor?.x??0)*window.innerWidth,y=(probe.cursor?.y??0)*window.innerHeight;
      const captured=state.mode==='transform';
      const target=probe.cursor&&!captured?gestureTarget(x,y):undefined;
      if(probe.state.features)calibrationFeed.current?.(probe.state.features.pinch,m.t);
      const overBoard=!!probe.cursor&&callbacks.current.boardContains(x,y)&&!document.querySelector('dialog[open]');
      const output=step(frame,state,s,{...common,overUI:!!target||!!document.querySelector('dialog[open]'),allowInk:captured||overBoard});
      state=output.state;
      // End drawing before dispatching a control. A toolbar pinch is never pen-down.
      output.events.forEach(e=>callbacks.current.onInput(e));
      const ui=dwellStep(dwell,{target:target?.element,x,y,t:m.t,pinching:state.pinching,allowDwell:!captured&&!!output.cursor&&!output.cursor.eraser&&output.gesture!=='FIST'});
      dwell=ui.state;
      if(ui.click&&target){callbacks.current.onInput({type:'end',reason:'UI click'});target.element.click();}
      cursor.current?.update({x,y,visible:!!output.cursor,pinching:state.pinching,radius:currentSettings.current.eraserRadius,eraser:(output.cursor?.eraser??false)||callbacks.current.tool==='eraser',progress:ui.progress,overUI:!!target,laser:(callbacks.current.presentation||callbacks.current.tool==='laser')&&!target,label:target?.element.getAttribute('aria-label')??(output.cursor?.eraser?'Erase':output.gesture==='PINCH'?'Pinch':'')});
      const ctx=overlay.current?.getContext('2d');if(ctx){ctx.clearRect(0,0,320,240);hands.forEach(h=>{ctx.fillStyle='#66ddc1';h.landmarks.forEach(p=>{ctx.beginPath();ctx.arc((s.mirror?1-p.x:p.x)*320,p.y*240,2,0,7);ctx.fill();});});}
      if(m.t-lastUI>160){
        setMetrics({...m,hands:hands.length,gesture:output.gesture,activeHand:output.activeHand,state:state.mode.toUpperCase()});
        callbacks.current.onStatus(`${output.gesture} · ${state.mode.toUpperCase()} · ${output.activeHand} · ${output.status} · ${hands.length<2?'Single hand: use controls':output.commandReady?'Commands armed':'Open other palm to arm commands'}${m.lowLight?' · Low light':''}`);lastUI=m.t;
      }
    },message=>{if(alive){finish('camera error');setPreview(true);setError(message);setLoading(false);callbacks.current.onStatus('Camera stopped — mouse and touch ready');}});
    void tracker.start(device||undefined);
    const visibility=()=>{if(document.hidden){tracker.stop();finish('tab hidden');setError('Camera stopped while this tab was hidden. Restart when ready.');setLoading(false);}};
    document.addEventListener('visibilitychange',visibility);
    return()=>{alive=false;tracker.stop();finish('camera closed');document.removeEventListener('visibilitychange',visibility);};
  },[device,retry]);
  const saveRecording=()=>{setRecording(false);download(new Blob([JSON.stringify({source:'real-camera',version:2,metadata:{sdk:'@mediapipe/tasks-vision',inputMirrored:false,settings:currentSettings.current,labels:'user-selected per-frame; unlabeled frames excluded from accuracy scores'},frames:records.current})],{type:'application/json'}),'gestera-labeled-landmarks.json');records.current=[];};
  return <><HandCursor ref={cursor}/><div className="camera-panel gesture-camera"><div className="camera-head"><span><span className={error?'status-dot warning':'status-dot'}/>{loading?'Starting camera…':'Air writing'}</span><button data-gesture aria-label="Stop camera" onClick={onClose}><X size={16}/></button></div><div className={`camera-view ${preview?'':'preview-hidden'}`}><video ref={video} muted playsInline style={{transform:settings.mirror?'scaleX(-1)':'none'}}/><canvas ref={overlay} width={320} height={240}/><div className="camera-region" style={{inset:`${settings.region*100}%`}}/>{loading&&<div className="camera-message"><LoaderCircle className="spin" size={24}/><span>Loading hand tracking…</span></div>}{error&&<div className="camera-message"><VideoOff size={25}/><p>{error}</p><button data-gesture className="btn primary small-btn" onClick={()=>{setError('');setLoading(true);setRetry(n=>n+1);}}>Restart camera</button></div>}{!error&&!loading&&metrics.hands===0&&<span className="camera-nohand"><Hand size={15}/>Bring your hand into view</span>}</div>{!error&&<><div className="camera-metrics"><span>{metrics.hands} hands</span><span>{metrics.fps?`${Math.round(metrics.fps)} fps`:'— fps'}</span><span>{metrics.inference?`${Math.round(metrics.inference)} ms`:'— ms'}</span></div><div className="camera-pipeline">{metrics.backend} · camera {Math.round(metrics.captureFPS)} fps · pipeline {Math.round(metrics.pipeline)} ms</div><div className="camera-state">{metrics.activeHand} · {metrics.gesture} · {metrics.state}</div>{!loading&&(metrics.lowLight||(metrics.fps>0&&metrics.fps<24))&&<p className="camera-hint">{metrics.lowLight?'Low light. ':''}Add front lighting; lower FPS makes fine writing harder.</p>}<div className="camera-actions"><button data-gesture aria-label={paused?'Resume tracking':'Pause tracking'} onClick={()=>setPaused(p=>!p)}>{paused?<Play size={16}/>:<Pause size={16}/>} {paused?'Resume':'Pause'}</button><button data-gesture disabled={!recording&&label==='unlabeled'&&!freeRecording} className={recording?'recording':''} onClick={()=>recording?saveRecording():(records.current=[],setRecording(true))}>{recording?<Download size={14}/>:<Circle size={11}/>} {recording?'Save recording':'Record'}</button></div><button data-gesture className="camera-label-cycle" onClick={()=>setLabel(labels[(labels.indexOf(label as typeof labels[number])+1)%labels.length])}>Pose: {label} · change</button><label className="free-recording"><input type="checkbox" checked={freeRecording} onChange={e=>setFreeRecording(e.target.checked)}/>Free session (no pose scores)</label>{!recording&&label==='unlabeled'&&!freeRecording&&<p className="camera-hint">Choose a pose label before recording.</p>}<label className="recorder-label">Recording label<select aria-label="Recording gesture label" value={label} onChange={e=>setLabel(e.target.value)}>{labels.map(l=><option key={l}>{l}</option>)}</select></label>{recording&&<p className="camera-hint">Record only the selected pose. Choose unlabeled while changing poses.</p>}{devices.length>1&&<label className="camera-select"><Camera size={14}/><select aria-label="Choose camera" value={device} onChange={e=>{setLoading(true);setError('');setDevice(e.target.value);}}><option value="">Default camera</option>{devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}</select></label>}</>}<div className="camera-quick"><button data-gesture onClick={()=>setCalibrationOpen(true)}>Calibrate pinch</button><button data-gesture onClick={()=>settings.update({calibration:undefined})} disabled={!settings.calibration}>Reset profile</button><button data-gesture aria-label="Toggle camera preview" onClick={()=>setPreview(v=>!v)}>{preview?'Compact preview':'Full preview'}</button><button data-gesture aria-label="Swap drawing hand" onClick={()=>settings.update({swapHands:!settings.swapHands})}>{settings.swapHands?'Hands swapped':'Swap hands'}</button><button data-gesture aria-label="Cycle smoothness" onClick={()=>settings.update({smoothness:settings.smoothness==='precise'?'balanced':settings.smoothness==='balanced'?'fast':'precise'})}>Smoothness: {settings.smoothness}</button></div><div className="camera-private">Frames and landmarks stay on your device.</div></div>{calibrationOpen&&<GestureCalibration feed={calibrationFeed} onSave={profile=>settings.update({calibration:profile})} onClose={()=>setCalibrationOpen(false)}/>}</>;
}
