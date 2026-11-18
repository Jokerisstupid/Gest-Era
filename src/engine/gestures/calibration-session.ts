import type { PinchCalibration } from './calibration';
export interface CalibrationObservation {t:number;ratio?:number;wrist?:{x:number;y:number};hands:number;mobile?:boolean;lowLight?:boolean;cameraId?:string;aspect?:number;}
export interface CaptureState {samples:number[];elapsed:number;last?:number;anchor?:{x:number;y:number};invalidSince?:number;progress:number;reason:string;done:boolean;}
export const initialCapture=():CaptureState=>({samples:[],elapsed:0,progress:0,reason:'Show just your drawing hand',done:false});
export function captureStep(previous:CaptureState,o:CalibrationObservation,pose:'open'|'closed'):CaptureState{
  if(previous.done||o.t<=(previous.last??-Infinity))return previous;
  let state={...previous,samples:[...previous.samples]};
  const gap=o.mobile?600:250;
  if(previous.last!==undefined && o.t-(previous.invalidSince??previous.last)>gap)state=initialCapture();
  const valid=o.hands===1&&o.ratio!==undefined&&Number.isFinite(o.ratio)&&o.ratio>0&&o.ratio<4&&o.wrist&&Number.isFinite(o.wrist.x)&&Number.isFinite(o.wrist.y);
  const poseValid=valid&&(pose==='open'?o.ratio!>=.65:o.ratio!<.60);
  if(!poseValid){const invalidSince=state.invalidSince??o.t;if(o.t-invalidSince>=gap)state=initialCapture();return{...state,last:o.t,invalidSince,reason:o.hands>1?'Use only your drawing hand':!valid?'Hand lost — sampling paused':pose==='open'?'Open your thumb and index finger':'Touch thumb and index tips together'};}
  if(state.anchor&&Math.hypot(o.wrist!.x-state.anchor.x,o.wrist!.y-state.anchor.y)>(o.mobile ? .09 : .045))return{...initialCapture(),last:o.t,anchor:o.wrist,reason:'Rest your hand — hold this position'};
  const dt=state.last===undefined||state.invalidSince!==undefined?0:Math.min(o.mobile?160:100,o.t-state.last);
  state={...state,last:o.t,invalidSince:undefined,anchor:state.anchor??o.wrist,elapsed:state.elapsed+dt};
  const settle=o.mobile?400:700, sampleTime=o.mobile?1200:1600, sampleCount=o.mobile?24:40;
  if(state.elapsed>=settle)state.samples.push(o.ratio!);
  const progress=Math.max(0,Math.min(1,state.samples.length/sampleCount,(state.elapsed-settle)/sampleTime));
  return{...state,progress,done:progress>=1,reason:state.elapsed<settle?'Hold steady — settling':o.lowLight?'Collecting — more front light may help':'Collecting steady samples'};
}
export interface VerificationState {cycles:number;ready:boolean;closed:boolean;confirm:number;last?:number;missingSince?:number;hint:string;}
export const initialVerification=():VerificationState=>({cycles:0,ready:false,closed:false,confirm:0,hint:'Open your hand to begin'});
export function verificationStep(previous:VerificationState,o:CalibrationObservation,profile:PinchCalibration):VerificationState{
  if(o.t<=(previous.last??-Infinity)||previous.cycles>=3)return previous;
  const missing=o.hands!==1 || o.ratio===undefined || !Number.isFinite(o.ratio);
  const gap=o.mobile?600:250;
  if(o.mobile && missing && o.hands===0 && previous.last!==undefined && o.t-(previous.missingSince??previous.last)<gap) {
    return {...previous,confirm:0,last:o.t,missingSince:previous.missingSince??previous.last,hint:'Hand out of view. Hold the same pose.'};
  }
  if(missing || previous.last!==undefined && o.t-(previous.missingSince??previous.last)>gap) {
    return {...initialVerification(),cycles:previous.cycles,last:o.t,hint:'Show one hand, then open to restart this cycle'};
  }
  const state={...previous,last:o.t,missingSince:undefined};
  const ratio=o.ratio!;
  if(!state.ready){if(ratio>=profile.exit)state.confirm++;else state.confirm=0;if(state.confirm>=2){state.ready=true;state.confirm=0;state.hint='Pinch thumb and index tips';}return state;}
  if(!state.closed){state.confirm=ratio<profile.enter?state.confirm+1:0;if(state.confirm>=2){state.closed=true;state.confirm=0;state.hint='Pinch detected — release fully';}}
  else{state.confirm=ratio>=profile.exit?state.confirm+1:0;if(state.confirm>=2){state.cycles++;state.closed=false;state.confirm=0;state.hint=state.cycles===3?'Three clean cycles verified':'Release detected — pinch again';}}
  return state;
}
