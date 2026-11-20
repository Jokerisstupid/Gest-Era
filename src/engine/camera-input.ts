import type { CameraRegion } from './gesture-crop';

export function cameraInputPlan(region:CameraRegion|undefined,misses:number,slow:boolean,scanDetail=false,fixed=false){
  // Alternate detail and full context without adding a second inference to a frame.
  const phase=misses%4;
  const seek=scanDetail&&misses>=2&&phase%2===1;
  const detail=region??(seek?{x:[.18,.02,.34][Math.floor(misses/4)%3],y:.14,size:.64}:undefined);
  const useFull=!fixed&&(phase===2||(phase===0&&misses>0));
  return {
    region:useFull?undefined:detail,
    enhance:phase===1||phase===0&&misses>0,
    edge:slow?480:misses>0?768:640
  };
}

export function inputSize(width:number,height:number,maxEdge:number){
  const scale=Math.min(1,maxEdge/Math.max(width,height));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}

export function liftCameraShadows(data:Uint8ClampedArray){
  // A bounded curve preserves bright detail while lifting darker fingers.
  const curve=SHADOW_CURVE;
  for(let i=0;i<data.length;i+=4){
    data[i]=curve[data[i]];
    data[i+1]=curve[data[i+1]];
    data[i+2]=curve[data[i+2]];
  }
}
const SHADOW_CURVE=Uint8ClampedArray.from({length:256},(_,i)=>255*(i/255)**.68);
