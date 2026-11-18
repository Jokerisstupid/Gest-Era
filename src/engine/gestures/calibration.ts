export interface PinchCalibration { enter:number;exit:number;lead:number;openMedian:number;closedMedian:number;noise:number;samples:number;createdAt:number;version?:2;verifiedCycles?:number;cameraId?:string;aspect?:number;drawingHand?:'Left'|'Right'; }
const quantile=(v:number[],q:number)=>{const s=[...v].sort((a,b)=>a-b);return s[Math.floor((s.length-1)*q)];};
export function validCalibration(v:unknown):v is PinchCalibration{
  if(!v||typeof v!=='object')return false;const x=v as PinchCalibration;
  return [x.enter,x.exit,x.lead,x.openMedian,x.closedMedian,x.noise,x.samples,x.createdAt].every(Number.isFinite)&&x.enter>=.08&&x.closedMedian>=0&&x.noise>=0&&x.closedMedian<x.enter&&x.exit>x.enter+.07&&x.exit<x.openMedian&&x.exit<=1.1&&x.lead>x.exit&&x.lead<=1.4&&x.samples>=48&&(x.drawingHand===undefined||x.drawingHand==='Left'||x.drawingHand==='Right')&&(x.cameraId===undefined||typeof x.cameraId==='string')&&(x.aspect===undefined||(Number.isFinite(x.aspect)&&x.aspect>0))&&(x.version===undefined||(x.version===2&&x.verifiedCycles===3));
}
export function calibrate(open:number[],closed:number[],createdAt=Date.now()):{profile?:PinchCalibration;error?:string}{
  const clean=(a:number[])=>a.filter(x=>Number.isFinite(x)&&x>0&&x<4);
  open=clean(open);closed=clean(closed);
  if(open.length<24||closed.length<24)return{error:'Hold each pose until at least 24 good samples have been collected.'};
  const om=quantile(open,.5),cm=quantile(closed,.5),gap=om-cm,noise=Math.max(quantile(open,.9)-quantile(open,.1),quantile(closed,.9)-quantile(closed,.1));
  if(cm>=.60)return{error:'The pinch sample still looks open. Touch thumb and index tips, turn them toward the camera, and try again.'};
  if(gap<.22||quantile(closed,.9)>=quantile(open,.1)-.10)return{error:'Open and pinched poses overlap. Show an open hand, then touch thumb and index tips clearly in view.'};
  if(noise>gap*.6)return{error:'Tracking moved too much during calibration. Add front light, rest your elbow, and hold each pose steady.'};
  const enter=Math.min(.65,Math.max(.10,quantile(closed,.9)+gap*.16)),exit=Math.min(1.1,Math.max(enter+.10,cm+gap*.48)),lead=Math.min(1.4,Math.max(exit+.08,cm+gap*.66));
  return{profile:{enter,exit,lead,openMedian:om,closedMedian:cm,noise,samples:open.length+closed.length,createdAt}};
}
export function thresholds(profile?:PinchCalibration){return validCalibration(profile)?{enter:profile.enter,exit:profile.exit,lead:profile.lead}:{enter:.30,exit:.50,lead:.60};}
export function profileMatches(profile:PinchCalibration|undefined,cameraId:string,aspect:number,drawingHand?:string){return !profile||(validCalibration(profile)&&(!profile.drawingHand||!drawingHand||profile.drawingHand===drawingHand)&&(!profile.cameraId||profile.cameraId===cameraId)&&(!profile.aspect||Math.abs(profile.aspect-aspect)<.08));}
