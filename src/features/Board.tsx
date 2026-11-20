import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Circle, Download, Layers2, LoaderCircle, Maximize, Minus, Plus, Presentation, Redo2, Settings2, Sparkles, Undo2, Video, X } from 'lucide-react';
import { repository } from '../services/storage';
import { background, BOARD_HEIGHT, BOARD_WIDTH, bounds, download, drawObject, exportPDF, exportPNG, hitTest, moveObject } from '../engine/board';
import { arrangeSelection, offsetCopies, lassoSelection } from '../engine/selection';
import { useNotebookDocument } from './useNotebookDocument';
import { uid, type Background, type BoardObject, type Point, type Project, type ShapeObject, type Tool, type TextObject } from '../types';
import { Confirm, GestureGuide, Logo, useToast } from '../ui/common';
import CameraPanel, { type HandInput } from './CameraPanel';
import { eraseSweep } from '../engine/erase';
import {importPdf,importPicture,pageImages} from '../engine/board-media';
import {inkPoints} from '../engine/gestures/dot';
import {newPage} from '../types';
import { transformViewport } from '../engine/gestures/transform';
import { useSettings } from '../store/settings';
import { recognizeShape } from '../engine/gestures/snap';
import { useInkPreset } from './useInkPreset';
import InkProperties, { inks } from './InkProperties';
import NotebookRibbon from './NotebookRibbon';
import useCanvasInput from './useCanvasInput';
import PageContents from './PageContents';
import NoteEditor from './NoteEditor';
import NotebookExplorer from './NotebookExplorer';
import { sectionsOf } from '../engine/notebooks';


export default function Board() { const { id } = useParams(), [project, setProject] = useState<Project>(), [error, setError] = useState(''); useEffect(() => { let cancelled = false; void repository.get(id!).then(p => { if (cancelled)
    return; if (p)
    setProject(p);
else
    setError('This board could not be found on this device.'); }).catch(() => setError('Your board could not be opened. Check your browser storage settings.')); return () => { cancelled = true; }; }, [id]); if (error)
    return <div className="board-loading"><h2>We couldn’t open this board.</h2><p>{error}</p><Link className="btn primary" to="/app">Back to workspace</Link></div>; return project ? <BoardEditor key={project.id} initial={project}/> : <div className="board-loading"><LoaderCircle size={26} className="spin"/><p>Making room for your ideas…</p></div>; }
function BoardEditor({ initial }: {
    initial: Project;
}) {
    const {project,projectRef,update,publish,history,save,saveState}=useNotebookDocument(initial);
    const [params]=useSearchParams();
    const [firstPage]=useState(()=>{
      let requested=params.get('page');
      if(!requested)try{requested=localStorage.getItem('gestera:page:'+initial.id);}catch{}
      return Math.max(0,initial.pages.findIndex(p=>p.id===requested));
    });
    const [pageIndex, setPageIndex] = useState(firstPage), pageRef = useRef(firstPage), [tool, setTool] = useState<Tool>('pen'), [shape, setShape] = useState<ShapeObject['shape']>('rectangle'), [selected, setSelected] = useState<string[]>([]), [camera, setCamera] = useState(false), [handStatus, setHandStatus] = useState('Mouse & touch ready'), [guide, setGuide] = useState(false), [ai, setAI] = useState(false), [pagesOpen, setPagesOpen] = useState(()=>window.innerWidth>=1100), [exportOpen, setExportOpen] = useState(false), [properties, setProperties] = useState(false), [presenting, setPresenting] = useState(false), [confirm, setConfirm] = useState<'clear' | 'page' | null>(null), [textInput, setTextInput] = useState<TextObject | null>(null), [size, setSize] = useState({ w: 1000, h: 700 }), [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 });
    const {color,width,setColor,setWidth}=useInkPreset(tool);
    const [locked,setLocked]=useState(false),lockRef=useRef(false);
    const toggleLock=()=>{finishRef.current();lockRef.current=!lockRef.current;setLocked(lockRef.current);};
    const mediaPicker=useRef<HTMLInputElement>(null),job=useRef<AbortController|null>(null);
    const [importing,setImporting]=useState('');
    useEffect(()=>()=>job.current?.abort(),[]);
    const images=useRef(new Map<string,HTMLImageElement>());
    const contact=useRef<Point|undefined>(undefined);
    const [contents,setContents]=useState(false);
    const [clipboard, setClipboard] = useState<BoardObject[]>([]);
    const [sectionView,setSectionView]=useState(initial.pages[firstPage]?.sectionId);
    const settings = useSettings(), settingsRef=useRef(settings); settingsRef.current=settings;
    const snapTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
    useEffect(()=>()=>clearTimeout(snapTimer.current),[]);
    const snapPreview=useRef<ShapeObject|null>(null),finishRef=useRef<()=>void>(()=>{});
    const navigate = useNavigate(), toast = useToast();
    const host = useRef<HTMLDivElement>(null), committed = useRef<HTMLCanvasElement>(null), live = useRef<HTMLCanvasElement>(null), overlay = useRef<HTMLCanvasElement>(null), liveObject = useRef<BoardObject | null>(null), drag = useRef<{
        start: Point;
        last: Point;
        originals?: BoardObject[];
        moved?: BoardObject[];
        lasso?: Point[];
        source: 'pointer' | 'hand';
        erase?: boolean;
        pan?: boolean;
        panScreen?: {x:number;y:number};
        changed?: boolean;
        holdPoint?: Point;
        lastMotion?: number;
        snapAttempted?: boolean;
    } | null>(null), selectedRef = useRef(selected), space = useRef(false), toolsRef = useRef({ tool, color, width, shape });
    toolsRef.current = { tool, color, width, shape };
    pageRef.current = pageIndex;
    selectedRef.current = selected;
    const updatePage = useCallback((objects: BoardObject[]) => { const pages = [...projectRef.current.pages]; pages[pageRef.current] = { ...pages[pageRef.current], objects }; update(pages); }, [update]);
    const undo = useCallback(() => { const activeId=projectRef.current.pages[pageRef.current]?.id; finishRef.current(); const content = history.current.undo({pages:projectRef.current.pages,sections:projectRef.current.sections}); const pages=content?.pages; if (pages) {
        update(pages, false,content!.sections);setSectionView(pages.find(p=>p.id===activeId)?.sectionId??pages[Math.min(pageRef.current,pages.length-1)].sectionId);
        setPageIndex(i => {const index=pages.findIndex(p=>p.id===activeId);return index>=0?index:Math.min(i,pages.length-1);});
        setSelected([]);
    } }, [update]);
    const redo = useCallback(() => { const activeId=projectRef.current.pages[pageRef.current]?.id; finishRef.current(); const content = history.current.redo({pages:projectRef.current.pages,sections:projectRef.current.sections}); const pages=content?.pages; if (pages) {
        update(pages, false,content!.sections);
        setSectionView(pages.find(p=>p.id===activeId)?.sectionId??pages[Math.min(pageRef.current,pages.length-1)].sectionId);
        setPageIndex(i => {const index=pages.findIndex(p=>p.id===activeId);return index>=0?index:Math.min(i,pages.length-1);});
        setSelected([]);
    } }, [update]);
    useEffect(() => { if (params.get('camera') === '1')
        setCamera(true); }, [params]);
    useEffect(() => { const el = host.current; if (!el)
        return; const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height })); observer.observe(el); return () => observer.disconnect(); }, []);
    const scale = Math.max(.01,Math.min((size.w - (size.w<600?16:60)) / BOARD_WIDTH, (size.h - 48) / BOARD_HEIGHT)) * zoom;
    const transform = { scale, tx: (size.w - BOARD_WIDTH * scale) / 2 + pan.x, ty: (size.h - BOARD_HEIGHT * scale) / 2 + pan.y };
    const transformBaseZoom=useRef(zoom);
    const zoomRef=useRef(zoom),panRef=useRef(pan);zoomRef.current=zoom;panRef.current=pan;
    const viewport = useRef(transform);
    viewport.current = transform;
    const prepare = useCallback((canvas: HTMLCanvasElement | null, clear = true) => { if (!canvas)
        return null;
        const pixelBudget=canvas===committed.current?4200000:2300000;
        const dpr=Math.min(window.devicePixelRatio||1,Math.sqrt(pixelBudget/Math.max(1,size.w*size.h)));
        if (canvas.width !== Math.round(size.w * dpr) || canvas.height !== Math.round(size.h * dpr)) {
        canvas.width = Math.round(size.w * dpr);
        canvas.height = Math.round(size.h * dpr);
    } const ctx = canvas.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); if (clear)
        ctx.clearRect(0, 0, size.w, size.h); const v = viewport.current; ctx.translate(v.tx, v.ty); ctx.scale(v.scale, v.scale); return ctx; }, [size]);
    const redrawLive = useCallback(() => { const ctx = prepare(live.current); if (!ctx)return;
        const active=drag.current;
        if(active?.lasso?.length){
            ctx.beginPath();active.lasso.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
            ctx.fillStyle='#487aff22';ctx.fill();ctx.strokeStyle='#376bd1';ctx.lineWidth=1.5/viewport.current.scale;
            ctx.setLineDash([5/viewport.current.scale,4/viewport.current.scale]);ctx.stroke();ctx.setLineDash([]);
        }
        active?.moved?.forEach(object=>drawObject(ctx,object,images.current));
        if (liveObject.current)
        drawObject(ctx, snapPreview.current ?? liveObject.current,images.current); }, [prepare]);
    const drawOverlay = useCallback((cursor?: Point) => { const ctx = prepare(overlay.current); if (!ctx)
        return; const page = projectRef.current.pages[pageRef.current]; const objects=drag.current?.moved??page.objects.filter(o=>selectedRef.current.includes(o.id)); for (const object of objects) {
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
        ctx.arc(cursor.x, cursor.y, (toolsRef.current.tool==='eraser'?settingsRef.current.eraserRadius:7) / viewport.current.scale, 0, 7);
        ctx.stroke();
    } }, [prepare]);
    const redrawPage=useCallback(() => { const ctx = prepare(committed.current); if (!ctx)
        return; ctx.shadowColor = '#00000025'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 7; ctx.fillStyle = '#f7f8fc'; ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.save(); ctx.beginPath(); ctx.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT); ctx.clip(); background(ctx, project.pages[pageIndex]); const moving=new Set(drag.current?.moved?.map(o=>o.id));
        project.pages[pageIndex].objects.forEach(o=>{if(!moving.has(o.id))drawObject(ctx,o,images.current);});ctx.restore();
    },[project.pages,pageIndex,prepare]);
    const visibleObjects=project.pages[pageIndex].objects;
    useEffect(()=>{
      let active=true;
      if(!visibleObjects.some(o=>o.kind==='picture')){images.current.clear();return;}
      void pageImages(visibleObjects,images.current).then(loaded=>{
        if(active){images.current=loaded;redrawPage();}
      }).catch(()=>{if(active)toast('A picture could not be displayed.');});
      return ()=>{active=false;};
    },[visibleObjects,redrawPage,toast]);
    useEffect(()=>{redrawPage();redrawLive();drawOverlay();},[redrawPage,redrawLive,drawOverlay,zoom,pan]);
    useEffect(()=>{drawOverlay();},[selected,drawOverlay]);
    const frame=useRef<number | null>(null), latestCursor=useRef<Point | undefined>(undefined);
    const paintInput=useCallback((cursor:Point)=>{
        latestCursor.current=cursor;
        if(frame.current!==null)return;
        frame.current=requestAnimationFrame(()=>{
            frame.current=null;redrawLive();drawOverlay(latestCursor.current);
        });
    },[redrawLive,drawOverlay]);
    useEffect(()=>()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;},[paintInput]);
    const finish = useCallback((trimAfter?:number) => { const d = drag.current; if (!d)
        return; if(frame.current!==null){cancelAnimationFrame(frame.current);frame.current=null;}clearTimeout(snapTimer.current);drag.current = null; const raw = liveObject.current; if(raw?.kind==='stroke' && trimAfter!==undefined)raw.points=raw.points.filter(p=>p.t<=trimAfter); if(raw?.kind==='stroke' && raw.tool==='pen' && d.source==='hand' && contact.current && raw.points.length)
            raw.points=inkPoints(raw.points,contact.current,viewport.current.scale);
        contact.current=undefined;const o=snapPreview.current??raw; snapPreview.current=null; liveObject.current = null;
        if(d.lasso){
            const ids=lassoSelection(projectRef.current.pages[pageRef.current].objects,d.lasso);
            setSelected(ids);if(ids.length)setTool('select');
        } else if(d.moved){
            const replacements=new Map(d.moved.map(obj=>[obj.id,obj]));
            updatePage(projectRef.current.pages[pageRef.current].objects.map(obj=>replacements.get(obj.id)??obj));
        } else if (o) {
        const page = projectRef.current.pages[pageRef.current];
        if ((o.kind !== 'stroke' || o.points.length > 0) && (o.kind !== 'shape' || Math.hypot(o.w,o.h)*viewport.current.scale>2))
            updatePage([...page.objects, o]);
    }
    redrawLive();drawOverlay(); }, [updatePage, redrawLive, drawOverlay, projectRef]);
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
            if ((!space.current && activeTool !== 'hand') && (point.x < 0 || point.y < 0 || point.x > BOARD_WIDTH || point.y > BOARD_HEIGHT))
                return;
            if (activeTool === 'text' && !erase && !space.current) {
                const existing = [...page.objects].reverse().find((o): o is TextObject => o.kind === 'text' && hitTest(o, point, 3));
                setTextInput(existing ?? { id: uid(), kind: 'text', text: '', x: point.x, y: point.y, fontSize: 28, color: activeColor, width: activeWidth, createdAt: Date.now() });
                return;
            }
            if (!erase && (activeTool === 'hand' || space.current)) {
                drag.current = { start: point, last: point, source, pan: true, panScreen:{x:point.x*viewport.current.scale+viewport.current.tx,y:point.y*viewport.current.scale+viewport.current.ty} };
                return;
            }
            const erasing = erase || activeTool === 'eraser';
            drag.current = { start: point, last: point, source, erase: erasing, holdPoint:point, lastMotion:point.t };
            if(activeTool==='lasso'&&!erasing){drag.current.lasso=[point];setSelected([]);return;}
            if (activeTool === 'select' && !erasing) {
                const found = [...page.objects].reverse().find(o => hitTest(o, point, (source==='hand'?9:5)/viewport.current.scale));
                const ids=found?(selectedRef.current.includes(found.id)?selectedRef.current:[found.id]):[];
                setSelected(ids);
                if(ids.length)drag.current.originals=page.objects.filter(o=>ids.includes(o.id));
                return;
            }
            setSelected([]);
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
            if(erased.changed){if(!d.changed){history.current.push({pages:projectRef.current.pages,sections:projectRef.current.sections});d.changed=true;}const pages=[...projectRef.current.pages];pages[pageRef.current]={...page,objects:erased.objects};const next={...projectRef.current,pages,updatedAt:Date.now()};publish(next);}d.last=point;
            drawOverlay(point);
            return;
        }
        if(d.lasso){
            const last=d.lasso.at(-1)!;
            if(Math.hypot(point.x-last.x,point.y-last.y)*viewport.current.scale>=2)d.lasso.push(point);
            paintInput(point);return;
        }
        if (d.originals) {
            if (!d.moved && Math.hypot(point.x-d.start.x, point.y-d.start.y)*viewport.current.scale < (source === 'hand' ? 6 : 2)) return;
            const firstMove=!d.moved;
            d.moved=d.originals.map(o=>moveObject(o,point.x-d.start.x,point.y-d.start.y));
            if(firstMove)redrawPage();
            paintInput(point);
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
            if(source==='pointer' && settingsRef.current.shapeSnap && object.tool==='pen' && d.lastMotion===point.t){
                clearTimeout(snapTimer.current);
                snapTimer.current=setTimeout(()=>{
                    if(drag.current!==d || d.snapAttempted || !settingsRef.current.shapeSnap)return;
                    d.snapAttempted=true;snapPreview.current=recognizeShape(object)??null;redrawLive();
                },600);
            }
            if(settingsRef.current.shapeSnap && !d.snapAttempted && point.t-(d.lastMotion??point.t)>=600 && object.tool==='pen'){d.snapAttempted=true;snapPreview.current=recognizeShape(object)??null;}
        }
        else if (object?.kind === 'shape') {
            object.w = point.x - d.start.x;
            object.h = point.y - d.start.y;
        }
        paintInput(point);
    }, [finish, drawOverlay, redrawLive,redrawPage,paintInput,publish,history,projectRef]);
    const screenToWorld=(p:Point):Point=>{const r=host.current!.getBoundingClientRect(),v=viewport.current;return{...p,x:(p.x*window.innerWidth-r.left-v.tx)/v.scale,y:(p.y*window.innerHeight-r.top-v.ty)/v.scale};};
    const paperArea=()=>{
      const box=host.current?.getBoundingClientRect();
      if(!box)return;
      // Use the sheet at fit zoom so panning and zooming never move the input map itself.
      const fit=scale/zoom,w=BOARD_WIDTH*fit,h=BOARD_HEIGHT*fit;
      const left=box.left+(box.width-w)/2,top=box.top+(box.height-h)/2;
      return {left:left/window.innerWidth,right:(left+w)/window.innerWidth,top:top/window.innerHeight,bottom:(top+h)/window.innerHeight};
    };
    const boardContains=(x:number,y:number)=>{if(!host.current||document.elementFromPoint(x,y)!==overlay.current)return false;const p=screenToWorld({x:x/window.innerWidth,y:y/window.innerHeight,t:0});return p.x>=0&&p.x<=BOARD_WIDTH&&p.y>=0&&p.y<=BOARD_HEIGHT;};
    const handInput=(event:HandInput)=>{
      if(event.type==='end'){if(drag.current?.source==='hand')finish(event.trimAfter);return;}
      if(lockRef.current||drag.current?.source==='pointer')return;
      if(event.type==='begin'){const pts=event.points.map(screenToWorld);input('down',pts[0],'hand',event.erase);contact.current=pts.at(-1);pts.slice(1).forEach(p=>input('move',p,'hand',event.erase));return;}
      if(event.type==='point'){input('move',screenToWorld(event.point),'hand',event.erase);return;}
      if(event.type==='undo'){finish();undo();return;}
      if(event.type==='redo'){finish();redo();return;}
      if(event.type==='page'){
        const next=pageRef.current+event.direction,count=projectRef.current.pages.length;
        if(next<0 || next>=count){
          toast(count===1?'Only one page. Add a page or import a PDF to swipe between pages.':
            next<0?'Already on the first page.':'Already on the last page.');
        }else switchPage(next);
        return;
      }
      if(event.type==='transform-start'){finish();transformBaseZoom.current=zoomRef.current;return;}
      if(event.type==='transform'){
        finish();const r=host.current!.getBoundingClientRect();
        const ax=event.anchor.x*window.innerWidth-r.left,ay=event.anchor.y*window.innerHeight-r.top;
        const next=transformViewport({zoom:zoomRef.current,pan:panRef.current},transformBaseZoom.current,{factor:event.factor,anchor:{x:ax,y:ay},dx:event.dx*window.innerWidth,dy:event.dy*window.innerHeight},size);
        zoomRef.current=next.zoom;panRef.current=next.pan;setZoom(next.zoom);setPan(next.pan);
      }
    };
    const localPoint = (p: Point):Point => {
        const rect=host.current!.getBoundingClientRect(), v=viewport.current;
        return {...p,x:(p.x-rect.left-v.tx)/v.scale,y:(p.y-rect.top-v.ty)/v.scale};
    };
    const applyZoom = (ratio:number, previous:{x:number;y:number}, next=previous) => {
        const rect=host.current!.getBoundingClientRect(), zoom=zoomRef.current;
        const view=transformViewport({zoom,pan:panRef.current},zoom,{
            factor:ratio,anchor:{x:previous.x-rect.left,y:previous.y-rect.top},dx:next.x-previous.x,dy:next.y-previous.y
        },size);
        zoomRef.current=view.zoom;panRef.current=view.pan;setZoom(view.zoom);setPan(view.pan);
    };
    const [fingerPan,setFingerPan]=useState(()=>{try{return localStorage.getItem('gestera:finger-pan')==='true';}catch{return false;}});
    useEffect(()=>{try{localStorage.setItem('gestera:finger-pan',String(fingerPan));}catch{}},[fingerPan]);
    const pointerHandlers=useCanvasInput({
        fingerPan,
        start:(p,middle,erase)=>{const wasHeld=space.current;space.current=wasHeld||middle;input('down',localPoint(p),'pointer',erase);space.current=wasHeld;},
        move:p=>{if(drag.current?.source==='pointer')input('move',localPoint(p));},
        finish:()=>{if(drag.current?.source==='pointer')finish();},
        hover:p=>{if(!drag.current)drawOverlay(localPoint(p));},
        zoom:applyZoom
    });
    const wheelZoom=useRef(applyZoom);wheelZoom.current=applyZoom;
    useEffect(()=>{
        const canvas=overlay.current;if(!canvas)return;
        const wheel=(event:WheelEvent)=>{
            if(lockRef.current||(!event.ctrlKey && !event.metaKey))return;
            event.preventDefault();finishRef.current();
            const unit=event.deltaMode===1?16:event.deltaMode===2?canvas.clientHeight:1;
            wheelZoom.current(Math.exp(-Math.max(-100,Math.min(100,event.deltaY*unit))*.012),{x:event.clientX,y:event.clientY});
        };
        canvas.addEventListener('wheel',wheel,{passive:false});return()=>canvas.removeEventListener('wheel',wheel);
    },[]);
    const switchPage = useCallback((index: number) => { const next=Math.max(0,Math.min(projectRef.current.pages.length-1,index));if(next===pageRef.current)return;finish();setSectionView(projectRef.current.pages[next].sectionId);setPageIndex(next); setSelected([]); setPan({ x: 0, y: 0 }); setZoom(1); }, [finish]);
    const copySelection = useCallback(()=>{
        const page=projectRef.current.pages[pageRef.current];
        setClipboard(page.objects.filter(o=>selectedRef.current.includes(o.id)));
    },[]);
    const pasteSelection = useCallback(()=>{
        if(!clipboard.length)return;
        finish();
        const pasted=offsetCopies(clipboard,BOARD_WIDTH,BOARD_HEIGHT).map(o=>({...o,id:uid(),createdAt:Date.now()}));
        updatePage([...projectRef.current.pages[pageRef.current].objects,...pasted]);
        setClipboard(pasted);setTool('select');setSelected(pasted.map(o=>o.id));
    },[clipboard,finish,updatePage]);
    const deleteSelection = useCallback(()=>{
        finish();
        updatePage(projectRef.current.pages[pageRef.current].objects.filter(o=>!selectedRef.current.includes(o.id)));setSelected([]);
    },[finish,updatePage]);
    const selectAll=useCallback(()=>{
      finish();setTool('select');setSelected(projectRef.current.pages[pageRef.current].objects.map(o=>o.id));
    },[finish,projectRef]);
    const cutSelection=useCallback(()=>{copySelection();deleteSelection();},[copySelection,deleteSelection]);
    const hasVisiblePage=project.pages.some(p=>p.sectionId===sectionView);
    useEffect(() => { const fn = (e: KeyboardEvent) => { if (lockRef.current || document.querySelector('dialog[open]') || (e.target as HTMLElement).matches('input,textarea,select,[contenteditable]'))
        return; if(!hasVisiblePage)return;
        if(e.target===overlay.current && !presenting && !e.ctrlKey && !e.metaKey && !e.altKey){
            if(e.key==='Enter'){e.preventDefault();finish();setContents(true);return;}
            const offset:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
            if(selectedRef.current.length && offset[e.key]){
                e.preventDefault();const [dx,dy]=offset[e.key],step=e.shiftKey?10:1;
                const ids=new Set(selectedRef.current);
                updatePage(projectRef.current.pages[pageRef.current].objects.map(o=>ids.has(o.id)?moveObject(o,dx*step,dy*step):o));return;
            }
        }
        const mod = e.ctrlKey || e.metaKey; if (mod && !e.altKey && !e.shiftKey && !window.getSelection()?.toString()){
        if(!presenting&&e.key.toLowerCase()==='a'){e.preventDefault();selectAll();return;}
        if(!presenting&&e.key.toLowerCase()==='x'&&selectedRef.current.length){e.preventDefault();cutSelection();return;}
        if(e.key.toLowerCase()==='c' && selectedRef.current.length){e.preventDefault();copySelection();return;}
        if(!presenting&&e.key.toLowerCase()==='v' && clipboard.length){e.preventDefault();pasteSelection();return;}
    } if (mod && ['z', 's', 'y'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        if (e.key.toLowerCase() === 's') {
            save();
            toast('Saving your board on this device.');
        }
        else if (e.shiftKey || e.key.toLowerCase() === 'y')
            redo();
        else
            undo();
        return;
    } if (mod)
        return; if (e.key === 'Escape') {
        finish();
        setPresenting(false);
        if (document.fullscreenElement)
            void document.exitFullscreen();
        setSelected([]);
        setAI(false);
    } if (e.key === '?')
        setGuide(true); if (e.key === ' ' && !(e.target as HTMLElement).closest('button,a')) {
        space.current = true;
        e.preventDefault();
    } if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRef.current.length) {
        updatePage(projectRef.current.pages[pageRef.current].objects.filter(o => !selectedRef.current.includes(o.id)));
        setSelected([]);
    } if (presenting && e.key === 'ArrowRight')
        switchPage(pageRef.current + 1); if (presenting && e.key === 'ArrowLeft')
        switchPage(pageRef.current - 1); const shortcuts: Record<string, Tool> = { b: 'pen', e: 'eraser', v: 'select', h: 'hand', t: 'text', l: 'laser' }; if (shortcuts[e.key.toLowerCase()]) {
        finish();
        setTool(shortcuts[e.key.toLowerCase()]);
    } if (e.key === '+' || e.key === '=')
        setZoom(z => Math.min(3, z + .2)); if (e.key === '-')
        setZoom(z => Math.max(.4, z - .2)); }; const up = (e: KeyboardEvent) => { if (e.key === ' ')
        space.current = false; }; window.addEventListener('keydown', fn); window.addEventListener('keyup', up); return () => { window.removeEventListener('keydown', fn); window.removeEventListener('keyup', up); }; }, [undo, redo, save, toast, presenting, switchPage, updatePage, finish,clipboard,copySelection,pasteSelection,cutSelection,selectAll,hasVisiblePage]);
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
    const chooseMedia=(pdf:boolean)=>{
      const picker=mediaPicker.current;
      if(!picker||job.current)return;
      picker.accept=pdf?'application/pdf,.pdf':'image/png,image/jpeg,image/webp,image/gif';picker.value='';picker.click();
    };
    const insertMedia=async(file:File)=>{
      if(job.current||lockRef.current)return;
      finish();
      const targetId=projectRef.current.pages[pageRef.current].id,controller=new AbortController();
      job.current=controller;setImporting('Reading '+file.name);
      try{
        const pdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name);
        const pictures=pdf?await importPdf(file,100-projectRef.current.pages.length,(n,total)=>setImporting('Preparing slide '+n+' of '+total),controller.signal):[await importPicture(file)];
        if(controller.signal.aborted)return;
        const doc=projectRef.current,index=doc.pages.findIndex(p=>p.id===targetId);
        if(index<0||lockRef.current)throw Error('Import cancelled because the destination page changed or was locked.');
        if(pdf && doc.pages.length+pictures.length>100)throw Error('This notebook has reached its page limit.');
        finish();
        const pages=[...projectRef.current.pages],target=pages[index];
        if(pdf)pages.splice(index+1,0,...pictures.map(pic=>({...newPage('blank',target.sectionId,pic.name),objects:[pic]})));
        else pages[index]={...target,objects:[...target.objects,...pictures]};
        update(pages);switchPage(pdf?index+1:index);
        if(!pdf){setTool('select');setSelected([pictures[0].id]);}
        toast(pdf?pictures.length+' slides added.':'Picture inserted.');
      }catch(error){if(!controller.signal.aborted)toast(error instanceof Error?error.message:'The file could not be imported.');}
      finally{if(!controller.signal.aborted)setImporting('');job.current=null;}
    };
    const selectedPage = project.pages[pageIndex];
    useEffect(()=>{try{localStorage.setItem('gestera:page:'+project.id,selectedPage.id);}catch{}},[project.id,selectedPage.id]);
    const viewedSection=sectionsOf(project).find(s=>s.id===sectionView)??sectionsOf(project).find(s=>s.id===selectedPage.sectionId)!,emptySection=!project.pages.some(p=>p.sectionId===viewedSection.id);
    return <div className={`board-app ${presenting ? 'is-presenting' : ''} ${camera ? 'gesture-mode' : ''}`}><header className="board-topbar" inert={locked}><Link to="/app" data-gesture aria-label="Back to workspace" className="board-brand"><Logo small/></Link><span className="bar-separator"/><div className="board-title-group"><input aria-label="Notebook title" value={project.name} maxLength={150} onChange={e=>publish({...projectRef.current,name:e.target.value})} onBlur={()=>{if(!projectRef.current.name.trim())publish({...projectRef.current,name:'Untitled notebook'});}}/><span className={saveState.includes('failed') ? 'save-warning' : ''}>{saveState === 'Saved locally' ? <Check size={11}/> : <Circle size={9}/>} {saveState}</span></div><div className="board-top-actions"><button data-gesture aria-label="Previous page" className="btn secondary small-btn" disabled={pageIndex===0} onClick={()=>switchPage(pageIndex-1)}><ArrowLeft size={17}/></button><button data-gesture aria-label="Next page" className="btn secondary small-btn" disabled={pageIndex===project.pages.length-1} onClick={()=>switchPage(pageIndex+1)}><ArrowRight size={17}/></button><button data-gesture aria-label="Notebook navigation" className={`btn secondary small-btn ${pagesOpen ? 'active' : ''}`} onClick={() => setPagesOpen(x => !x)}><Layers2 size={15}/><span>{pageIndex + 1} / {project.pages.length}</span></button><button data-gesture aria-label="Present notebook" disabled={emptySection} className="btn secondary small-btn present-btn" onClick={() => { finish(); setPresenting(true); setTool('laser'); void document.documentElement.requestFullscreen?.().catch(() => { }); }}><Presentation size={15}/><span>Present</span></button><div className="export-wrap"><button data-gesture className="btn secondary small-btn" aria-label="Export notebook" disabled={emptySection} onClick={() => setExportOpen(x => !x)}><Download size={15}/><span>Export</span><ChevronDown size={12}/></button>{exportOpen && <><button data-gesture className="menu-scrim" aria-label="Close export menu" onClick={() => setExportOpen(false)}/><div className="dropdown"><button data-gesture onClick={() => exportBoard('png')}>PNG · current page</button><button data-gesture onClick={() => exportBoard('pdf')}>PDF · all pages</button><button data-gesture onClick={() => exportBoard('json')}>GestEra · editable backup</button></div></>}</div><button data-gesture className="btn primary small-btn ai-button" onClick={() => setAI(x => !x)}><Sparkles size={15}/><span>Board assistant</span></button></div></header>{!presenting&&<div inert={locked} className="page-context"><span>{viewedSection.name}</span><span>/</span><h1>{emptySection?'No pages yet':selectedPage.title??'Untitled page'}</h1><button data-gesture onClick={()=>setPagesOpen(true)}>Organize pages</button></div>}{!presenting&&!emptySection&&<NotebookRibbon locked={locked} onMedia={chooseMedia} importing={importing} onLock={toggleLock} tool={tool} color={color} onTool={next=>{finish();setTool(next);if(next==='shape')setProperties(true);}} onProperties={()=>{finish();setProperties(true);}}
      canCopy={selected.length>0} canPaste={clipboard.length>0}
      onArrange={action=>{finish();const objects=projectRef.current.pages[pageRef.current].objects;
        const next=arrangeSelection(objects,selectedRef.current,action);if(next!==objects)updatePage(next);}}
      onNextColor={()=>{finish();const index=inks.findIndex(([,value])=>value===color);setColor(inks[(index+1)%inks.length][1]);}}
      fingerPan={fingerPan} onFingerPan={()=>setFingerPan(current=>!current)}
      onContents={()=>{finish();setContents(true);}} onCut={cutSelection} onSelectAll={selectAll} onRecolor={()=>{
        finish();const objects=projectRef.current.pages[pageRef.current].objects,ids=new Set(selectedRef.current);
        if(objects.some(o=>ids.has(o.id)&&o.color!==color))updatePage(objects.map(o=>ids.has(o.id)?{...o,color}:o));
      }} onCopy={copySelection} onPaste={pasteSelection} onDelete={deleteSelection}
      onClear={()=>setConfirm('clear')} onGuide={()=>setGuide(true)} zoomControls={<div className="ribbon-zoom"><button data-gesture aria-label="Zoom out" onClick={() => setZoom(z => Math.max(.4, z - .2))}><Minus size={16}/></button><span>{Math.round(zoom * 100)}%</span><button data-gesture aria-label="Zoom in" onClick={() => setZoom(z => Math.min(3, z + .2))}><Plus size={16}/></button><i /><button data-gesture aria-label="Fit board to screen" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><Maximize size={15}/></button></div>}/>}
      {properties&&<InkProperties group={tool==='shape'?'Shapes':tool==='eraser'?'Eraser':'Ink'} color={color} width={width} shape={shape} paper={selectedPage.background}
        onColor={setColor} onWidth={setWidth} onShape={v=>{setShape(v);setTool('shape');}} onPaper={(background:Background)=>{const pages=[...projectRef.current.pages];pages[pageRef.current]={...pages[pageRef.current],background};update(pages);}} onClose={()=>setProperties(false)}/>}
      <input type="file" hidden ref={mediaPicker} onChange={e=>{const file=e.target.files?.[0];if(file)void insertMedia(file);}}/>
      {locked&&<div className="board-lock-banner" role="region" aria-label="Board locked"><strong>Board locked</strong><button autoFocus onClick={toggleLock}>Unlock board</button></div>}
      <div inert={locked} className="board-body">{pagesOpen&&!presenting&&<><button className="notebook-nav-scrim" aria-label="Close notebook navigation" onClick={()=>setPagesOpen(false)}/><NotebookExplorer sectionId={viewedSection.id} onBrowse={id=>{const p=projectRef.current,index=p.pages.findIndex(page=>page.sectionId===id);if(index>=0)switchPage(index);else{finish();setSelected([]);setSectionView(id);}}} project={project} activePageId={selectedPage.id} onClose={()=>setPagesOpen(false)} onSelect={id=>{const i=projectRef.current.pages.findIndex(p=>p.id===id);if(i>=0)switchPage(i);if(window.innerWidth<1100)setPagesOpen(false);}} onChange={next=>{const active=projectRef.current.pages[pageRef.current]?.id,before=projectRef.current;finish();const latest=projectRef.current;const pages=next.pages.map(page=>{const old=before.pages.find(p=>p.id===page.id),current=latest.pages.find(p=>p.id===page.id);return old&&current&&page.objects===old.objects?{...page,objects:current.objects}:page;});update(pages,true,next.sections);const index=pages.findIndex(p=>p.id===active);setSectionView(pages[index>=0?index:Math.min(pageRef.current,pages.length-1)].sectionId);setPageIndex(index>=0?index:Math.min(pageRef.current,pages.length-1));setSelected([]);}}/></>}<div className="canvas-host" ref={host}>{emptySection&&!presenting&&<div className="empty-section-canvas"><Layers2 size={35}/><h2>A fresh section</h2><p>Add a page to start writing in {viewedSection.name}.</p><button data-gesture className="btn secondary" onClick={()=>setPagesOpen(true)}>Open pages</button><button data-gesture className="subtle" disabled={!history.current.canUndo} onClick={undo}>Undo last change</button></div>}<div className="canvas-content" inert={emptySection}><canvas ref={committed} className="canvas-layer"/><canvas ref={live} className="canvas-layer live-layer"/><canvas ref={overlay} className={`canvas-layer input-layer tool-${tool}`} aria-label="Drawing area. Press Enter for page contents. Use arrow keys to move selected items, or Shift and arrow keys for larger steps." tabIndex={0} {...pointerHandlers} onPointerLeave={() => { if (!drag.current)
        drawOverlay(); }}/>
  {!presenting && <><div className="board-undo"><button data-gesture aria-label="Undo" title="Undo (Ctrl Z)" disabled={!history.current.canUndo} onClick={undo}><Undo2 size={18}/></button><button data-gesture aria-label="Redo" title="Redo (Ctrl Shift Z)" disabled={!history.current.canRedo} onClick={redo}><Redo2 size={18}/></button></div><div className="gesture-hud"><span className={camera ? 'status-dot' : 'inactive-dot'}/><span>{camera ? handStatus : 'Mouse, touch & pen ready'}</span><i /><button data-gesture className={camera ? 'camera-on' : ''} onClick={() => setCamera(x => !x)}><Video size={15}/>{camera ? 'Stop camera' : 'Start air writing'}</button><button data-gesture aria-label="Gesture help" onClick={() => setGuide(true)}>?</button></div>{selectedPage.objects.length === 0 && <div className="canvas-empty"><span>{camera?'Pinch to draw':'Draw or type anywhere on the page'}</span><small>{camera?'Release to lift the pen.':'Choose Text to add or edit a note.'}</small></div>}</>}{presenting && <div className="presentation-controls"><button aria-label={camera?'Stop gesture camera':'Start gesture camera'} onClick={()=>setCamera(v=>!v)}><Video size={17}/></button><button data-gesture aria-label="Previous slide" disabled={pageIndex === 0} onClick={() => switchPage(pageIndex - 1)}><ArrowLeft size={18}/></button><span>{pageIndex + 1} / {project.pages.length}</span><button data-gesture aria-label="Next slide" disabled={pageIndex === project.pages.length - 1} onClick={() => switchPage(pageIndex + 1)}><ArrowRight size={18}/></button><button data-gesture onClick={() => { setPresenting(false); setTool('pen'); if (document.fullscreenElement)
        void document.exitFullscreen(); }}><X size={16}/>Exit presentation</button></div>}</div></div>{ai && !presenting && <aside className="ai-panel"><div className="panel-heading"><h3><Sparkles size={18}/>Board assistant</h3><button data-gesture aria-label="Close assistant" onClick={() => setAI(false)}><X size={17}/></button></div><div className="ai-setup-icon"><Sparkles size={30}/></div><h2>A little intelligence.<br />A lot of possibility.</h2><p>Transcribe handwriting, explain a diagram, or create a study quiz from a snapshot you choose.</p><div className="setup-state"><span className="status-dot warning"/><strong>Server setup required</strong><p>AI is not connected in this core release. Add a server-side Gemini integration before sending board snapshots. Camera frames are never sent.</p></div><Link className="btn secondary" to="/settings"><Settings2 size={15}/>View project setup</Link><button data-gesture className="subtle" onClick={() => { download(new Blob([JSON.stringify(projectRef.current)], { type: 'application/json' }), `${project.name}.gestera`); toast('Editable board backup exported.'); }}>Export your board instead <ArrowRight size={14}/></button></aside>}</div>{camera && <CameraPanel paperArea={paperArea} locked={locked} onToggleLock={toggleLock} sessionKey={emptySection?'section:'+viewedSection.id:selectedPage.id} onClose={() => { setCamera(false); finish(); setHandStatus('Mouse & touch ready'); }} onInput={handInput} onStatus={setHandStatus} presentation={presenting} boardContains={boardContains} tool={tool}/>}{guide && <GestureGuide onClose={() => setGuide(false)}/>}{confirm && <Confirm title={confirm === 'clear' ? 'Clear this page?' : 'Delete this page?'} description="You can undo this change while this board is open." onClose={() => setConfirm(null)} onConfirm={() => { finish(); if (confirm === 'clear')
        updatePage([]);
    else {
        const pages = project.pages.filter((_, i) => i !== pageIndex);
        setPageIndex(Math.max(0, pageIndex - 1));
        update(pages);
    } }}/>}{contents&&<PageContents objects={selectedPage.objects} onClose={()=>setContents(false)}
      onSelect={o=>{setContents(false);setTool('select');setSelected([o.id]);requestAnimationFrame(()=>overlay.current?.focus());}}
      onEdit={note=>{setContents(false);setTextInput(note??{kind:'text',id:uid(),x:72,y:Math.min(BOARD_HEIGHT-48,80+selectedPage.objects.length*36),fontSize:28,color,width,text:'',createdAt:Date.now()});}}/>}
    {textInput && <NoteEditor airTyping={camera} note={textInput} existing={selectedPage.objects.some(o=>o.id===textInput.id)} onClose={()=>setTextInput(null)} onSave={note=>{
        const objects=projectRef.current.pages[pageRef.current].objects;
        updatePage(objects.some(o=>o.id===note.id)?objects.map(o=>o.id===note.id?note:o):[...objects,note]);setTextInput(null);
    }}/>} <button data-gesture className="sr-only" onClick={() => navigate('/app')}>Exit board</button></div>;
}
