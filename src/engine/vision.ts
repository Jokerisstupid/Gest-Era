import type { Hand } from './gestures/types';
import { createVisionBackend,type VisionBackend } from './vision-backend';
import { FrameGate } from './frameGate';
import { acquireCamera } from './camera-request';
export type TrackedHand=Hand;
export interface CaptureMetrics {t:number;fps:number;captureFPS:number;inference:number;pipeline:number;backend:string;lowLight:boolean;aspect:number;inputMirrored:false;cameraId:string;}
export class CameraTracker {
  private stream?:MediaStream;private backend?:VisionBackend;private gate=new FrameGate();private handle=0;private cancelled=true;private usesVideoCallback=false;private permission?:AbortController;
  constructor(private video:HTMLVideoElement,private onFrame:(hands:Hand[],metrics:CaptureMetrics)=>void,private onError:(message:string)=>void){}
  async start(deviceId?:string){
    this.cancelled=false;
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera access requires HTTPS or localhost. Mouse and touch still work.');
      this.permission=new AbortController();
      const stream=await acquireCamera(navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:30},...(deviceId?{deviceId:{exact:deviceId}}:{facingMode:'user'})},audio:false}),this.permission.signal);
      if(this.cancelled){stream.getTracks().forEach(t=>t.stop());return;}this.stream=stream;this.video.srcObject=stream;
      stream.getVideoTracks().forEach(track=>track.onended=()=>{if(!this.cancelled){this.stop();this.onError('Your camera disconnected. Reconnect it and restart tracking.');}});
      await this.video.play();
      const head=await fetch('/mediapipe/hand_landmarker.task',{method:'HEAD'}).catch(()=>null),model=head?.ok&&!head.headers.get('content-type')?.includes('text/html')?'/mediapipe/hand_landmarker.task':'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
      if(this.cancelled)return;this.backend=await createVisionBackend(model);if(this.cancelled){this.backend.close();return;}
      let previous=-1,lowLight=false,lastLight=-Infinity;const captured:number[]=[],processed:number[]=[];
      const sample=document.createElement('canvas');sample.width=16;sample.height=12;const ctx=sample.getContext('2d',{willReadFrequently:true});
      const rate=(list:number[],t:number)=>{list.push(t);while(list.length>2&&t-list[0]>1000)list.shift();return list.length>1?(list.length-1)*1000/(t-list[0]):0;};
      const process=(mediaTime:number)=>{
        if(this.cancelled||this.video.readyState<2||mediaTime<=previous)return;previous=mediaTime;const t=mediaTime*1000,captureFPS=rate(captured,t);if(this.gate.busy)return;
        if(t-lastLight>2000&&ctx){ctx.drawImage(this.video,0,0,16,12);const rgba=ctx.getImageData(0,0,16,12).data;let sum=0;for(let i=0;i<rgba.length;i+=4)sum+=rgba[i]*.2126+rgba[i+1]*.7152+rgba[i+2]*.0722;lowLight=sum/(rgba.length/4)<45;lastLight=t;}
        const start=performance.now(),aspect=this.video.videoHeight/this.video.videoWidth;
        void this.gate.run(()=>this.backend!.infer(this.video,t),result=>this.onFrame(result.hands,{t,fps:rate(processed,t),captureFPS,inference:result.inference,pipeline:performance.now()-start,backend:this.backend!.mode,lowLight,aspect,inputMirrored:false,cameraId:this.stream?.getVideoTracks()[0]?.getSettings().deviceId??'default'}),error=>{this.stop();this.onError(error instanceof Error?error.message:'Tracking stopped. Restart your camera.');});
      };
      this.usesVideoCallback=typeof this.video.requestVideoFrameCallback==='function';
      const schedule=()=>{if(this.cancelled)return;if(this.usesVideoCallback)this.handle=this.video.requestVideoFrameCallback((_,metadata)=>run(metadata.mediaTime));else this.handle=requestAnimationFrame(()=>run(this.video.currentTime));};
      const run=(time:number)=>{if(this.cancelled)return;try{process(time);schedule();}catch(error){this.stop();this.onError(error instanceof Error?error.message:'Tracking stopped. Restart your camera.');}};schedule();
    }catch(error){if(this.cancelled)return;this.stop();const name=error instanceof DOMException?error.name:'';this.onError(name==='NotAllowedError'?'Camera permission was declined. Enable it in your browser or use mouse/touch.':name==='NotFoundError'?'No camera found. Connect one or use mouse/touch.':name==='NotReadableError'?'Your camera is busy. Close other camera apps.':error instanceof Error?error.message:'Camera setup failed.');}
  }
  stop(){this.cancelled=true;this.permission?.abort();this.permission=undefined;this.gate.stop();if(this.usesVideoCallback)this.video.cancelVideoFrameCallback?.(this.handle);else cancelAnimationFrame(this.handle);this.stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});this.stream=undefined;this.video.srcObject=null;this.backend?.close();this.backend=undefined;}
}
