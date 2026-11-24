import type { CameraRegion } from './gesture-crop';

// Search the center first, then all four corners. Full-frame observations run between tiles.
const searchTiles = [[.18,.18],[0,0],[.36,.36],[.36,0],[0,.36]] as const;

export class CameraBudget {
  private average=0;
  private changedAt=-Infinity;
  compact=false;
  observe(ms:number,t:number){
    if(!Number.isFinite(ms)||ms<=0)return;
    this.average=this.average?this.average*.85+Math.min(ms,250)*.15:Math.min(ms,250);
    if(t-this.changedAt<1800)return;
    const compact=this.compact?this.average>=36:this.average>56;
    if(compact!==this.compact){this.compact=compact;this.changedAt=t;}
  }
}

export function cameraInputPlan(region:CameraRegion|undefined,misses:number,slow:boolean,scanDetail=false,fixed=false){
  // Alternate detail and full context without adding a second inference to a frame.
  const phase=misses%4;
  const seek=scanDetail&&misses>=2&&phase%2===1;
  const tile=searchTiles[Math.floor(Math.max(0,misses-3)/2)%searchTiles.length];
  const detail=region??(seek?{x:tile[0],y:tile[1],size:.64}:undefined);
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

// Meter the last known hand region. A bright window elsewhere should not set hand exposure.
export function meterHandLight(data:Uint8ClampedArray){
  const levels:number[]=[];
  for(let i=0;i<data.length;i+=4)levels.push(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2]);
  levels.sort((a,b)=>a-b);
  const percentile=(q:number)=>levels[Math.floor(q*(levels.length-1))]??128;
  const low=percentile(.10),mid=percentile(.50),high=percentile(.90);
  const lowLight=mid<68,glare=mid>194||(high>226&&low<82);
  if(!lowLight&&!glare&&high-low>=58)return {lowLight,glare};
  const gamma=Math.max(.65,Math.min(1.6,Math.log(.48)/Math.log(Math.max(.01,Math.min(.99,mid/255)))));
  const contrast=Math.min(1.35,1+Math.max(0,90-(high-low))/180);
  const curve=Uint8ClampedArray.from({length:256},(_,i)=>128+(255*(i/255)**gamma-128)*contrast);
  return {lowLight,glare,curve};
}

export function liftCameraShadows(data:Uint8ClampedArray,curve:Uint8ClampedArray=SHADOW_CURVE){
  // Apply the same tone curve to every color channel, preserving alpha.

  for(let i=0;i<data.length;i+=4){
    data[i]=curve[data[i]];
    data[i+1]=curve[data[i+1]];
    data[i+2]=curve[data[i+2]];
  }
}
const SHADOW_CURVE=Uint8ClampedArray.from({length:256},(_,i)=>255*(i/255)**.68);
