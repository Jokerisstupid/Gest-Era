import type { Hand } from './gestures/types';
import { createVisionBackend, type VisionBackend } from './vision-backend';
import { FrameGate } from './frameGate';
import { acquireCamera } from './camera-request';
import { watchCameraFrames } from './camera-frames';

export type TrackedHand=Hand;
export interface CaptureMetrics {
  t:number; fps:number; captureFPS:number; inference:number; pipeline:number;
  backend:string; lowLight:boolean; aspect:number; inputMirrored:false; cameraId:string;
}

const model='/mediapipe/hand_landmarker.task';
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
  private stream?:MediaStream;
  private backend?:VisionBackend;
  private gate=new FrameGate();
  private stopFrames?:()=>void;
  private watchdog?:ReturnType<typeof setInterval>;
  private permission=new AbortController();
  private stopped=false;
  constructor(
    private video:HTMLVideoElement,
    private onFrame:(hands:Hand[],metrics:CaptureMetrics)=>void,
    private onError:(message:string)=>void
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

  async start(deviceId?:string) {
    try {
      if(!navigator.mediaDevices?.getUserMedia) throw Error('Open GestEra directly in your browser over HTTPS to use the camera.');
      const stream=await acquireCamera(navigator.mediaDevices.getUserMedia({
        video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:30},
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
      const appleMobile=/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
      await this.loadBackend(appleMobile);
      if(!this.stopped) this.trackFrames(track,appleMobile);
    } catch(error) {this.fail(error);}
  }

  private trackFrames(track:MediaStreamTrack, compatible:boolean) {
    const captured:number[]=[], processed:number[]=[];
    const sample=document.createElement('canvas');
    sample.width=16;
    sample.height=12;
    const ctx=sample.getContext('2d',{willReadFrequently:true});
    const cameraId=track.getSettings?.().deviceId??'default';
    let lastFrame=performance.now(), lastLight=-Infinity, lowLight=false;

    this.stopFrames=watchCameraFrames(this.video,t=>{
      lastFrame=t;
      const captureFPS=frameRate(captured,t);
      if(this.gate.busy) return;
      const aspect=this.video.videoHeight/this.video.videoWidth;
      void this.gate.run(async ()=>{
        if(t-lastLight>2000 && ctx) {
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
        const result=await deadline(backend.infer(this.video,t),4500,'Hand tracking stopped responding.');
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
          if(!this.stopped) this.trackFrames(track,true);
        },failure=>this.fail(failure));
      });
    });

    this.watchdog=setInterval(()=>{
      if(performance.now()-lastFrame>=5000) this.fail(Error('No live video frames are coming from the camera. Check that it is available, then tap Restart camera.'));
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
    this.video.onpause=null;
    this.stream?.getTracks().forEach(track=>{track.onended=null;track.stop();});
    this.stream=undefined;
    this.video.pause();
    this.video.srcObject=null;
    this.backend?.close();
    this.backend=undefined;
  }
}
