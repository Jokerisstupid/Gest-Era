import { useId, createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, X, ArrowRight, Hand, Pencil, MousePointer2, Video, Undo2 } from 'lucide-react';
const ToastContext = createContext<(message: string) => void>(() => { });
export function ToastProvider({ children }: {
    children: ReactNode;
}) { const [message, setMessage] = useState(''); useEffect(() => { if (!message)
    return; const t = setTimeout(() => setMessage(''), 4200); return () => clearTimeout(t); }, [message]); return <ToastContext.Provider value={setMessage}>{children}{message && <div className="toast" role="status"><Check size={17}/>{message}<button data-gesture aria-label="Dismiss notification" onClick={() => setMessage('')}><X size={15}/></button></div>}</ToastContext.Provider>; }
export const useToast = () => useContext(ToastContext);
export function Modal({ title, children, onClose, wide = false }: {
    title: string;
    children: ReactNode;
    onClose: () => void;
    wide?: boolean;
}) { const ref = useRef<HTMLDialogElement>(null);
  const titleId=useId();
  const [scroll,setScroll]=useState({up:false,down:false});
  useEffect(()=>{
    const dialog=ref.current;if(!dialog||!dialog.closest('.gesture-mode'))return;
    const measure=()=>{
      const up=dialog.scrollTop>2,down=dialog.scrollTop+dialog.clientHeight<dialog.scrollHeight-2;
      setScroll(old=>old.up===up&&old.down===down?old:{up,down});
    };
    const observer=new ResizeObserver(measure);
    observer.observe(dialog);Array.from(dialog.children).forEach(el=>observer.observe(el));
    const mutation=new MutationObserver(measure);
    mutation.observe(dialog,{childList:true,subtree:true,characterData:true});
    dialog.addEventListener('scroll',measure);measure();
    return()=>{observer.disconnect();mutation.disconnect();dialog.removeEventListener('scroll',measure);};
  },[]);
  useEffect(() => { const d = ref.current; d?.showModal(); d?.querySelector<HTMLInputElement>('input:not([type="hidden"]),textarea')?.focus(); return () => d?.close(); }, []); return <dialog aria-labelledby={titleId} ref={ref} className={`modal ${wide ? 'wide' : ''}`} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget)
    onClose(); }} onKeyDown={e => { if (e.key === 'Escape') {
    e.stopPropagation();
    onClose();
} }}><div className="modal-head"><h2 id={titleId}>{title}</h2><button data-gesture className="icon-btn" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>{(scroll.up||scroll.down)&&<div className="dialog-scroll-controls">{([-1,1] as const).map(direction=><button type="button" key={direction} data-gesture disabled={direction<0?!scroll.up:!scroll.down}
    onClick={()=>{const el=ref.current;if(el)el.scrollBy(0,direction*Math.max(80,el.clientHeight*.55));}}>{direction<0?'Scroll up':'Scroll down'}</button>)}</div>}{children}</dialog>; }
export function Confirm({ title, description, onConfirm, onClose }: {
    title: string;
    description: string;
    onConfirm: () => void;
    onClose: () => void;
}) { return <Modal title={title} onClose={onClose}><p className="muted">{description}</p><div className="modal-actions"><button data-gesture className="btn secondary" onClick={onClose}>Cancel</button><button data-gesture className="btn danger" onClick={() => { onConfirm(); onClose(); }}>Delete</button></div></Modal>; }
export function GestureGuide({ onClose }: {
    onClose: () => void;
}) { return <Modal title="Gesture controls" onClose={onClose} wide><p className="muted">Keep your hand in view and use small, comfortable movements. Tap your palm marker, or choose 1 to 5 and hold up that many fingers in the center to pair. Pair a second hand for two-hand commands. Mouse, touch, and pen always work too.</p><div className="guide-grid">{[{ icon: MousePointer2, name: 'Point to explore', detail: 'Your index finger moves the cursor. It does not leave ink.', key: 'Hover' }, { icon: Hand, name: 'Pinch to write', detail: 'Touch thumb and index finger to draw. For a full stop, pinch briefly in one spot and release.', key: 'Draw' }, { icon: Pencil, name: 'Peace to erase', detail: 'Hold up your index and middle fingers for precise erasing. Change size or whole-object mode in tool properties.', key: 'Erase' }, { icon: Pencil, name: 'Change ink or shape', detail: 'Point at Ink & paper and hold still or pinch. Choose a color and Done, or choose Shapes and drag a pinch across the page.', key: 'Tools' }, { icon: Hand, name: 'Pinky to lock', detail: 'Hold up only your pinky for a moment to lock the board. Lower it, then repeat to unlock. You can also tap Unlock board.', key: 'Safe' }, { icon: Undo2, name: 'Undo / Redo', detail: 'With two hands visible, open the other palm briefly, then hold a fist for Undo or peace for Redo.', key: 'Undo' }, { icon: Video, name: 'Stay in control', detail: 'Hold only your thumb sideways for half a second: right for next page, left for previous. Relax between turns. Pair your second hand, then pinch both and spread or bring them together to zoom. In presentation, hold your drawing palm open briefly and swipe left for the next slide or right to go back. Camera processing stays on your device.', key: 'Private' }].map(g => <div className="guide-card" key={g.name}><g.icon size={27}/><span className="eyebrow">{g.key}</span><h3>{g.name}</h3><p>{g.detail}</p></div>)}</div><div className="shortcut-row"><kbd>B</kbd> Pen <kbd>E</kbd> Eraser <kbd>V</kbd> Select <kbd>Ctrl Z</kbd> Undo <kbd>?</kbd> This guide</div><button data-gesture className="btn primary" onClick={onClose}>Got it, let's create <ArrowRight size={16}/></button></Modal>; }
export function Logo({ small = false }: {
    small?: boolean;
}) { return <span className={`brand ${small ? 'small' : ''}`}><span className="brand-symbol"><svg viewBox="0 0 32 32" fill="none"><path d="M22 10c-3-5-13-4-14 3-3 10 10 15 15 7v-5h-8" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/></svg></span>{!small && <>Gest<span className="brand-era">Era</span><span className="beta-tag">BETA</span></>}</span>; }
