import { useState } from 'react';
import { Check } from 'lucide-react';
import { Modal } from '../ui/common';
import { useSettings } from '../store/settings';
import type { Background, ShapeObject } from '../types';

export const inks = [
  ['Graphite','#26324f'], ['Blue','#2f6bff'], ['Violet','#7c57cc'],
  ['Teal','#23a38c'], ['Amber','#e6a538'], ['Rose','#ed718a'],
] as const;
type Shape = ShapeObject['shape'];
type Group = 'Ink' | 'Shapes' | 'Eraser' | 'Paper';
interface Props {
  group: Group; color: string; width: number; shape: Shape; paper: Background;
  onColor: (value: string) => void; onWidth: (value: number) => void;
  onShape: (value: Shape) => void; onPaper: (value: Background) => void; onClose: () => void;
}
export default function InkProperties(props: Props) {
  const [group,setGroup] = useState(props.group);
  const settings = useSettings();
  const option = (name:string, active:boolean, run:()=>void) =>
    <button type="button" key={name} data-gesture aria-pressed={active} onClick={run}>{name}</button>;
  return <Modal title="Ink & paper" onClose={props.onClose}>
    <div className="ribbon-groups property-tabs">{(['Ink','Shapes','Eraser','Paper'] as const).map(name => option(name,group===name,()=>setGroup(name)))}</div>
    <div className="property-options">
      {group === 'Ink' && <><h3>Ink color</h3><div>{inks.map(([name,value]) =>
        <button data-gesture key={value} aria-pressed={props.color===value} onClick={()=>props.onColor(value)}><i style={{background:value}}/>{name}</button>)}
        <label>Custom <input type="color" value={props.color} onChange={e=>props.onColor(e.target.value)}/></label></div>
        <h3>Stroke width</h3><div>{[1,2,3,5,8,12].map(n=>option(n+' px',props.width===n,()=>props.onWidth(n)))}</div>
        <label>Fine adjustment <input type="range" min="1" max="12" value={props.width} onChange={e=>props.onWidth(Number(e.target.value))}/> {props.width} px</label></>}
      {group === 'Shapes' && <><h3>Drag to draw</h3><div>{(['line','arrow','rectangle','ellipse','triangle'] as const).map(s=>option(s,s===props.shape,()=>{props.onShape(s);props.onClose();}))}</div>
        <h3>Freehand shapes</h3><div>{option('Hold to straighten',settings.shapeSnap,()=>settings.update({shapeSnap:!settings.shapeSnap}))}</div></>}
      {group === 'Eraser' && <><h3>Erase</h3><div>{(['stroke','ink','object'] as const).map(v=>option(v==='stroke'?'Precision eraser':v==='ink'?'Whole ink stroke':'Whole object',settings.eraserMode===v,()=>settings.update({eraserMode:v})))}</div>
        <h3>Eraser radius</h3><div>{[8,12,24,40,48].map(n=>option(n+' px',settings.eraserRadius===n,()=>settings.update({eraserRadius:n})))}</div><label>Custom radius <input type="range" min={8} max={48} value={settings.eraserRadius} onChange={e=>settings.update({eraserRadius:Number(e.target.value)})}/> {settings.eraserRadius} px</label></>}
      {group === 'Paper' && <><h3>Page background</h3><div>{(['blank','dots','grid','ruled'] as const).map(v=>option(v,props.paper===v,()=>props.onPaper(v)))}</div></>}
    </div>
    <div className="modal-actions"><button className="btn primary" data-gesture onClick={props.onClose}><Check size={16}/>Done</button></div>
  </Modal>;
}
