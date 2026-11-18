import { useRef, useState } from 'react';
import type { TextObject } from '../types';
import { Modal } from '../ui/common';

import NoteKeyboard from './NoteKeyboard';

export default function NoteEditor({note, existing, airTyping, onSave, onClose}:{
  note: TextObject; existing: boolean; airTyping:boolean; onSave: (note: TextObject) => void; onClose: () => void;
}) {
  const [draft,setDraft] = useState(note);
  const field=useRef<HTMLTextAreaElement>(null);
  const [keyboard,setKeyboard]=useState(airTyping);
  return <Modal wide={keyboard} title={existing?'Edit note':'Add note'} onClose={onClose}>
    <form onSubmit={event=>{event.preventDefault();if(draft.text.trim())onSave(draft);}}>
      <div className="note-format">
        <button type="button" data-gesture aria-pressed={!!draft.bold} onClick={()=>setDraft({...draft,bold:!draft.bold})}><b>Bold</b></button>
        <button type="button" data-gesture aria-pressed={!!draft.italic} onClick={()=>setDraft({...draft,italic:!draft.italic})}><em>Italic</em></button>
        <button type="button" data-gesture aria-label="Decrease font size" disabled={draft.fontSize<=8} onClick={()=>setDraft({...draft,fontSize:Math.max(8,draft.fontSize-2)})}>A−</button>
        <output>{draft.fontSize} px</output>
        <button type="button" data-gesture aria-label="Increase font size" disabled={draft.fontSize>=200} onClick={()=>setDraft({...draft,fontSize:Math.min(200,draft.fontSize+2)})}>A+</button>
      </div>
      <textarea ref={field} inputMode={keyboard?'none':'text'} autoFocus className="input" aria-label="Note text" rows={5} maxLength={10000} value={draft.text}
        style={{fontWeight:draft.bold?700:400,fontStyle:draft.italic?'italic':'normal'}}
        onChange={event=>setDraft({...draft,text:event.target.value})}/>
      <button type="button" data-gesture className="keyboard-toggle" aria-expanded={keyboard} onClick={()=>setKeyboard(!keyboard)}>{keyboard?"Hide on-screen keyboard":"Show on-screen keyboard"}</button>
      {keyboard && <NoteKeyboard field={field} value={draft.text} onChange={text=>setDraft({...draft,text})}/>}
      <div className="modal-actions"><button data-gesture type="button" className="btn secondary" onClick={onClose}>Cancel</button>
        <button data-gesture className="btn primary" disabled={!draft.text.trim()}>Save note</button></div>
    </form>
  </Modal>;
}
