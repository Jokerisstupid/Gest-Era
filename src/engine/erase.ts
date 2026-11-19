import { uid,type BoardObject,type Point,type Stroke } from '../types';
import { bounds } from './board';
const boxes=new WeakMap<BoardObject,ReturnType<typeof bounds>>();
const lerp=(a:Point,b:Point,t:number):Point=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,t:a.t+(b.t-a.t)*t,pressure:a.pressure});
function distance(p:Point,a:Point,b:Point){const dx=b.x-a.x,dy=b.y-a.y,u=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-u*dx,p.y-a.y-u*dy);}
function roots(p:Point,q:Point,c:Point,r:number){const dx=q.x-p.x,dy=q.y-p.y,x=p.x-c.x,y=p.y-c.y,a=dx*dx+dy*dy,b=2*(x*dx+y*dy),d=b*b-4*a*(x*x+y*y-r*r);if(a<1e-12||d<0)return[];return[(-b-Math.sqrt(d))/(2*a),(-b+Math.sqrt(d))/(2*a)];}
function cuts(p:Point,q:Point,a:Point,b:Point,r:number){
  const ts=[0,1,...roots(p,q,a,r),...roots(p,q,b,r)],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
  if(len>1e-6){const cross=(x:Point)=>((x.x-a.x)*dy-(x.y-a.y)*dx)/len,one=cross(p),two=cross(q);if(Math.abs(two-one)>1e-9)for(const side of [-r,r])ts.push((side-one)/(two-one));}
  return [...new Set(ts.filter(t=>t>=0&&t<=1).map(t=>Math.round(t*1e10)/1e10))].sort((x,y)=>x-y);
}
export function splitStroke(stroke:Stroke,a:Point,b:Point,radius:number,id:()=>string=uid):Stroke[]{
  const radiusWithInk=radius+(stroke.tool==='highlighter'?stroke.width*4:stroke.width)/2;
  if(stroke.points.length===1)return distance(stroke.points[0],a,b)>radiusWithInk?[stroke]:[];
  const parts:Point[][]=[];let part:Point[]=[];let removed=false;
  const finish=()=>{if(part.length)parts.push(part);part=[];};
  for(let i=1;i<stroke.points.length;i++){const p=stroke.points[i-1],q=stroke.points[i],ts=cuts(p,q,a,b,radiusWithInk);
    for(let j=1;j<ts.length;j++){const lo=ts[j-1],hi=ts[j];if(hi-lo<1e-10)continue;
      if(distance(lerp(p,q,(lo+hi)/2),a,b)<=radiusWithInk){removed=true;finish();continue;}
      const start=lerp(p,q,lo),end=lerp(p,q,hi),last=part.at(-1);if(!last||Math.hypot(last.x-start.x,last.y-start.y)>1e-6){finish();part=[start];}part.push(end);
    }
  }finish();if(!removed)return[stroke];return parts.filter(p=>p.length>1).map((points,i)=>({...stroke,id:i?id():stroke.id,points}));
}
function shapeSegments(o:Exclude<BoardObject,Stroke>):Point[][]{
  const p=(x:number,y:number):Point=>({x,y,t:0});
  if(o.kind==='text'||o.kind==='picture'){const b=bounds(o);return[[p(b.x,b.y),p(b.x+b.w,b.y),p(b.x+b.w,b.y+b.h),p(b.x,b.y+b.h),p(b.x,b.y)]];}
  if(o.vertices?.length)return[[...o.vertices.map(v=>p(v.x,v.y)),p(o.vertices[0].x,o.vertices[0].y)]];
  if(o.shape==='ellipse')return[Array.from({length:49},(_,i)=>p(o.x+o.w/2+o.w/2*Math.cos(i*Math.PI/24),o.y+o.h/2+o.h/2*Math.sin(i*Math.PI/24)))];
  if(o.shape==='rectangle')return[[p(o.x,o.y),p(o.x+o.w,o.y),p(o.x+o.w,o.y+o.h),p(o.x,o.y+o.h),p(o.x,o.y)]];
  if(o.shape==='triangle')return[[p(o.x+o.w/2,o.y),p(o.x+o.w,o.y+o.h),p(o.x,o.y+o.h),p(o.x+o.w/2,o.y)]];
  if(o.shape==='arrow'){const angle=Math.atan2(o.h,o.w),tip=p(o.x+o.w,o.y+o.h);return[[p(o.x,o.y),tip],[p(tip.x-16*Math.cos(angle-.5),tip.y-16*Math.sin(angle-.5)),tip,p(tip.x-16*Math.cos(angle+.5),tip.y-16*Math.sin(angle+.5))]];}
  return[[p(o.x,o.y),p(o.x+o.w,o.y+o.h)]];
}
export function eraseSweep(objects:BoardObject[],a:Point,b:Point,radius:number,mode:'stroke'|'ink'|'object',id:()=>string=uid){
  let changed=false;const result:BoardObject[]=[];
  for(const o of objects){
    if((mode==='ink' && o.kind!=='stroke') || (o.kind==='picture' && mode==='stroke')){result.push(o);continue;}
    let box=boxes.get(o);if(!box){box=bounds(o);boxes.set(o,box);}const extent=radius+(o.kind==='stroke'&&o.tool==='highlighter'?o.width*4:o.width)/2+(o.kind==='shape'&&o.shape==='arrow'?16:0);
    if(box.x+box.w<Math.min(a.x,b.x)-extent||box.x>Math.max(a.x,b.x)+extent||box.y+box.h<Math.min(a.y,b.y)-extent||box.y>Math.max(a.y,b.y)+extent){result.push(o);continue;}
    if(o.kind==='stroke'){const fragments=splitStroke(o,a,b,radius,id);if(fragments.length===1&&fragments[0]===o)result.push(o);else{changed=true;if(mode==='stroke')result.push(...fragments);}}
    else{const insideText=(o.kind==='text'||o.kind==='picture')&&[a,b].some(p=>p.x>=box.x&&p.x<=box.x+box.w&&p.y>=box.y&&p.y<=box.y+box.h);const hit=insideText||shapeSegments(o).some(line=>line.slice(1).some((q,i)=>{const p=line[i];const ts=cuts(p,q,a,b,radius+o.width/2);return ts.slice(1).some((hi,j)=>distance(lerp(p,q,(ts[j]+hi)/2),a,b)<=radius+o.width/2);}));if(hit)changed=true;else result.push(o);}
  }return{objects:changed?result:objects,changed};
}
