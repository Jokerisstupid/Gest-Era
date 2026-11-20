import type { HandLandmarker } from '@mediapipe/tasks-vision';
import type { Hand } from './gestures/types';
type CameraInput = HTMLVideoElement | HTMLCanvasElement;
export interface Inference {hands:Hand[];inference:number;}
export interface VisionBackend {mode:string;infer:(video:CameraInput,t:number)=>Promise<Inference>;close:()=>void;}
async function workerBackend(model:string):Promise<VisionBackend>{
  const worker=new Worker('/mediapipe/hand-worker.js');
  let pending:{resolve:(v:Inference)=>void;reject:(e:Error)=>void}|undefined,closed=false,timer:ReturnType<typeof setTimeout>|undefined,frameTimer:ReturnType<typeof setTimeout>|undefined;
  try{return await new Promise<VisionBackend>((resolve,reject)=>{
    timer=setTimeout(()=>{worker.terminate();reject(Error('Worker setup timed out'));},12000);
    worker.onerror=event=>{clearTimeout(frameTimer);const e=Error(event.message||'Worker unavailable');if(pending){pending.reject(e);pending=undefined;}else reject(e);};
    worker.onmessage=({data})=>{
      if(data.type==='ready'){clearTimeout(timer);resolve({mode:`Worker ${data.delegate}`,async infer(video,t){if(closed)throw Error('Camera stopped');const bitmap=await createImageBitmap(video);if(closed){bitmap.close();throw Error('Camera stopped');}return new Promise<Inference>((resolve,reject)=>{pending={resolve,reject};frameTimer=setTimeout(()=>{pending?.reject(Error('Tracking worker did not respond. Restart the camera.'));pending=undefined;},3000);try{worker.postMessage({type:'frame',bitmap,t},[bitmap]);}catch(error){clearTimeout(frameTimer);bitmap.close();pending=undefined;reject(error);}});},close(){closed=true;clearTimeout(frameTimer);worker.terminate();pending?.reject(Error('Camera stopped'));pending=undefined;}});}
      else if(data.type==='result'){clearTimeout(frameTimer);pending?.resolve({hands:data.hands,inference:data.inference});pending=undefined;}
      else if(data.type==='error'){clearTimeout(frameTimer);const e=Error(data.message);if(pending){pending.reject(e);pending=undefined;}else reject(e);}
    };
    worker.postMessage({type:'init',wasm:new URL('/mediapipe/wasm',location.origin).href,model:new URL(model,location.origin).href});
  });}catch(error){clearTimeout(timer);worker.terminate();throw error;}
}
export async function createVisionBackend(model:string, preferCompatible=false):Promise<VisionBackend>{
  if(!preferCompatible && typeof Worker!=='undefined'&&typeof OffscreenCanvas!=='undefined'&&typeof createImageBitmap==='function')try{return await workerBackend(model);}catch{/* Compatible main-thread fallback remains available. */}
  const {FilesetResolver,HandLandmarker}=await import('@mediapipe/tasks-vision'),vision=await FilesetResolver.forVisionTasks('/mediapipe/wasm'),options={runningMode:'VIDEO' as const,numHands:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55,};let tracker:HandLandmarker|undefined,delegate='GPU';
  if(!preferCompatible){
    try {tracker=await HandLandmarker.createFromOptions(vision,{...options,canvas:document.createElement('canvas'),baseOptions:{modelAssetPath:model,delegate:'GPU'}});}
    catch {delegate='CPU';}
  } else delegate='CPU';
  if(!tracker) tracker=await HandLandmarker.createFromOptions(vision,{...options,canvas:document.createElement('canvas'),baseOptions:{modelAssetPath:model,delegate:'CPU'}});
  const landmarker=tracker;
  const input=preferCompatible?document.createElement('canvas'):undefined;
  const context=input?.getContext('2d');
  if(input && !context) {landmarker.close();throw Error('Could not prepare camera frames. Restart the camera.');}
  return{mode:`Compatible ${delegate}`,async infer(video,t){const start=performance.now();
    let source=video;
    if(input && context && ('videoWidth' in video || Math.max(video.width,video.height)>480)){
      const w='videoWidth' in video?video.videoWidth:video.width,h='videoHeight' in video?video.videoHeight:video.height;
      const scale=Math.min(1,480/Math.max(w,h));
      const width=Math.max(1,Math.round(w*scale)),height=Math.max(1,Math.round(h*scale));
      if(input.width!==width || input.height!==height){input.width=width;input.height=height;}
      context.drawImage(video,0,0,width,height);
      source=input;
    }
    const r=landmarker.detectForVideo(source,t);return{inference:performance.now()-start,hands:r.landmarks.map((landmarks,i)=>({landmarks,worldLandmarks:r.worldLandmarks?.[i],side:r.handedness[i]?.[0]?.categoryName??'Unknown',score:r.handedness[i]?.[0]?.score??0}))};},close(){landmarker.close();}};
}
