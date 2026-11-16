import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { createPortal } from 'react-dom';
import { activeDialog } from './gestureUI';
export interface CursorDisplay {x:number;y:number;visible:boolean;pinching:boolean;eraser:boolean;progress:number;overUI:boolean;label:string;laser?:boolean;radius?:number;}
export interface HandCursorHandle {update:(display:CursorDisplay)=>void;}
const HandCursor=forwardRef<HandCursorHandle>(function HandCursor(_,ref){
  const host=useRef<HTMLDivElement|null>(null),cursor=useRef<HTMLDivElement>(null),progress=useRef<SVGCircleElement>(null),label=useRef<HTMLSpanElement>(null);
  if(!host.current)host.current=document.createElement('div');
  useEffect(()=>{const el=host.current!;el.className='hand-cursor-host';document.body.appendChild(el);return()=>el.remove();},[]);
  useImperativeHandle(ref,()=>({update(d){const el=cursor.current;if(!el)return;const parent=activeDialog()??document.body;if(host.current!.parentElement!==parent)parent.appendChild(host.current!);el.style.display=d.visible?'block':'none';el.style.transform=`translate3d(${d.x}px,${d.y}px,0)`;el.dataset.pinching=String(d.pinching);el.dataset.eraser=String(d.eraser);el.style.setProperty('--eraser-r',`${d.radius??24}px`);el.dataset.ui=String(d.overUI);el.dataset.laser=String(d.laser??false);if(progress.current)progress.current.style.strokeDashoffset=String(138.23*(1-d.progress));if(label.current)label.current.textContent=d.label;}}),[]);
  return createPortal(<div ref={cursor} className="hand-cursor" aria-hidden="true" style={{display:'none'}}><svg viewBox="0 0 56 56"><circle className="cursor-outline" cx="28" cy="28" r="22"/><circle ref={progress} className="cursor-progress" cx="28" cy="28" r="22" strokeDasharray="138.23" strokeDashoffset="138.23"/><circle className="cursor-dot" cx="28" cy="28" r="3"/></svg><span ref={label}/></div>,host.current);
});
export default HandCursor;
