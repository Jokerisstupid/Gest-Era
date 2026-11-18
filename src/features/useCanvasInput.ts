import { useRef, type PointerEvent } from 'react';
type Position = { x:number; y:number };
type Sample = Position & { t:number; pressure:number };
type CanvasEvent = PointerEvent<HTMLCanvasElement>;
interface Actions {
  start:(p:Sample,pan:boolean,erase?:boolean)=>void;
  fingerPan:boolean;
  move:(p:Sample)=>void;
  hover:(p:Sample)=>void;
  finish:()=>void;
  zoom:(ratio:number,previous:Position,next:Position)=>void;
}
const sample = (e: globalThis.PointerEvent):Sample => ({x:e.clientX,y:e.clientY,t:e.timeStamp,pressure:e.pressure});
const center = (a:Position,b:Position) => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const distance = (a:Position,b:Position) => Math.hypot(a.x-b.x,a.y-b.y);
export default function useCanvasInput(actions: Actions) {
  const touches=useRef(new Map<number,Sample>()), owner=useRef<number | null>(null);
  const pending=useRef<Sample | null>(null), navigating=useRef(false);
  function end(e:CanvasEvent,cancel:boolean) {
    const wasTouch=touches.current.delete(e.pointerId);
    if(owner.current===e.pointerId){
      if(pending.current && !cancel) actions.start(pending.current,actions.fingerPan);
      if(!cancel && !pending.current) actions.move(sample(e.nativeEvent));
      actions.finish();owner.current=null;pending.current=null;
    }
    if(wasTouch && !touches.current.size)navigating.current=false;
  }
  return {
    onPointerDown(e:CanvasEvent){
      const penEraser=e.pointerType==='pen' && (e.button===5 || (e.buttons&32)!==0);
      if(e.button!==0 && e.button!==1 && !penEraser)return;
      const p=sample(e.nativeEvent);
      if(e.pointerType==='touch'){
        if(owner.current!==null && !touches.current.has(owner.current))return;
        touches.current.set(e.pointerId,p);
      } else if(owner.current!==null || navigating.current)return;
      e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
      if(touches.current.size>1){
        if(owner.current!==null && !pending.current)actions.finish();
        owner.current=null;pending.current=null;navigating.current=true;return;
      }
      owner.current=e.pointerId;
      if(e.pointerType==='touch')pending.current=p;
      else actions.start(p,e.button===1,penEraser);
    },
    onPointerMove(e:CanvasEvent){
      const p=sample(e.nativeEvent), previous=touches.current.get(e.pointerId);
      if(previous){
        const pair=Array.from(touches.current.keys()).slice(0,2);
        touches.current.set(e.pointerId,p);
        if(navigating.current){
          const other=touches.current.get(pair.find(id=>id!==e.pointerId)!);
          if(pair.includes(e.pointerId) && other && distance(previous,other)>4)
            actions.zoom(distance(p,other)/distance(previous,other),center(previous,other),center(p,other));
          return;
        }
      }
      if(owner.current!==e.pointerId){if(owner.current===null && e.pointerType!=='touch')actions.hover(p);return;}
      if(pending.current){
        if(distance(p,pending.current)<3)return;
        actions.start(pending.current,actions.fingerPan);pending.current=null;
      }
      const samples=e.nativeEvent.getCoalescedEvents?.() ?? [];
      if(samples.length)samples.forEach(s=>actions.move(sample(s)));
      else actions.move(p);
    },
    onPointerUp:(e:CanvasEvent)=>end(e,false),
    onPointerCancel:(e:CanvasEvent)=>end(e,true),
    onLostPointerCapture:(e:CanvasEvent)=>end(e,true),
  };
}
