/* Classic worker: MediaPipe's pinned browser bundle and WASM loader use importScripts. */
let tracker;
self.onmessage=async({data})=>{
  if(data.type==='init'){
    try{
      importScripts('/mediapipe/vision_bundle.js');
      const sdk=globalThis.Vision??globalThis.vision??globalThis;
      const vision=await sdk.FilesetResolver.forVisionTasks(data.wasm),options={runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55};
      let delegate='GPU';try{tracker=await sdk.HandLandmarker.createFromOptions(vision,{...options,canvas:new OffscreenCanvas(1,1),baseOptions:{modelAssetPath:data.model,delegate:'GPU'}});}catch{delegate='CPU';tracker=await sdk.HandLandmarker.createFromOptions(vision,{...options,canvas:new OffscreenCanvas(1,1),baseOptions:{modelAssetPath:data.model,delegate:'CPU'}});}
      self.postMessage({type:'ready',delegate});
    }catch(error){self.postMessage({type:'error',message:error instanceof Error?error.message:'Worker setup failed'});}return;
  }
  try{if(!tracker)throw Error('Tracker not initialized');const start=performance.now(),r=tracker.detectForVideo(data.bitmap,data.t),inference=performance.now()-start;
    const hands=r.landmarks.map((landmarks,i)=>({landmarks,worldLandmarks:r.worldLandmarks?.[i],side:r.handedness[i]?.[0]?.categoryName??'Unknown',score:r.handedness[i]?.[0]?.score??0}));self.postMessage({type:'result',hands,inference});
  }catch(error){self.postMessage({type:'error',message:error instanceof Error?error.message:'Worker inference failed'});}finally{data.bitmap.close();}
};
