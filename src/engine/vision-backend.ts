import type { HandLandmarker } from '@mediapipe/tasks-vision';
import type { Hand } from './gestures/types';
export interface Inference {hands:Hand[];inference:number;}
export interface VisionBackend {mode:string;infer:(video:HTMLVideoElement,t:number)=>Promise<Inference>;close:()=>void;}
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
export async function createVisionBackend(model:string):Promise<VisionBackend>{
  if(typeof Worker!=='undefined'&&typeof OffscreenCanvas!=='undefined'&&typeof createImageBitmap==='function')try{return await workerBackend(model);}catch{/* Compatible main-thread fallback remains available. */}
  const {FilesetResolver,HandLandmarker}=await import('@mediapipe/tasks-vision'),vision=await FilesetResolver.forVisionTasks('/mediapipe/wasm'),options={runningMode:'VIDEO' as const,numHands:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55};let tracker:HandLandmarker,delegate='GPU';
  try{tracker=await HandLandmarker.createFromOptions(vision,{...options,baseOptions:{modelAssetPath:model,delegate:'GPU'}});}catch{delegate='CPU';tracker=await HandLandmarker.createFromOptions(vision,{...options,baseOptions:{modelAssetPath:model,delegate:'CPU'}});}
  return{mode:`Compatible ${delegate}`,async infer(video,t){const start=performance.now(),r=tracker.detectForVideo(video,t);return{inference:performance.now()-start,hands:r.landmarks.map((landmarks,i)=>({landmarks,worldLandmarks:r.worldLandmarks?.[i],side:r.handedness[i]?.[0]?.categoryName??'Unknown',score:r.handedness[i]?.[0]?.score??0}))};},close(){tracker.close();}};
}
