export interface TransformSession {baseDistance:number;baseX:number;baseY:number;distance:number;x:number;y:number;scale:number;panX:number;panY:number;t:number;}
const soft=(v:number,dead:number)=>Math.abs(v)<=dead?0:Math.sign(v)*(Math.abs(v)-dead);
export function transformViewport(view:{zoom:number;pan:{x:number;y:number}},baseZoom:number,event:{factor:number;dx:number;dy:number;anchor:{x:number;y:number}},size:{w:number;h:number}){
  const zoom=Math.max(.4,Math.min(3,baseZoom*event.factor)),ratio=zoom/view.zoom;
  return{zoom,pan:{x:view.pan.x+(event.anchor.x-size.w/2-view.pan.x)*(1-ratio)+event.dx,y:view.pan.y+(event.anchor.y-size.h/2-view.pan.y)*(1-ratio)+event.dy}};
}
export function transformStep(distance:number,mid:{x:number;y:number},t:number,previous?:TransformSession){
  if(!previous||t-previous.t>180)return{state:{baseDistance:distance,baseX:mid.x,baseY:mid.y,distance,x:mid.x,y:mid.y,scale:1,panX:0,panY:0,t},scale:1,dx:0,dy:0};
  const a=1-Math.exp(-Math.max(1,t-previous.t)/65),d=previous.distance+(distance-previous.distance)*a,x=previous.x+(mid.x-previous.x)*a,y=previous.y+(mid.y-previous.y)*a;
  const target=Math.exp(soft(Math.log(Math.max(.01,d)/Math.max(.01,previous.baseDistance)),.025)),panX=soft(x-previous.baseX,.005),panY=soft(y-previous.baseY,.005),ratio=Math.max(.85,Math.min(1.18,target/previous.scale)),scale=previous.scale*ratio;
  return{state:{...previous,distance:d,x,y,scale,panX,panY,t},scale:ratio,dx:panX-previous.panX,dy:panY-previous.panY};
}
