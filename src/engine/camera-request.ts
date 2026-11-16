interface CameraStream {getTracks:()=>{stop:()=>void}[];}
// Permission dialogs can remain pending. Cancellation must also clean up a late grant.
export function acquireCamera<T extends CameraStream>(request:Promise<T>,signal:AbortSignal,timeoutMs=15000):Promise<T>{
  return new Promise((resolve,reject)=>{
    let settled=false;let timer:ReturnType<typeof setTimeout>;
    const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
    const fail=(error:unknown)=>{if(settled)return;settled=true;cleanup();reject(error);};
    const abort=()=>fail(Error('Camera setup cancelled.'));
    signal.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>fail(Error('Camera permission is still pending. Allow access in your browser, then restart the camera.')),timeoutMs);
    request.then(stream=>{if(settled||signal.aborted){stream.getTracks().forEach(track=>track.stop());if(!settled)abort();return;}settled=true;cleanup();resolve(stream);},fail);
    if(signal.aborted)abort();
  });
}
