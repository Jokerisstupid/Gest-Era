// A frame counter can advance even when a live stream's media clock repeats.
export function watchCameraFrames(video:HTMLVideoElement, onFrame:(time:number)=>void, sampleImage?:()=>number) {
  let videoHandle:number|undefined;
  let animationHandle:number;
  let lastNativeFrame=performance.now(), lastProbe=-Infinity, lastMediaTime=-1, lastCount=0;
  let lastImage:number|undefined;
  let stopped=false;

  function ready() {
    return !video.paused && video.readyState>=2 && video.videoWidth>0 && video.videoHeight>0;
  }

  function emit(time:number, count:number, now:number) {
    if(!ready()) return;
    if(!(time>lastMediaTime || count>lastCount)) return;
    lastMediaTime=Math.max(lastMediaTime, Number.isFinite(time)?time:-1);
    lastCount=Math.max(lastCount,count);
    onFrame(now);
  }

  function scheduleVideo() {
    try {videoHandle=video.requestVideoFrameCallback(fromVideo);}
    catch {videoHandle=undefined;}
  }

  function fromVideo(_now:number, metadata:VideoFrameCallbackMetadata) {
    if(stopped) return;
    const now=performance.now(), count=metadata.presentedFrames??0;
    if(ready() && (metadata.mediaTime>lastMediaTime || count>lastCount)) lastNativeFrame=now;
    emit(metadata.mediaTime,count,now);
    if(!stopped) scheduleVideo();
  }

  function fromAnimation() {
    if(stopped) return;
    const now=performance.now();
    if(ready() && (videoHandle===undefined || now-lastNativeFrame>=500)) {
      if(!sampleImage || now-lastProbe>=66) {
        lastProbe=now;
        const image=sampleImage?.();
        if(image!==undefined && Number.isFinite(image)) {
          // A changing picture is stronger evidence than a clock that may advance over a frozen frame.
          if(lastImage!==undefined && image!==lastImage) onFrame(now);
          lastImage=image;
        } else {
          const quality=video.getVideoPlaybackQuality?.();
          const count=quality?Math.max(0,quality.totalVideoFrames-quality.droppedVideoFrames):0;
          emit(video.currentTime,count,now);
        }
      }
    }
    if(!stopped) animationHandle=requestAnimationFrame(fromAnimation);
  }

  if(typeof video.requestVideoFrameCallback==='function') scheduleVideo();
  animationHandle=requestAnimationFrame(fromAnimation);
  return ()=>{
    stopped=true;
    cancelAnimationFrame(animationHandle);
    if(videoHandle!==undefined) video.cancelVideoFrameCallback?.(videoHandle);
  };
}
