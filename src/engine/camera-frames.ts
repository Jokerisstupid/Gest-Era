// Some browsers expose video callbacks even when delivery stalls.
export function watchCameraFrames(video:HTMLVideoElement, onFrame:(time:number)=>void) {
  let videoHandle:number|undefined;
  let animationHandle:number;
  let lastCallback=performance.now(), lastMediaTime=-1, stopped=false;

  function emit(mediaTime:number) {
    if(video.paused || video.readyState<2 || !video.videoWidth || !video.videoHeight) return;
    if(!Number.isFinite(mediaTime) || mediaTime<=lastMediaTime) return;
    lastMediaTime=mediaTime;
    onFrame(performance.now());
  }

  function scheduleVideo() {
    try { videoHandle=video.requestVideoFrameCallback(fromVideo); }
    catch { videoHandle=undefined; }
  }

  function fromVideo(_now:number, metadata:VideoFrameCallbackMetadata) {
    if(stopped) return;
    lastCallback=performance.now();
    emit(metadata.mediaTime);
    if(!stopped) scheduleVideo();
  }

  function fromAnimation() {
    if(stopped) return;
    if(videoHandle===undefined || performance.now()-lastCallback>=500) emit(video.currentTime);
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
