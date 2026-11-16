import type { Point, ShapeObject, Stroke } from '../../types';
const dist=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
function lineError(p:Point,a:Point,b:Point){const d=(b.x-a.x)**2+(b.y-a.y)**2;if(!d)return dist(p,a);const t=Math.max(0,Math.min(1,((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/d));return dist(p,{x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)});}
export function simplify(points:Point[],tolerance:number):Point[]{if(points.length<3)return points;let largest=0,index=0;for(let i=1;i<points.length-1;i++){const error=lineError(points[i],points[0],points.at(-1)!);if(error>largest){largest=error;index=i;}}return largest>tolerance?[...simplify(points.slice(0,index+1),tolerance).slice(0,-1),...simplify(points.slice(index),tolerance)]:[points[0],points.at(-1)!];}
function resample(points:Point[],count=80){const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+dist(points[i-1],points[i]));const total=lengths.at(-1)!;if(total<1)return points;const result:Point[]=[];let i=1;for(let k=0;k<count;k++){const t=total*k/(count-1);while(i<lengths.length-1&&lengths[i]<t)i++;const f=(t-lengths[i-1])/(lengths[i]-lengths[i-1]||1);result.push({x:points[i-1].x+(points[i].x-points[i-1].x)*f,y:points[i-1].y+(points[i].y-points[i-1].y)*f,t:0});}return result;}
export function recognizeShape(stroke:Stroke):ShapeObject|undefined{
  if(stroke.points.length<5)return;
  const pts=resample(stroke.points),xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y,diag=Math.hypot(w,h);
  if(diag<35)return;
  const first=pts[0],last=pts.at(-1)!,length=pts.reduce((sum,p,i)=>sum+(i?dist(p,pts[i-1]):0),0);
  const base={id:stroke.id,kind:'shape' as const,color:stroke.color,width:stroke.width,createdAt:stroke.createdAt};
  if(dist(first,last)>.80*length&&pts.every(p=>lineError(p,first,last)<Math.max(3,diag*.035)))return{...base,shape:'line',x:first.x,y:first.y,w:last.x-first.x,h:last.y-first.y};
  const simplified=simplify(stroke.points,diag*.035);
  if(simplified.length>=4&&simplified.length<=6){const tip=simplified[1],shaft=dist(first,tip);if(shaft>diag*.65){const rest=simplified.slice(2),cross=rest.map(p=>((tip.x-first.x)*(p.y-tip.y)-(tip.y-first.y)*(p.x-tip.x))/shaft);if(rest.every(p=>dist(p,tip)<shaft*.4)&&Math.min(...cross)<-shaft*.06&&Math.max(...cross)>shaft*.06)return{...base,shape:'arrow',x:first.x,y:first.y,w:tip.x-first.x,h:tip.y-first.y};}}
  if(w<25||h<25||dist(first,last)>Math.max(15,diag*.12))return;
  const edgeError=pts.reduce((sum,p)=>sum+Math.min(Math.abs(p.x-x),Math.abs(p.x-x-w),Math.abs(p.y-y),Math.abs(p.y-y-h)),0)/pts.length;
  const corners=[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
  if(edgeError<diag*.025&&Math.abs(length-2*(w+h))<diag*.18&&corners.every(c=>pts.some(p=>dist(c,p)<diag*.09)))return{...base,shape:'rectangle',x,y,w,h};
  const poly=simplify([...pts.slice(0,-1),pts[0]],diag*.055).slice(0,-1);
  if(poly.length===3){const area=Math.abs(poly[0].x*(poly[1].y-poly[2].y)+poly[1].x*(poly[2].y-poly[0].y)+poly[2].x*(poly[0].y-poly[1].y))/2;const error=pts.reduce((sum,p)=>sum+Math.min(...poly.map((a,i)=>lineError(p,a,poly[(i+1)%3]))),0)/pts.length;if(area>w*h*.15&&error<diag*.025)return{...base,shape:'triangle',x,y,w,h,vertices:poly.map(p=>({x:p.x,y:p.y}))};}
  const radial=pts.reduce((sum,p)=>sum+Math.abs(Math.hypot((p.x-x-w/2)/(w/2),(p.y-y-h/2)/(h/2))-1),0)/pts.length;
  if(radial<.075&&length>Math.PI*Math.min(w,h)*.8)return{...base,shape:'ellipse',x,y,w,h};
}
