import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Circle, Download, Eraser, Hand, Highlighter, Layers2, LoaderCircle, Maximize, Minus, MousePointer2, Pencil, Plus, Presentation, Redo2, ScanLine, Settings2, Sparkles, Square, Trash2, Type, Undo2, Video, X } from 'lucide-react';
import { repository } from '../services/storage';
import { background, BOARD_HEIGHT, BOARD_WIDTH, bounds, download, drawObject, exportPDF, exportPNG, hitTest, moveObject } from '../engine/board';
import { History } from '../engine/history';
import { uid, type Background, type BoardObject, type Point, type Project, type ShapeObject, type Tool } from '../types';
import { Confirm, GestureGuide, Logo, Modal, useToast } from '../ui/common';
import CameraPanel, { type HandInput } from './CameraPanel';
import { eraseSweep } from '../engine/erase';
import { transformViewport } from '../engine/gestures/transform';
import { useSettings } from '../store/settings';
import { recognizeShape } from '../engine/gestures/snap';
import GestureProperties from './GestureProperties';
import NotebookExplorer from './NotebookExplorer';
import { sectionsOf } from '../engine/notebooks';
type NotebookContent=Pick<Project,'pages'|'sections'>;
const colors = ['#26324f', '#2f6bff', '#7c57cc', '#23a38c', '#e6a538', '#ed718a'];
export default function Board() { const { id } = useParams(), [project, setProject] = useState<Project>(), [error, setError] = useState(''); useEffect(() => { let cancelled = false; void repository.get(id!).then(p => { if (cancelled)
    return; if (p)
    setProject(p);
else
    setError('This board could not be found on this device.'); }).catch(() => setError('Your board could not be opened. Check your browser storage settings.')); return () => { cancelled = true; }; }, [id]); if (error)
    return <div className="board-loading"><h2>We couldn’t open this board.</h2><p>{error}</p><Link className="btn primary" to="/app">Back to workspace</Link></div>; return project ? <BoardEditor key={project.id} initial={project}/> : <div className="board-loading"><LoaderCircle size={26} className="spin"/><p>Making room for your ideas…</p></div>; }
function BoardEditor({ initial }: {
    initial: Project;
}) {
    const [project, setProject] = useState(initial), projectRef = useRef(initial), [pageIndex, setPageIndex] = useState(0), pageRef = useRef(0), [tool, setTool] = useState<Tool>('pen'), [color, setColor] = useState(colors[0]), [width, setWidth] = useState(3), [shape, setShape] = useState<ShapeObject['shape']>('rectangle'), [selected, setSelected] = useState<string>(), [camera, setCamera] = useState(false), [handStatus, setHandStatus] = useState('Mouse & touch ready'), [guide, setGuide] = useState(false), [ai, setAI] = useState(false), [pagesOpen, setPagesOpen] = useState(()=>window.innerWidth>=1100), [exportOpen, setExportOpen] = useState(false), [properties, setProperties] = useState(false), [presenting, setPresenting] = useState(false), [confirm, setConfirm] = useState<'clear' | 'page' | null>(null), [textInput, setTextInput] = useState<{
        point: Point;
        text: string;
    } | null>(null), [saveState, setSaveState] = useState('Saved locally'), [revision, setRevision] = useState(0), [size, setSize] = useState({ w: 1000, h: 700 }), [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 });
    const [sectionView,setSectionView]=useState(initial.pages[0]?.sectionId);
    const settings = useSettings(), settingsRef=useRef(settings); settingsRef.current=settings;
    const snapPreview=useRef<ShapeObject|null>(null),finishRef=useRef<()=>void>(()=>{});
    const [params] = useSearchParams(), navigate = useNavigate(), toast = useToast();
    const host = useRef<HTMLDivElement>(null), committed = useRef<HTMLCanvasElement>(null), live = useRef<HTMLCanvasElement>(null), overlay = useRef<HTMLCanvasElement>(null), history = useRef(new History<NotebookContent>()), liveObject = useRef<BoardObject | null>(null), drag = useRef<{
        start: Point;
        last: Point;
        original?: BoardObject;
        source: 'pointer' | 'hand';
        erase?: boolean;
        pan?: boolean;
        panScreen?: {x:number;y:number};
        changed?: boolean;
        holdPoint?: Point;
        lastMotion?: number;
        snapAttempted?: boolean;
    } | null>(null), selectedRef = useRef(selected), space = useRef(false), pointerScreen = useRef({ x: 0, y: 0 }), saveQueue = useRef(Promise.resolve()), mounted = useRef(true), saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null), toolsRef = useRef({ tool, color, width, shape });
    toolsRef.current = { tool, color, width, shape };
    projectRef.current = project;
    pageRef.current = pageIndex;
    selectedRef.current = selected;
    const queueSave = useCallback((p: Project) => { saveQueue.current = saveQueue.current.catch(() => { }).then(async () => { try {
        await repository.save(p);
        if (mounted.current)
            setSaveState(current => projectRef.current.updatedAt === p.updatedAt ? 'Saved locally' : current);
    }
    catch {
        if (mounted.current)
            setSaveState('Save failed — export a backup');
    } }); }, []);
    const update = useCallback((pages: Project['pages'], record = true, sections:Project['sections']=projectRef.current.sections) => { const p = projectRef.current; if (record)
        history.current.push({pages:p.pages,sections:p.sections}); const next = { ...p, pages, sections, updatedAt: Date.now() }; projectRef.current = next; setProject(next); setRevision(x => x + 1); setSaveState('Saving…'); if (saveTimer.current)
        clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => queueSave(next), 350); }, [queueSave]);
    const updatePage = useCallback((objects: BoardObject[]) => { const pages = [...projectRef.current.pages]; pages[pageRef.current] = { ...pages[pageRef.current], objects }; update(pages); }, [update]);
    const undo = useCallback(() => { const activeId=projectRef.current.pages[pageRef.current]?.id; finishRef.current(); const content = history.current.undo({pages:projectRef.current.pages,sections:projectRef.current.sections}); const pages=content?.pages; if (pages) {
        update(pages, false,content!.sections);setSectionView(pages.find(p=>p.id===activeId)?.sectionId??pages[0].sectionId);
        setPageIndex(i => {const index=pages.findIndex(p=>p.id===activeId);return index>=0?index:Math.min(i,pages.length-1);});
        setSelected(undefined);
    } }, [update]);
    const redo = useCallback(() => { const activeId=projectRef.current.pages[pageRef.current]?.id; finishRef.current(); const content = history.current.redo({pages:projectRef.current.pages,sections:projectRef.current.sections}); const pages=content?.pages; if (pages) {
        update(pages, false,content!.sections);
        setPageIndex(i => {const index=pages.findIndex(p=>p.id===activeId);return index>=0?index:Math.min(i,pages.length-1);});
        setSelected(undefined);
    } }, [update]);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (saveTimer.current)
        clearTimeout(saveTimer.current); queueSave(projectRef.current); }; }, [queueSave]);
    useEffect(() => { if (params.get('camera') === '1')
        setCamera(true); }, [params]);
    useEffect(() => { const el = host.current; if (!el)
        return; const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height })); observer.observe(el); return () => observer.disconnect(); }, []);
    const scale = Math.min((size.w - 60) / BOARD_WIDTH, (size.h - 48) / BOARD_HEIGHT) * zoom;
    const transform = { scale, tx: (size.w - BOARD_WIDTH * scale) / 2 + pan.x, ty: (size.h - BOARD_HEIGHT * scale) / 2 + pan.y };
    const transformBaseZoom=useRef(zoom);
    const zoomRef=useRef(zoom),panRef=useRef(pan);zoomRef.current=zoom;panRef.current=pan;
    const viewport = useRef(transform);
    viewport.current = transform;
    const prepare = useCallback((canvas: HTMLCanvasElement | null, clear = true) => { if (!canvas)
        return null; const dpr = window.devicePixelRatio || 1; if (canvas.width !== Math.round(size.w * dpr) || canvas.height !== Math.round(size.h * dpr)) {
        canvas.width = Math.round(size.w * dpr);
        canvas.height = Math.round(size.h * dpr);
    } const ctx = canvas.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); if (clear)
        ctx.clearRect(0, 0, size.w, size.h); const v = viewport.current; ctx.translate(v.tx, v.ty); ctx.scale(v.scale, v.scale); return ctx; }, [size]);
    const redrawLive = useCallback(() => { const ctx = prepare(live.current); if (ctx && liveObject.current)
        drawObject(ctx, snapPreview.current ?? liveObject.current); }, [prepare]);
    const drawOverlay = useCallback((cursor?: Point) => { const ctx = prepare(overlay.current); if (!ctx)
        return; const page = projectRef.current.pages[pageRef.current]; const object = page.objects.find(o => o.id === selectedRef.current); if (object) {
        const b = bounds(object);
        ctx.strokeStyle = '#2f6bff';
        ctx.lineWidth = 1.5 / viewport.current.scale;
        ctx.setLineDash([6 / viewport.current.scale, 4 / viewport.current.scale]);
        ctx.strokeRect(b.x - 8, b.y - 8, b.w + 16, b.h + 16);
        ctx.setLineDash([]);
    } if (cursor) {
        ctx.strokeStyle = toolsRef.current.color;
        ctx.lineWidth = 2 / viewport.current.scale;
        ctx.beginPath();
        ctx.arc(cursor.x, cursor.y, 7 / viewport.current.scale, 0, 7);
        ctx.stroke();
    } }, [prepare]);
    useEffect(() => { const ctx = prepare(committed.current); if (!ctx)
        return; ctx.shadowColor = '#00000025'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 7; ctx.fillStyle = '#f7f8fc'; ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.save(); ctx.beginPath(); ctx.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT); ctx.clip(); background(ctx, project.pages[pageIndex]); project.pages[pageIndex].objects.forEach(o => drawObject(ctx, o)); ctx.restore(); redrawLive(); drawOverlay(); }, [project, pageIndex, prepare, zoom, pan, selected, redrawLive, drawOverlay]);
    const finish = useCallback((trimAfter?:number) => { const d = drag.current; if (!d)
        return; drag.current = null; const raw = liveObject.current; if(raw?.kind==='stroke' && trimAfter!==undefined)raw.points=raw.points.filter(p=>p.t<=trimAfter); const o=snapPreview.current??raw; snapPreview.current=null; liveObject.current = null; if (o) {
        const page = projectRef.current.pages[pageRef.current];
        if (d.original)
            updatePage(page.objects.map(item => item.id === o.id ? o : item));
        else if (o.kind !== 'stroke' || o.points.length > 0)
            updatePage([...page.objects, o]);
    }
    else if (d.erase && d.changed) {
        setRevision(x => x + 1);
        setSaveState('Saving…');
        if (saveTimer.current)
            clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => queueSave(projectRef.current), 350);
    } redrawLive(); }, [updatePage, redrawLive, queueSave]);
    finishRef.current=finish;
    const input = useCallback((phase: 'down' | 'move' | 'up' | 'hover', point: Point, source: 'pointer' | 'hand' = 'pointer', erase = false) => {
        const { tool: activeTool, color: activeColor, width: activeWidth, shape: activeShape } = toolsRef.current;
        const page = projectRef.current.pages[pageRef.current];
        if (phase === 'up') {
            finish();
            return;
        }
        if (phase === 'hover') {
            drawOverlay(point);
            return;
        }
        if (phase === 'down') {
            finish();
            if (point.x < 0 || point.y < 0 || point.x > BOARD_WIDTH || point.y > BOARD_HEIGHT)
                return;
            if (activeTool === 'text' && !erase) {
                setTextInput({ point, text: '' });
                return;
            }
            if (activeTool === 'hand' || space.current) {
                drag.current = { start: point, last: point, source, pan: true, panScreen:{x:point.x*viewport.current.scale+viewport.current.tx,y:point.y*viewport.current.scale+viewport.current.ty} };
                return;
            }
            const erasing = erase || activeTool === 'eraser';
            drag.current = { start: point, last: point, source, erase: erasing, holdPoint:point, lastMotion:point.t };
            if (activeTool === 'select' && !erasing) {
                const found = [...page.objects].reverse().find(o => hitTest(o, point));
                setSelected(found?.id);
                if (found)
                    drag.current.original = found;
                return;
            }
            setSelected(undefined);
            if (!erasing && activeTool !== 'laser') {
                liveObject.current = activeTool === 'shape' ? { id: uid(), kind: 'shape', shape: activeShape, x: point.x, y: point.y, w: 0, h: 0, color: activeColor, width: activeWidth, createdAt: Date.now() } : { id: uid(), kind: 'stroke', tool: activeTool === 'highlighter' ? 'highlighter' : 'pen', color: activeColor, width: activeWidth, points: [point], createdAt: Date.now() };
            }
        }
        const d = drag.current;
        if (!d || d.source !== source)
            return;
        if (d.pan) {
            const v = viewport.current;
            const screen={x:point.x*v.scale+v.tx,y:point.y*v.scale+v.ty},prior=d.panScreen??screen;
            setPan(p=>({x:p.x+screen.x-prior.x,y:p.y+screen.y-prior.y}));d.panScreen=screen;
            d.last = point;
            return;
        }
        if (d.erase) {
            const erased=eraseSweep(page.objects,d.last,point,settingsRef.current.eraserRadius/viewport.current.scale,settingsRef.current.eraserMode);
            if(erased.changed){if(!d.changed){history.current.push({pages:projectRef.current.pages,sections:projectRef.current.sections});d.changed=true;}const pages=[...projectRef.current.pages];pages[pageRef.current]={...page,objects:erased.objects};const next={...projectRef.current,pages,updatedAt:Date.now()};projectRef.current=next;setProject(next);}d.last=point;
            drawOverlay(point);
            return;
        }
        if (d.original) {
            liveObject.current = moveObject(d.original, point.x - d.start.x, point.y - d.start.y);
            redrawLive();
            return;
        }
        if (activeTool === 'laser') {
            drawOverlay(point);
            return;
        }
        const object = liveObject.current;
        if (object?.kind === 'stroke') {
            if(!d.holdPoint || Math.hypot(d.holdPoint.x-point.x,d.holdPoint.y-point.y)>7){d.holdPoint=point;d.lastMotion=point.t;d.snapAttempted=false;snapPreview.current=null;}
            const last = object.points.at(-1);
            if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 1.2)
                object.points.push(point);
            if(settingsRef.current.shapeSnap && !d.snapAttempted && point.t-(d.lastMotion??point.t)>=600 && object.tool==='pen'){d.snapAttempted=true;snapPreview.current=recognizeShape(object)??null;}
        }
        else if (object?.kind === 'shape') {
            object.w = point.x - d.start.x;
            object.h = point.y - d.start.y;
        }
        redrawLive();
        drawOverlay(point);
    }, [finish, drawOverlay, redrawLive]);
    const screenToWorld=(p:Point):Point=>{const r=host.current!.getBoundingClientRect(),v=viewport.current;return{...p,x:(p.x*window.innerWidth-r.left-v.tx)/v.scale,y:(p.y*window.innerHeight-r.top-v.ty)/v.scale};};
    const boardContains=(x:number,y:number)=>{if(!host.current||document.elementFromPoint(x,y)!==overlay.current)return false;const p=screenToWorld({x:x/window.innerWidth,y:y/window.innerHeight,t:0});return p.x>=0&&p.x<=BOARD_WIDTH&&p.y>=0&&p.y<=BOARD_HEIGHT;};
    const handInput=(event:HandInput)=>{
      if(event.type==='end'){finish(event.trimAfter);return;}
      if(event.type==='begin'){const pts=event.points.map(screenToWorld);input('down',pts[0],'hand',event.erase);pts.slice(1).forEach(p=>input('move',p,'hand',event.erase));return;}
      if(event.type==='point'){input('move',screenToWorld(event.point),'hand',event.erase);return;}
      if(event.type==='undo'){finish();undo();return;}
      if(event.type==='redo'){finish();redo();return;}
      if(event.type==='page'){switchPage(pageRef.current+event.direction);return;}
      if(event.type==='transform-start'){finish();transformBaseZoom.current=zoomRef.current;return;}
      if(event.type==='transform'){
        finish();const r=host.current!.getBoundingClientRect();
        const ax=event.anchor.x*window.innerWidth-r.left,ay=event.anchor.y*window.innerHeight-r.top;
        const next=transformViewport({zoom:zoomRef.current,pan:panRef.current},transformBaseZoom.current,{factor:event.factor,anchor:{x:ax,y:ay},dx:event.dx*window.innerWidth,dy:event.dy*window.innerHeight},size);
        zoomRef.current=next.zoom;panRef.current=next.pan;setZoom(next.zoom);setPan(next.pan);
      }
    };
    const pointFrom = (event: ReactPointerEvent<HTMLCanvasElement>): Point => { const r = event.currentTarget.getBoundingClientRect(), v = viewport.current; return { x: (event.clientX - r.left - v.tx) / v.scale, y: (event.clientY - r.top - v.ty) / v.scale, t: performance.now(), pressure: event.pressure }; };
    const switchPage = useCallback((index: number) => { finish(); const next=Math.max(0,Math.min(projectRef.current.pages.length-1,index));setSectionView(projectRef.current.pages[next].sectionId);setPageIndex(next); setSelected(undefined); setPan({ x: 0, y: 0 }); setZoom(1); }, [finish]);
    useEffect(() => { const fn = (e: KeyboardEvent) => { if ((e.target as HTMLElement).matches('input,textarea,select,[contenteditable]'))
        return; const mod = e.ctrlKey || e.metaKey; if (mod && ['z', 's', 'y'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        if (e.key.toLowerCase() === 's') {
            if (saveTimer.current)
                clearTimeout(saveTimer.current);
            queueSave(projectRef.current);
            toast('Saving your board on this device.');
        }
        else if (e.shiftKey || e.key.toLowerCase() === 'y')
            redo();
        else
            undo();
        return;
    } if (mod)
        return; if (e.key === 'Escape') {
        setPresenting(false);
        if (document.fullscreenElement)
            void document.exitFullscreen();
        setSelected(undefined);
        setAI(false);
    } if (e.key === '?')
        setGuide(true); if (e.key === ' ' && !(e.target as HTMLElement).closest('button,a')) {
        space.current = true;
        e.preventDefault();
    } if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRef.current) {
        updatePage(projectRef.current.pages[pageRef.current].objects.filter(o => o.id !== selectedRef.current));
        setSelected(undefined);
    } if (presenting && e.key === 'ArrowRight')
        switchPage(pageRef.current + 1); if (presenting && e.key === 'ArrowLeft')
        switchPage(pageRef.current - 1); const shortcuts: Record<string, Tool> = { b: 'pen', e: 'eraser', v: 'select', h: 'hand', t: 'text', l: 'laser' }; if (shortcuts[e.key.toLowerCase()]) {
        finish();
        setTool(shortcuts[e.key.toLowerCase()]);
    } if (e.key === '+' || e.key === '=')
        setZoom(z => Math.min(3, z + .2)); if (e.key === '-')
        setZoom(z => Math.max(.4, z - .2)); }; const up = (e: KeyboardEvent) => { if (e.key === ' ')
        space.current = false; }; window.addEventListener('keydown', fn); window.addEventListener('keyup', up); return () => { window.removeEventListener('keydown', fn); window.removeEventListener('keyup', up); }; }, [undo, redo, queueSave, toast, presenting, switchPage, updatePage, finish]);
    const exportBoard = async (type: 'png' | 'pdf' | 'json') => { finish(); setExportOpen(false); try {
        const p = projectRef.current;
        if (type === 'png')
            await exportPNG(p.pages[pageRef.current], p.name);
        else if (type === 'pdf')
            await exportPDF(p.pages, p.name);
        else
            download(new Blob([JSON.stringify(p)], { type: 'application/json' }), `${p.name}.gestera`);
        toast('Your export is ready.');
    }
    catch {
        toast('Export failed. Please try again.');
    } };
    const selectedPage = project.pages[pageIndex], tools = [{ id: 'select', icon: MousePointer2, label: 'Select & move (V)' }, { id: 'pen', icon: Pencil, label: 'Pen (B)' }, { id: 'highlighter', icon: Highlighter, label: 'Highlighter' }, { id: 'eraser', icon: Eraser, label: 'Eraser (E)' }, { id: 'shape', icon: Square, label: 'Shapes' }, { id: 'text', icon: Type, label: 'Text (T)' }, { id: 'laser', icon: ScanLine, label: 'Laser pointer (L)' }, { id: 'hand', icon: Hand, label: 'Pan (H)' }] as const;
    const viewedSection=sectionsOf(project).find(s=>s.id===sectionView)??sectionsOf(project).find(s=>s.id===selectedPage.sectionId)!,emptySection=!project.pages.some(p=>p.sectionId===viewedSection.id);
    return <div className={`board-app ${presenting ? 'is-presenting' : ''} ${camera ? 'gesture-mode' : ''}`}><header className="board-topbar"><Link to="/app" data-gesture aria-label="Back to workspace" className="board-brand"><Logo small/></Link><span className="bar-separator"/><div className="board-title-group"><input aria-label="Notebook title" value={project.name} maxLength={150} onChange={e => { const next = { ...projectRef.current, name: e.target.value, updatedAt: Date.now() }; projectRef.current = next; setProject(next); setSaveState('Saving…'); if (saveTimer.current)
        clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => queueSave(next), 500); }} onBlur={() => { if (!projectRef.current.name.trim()) {
        const next = { ...projectRef.current, name: 'Untitled notebook' };
        projectRef.current = next;
        setProject(next);
        queueSave(next);
    } }}/><span className={saveState.includes('failed') ? 'save-warning' : ''}>{saveState === 'Saved locally' ? <Check size={11}/> : <Circle size={9}/>} {saveState}</span></div><div className="board-top-actions"><button data-gesture aria-label="Previous page" className="btn secondary small-btn" disabled={pageIndex===0} onClick={()=>switchPage(pageIndex-1)}><ArrowLeft size={17}/></button><button data-gesture aria-label="Next page" className="btn secondary small-btn" disabled={pageIndex===project.pages.length-1} onClick={()=>switchPage(pageIndex+1)}><ArrowRight size={17}/></button><button data-gesture aria-label="Notebook navigation" className={`btn secondary small-btn ${pagesOpen ? 'active' : ''}`} onClick={() => setPagesOpen(x => !x)}><Layers2 size={15}/><span>{pageIndex + 1} / {project.pages.length}</span></button><button data-gesture disabled={emptySection} className="btn secondary small-btn present-btn" onClick={() => { finish(); setPresenting(true); setTool('laser'); void document.documentElement.requestFullscreen?.().catch(() => { }); }}><Presentation size={15}/><span>Present</span></button><div className="export-wrap"><button data-gesture className="btn secondary small-btn" disabled={emptySection} onClick={() => setExportOpen(x => !x)}><Download size={15}/><span>Export</span><ChevronDown size={12}/></button>{exportOpen && <><button data-gesture className="menu-scrim" aria-label="Close export menu" onClick={() => setExportOpen(false)}/><div className="dropdown"><button data-gesture onClick={() => exportBoard('png')}>PNG · current page</button><button data-gesture onClick={() => exportBoard('pdf')}>PDF · all pages</button><button data-gesture onClick={() => exportBoard('json')}>GestEra · editable backup</button></div></>}</div><button data-gesture className="btn primary small-btn ai-button" onClick={() => setAI(x => !x)}><Sparkles size={15}/><span>Board assistant</span></button></div></header>{!presenting&&<div className="page-context"><span>{viewedSection.name}</span><span>/</span><h1>{emptySection?'No pages yet':selectedPage.title??'Untitled page'}</h1><button data-gesture onClick={()=>setPagesOpen(true)}>Organize pages</button></div>}<div className="board-body">{pagesOpen&&!presenting&&<><button className="notebook-nav-scrim" aria-label="Close notebook navigation" onClick={()=>setPagesOpen(false)}/><NotebookExplorer sectionId={viewedSection.id} onBrowse={id=>{const p=projectRef.current,index=p.pages.findIndex(page=>page.sectionId===id);if(index>=0)switchPage(index);else{finish();setSectionView(id);}}} project={project} activePageId={selectedPage.id} onClose={()=>setPagesOpen(false)} onSelect={id=>{const i=projectRef.current.pages.findIndex(p=>p.id===id);if(i>=0)switchPage(i);if(window.innerWidth<1100)setPagesOpen(false);}} onChange={next=>{const active=projectRef.current.pages[pageRef.current]?.id,before=projectRef.current;finish();const latest=projectRef.current;const pages=next.pages.map(page=>{const old=before.pages.find(p=>p.id===page.id),current=latest.pages.find(p=>p.id===page.id);return old&&current&&page.objects===old.objects?{...page,objects:current.objects}:page;});update(pages,true,next.sections);const index=pages.findIndex(p=>p.id===active);setSectionView(pages[index>=0?index:0].sectionId);setPageIndex(index>=0?index:Math.min(pageRef.current,pages.length-1));setSelected(undefined);}}/></>}<div className="canvas-host" ref={host}>{emptySection&&!presenting&&<div className="empty-section-canvas"><Layers2 size={35}/><h2>A fresh section</h2><p>Add a page to start writing in {viewedSection.name}.</p><button data-gesture className="btn secondary" onClick={()=>setPagesOpen(true)}>Open pages</button></div>}<canvas ref={committed} className="canvas-layer"/><canvas ref={live} className="canvas-layer live-layer"/><canvas ref={overlay} className={`canvas-layer input-layer tool-${tool}`} aria-label="Whiteboard drawing area" tabIndex={0} onPointerDown={e => { if (e.button !== 0 && e.button !== 1)
        return; e.preventDefault(); if (e.button === 1)
        space.current = true; pointerScreen.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); input('down', pointFrom(e)); }} onPointerMove={e => { if (drag.current?.pan && drag.current.source === 'pointer') {
        const last = pointerScreen.current;
        setPan(p => ({ x: p.x + e.clientX - last.x, y: p.y + e.clientY - last.y }));
        pointerScreen.current = { x: e.clientX, y: e.clientY };
    }
    else
        input(drag.current?.source === 'pointer' ? 'move' : 'hover', pointFrom(e)); }} onPointerUp={e => { input('up', pointFrom(e)); if (e.button === 1)
        space.current = false; }} onPointerCancel={() => finish()} onLostPointerCapture={() => finish()} onPointerLeave={() => { if (!drag.current)
        drawOverlay(); }}/>
  {!presenting && <><div className="board-tools">{tools.map(t => <button data-gesture key={t.id} aria-label={t.label} title={t.label} className={tool === t.id ? 'active' : ''} onClick={() => { finish(); setTool(t.id); if (t.id === 'shape')
        setProperties(true); }}><t.icon size={20}/></button>)}<i /><button data-gesture aria-label="Tool properties" title="Tool properties" onClick={() => setProperties(x => !x)}><span className="color-current" style={{ background: color }}/></button><button data-gesture aria-label="Clear page" title="Clear page" onClick={() => setConfirm('clear')}><Trash2 size={17}/></button></div>{properties && (camera ? <GestureProperties colors={colors} color={color} width={width} shape={shape} paper={selectedPage.background} onColor={setColor} onWidth={setWidth} onShape={v=>{finish();setShape(v);setTool('shape');}} onPaper={v=>{const pages=[...projectRef.current.pages];pages[pageRef.current]={...pages[pageRef.current],background:v};update(pages);}} onClose={()=>setProperties(false)}/> : <div className="tool-properties"><div className="popover-title">Make your mark <button data-gesture aria-label="Close tool properties" onClick={() => setProperties(false)}><X size={14}/></button></div><div className="color-options">{colors.map(c => <button data-gesture key={c} aria-label={`Ink ${c}`} style={{ background: c }} className={color === c ? 'chosen' : ''} onClick={() => setColor(c)}>{c === color && <Check size={13}/>}</button>)}<input aria-label="Custom ink color" type="color" value={color} onChange={e => setColor(e.target.value)}/></div><label className="range-label">Stroke size <span>{width} px</span><input type="range" min="1" max="12" value={width} onChange={e => setWidth(Number(e.target.value))}/></label><label className="field-label">Shape<select className="input" value={shape} onChange={e => setShape(e.target.value as ShapeObject['shape'])}><option value="rectangle">Rectangle</option><option value="ellipse">Ellipse</option><option value="line">Line</option><option value="arrow">Arrow</option><option value="triangle">Triangle</option></select></label><label className="field-label">Paper<select className="input" value={selectedPage.background} onChange={e => { const pages = [...project.pages]; pages[pageIndex] = { ...selectedPage, background: e.target.value as Background }; update(pages); }}><option value="dots">Dot grid</option><option value="blank">Blank</option><option value="grid">Square grid</option><option value="ruled">Ruled</option></select></label></div>)}<div className="board-undo"><button data-gesture aria-label="Undo" title="Undo (Ctrl Z)" disabled={!history.current.canUndo} onClick={undo}><Undo2 size={18}/></button><button data-gesture aria-label="Redo" title="Redo (Ctrl Shift Z)" disabled={!history.current.canRedo} onClick={redo}><Redo2 size={18}/></button></div><div className="board-zoom"><button data-gesture aria-label="Zoom out" onClick={() => setZoom(z => Math.max(.4, z - .2))}><Minus size={16}/></button><span>{Math.round(zoom * 100)}%</span><button data-gesture aria-label="Zoom in" onClick={() => setZoom(z => Math.min(3, z + .2))}><Plus size={16}/></button><i /><button data-gesture aria-label="Fit board to screen" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><Maximize size={15}/></button></div><div className="gesture-hud"><span className={camera ? 'status-dot' : 'inactive-dot'}/><span>{camera ? handStatus : 'Mouse, touch & pen ready'}</span><i /><button data-gesture className={camera ? 'camera-on' : ''} onClick={() => setCamera(x => !x)}><Video size={15}/>{camera ? 'Stop camera' : 'Start air writing'}</button><button data-gesture aria-label="Gesture help" onClick={() => setGuide(true)}>?</button></div>{selectedPage.objects.length === 0 && <div className="canvas-empty"><span>Every great idea starts with a mark.</span><small>Pick up your pen, or try writing in the air.</small></div>}</>}{presenting && <div className="presentation-controls"><button data-gesture aria-label="Previous slide" disabled={pageIndex === 0} onClick={() => switchPage(pageIndex - 1)}><ArrowLeft size={18}/></button><span>{pageIndex + 1} / {project.pages.length}</span><button data-gesture aria-label="Next slide" disabled={pageIndex === project.pages.length - 1} onClick={() => switchPage(pageIndex + 1)}><ArrowRight size={18}/></button><button data-gesture onClick={() => { setPresenting(false); setTool('pen'); if (document.fullscreenElement)
        void document.exitFullscreen(); }}><X size={16}/>Exit presentation</button></div>}</div>{ai && !presenting && <aside className="ai-panel"><div className="panel-heading"><h3><Sparkles size={18}/>Board assistant</h3><button data-gesture aria-label="Close assistant" onClick={() => setAI(false)}><X size={17}/></button></div><div className="ai-setup-icon"><Sparkles size={30}/></div><h2>A little intelligence.<br />A lot of possibility.</h2><p>Transcribe handwriting, explain a diagram, or create a study quiz from a snapshot you choose.</p><div className="setup-state"><span className="status-dot warning"/><strong>Server setup required</strong><p>AI is not connected in this core release. Add a server-side Gemini integration before sending board snapshots. Camera frames are never sent.</p></div><Link className="btn secondary" to="/settings"><Settings2 size={15}/>View project setup</Link><button data-gesture className="subtle" onClick={() => { download(new Blob([JSON.stringify(projectRef.current)], { type: 'application/json' }), `${project.name}.gestera`); toast('Editable board backup exported.'); }}>Export your board instead <ArrowRight size={14}/></button></aside>}</div>{camera && <CameraPanel sessionKey={emptySection?'section:'+viewedSection.id:selectedPage.id} onClose={() => { setCamera(false); finish(); setHandStatus('Mouse & touch ready'); }} onInput={handInput} onStatus={setHandStatus} presentation={presenting} boardContains={boardContains} tool={tool}/>}{guide && <GestureGuide onClose={() => setGuide(false)}/>}{confirm && <Confirm title={confirm === 'clear' ? 'Clear this page?' : 'Delete this page?'} description="You can undo this change while this board is open." onClose={() => setConfirm(null)} onConfirm={() => { finish(); if (confirm === 'clear')
        updatePage([]);
    else {
        const pages = project.pages.filter((_, i) => i !== pageIndex);
        setPageIndex(Math.max(0, pageIndex - 1));
        update(pages);
    } }}/>}{textInput && <Modal title="Add a thought" onClose={() => setTextInput(null)}><form onSubmit={e => { e.preventDefault(); if (textInput.text.trim()) {
        const objects = projectRef.current.pages[pageRef.current].objects;
        updatePage([...objects, { id: uid(), kind: 'text', text: textInput.text, x: textInput.point.x, y: textInput.point.y, fontSize: 28, color, width, createdAt: Date.now() }]);
        setTextInput(null);
    } }}><textarea autoFocus className="input" aria-label="Text to add" rows={5} maxLength={10000} placeholder="Write something worth remembering…" value={textInput.text} onChange={e => setTextInput({ ...textInput, text: e.target.value })}/><div className="modal-actions"><button data-gesture type="button" className="btn secondary" onClick={() => setTextInput(null)}>Cancel</button><button data-gesture className="btn primary" disabled={!textInput.text.trim()}>Add to board</button></div></form></Modal>}<span className="sr-only">Revision {revision}</span><button data-gesture className="sr-only" onClick={() => navigate('/app')}>Exit board</button></div>;
}
