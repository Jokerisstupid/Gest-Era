import type { Hand } from './gestures/types';
import { createVisionBackend, type VisionBackend } from './vision-backend';
import { fullFrameHand, type CameraRegion } from './gesture-crop';
import { FrameGate } from './frameGate';
import { acquireCamera } from './camera-request';
import { watchCameraFrames } from './camera-frames';
import { CameraBudget,cameraInputPlan,inputSize,liftCameraShadows,meterHandLight } from './camera-input';

export type TrackedHand=Hand;
export interface CaptureMetrics {
  t:number; fps:number; captureFPS:number; inference:number; pipeline:number;
  backend:string; lowLight:boolean; glare:boolean; width:number; height:number; aspect:number; inputMirrored:false; cameraId:string;
}

const model='/mediapipe/hand_landmarker.task';
const isAppleMobile=()=> /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
function deadline<T>(pending:Promise<T>, ms:number, message:string):Promise<T> {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error(message)),ms);
    void pending.then(resolve,reject).finally(()=>clearTimeout(timer));
  });
}
function frameRate(samples:number[], t:number) {
  samples.push(t);
  while(samples.length>2 && t-samples[0]>1000) samples.shift();
  return samples.length>1 && t>samples[0]?(samples.length-1)*1000/(t-samples[0]):0;
}

export class CameraTracker {
  region?:CameraRegion;
  meterRegion?:CameraRegion;
  trackingMissing=false;
  scanDetail=false;
  fixedRegion=false;
  private stream?:MediaStream;
  private backend?:VisionBackend;
  private gate=new FrameGate();
  private stopFrames?:()=>void;
  private watchdog?:ReturnType<typeof setInterval>;
  private permission=new AbortController();
  private stopped=false;
  private recovered=false;
  constructor(
    private video:HTMLVideoElement,
    private onFrame:(hands:Hand[],metrics:CaptureMetrics)=>void,
    private onError:(message:string)=>void,
    private onRecover:()=>void=()=>{}
  ) {}

  private fail(error:unknown) {
    if(this.stopped) return;
    this.stop();
    const name=error instanceof Error?error.name:'';
    this.onError(name==='NotAllowedError'?'Allow camera access for GestEra in your browser, then restart the camera.':
      name==='NotFoundError'?'No camera found. Connect one or use touch and mouse controls.':
      name==='NotReadableError'?'The camera is unavailable. Close other camera apps and restart.':
      error instanceof Error?error.message:'Camera setup failed. Restart the camera.');
  }

  private async loadBackend(compatible:boolean) {
    const pending=createVisionBackend(model,compatible);
    try {
      const backend=await deadline(pending,25000,'Hand tracking took too long to load. Restart on a stable connection.');
      if(this.stopped) backend.close();
      else this.backend=backend;
    } catch(error) {
      void pending.then(backend=>backend.close(),()=>{});
      throw error;
    }
  }

  private releaseStream() {
    this.video.onpause=null;
    this.stream?.getTracks().forEach(track=>{track.onended=null;track.stop();});
    this.stream=undefined;
    this.video.pause();
    this.video.srcObject=null;
  }

  async start(deviceId?:string) {
    try {
      if(!navigator.mediaDevices?.getUserMedia) throw Error('Open GestEra directly in your browser over HTTPS to use the camera.');
      const appleMobile=isAppleMobile();
      const width=appleMobile?480:960,height=appleMobile?360:540;
      const stream=await acquireCamera(navigator.mediaDevices.getUserMedia({
        video:{width:{ideal:width},height:{ideal:height},frameRate:{ideal:30},
          ...(deviceId?{deviceId:{exact:deviceId}}:{facingMode:{ideal:'user'}})},audio:false
      }),this.permission.signal);
      if(this.stopped) {stream.getTracks().forEach(track=>track.stop());return;}
      this.stream=stream;
      const track=stream.getVideoTracks()[0];
      if(!track) throw Error('The browser did not open a video track. Restart the camera.');
      track.onended=()=>this.fail(Error('The camera disconnected. Restart the camera to continue.'));
      this.video.muted=true;
      this.video.playsInline=true;
      this.video.srcObject=stream;
      await deadline(this.video.play(),8000,'The camera opened but video did not start. Tap Restart camera to retry.');
      if(this.stopped) return;
      if(!this.backend) await this.loadBackend(appleMobile);
      if(!this.stopped) this.trackFrames(track,appleMobile,appleMobile,deviceId);
    } catch(error) {this.fail(error);}
  }

  private trackFrames(track:MediaStreamTrack, compatible:boolean, mobileCapture:boolean, deviceId?:string) {
    this.region=undefined;
    const cropped=document.createElement('canvas'), cropContext=cropped.getContext('2d',{willReadFrequently:true});
    const captured:number[]=[], processed:number[]=[];
    const sample=document.createElement('canvas');
    sample.width=16;
    sample.height=12;
    const ctx=sample.getContext('2d',{willReadFrequently:true});
    const cameraId=track.getSettings?.().deviceId??'default';
    const budget=new CameraBudget();
    let lastFrame=performance.now(), lastLight=-Infinity, lowLight=false,glare=false,misses=0,lastAspect=0;

    let lightCurve:Uint8ClampedArray|undefined, holdLightingUntil=0;
    const fingerprint=mobileCapture && ctx?()=>{
      try {
        ctx.drawImage(this.video,0,0,16,12);
        const {data}=ctx.getImageData(0,0,16,12);
        let hash=0;
        for(let i=0;i<data.length;i+=4) hash=Math.imul(hash,31)+data[i]+data[i+1]*257+data[i+2]*65537|0;
        return hash;
      } catch {return NaN;}
    }:undefined;

    this.stopFrames=watchCameraFrames(this.video,t=>{
      lastFrame=t;
      const captureFPS=frameRate(captured,t);
      if(this.gate.busy) return;
      const width=this.video.videoWidth,height=this.video.videoHeight;
      if(!width||!height)return;
      const aspect=height/width;
      if(lastAspect && Math.abs(aspect-lastAspect)>.035){this.region=undefined;this.meterRegion=undefined;lightCurve=undefined;lastLight=-Infinity;misses=0;}
      lastAspect=aspect;
      void this.gate.run(async ()=>{
        if(t-lastLight>(misses?200:350) && ctx) {
          try {
            const roi=this.meterRegion??this.region;
            const size=roi?.size??1;
            ctx.drawImage(this.video,(roi?.x??0)*width,(roi?.y??0)*height,width*size,height*size,0,0,16,12);
            const light=meterHandLight(ctx.getImageData(0,0,16,12).data);
            lowLight=light.lowLight;
            glare=light.glare;
            if(light.curve){
              lightCurve=light.curve;
              holdLightingUntil=t+650;
            }else if(t>=holdLightingUntil)lightCurve=undefined;
          } catch { /* Lighting feedback is optional. */ }
          lastLight=t;
        }
        const backend=this.backend!;
        const start=performance.now();
        const plan=cameraInputPlan(this.region,misses,budget.compact,this.scanDetail,this.fixedRegion);
        const region=cropContext?plan.region:undefined;
        const enhance=lightCurve?misses%4!==2:plan.enhance&&misses>=3;
        let input:HTMLVideoElement|HTMLCanvasElement=this.video;
        if(cropContext && (region||enhance||Math.max(width,height)>plan.edge)){
          const size=region?.size??1;
          const output=inputSize(width*size,height*size,enhance?Math.min(plan.edge,480):plan.edge);
          if(cropped.width!==output.width || cropped.height!==output.height){
            cropped.width=output.width;cropped.height=output.height;
          }
          cropContext.drawImage(this.video,width*(region?.x??0),height*(region?.y??0),width*size,height*size,0,0,output.width,output.height);
          if(enhance){
            const pixels=cropContext.getImageData(0,0,output.width,output.height);
            liftCameraShadows(pixels.data,lightCurve);
            cropContext.putImageData(pixels,0,0);
          }
          input=cropped;
        }
        const result=await deadline(backend.infer(input,t),4500,'Hand tracking stopped responding.');
        if(region)result.hands=result.hands.map(hand=>fullFrameHand(hand,region));
        return {...result,backend:backend.mode,pipeline:performance.now()-start};
      },result=>{
        budget.observe(result.pipeline,t);
        this.onFrame(result.hands,{t,fps:frameRate(processed,t),captureFPS,inference:result.inference,
          pipeline:result.pipeline,backend:result.backend,lowLight,glare,width,height,aspect,inputMirrored:false,cameraId});
        misses=this.trackingMissing||!result.hands.length?misses+1:0;
      },error=>{
        if(compatible) {this.fail(error);return;}
        this.stopFrames?.();
        clearInterval(this.watchdog);
        this.backend?.close();
        this.backend=undefined;
        void this.loadBackend(true).then(()=>{
          if(!this.stopped) this.trackFrames(track,true,mobileCapture,deviceId);
        },failure=>this.fail(failure));
      });
    },fingerprint);

    this.watchdog=setInterval(()=>{
      const gap=performance.now()-lastFrame;
      if(!this.recovered && gap>=2500 && !document.hidden) {
        this.recovered=true;
        this.gate.discardPending();
        this.stopFrames?.();
        clearInterval(this.watchdog);
        this.onRecover();
        this.releaseStream();
        this.video.load();
        void this.start(deviceId);
      } else if(gap>=6000) {
        this.fail(Error('The live camera feed froze. Tap Restart camera to reopen it.'));
      }
    },500);
    this.video.onpause=()=>{
      if(!this.stopped && !document.hidden && this.stream?.active) void this.video.play().catch(()=>{});
    };
  }

  stop() {
    this.stopped=true;
    this.permission.abort();
    this.gate.stop();
    this.stopFrames?.();
    clearInterval(this.watchdog);
    this.releaseStream();
    this.backend?.close();
    this.backend=undefined;
  }
}
