import type { BoardObject, Point } from '../types';
import { bounds, moveObject } from './board';

type SelectionAction = 'larger' | 'smaller' | 'front' | 'back';
export type { SelectionAction };

function groupBounds(objects:BoardObject[]) {
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const object of objects){
    const b=bounds(object);
    left=Math.min(left,b.x);top=Math.min(top,b.y);
    right=Math.max(right,b.x+b.w);bottom=Math.max(bottom,b.y+b.h);
  }
  return {x:(left+right)/2,y:(top+bottom)/2,width:right-left,height:bottom-top};
}

export function arrangeSelection(objects:BoardObject[],ids:readonly string[],action:SelectionAction):BoardObject[]{
  const wanted=new Set(ids);
  const selected=objects.filter(o=>wanted.has(o.id));
  if(!selected.length)return objects;
  if(action==='front'||action==='back'){
    const other=objects.filter(o=>!wanted.has(o.id));
    const next=action==='front'?[...other,...selected]:[...selected,...other];
    return next.every((o,i)=>o===objects[i])?objects:next;
  }
  const center=groupBounds(selected), factor=action==='larger'?1.2:1/1.2;
  if(factor>1 && (center.width*factor>1440 || center.height*factor>900))return objects;
  if(selected.some(o=>o.kind==='text' && (o.fontSize*factor<8 || o.fontSize*factor>200)))return objects;
  if(factor<1 && Math.max(center.width,center.height)<4)return objects;
  const x=(n:number)=>center.x+(n-center.x)*factor;
  const y=(n:number)=>center.y+(n-center.y)*factor;
  return objects.map(o=>{
    if(!wanted.has(o.id))return o;
    const width=Math.max(.1,Math.min(100,o.width*factor));
    if(o.kind==='stroke')return {...o,width,points:o.points.map(p=>({...p,x:x(p.x),y:y(p.y)}))};
    if(o.kind==='text')return {...o,x:x(o.x),y:y(o.y),fontSize:o.fontSize*factor};
    return {...o,width,x:x(o.x),y:y(o.y),w:o.w*factor,h:o.h*factor,...(o.kind==='shape'&&o.vertices?{vertices:o.vertices.map(p=>({x:x(p.x),y:y(p.y)}))}:{})};
  });
}

export function offsetCopies(objects:BoardObject[],pageWidth:number,pageHeight:number):BoardObject[]{
  const group=groupBounds(objects);
  const offset=(center:number,size:number,limit:number)=>
    size>=limit?limit/2-center:Math.min(limit-size/2,Math.max(size/2,center+18))-center;
  return objects.map(o=>moveObject(o,offset(group.x,group.width,pageWidth),offset(group.y,group.height,pageHeight)));
}

export function lassoSelection(objects:BoardObject[], path:Point[]):string[] {
  if(path.length<3)return [];
  function inside(x:number,y:number){
    let result=false;
    for(let i=0,j=path.length-1;i<path.length;j=i++){
      const a=path[i],b=path[j];
      if((a.y>y)!==(b.y>y) && x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)result=!result;
    }
    return result;
  }
  return objects.filter(o=>{
    const box=bounds(o);
    return inside(box.x+box.w/2,box.y+box.h/2);
  }).map(o=>o.id);
}
