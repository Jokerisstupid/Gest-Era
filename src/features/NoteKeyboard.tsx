import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

interface Props {
  field: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
}
const letters = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const symbols = ['1234567890', '.,?!:;@#&', "()-+/'="];

export default function NoteKeyboard({field,value,onChange}:Props) {
  const [uppercase,setUppercase] = useState(false);
  const [numbers,setNumbers] = useState(false);
  const [compact,setCompact]=useState(()=>matchMedia('(max-width: 650px), (max-height: 550px)').matches);
  const [bank,setBank]=useState(0);
  useEffect(()=>{
    const media=matchMedia('(max-width: 650px), (max-height: 550px)');
    const change=()=>setCompact(media.matches);
    media.addEventListener('change',change);return()=>media.removeEventListener('change',change);
  },[]);
  const rows=numbers?symbols:letters;
  const keys=compact?(numbers?rows:['abcdefghi','jklmnopqr','stuvwxyz']):rows;
  const caret = useRef<number | null>(null);
  useLayoutEffect(()=>{
    if(caret.current!==null)field.current?.setSelectionRange(caret.current,caret.current);
    caret.current=null;
  },[value,field]);

  function edit(key:string) {
    const el=field.current;
    if(!el)return;
    let start=el.selectionStart;
    const end=el.selectionEnd;
    let inserted=key;
    if(key==='Backspace'){
      inserted='';
      if(start===end)start-=Array.from(value.slice(0,start)).at(-1)?.length??0;
    }
    const next=value.slice(0,start)+inserted+value.slice(end);
    if(next.length>el.maxLength)return;
    const position=start+inserted.length;
    if(next===value)el.setSelectionRange(position,position);
    else {caret.current=position;onChange(next);}
    if(uppercase && !numbers && key.length===1 && key.trim())setUppercase(false);
  }

  return <div className="note-keyboard" role="group" aria-label="On-screen keyboard">
    {compact&&<div className="note-key-actions">{keys.map((row,i)=><button key={row} type="button" data-gesture aria-pressed={bank===i} onClick={()=>setBank(i)}>{row[0]} – {row.at(-1)}</button>)}</div>}
    {(compact?[keys[bank]]:keys).map(row=><div className="note-key-row" key={row}>{Array.from(row).map(char=>{
      const key=uppercase&&!numbers?char.toUpperCase():char;
      return <button key={char} data-gesture type="button" onClick={()=>edit(key)}>{key}</button>;
    })}</div>)}
    <div className="note-key-actions">
      <button data-gesture type="button" aria-pressed={numbers} onClick={()=>{setNumbers(!numbers);setBank(0);}}>{numbers?'ABC':'123'}</button>
      <button data-gesture type="button" aria-pressed={uppercase} disabled={numbers} onClick={()=>setUppercase(!uppercase)}>Shift</button>
      <button data-gesture type="button" onClick={()=>edit(' ')}>Space</button>
      <button data-gesture type="button" onClick={()=>edit('\n')}>Enter</button>
      <button data-gesture type="button" onClick={()=>edit('Backspace')}>Backspace</button>
    </div>
  </div>;
}
