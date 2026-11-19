import type { Hand } from './gestures/types';
import { createVisionBackend, type VisionBackend } from './vision-backend';
import { fullFrameHand, type CameraRegion } from './gesture-crop';
import { FrameGate } from './frameGate';
import { acquireCamera } from './camera-request';
import { watchCameraFrames } from './camera-frames';

export type TrackedHand=Hand;
export interface CaptureMetrics {
  t:number; fps:number; captureFPS:number; inference:number; pipeline:number;
  backend:string; lowLight:boolean; aspect:number; inputMirrored:false; cameraId:string;
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
      const width=appleMobile?480:640,height=appleMobile?360:480;
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
    const cropped=document.createElement('canvas'), cropContext=cropped.getContext('2d');
    const captured:number[]=[], processed:number[]=[];
    const sample=document.createElement('canvas');
    sample.width=16;
    sample.height=12;
    const ctx=sample.getContext('2d',{willReadFrequently:true});
    const cameraId=track.getSettings?.().deviceId??'default';
    let lastFrame=performance.now(), lastLight=-Infinity, lowLight=false;

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
      const aspect=this.video.videoHeight/this.video.videoWidth;
      void this.gate.run(async ()=>{
        if(!mobileCapture && t-lastLight>2000 && ctx) {
          try {
            ctx.drawImage(this.video,0,0,16,12);
            const {data}=ctx.getImageData(0,0,16,12);
            let sum=0;
            for(let i=0;i<data.length;i+=4) sum+=data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722;
            lowLight=sum/(data.length/4)<45;
          } catch { /* Lighting feedback is optional. */ }
          lastLight=t;
        }
        const backend=this.backend!;
        const start=performance.now();
        const region=cropContext?this.region:undefined;
        if(region && cropContext){
          const w=this.video.videoWidth,h=this.video.videoHeight;
          const target=Math.min(1,640/Math.max(w*region.size,h*region.size));
          const cw=Math.max(1,Math.round(w*region.size*target)),ch=Math.max(1,Math.round(h*region.size*target));
          if(cropped.width!==cw || cropped.height!==ch){cropped.width=cw;cropped.height=ch;}
          cropContext.drawImage(this.video,w*region.x,h*region.y,w*region.size,h*region.size,0,0,cw,ch);
        }
        const result=await deadline(backend.infer(region?cropped:this.video,t),4500,'Hand tracking stopped responding.');
        if(region)result.hands=result.hands.map(hand=>fullFrameHand(hand,region));
        return {...result,backend:backend.mode,pipeline:performance.now()-start};
      },result=>{
        this.onFrame(result.hands,{t,fps:frameRate(processed,t),captureFPS,inference:result.inference,
          pipeline:result.pipeline,backend:result.backend,lowLight,aspect,inputMirrored:false,cameraId});
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
      if(mobileCapture && !this.recovered && gap>=2500 && !document.hidden) {
        this.recovered=true;
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
