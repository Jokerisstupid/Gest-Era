import type { Features, Hand, Landmark } from './types';
import { thresholds,type PinchCalibration } from './calibration';
export const clamp=(x:number,min=0,max=1)=>Math.min(max,Math.max(min,x));
export const distance=(a:Landmark,b:Landmark)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z??0)-(b.z??0));
export function angle(a:Landmark,b:Landmark,c:Landmark){const u={x:a.x-b.x,y:a.y-b.y,z:(a.z??0)-(b.z??0)},v={x:c.x-b.x,y:c.y-b.y,z:(c.z??0)-(b.z??0)};const lengths=Math.hypot(u.x,u.y,u.z)*Math.hypot(v.x,v.y,v.z);return lengths>1e-10?Math.acos(clamp((u.x*v.x+u.y*v.y+u.z*v.z)/lengths,-1,1))*180/Math.PI:0;}
function validPoints(points:Landmark[]|undefined):points is Landmark[]{
  return points?.length===21 && points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z??0));
}
function palmSpan(points:Landmark[]){
  const sizes=[distance(points[0],points[5]),distance(points[0],points[9]),distance(points[0],points[13]),distance(points[5],points[17])*1.15].sort((a,b)=>a-b);
  return (sizes[1]+sizes[2])/2;
}
export function handGeometry(hand:Hand,aspect:number){
  if(!validPoints(hand.landmarks)||!Number.isFinite(aspect)||aspect<=0)return;
  if(validPoints(hand.worldLandmarks)){
    const palm=palmSpan(hand.worldLandmarks);
    if(palm>=1e-5)return {source:hand.worldLandmarks,palm,world:true};
  }
  const source=aspect===1?hand.landmarks:hand.landmarks.map(p=>({...p,y:p.y*aspect}));
  const palm=palmSpan(source);
  if(palm>=1e-5)return {source,palm,world:false};
}
export function extractFeatures(hand:Hand,previous?:Features,aspect=1):Features|undefined {
  const geometry=handGeometry(hand,aspect);
  if(!geometry)return;
  const {source,palm,world}=geometry;
  let pinch=distance(source[4],source[8])/palm;
  if(world){
    const planar=(a:number,b:number)=>Math.hypot(hand.landmarks[a].x-hand.landmarks[b].x,(hand.landmarks[a].y-hand.landmarks[b].y)*aspect);
    const imagePalm=Math.max(planar(0,9),planar(5,17));
    const projected=planar(4,8)/Math.max(.001,imagePalm);
    // Use stronger image evidence only when the fingertips nearly coincide.
    if(imagePalm>.020 && projected<.30 && pinch<.66 && projected<pinch){
      const contact=clamp((.30-projected)/.20);
      pinch-=Math.min(.10+.09*contact,(pinch-projected)*(.40+.20*contact));
    }
  }
  const extended=[5,9,13,17].map((base,i)=>{const stay=previous?.extended[i]??false;return angle(source[base],source[base+1],source[base+2])>(stay?140:156)&&angle(source[base+1],source[base+2],source[base+3])>(stay?132:145)&&angle(source[0],source[base],source[base+1])>(stay?92:108);});
  const thumb=angle(source[1],source[2],source[3])>(previous?.thumb?125:145)&&angle(source[2],source[3],source[4])>(previous?.thumb?135:150)&&distance(source[4],source[5])/palm>(previous?.thumb ? .28 : .38);
  // A fully folded fist can put thumb and index tips close together. It is not pen intent.
  const fist=!thumb&&[5,9,13,17].every(base=>angle(source[base],source[base+1],source[base+2])<100&&distance(source[base+3],source[0])<distance(source[base],source[0])*1.1);
  const gesture=fist?'FIST':pinch<.30?'PINCH':extended.every(Boolean)?'OPEN_PALM':extended[0]&&extended[1]&&!extended[2]&&!extended[3]?'PEACE':extended[0]&&!extended[1]&&!extended[2]&&!extended[3]?'POINT':'NONE';
  return{pinch,palm,extended,thumb,gesture};
}
// A continuous geometric anchor; it never branches on pen-up / pen-down state.
export function cursorAnchor(hand:Hand,ratio:number,profile?:PinchCalibration,mobile=false){const p=thresholds(profile,mobile),start=p.lead+.25,end=p.enter*5/6;const s=clamp((start-ratio)/(start-end)),w=s*s*(3-2*s);const tip=hand.landmarks[8],thumb=hand.landmarks[4];return{x:tip.x+(thumb.x-tip.x)*w/2,y:tip.y+(thumb.y-tip.y)*w/2};}
