import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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
}) { const ref = useRef<HTMLDialogElement>(null); useEffect(() => { const d = ref.current; d?.showModal(); return () => d?.close(); }, []); return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget)
    onClose(); }} onKeyDown={e => { if (e.key === 'Escape') {
    e.stopPropagation();
    onClose();
} }}><div className="modal-head"><h2>{title}</h2><button data-gesture className="icon-btn" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>{children}</dialog>; }
export function Confirm({ title, description, onConfirm, onClose }: {
    title: string;
    description: string;
    onConfirm: () => void;
    onClose: () => void;
}) { return <Modal title={title} onClose={onClose}><p className="muted">{description}</p><div className="modal-actions"><button data-gesture className="btn secondary" onClick={onClose}>Cancel</button><button data-gesture className="btn danger" onClick={() => { onConfirm(); onClose(); }}>Delete</button></div></Modal>; }
export function GestureGuide({ onClose }: {
    onClose: () => void;
}) { return <Modal title="A little movement. A lot of possibility." onClose={onClose} wide><p className="muted">Keep your hand in view and use small, comfortable movements. Use Calibrate pinch in the camera panel first. Mouse, touch, and pen always work too.</p><div className="guide-grid">{[{ icon: MousePointer2, name: 'Point to explore', detail: 'Your index finger moves the cursor. It does not leave ink.', key: 'Hover' }, { icon: Hand, name: 'Pinch to write', detail: 'Bring your thumb and index finger together to draw. Release to stop.', key: 'Draw' }, { icon: Pencil, name: 'Peace to erase', detail: 'Hold up your index and middle fingers for precise erasing. Change size or whole-object mode in tool properties.', key: 'Erase' }, { icon: Hand, name: 'Palm to explore', detail: 'An open palm is safe hover. Pause and Resume are on-screen controls.', key: 'Safe' }, { icon: Undo2, name: 'Undo / Redo', detail: 'With two hands visible, open the other palm briefly, then hold a fist for Undo or peace for Redo.', key: 'Undo' }, { icon: Video, name: 'Stay in control', detail: 'Pinch both hands for zoom and pan. Open the other palm briefly, then swipe it to change pages. Camera processing stays on your device.', key: 'Private' }].map(g => <div className="guide-card" key={g.name}><g.icon size={27}/><span className="eyebrow">{g.key}</span><h3>{g.name}</h3><p>{g.detail}</p></div>)}</div><div className="shortcut-row"><kbd>B</kbd> Pen <kbd>E</kbd> Eraser <kbd>V</kbd> Select <kbd>Ctrl Z</kbd> Undo <kbd>?</kbd> This guide</div><button data-gesture className="btn primary" onClick={onClose}>Got it, let's create <ArrowRight size={16}/></button></Modal>; }
export function Logo({ small = false }: {
    small?: boolean;
}) { return <span className={`brand ${small ? 'small' : ''}`}><span className="brand-symbol"><svg viewBox="0 0 32 32" fill="none"><path d="M22 10c-3-5-13-4-14 3-3 10 10 15 15 7v-5h-8" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/></svg></span>{!small && <>Gest<span className="brand-era">Era</span><span className="beta-tag">BETA</span></>}</span>; }
