import { useState } from 'react';
import type { ReactNode } from 'react';
import { MousePointer2, Pencil, Highlighter, Eraser, Square, Type, Hand, ScanLine, Lasso } from 'lucide-react';
import { useSettings } from '../store/settings';
import type { Tool } from '../types';

const tools = [
  ['pen', 'Pen', Pencil], ['highlighter', 'Highlight', Highlighter],
  ['eraser', 'Erase', Eraser], ['shape', 'Shapes', Square],
  ['text', 'Text', Type], ['select', 'Select', MousePointer2],
  ['lasso', 'Lasso', Lasso], ['hand', 'Pan', Hand], ['laser', 'Laser', ScanLine],
] as const;

import type { SelectionAction } from '../engine/selection';

interface Props {
  locked:boolean;
  onContents:()=>void;
  onMedia:(pdf:boolean)=>void;
  importing:string;
  onLock:()=>void;
  onArrange:(action:SelectionAction)=>void;
  onNextColor:()=>void;
  fingerPan:boolean;
  onFingerPan:()=>void;
  tool: Tool;
  color: string;
  onTool: (tool: Tool) => void;
  onProperties: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onSelectAll:()=>void;
  onCut:()=>void;
  onRecolor:()=>void;
  onClear: () => void;
  onGuide: () => void;
  canCopy: boolean;
  canPaste: boolean;
  zoomControls: ReactNode;
}

export default function NotebookRibbon(props: Props) {
  const settings=useSettings();
  const [group, setGroup] = useState<'Draw' | 'Insert' | 'Edit' | 'View'>('Draw');
  return <section inert={props.locked} className="notebook-ribbon" aria-label="Page tools">
    <div className="ribbon-groups" role="group" aria-label="Tool groups">
      {(['Draw', 'Insert', 'Edit', 'View'] as const).map(name =>
        <button data-gesture key={name} aria-pressed={name === group} onClick={() => setGroup(name)}>{name}</button>)}
    </div>
    <div className="ribbon-controls" role="group" aria-label={group + ' controls'}>
      {group === 'Draw' && <>
        {tools.map(([id, label, Icon]) => <button key={id} data-gesture aria-pressed={props.tool === id} onClick={() => props.onTool(id)}><Icon size={17}/>{label}</button>)}
        {props.tool==='eraser'&&<button data-gesture onClick={props.onProperties}>Eraser mode &amp; size</button>}
        <button data-gesture onClick={props.onNextColor} title="Cycle through ink colors">Next color</button>
        <button data-gesture onClick={props.onProperties}><i style={{ backgroundColor: props.color }}/>Ink &amp; paper</button>
      </>}
      {group === 'Insert' && <>
        <button disabled={!!props.importing} onClick={()=>props.onMedia(false)}>Picture</button>
        <button disabled={!!props.importing} onClick={()=>props.onMedia(true)}>PDF slides</button>
        <span role="status">{props.importing}</span>
      </>}
      {group === 'Edit' && <>
        <button data-gesture onClick={props.onContents}>Page contents</button>
        <button data-gesture aria-pressed={props.tool === 'select'} onClick={() => props.onTool('select')}>Select &amp; move</button>
        <button data-gesture onClick={props.onSelectAll}>Select all</button>
        <button data-gesture disabled={!props.canCopy} onClick={props.onCut}>Cut</button>
        <button data-gesture disabled={!props.canCopy} onClick={props.onRecolor}><i style={{backgroundColor:props.color}}/>Apply ink color</button>
        <button data-gesture disabled={!props.canCopy} onClick={props.onCopy}>Copy selection</button>
        <button data-gesture disabled={!props.canPaste} onClick={props.onPaste}>Paste</button>
        {([['larger','Enlarge'],['smaller','Shrink'],['front','Bring to front'],['back','Send to back']] as const).map(([action,label])=>
          <button key={action} data-gesture disabled={!props.canCopy} onClick={()=>props.onArrange(action)}>{label}</button>)}
        <button data-gesture disabled={!props.canCopy} onClick={props.onDelete}>Delete selection</button>
        <button data-gesture onClick={props.onClear}>Clear page</button>
      </>}
      {group === 'View' && <>{props.zoomControls}<button data-gesture aria-pressed={settings.thumbPages} onClick={()=>settings.update({thumbPages:!settings.thumbPages})} title="Swipe an open hand right for next or left for previous. A sideways thumb hold also works.">Gesture page turns</button><button data-gesture onClick={props.onLock}>Lock board</button><button data-gesture aria-pressed={props.fingerPan} onClick={props.onFingerPan}>Finger pans</button><button data-gesture onClick={props.onGuide}>Gesture guide</button></>}
    </div>
  </section>;
}
