import { useState } from 'react';
import type { BoardObject, TextObject } from '../types';
import { Modal } from '../ui/common';

interface Props {
  objects: BoardObject[];
  onClose:()=>void;
  onSelect:(object:BoardObject)=>void;
  onEdit:(note?:TextObject)=>void;
}
export default function PageContents({objects,onClose,onSelect,onEdit}:Props) {
  const [page,setPage]=useState(0);
  const count=Math.max(1,Math.ceil(objects.length/8));
  const current=Math.min(page,count-1),start=current*8;
  return <Modal title="Page contents" onClose={onClose}>
    <button type="button" className="btn primary" data-gesture onClick={()=>onEdit()}>Add text note</button>
    {objects.length===0?<p>This page is empty.</p>:<>
      <ol className="page-content-items" start={start+1}>
        {objects.slice(start,start+8).map((object,i)=>{
          const label=object.kind==='text'?object.text:object.kind==='shape'?object.shape:object.kind==='picture'?object.name:object.tool+' stroke';
          return <li key={object.id}><span>{label}</span><div>
            <button data-gesture aria-label={'Select item '+(start+i+1)} onClick={()=>onSelect(object)}>Select</button>
            {object.kind==='text'&&<button data-gesture aria-label={'Edit note '+(start+i+1)} onClick={()=>onEdit(object)}>Edit</button>}
          </div></li>;
        })}
      </ol>
      {count>1&&<div className="modal-actions"><button data-gesture disabled={current===0} onClick={()=>setPage(current-1)}>Previous</button>
        <span role="status">{current+1} of {count}</span><button data-gesture disabled={current===count-1} onClick={()=>setPage(current+1)}>Next</button></div>}
    </>}
  </Modal>;
}
