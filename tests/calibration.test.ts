import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import { captureStep,initialCapture,initialVerification,verificationStep,type CalibrationObservation } from '../src/engine/gestures/calibration-session';
import { calibrate,profileMatches,validCalibration } from '../src/engine/gestures/calibration';
import { acquireCamera } from '../src/engine/camera-request';
import { watchCameraFrames } from '../src/engine/camera-frames';
const observation=(t:number,ratio=1.1,hands=1):CalibrationObservation=>({t,ratio,hands,wrist:{x:.5,y:.7},cameraId:'synthetic-camera',aspect:.75});
describe('calibration collection and verification - synthetic observations',()=>{
  it('completes only after actual stable valid samples and a settling interval',()=>{let s=initialCapture();for(let t=0;t<=2800;t+=50)s=captureStep(s,observation(t),'open');assert.equal(s.done,true);assert.ok(s.samples.length>=40);assert.ok(s.elapsed>=2300);});
  it('cannot complete from a long camera timestamp jump or missing hands',()=>{let s=initialCapture();s=captureStep(s,observation(0),'open');s=captureStep(s,observation(5000),'open');assert.equal(s.progress,0);for(let t=5050;t<=10000;t+=50)s=captureStep(s,{t,hands:0},'open');assert.equal(s.done,false);assert.equal(s.samples.length,0);});
  it('pauses a short missing detection and resets a sustained loss',()=>{let s=initialCapture();for(let t=0;t<=1500;t+=50)s=captureStep(s,observation(t),'open');const count=s.samples.length,elapsed=s.elapsed;s=captureStep(s,{t:1550,hands:0},'open');assert.equal(s.samples.length,count);s=captureStep(s,observation(1600),'open');assert.equal(s.elapsed,elapsed);for(let t=1650;t<=2000;t+=50)s=captureStep(s,{t,hands:0},'open');assert.equal(s.samples.length,0);});
  it('rejects two-hand samples and the wrong pose rather than teaching false thresholds',()=>{for(const [ratio,hands,pose]of [[1.1,2,'open'],[.2,1,'open'],[1.1,1,'closed']]as const){let s=initialCapture();for(let t=0;t<5000;t+=50)s=captureStep(s,observation(t,ratio,hands),pose);assert.equal(s.done,false);assert.equal(s.samples.length,0);}});
  it('restarts a sample when the wrist changes position and does not mutate its input',()=>{let s=initialCapture();for(let t=0;t<=1500;t+=50)s=captureStep(s,observation(t),'open');const copy=structuredClone(s),next=captureStep(s,{...observation(1550),wrist:{x:.7,y:.7}},'open');assert.equal(next.samples.length,0);assert.deepEqual(s,copy);});
  const profile=calibrate(Array(40).fill(1.1),Array(40).fill(.2),0).profile!;
  it('requires an initial release and three confirmed pinch and release cycles',()=>{let s=initialVerification(),t=0;for(let i=0;i<6;i++){s=verificationStep(s,observation(t+=50,.1),profile);assert.equal(s.cycles,0);}for(let i=0;i<3;i++){for(const r of [1.1,1.1,.1,.1,1.1,1.1])s=verificationStep(s,observation(t+=50,r),profile);assert.equal(s.cycles,i+1);}});
  it('does not count a hand loss as a successful release',()=>{let s=initialVerification();for(const [i,r]of [1.1,1.1,.1,.1].entries())s=verificationStep(s,observation(i*50,r),profile);assert.equal(s.closed,true);s=verificationStep(s,{t:200,hands:0},profile);s=verificationStep(s,observation(250),profile);assert.equal(s.cycles,0);assert.equal(s.closed,false);});
  it('binds verified profiles to camera and aspect while retaining legacy compatibility',()=>{const p={...profile,version:2 as const,verifiedCycles:3,cameraId:'one',aspect:.75};assert.ok(validCalibration(p));assert.equal(profileMatches(p,'one',.75),true);assert.equal(profileMatches(p,'two',.75),false);assert.equal(profileMatches(p,'one',.56),false);assert.equal(profileMatches(profile,'any',.56),true);assert.equal(validCalibration({...p,verifiedCycles:1}),false);});
});
describe('camera permission cleanup - synthetic stream promises',()=>{
  it('returns a granted stream without stopping its active tracks',async()=>{let stops=0;const stream={getTracks:()=>[{stop:()=>stops++}]};assert.equal(await acquireCamera(Promise.resolve(stream),new AbortController().signal),stream);assert.equal(stops,0);});
  it('stops a camera granted after setup was cancelled',async()=>{let grant!:(s:{getTracks:()=>{stop:()=>void}[]})=>void,stops=0;const controller=new AbortController(),pending=acquireCamera(new Promise(r=>grant=r),controller.signal);controller.abort();await assert.rejects(pending,/cancelled/);grant({getTracks:()=>[{stop:()=>stops++}]});await Promise.resolve();assert.equal(stops,1);});
  it('times out a pending permission and stops a stream granted after timeout',async()=>{let grant!:(s:{getTracks:()=>{stop:()=>void}[]})=>void,stops=0;const pending=acquireCamera(new Promise(r=>grant=r),new AbortController().signal,5);await assert.rejects(pending,/permission is still pending/);grant({getTracks:()=>[{stop:()=>stops++}]});await Promise.resolve();assert.equal(stops,1);});
});

it('processes advancing video time when native frame callbacks stall, then cancels both schedules',({mock})=>{
  let clock=0,mediaTime=0;
  let animation:FrameRequestCallback|undefined, native:VideoFrameRequestCallback|undefined;
  let cancelledAnimation=false,cancelledVideo=false;
  mock.method(performance,'now',()=>clock);
  const originalAnimation=globalThis.requestAnimationFrame;
  const originalCancel=globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame=callback=>{animation=callback;return 41;};
  globalThis.cancelAnimationFrame=id=>{assert.equal(id,41);cancelledAnimation=true;};
  const video={
    paused:false,readyState:2,videoWidth:640,videoHeight:480,
    get currentTime(){return mediaTime;},
    requestVideoFrameCallback(callback:VideoFrameRequestCallback){native=callback;return 17;},
    cancelVideoFrameCallback(id:number){assert.equal(id,17);cancelledVideo=true;},
  } as HTMLVideoElement;
  try {
    const frames:number[]=[];
    const stop=watchCameraFrames(video,time=>frames.push(time));
    native!(0,{mediaTime:0} as VideoFrameCallbackMetadata);
    clock=400;mediaTime=.4;animation!(clock);
    assert.deepEqual(frames,[0]);
    clock=500;mediaTime=.5;animation!(clock);
    clock=520;animation!(clock);
    native!(clock,{mediaTime:.5} as VideoFrameCallbackMetadata);
    clock=550;native!(clock,{mediaTime:.55} as VideoFrameCallbackMetadata);
    stop();
    assert.deepEqual(frames,[0,500,550]);
    assert.equal(cancelledAnimation,true);
    assert.equal(cancelledVideo,true);
  } finally {
    globalThis.requestAnimationFrame=originalAnimation;
    globalThis.cancelAnimationFrame=originalCancel;
  }
});

it('uses changing camera pixels when the iPhone video clock sticks, without replaying static frames',({mock})=>{
  let clock=0, image=123, animation:FrameRequestCallback|undefined;
  mock.method(performance,'now',()=>clock);
  const originalAnimation=globalThis.requestAnimationFrame;
  const originalCancel=globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame=callback=>{animation=callback;return 41;};
  globalThis.cancelAnimationFrame=()=>{};
  try {
    const video={paused:false,readyState:2,videoWidth:360,videoHeight:480,currentTime:0} as HTMLVideoElement;
    const frames:number[]=[];
    const stop=watchCameraFrames(video,t=>frames.push(t),()=>image);
    animation!(clock);
    clock=100;animation!(clock);
    assert.deepEqual(frames,[]);
    image=456;clock=200;animation!(clock);
    clock=300;animation!(clock);
    assert.deepEqual(frames,[200]);
    stop();
  } finally {
    globalThis.requestAnimationFrame=originalAnimation;
    globalThis.cancelAnimationFrame=originalCancel;
  }
});

it('collects a phone calibration across short dropped detections and a slow camera',()=>{
  let state=initialCapture();
  for(let i=0;i<40 && !state.done;i++) {
    state=captureStep(state,{...observation(i*150,1.1,i%8===5?0:1),mobile:true},'open');
  }
  assert.equal(state.done,true);
  assert.ok(state.samples.length>=24);
});
