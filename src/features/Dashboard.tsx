import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { ArrowDownUp, ArrowRight, ArrowUpRight, Check, ChevronRight, Clock3, Copy, Ellipsis, FileUp, FolderOpen, Hand, LayoutGrid, List, Pencil, Plus, Search, Sparkles, Star, Trash2, Video } from 'lucide-react';
import { importProject, repository } from '../services/storage';
import { renderPage } from '../engine/board';
import { applyTemplate, templates } from './templates';
import { Confirm, Modal, useToast } from '../ui/common';
import { useSettings } from '../store/settings';
import type { Project } from '../types';
function HeroArt() { return <div className="hero-art" aria-hidden="true"><div className="orb orb-one"/><div className="orb orb-two"/><div className="art-cross cross-one">+</div><div className="art-cross cross-two">+</div><div className="mini-board"><div className="mini-top"><span /><span /><span /><small>A little spark of an idea</small></div><svg viewBox="0 0 420 190"><defs><pattern id="dots" width="17" height="17" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#cbd6ed"/></pattern></defs><rect width="420" height="190" fill="url(#dots)"/><text x="45" y="52" fill="#2a3958" fontSize="21" fontFamily="Georgia" fontStyle="italic">What if we just…</text><path d="M44 64c53 9 121 8 173-1" stroke="#5e82ef" strokeWidth="3" fill="none" strokeLinecap="round"/><path d="M72 152c12-50 35-48 57-26s32 35 59-8 32-42 48-20 49 30 81-15" stroke="#2f6bff" strokeWidth="3.5" fill="none" strokeLinecap="round"/><path d="M282 56c22 2 36 10 45 28m-19-9 21 12-1-24" stroke="#91a4c5" strokeWidth="2" fill="none" strokeLinecap="round"/><circle cx="238" cy="99" r="6" fill="#2f6bff"/><circle cx="238" cy="99" r="15" stroke="#2f6bff" strokeOpacity=".2" fill="none" strokeWidth="7"/></svg><div className="mini-tools"><span className="active"><Pencil size={12}/></span><span className="dot-blue"/><span className="dot-purple"/><span className="dot-orange"/><i /><span>3 px</span></div></div><div className="art-label"><Hand size={16}/><span>Less clicking. More creating.</span><span className="blue-dot"/></div><div className="art-cursor"><svg width="24" height="29" viewBox="0 0 24 29"><path d="m2 2 18 13-9 1-4 9z" fill="#2f6bff" stroke="white" strokeWidth="2"/></svg><span>Your next idea</span></div></div>; }
function TemplateArt({ id }: {
    id: string;
}) { return <div className={`template-art ${id}`}><svg viewBox="0 0 300 105" aria-hidden="true">{id === 'blank' ? <><path d="M70 76C89 22 103 39 126 64s43 20 65-24" fill="none" stroke="#5b83d8" strokeWidth="3" strokeLinecap="round"/><path d="m181 42 14-8-2 16" fill="none" stroke="#5b83d8" strokeWidth="3"/><circle cx="231" cy="26" r="3" fill="#adc7ff"/><path d="M51 24v11m-5-5h10" stroke="#adc7ff" strokeWidth="2"/></> : id === 'math' ? <><path d="M0 26h300M0 52h300M0 78h300M50 0v105M100 0v105M150 0v105M200 0v105M250 0v105" stroke="#d5d0f0" strokeWidth=".6"/><text x="67" y="65" fill="#7663ab" fontSize="24" fontFamily="Georgia" fontStyle="italic">y = x² + a little magic</text></> : id === 'brainstorm' ? <><path d="m130 52-60-28m80 24 75-26m-87 39 56 27" stroke="#80b9b4" strokeWidth="1.6"/><rect x="102" y="33" width="81" height="37" rx="18" fill="#f1fcfa" stroke="#7aaea8"/><text x="121" y="56" fontSize="12" fill="#4c8e87">big idea</text><circle cx="66" cy="23" r="12" fill="#c9e7e0"/><circle cx="228" cy="21" r="12" fill="#c9e7e0"/><circle cx="201" cy="88" r="12" fill="#c9e7e0"/></> : <><path d="M50 33h192M50 56h192M50 79h192" stroke="#e5d9be"/><rect x="62" y="25" width="10" height="10" rx="2" fill="#d9b76b"/><path d="m64 30 2 2 4-5" stroke="white" fill="none" strokeWidth="1.5"/><path d="M88 30h88M88 53h128M88 76h104" stroke="#c0a777" strokeWidth="4" strokeLinecap="round"/></>}</svg></div>; }
function BoardPreview({ project }: {
    project: Project;
}) { const ref = useRef<HTMLCanvasElement>(null); useEffect(() => { const el = ref.current; if (!el)
    return; let active=true;void renderPage(project.pages[0],600).then(rendered=>{if(active){el.width=rendered.width;el.height=rendered.height;el.getContext('2d')?.drawImage(rendered,0,0);}}).catch(()=>{});return ()=>{active=false;}; }, [project]); return <canvas ref={ref} aria-label={`${project.name} preview`}/>; }
export default function Dashboard() {
    const [projects, setProjects] = useState<Project[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [query, setQuery] = useState(''), [sort, setSort] = useState<'recent' | 'name'>('recent'), [layout, setLayout] = useState<'grid' | 'list'>('grid'), [menu, setMenu] = useState<string | null>(null), [rename, setRename] = useState<Project | null>(null), [name, setName] = useState(''), [deleting, setDeleting] = useState<Project | null>(null), [busy, setBusy] = useState(false);
    const navigate = useNavigate(), location = useLocation(), toast = useToast(), { openGuide } = useOutletContext<{
        openGuide: () => void;
    }>(), file = useRef<HTMLInputElement>(null), settings = useSettings();
    const overview = location.pathname === '/app' || location.pathname === '/', favorites = location.pathname === '/favorites';
    const load = async () => { setLoading(true); try {
        setProjects(await repository.list());
        setError('');
    }
    catch {
        setError('Your saved boards could not be opened. Please enable browser storage and try again.');
    }
    finally {
        setLoading(false);
    } };
    useEffect(() => { void load(); }, []);
    const create = async (template = 'blank', air = false) => { if (busy)
        return; setBusy(true); try {
        const t = templates.find(t => t.id === template)!;
        let p = await repository.create(template === 'blank' ? 'Untitled board' : t.name, template === 'blank' ? settings.defaultBackground : t.background);
        p = applyTemplate(p, template);
        await repository.save(p);
        navigate(`/board/${p.id}${air ? '?camera=1' : ''}`);
    }
    catch {
        toast('Could not create a board. Check that browser storage is available.');
    }
    finally {
        setBusy(false);
    } };
    useEffect(() => { const fn = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !(e.target as HTMLElement).matches('input,textarea,[contenteditable]'))
        void create(); }; window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn); });
    const filtered = projects.filter(p => (!favorites || p.favorite) && p.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt);
    const change = async (p: Project) => { try {
        await repository.save(p);
        setProjects(prior => prior.map(x => x.id === p.id ? p : x));
        return true;
    }
    catch {
        toast('Your change could not be saved. Please try again.');
        return false;
    } };
    return <main className="dashboard"><div className="page-heading"><div><div className="eyebrow"><span className="tiny-line"/>{overview ? 'YOUR CREATIVE SPACE' : favorites ? 'THE IDEAS YOU LOVE' : 'A HOME FOR YOUR IDEAS'}</div><h1>{overview ? 'A fresh space. A fresh perspective.' : favorites ? 'Your favorites' : 'Your boards'}</h1><p>{overview ? 'Big ideas, messy notes, lightbulb moments. They all belong here.' : favorites ? 'Keep the boards you come back to within easy reach.' : 'Every thought starts somewhere. Pick up where you left off.'}</p></div><button className="btn secondary import-btn" onClick={() => file.current?.click()}><FileUp size={16}/>Import board</button><input ref={file} type="file" accept=".gestera,.json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f)
        return; try {
        const p = await importProject(f);
        navigate(`/board/${p.id}`);
    }
    catch {
        toast('This file is not a valid GestEra board (maximum 15 MB).');
    } e.target.value = ''; }}/></div>{overview && <><section className="hero"><div className="hero-copy"><div className="hero-tag"><span /><span>MEET YOUR NEXT WAY TO CREATE</span></div><h2>Your ideas.<br />No strings attached<span>.</span></h2><p>A whiteboard that moves with you. Sketch with your<br className="desktop-break"/> hands, explore a thought, and make it your own.</p><div className="hero-actions"><button className="btn primary" disabled={busy} onClick={() => create()}><Plus size={17}/>Create a board <ArrowRight size={16}/></button><button className="hero-air" disabled={busy} onClick={() => create('blank', true)}><Video size={17}/>Try air writing <ArrowUpRight size={14}/></button></div><div className="hero-foot"><Check size={13}/>No login. No limits on your imagination.</div></div><HeroArt /></section><section className="templates-section"><div className="section-title"><h2>Skip the blank page<span>Start with a little inspiration</span></h2><span className="subtle template-hint">A starting point, made yours <Sparkles size={14}/></span></div><div className="templates-grid">{templates.map(t => <button className={`template-card ${t.accent}`} key={t.id} disabled={busy} onClick={() => create(t.id)}><TemplateArt id={t.id}/><div className="template-content"><div><h3>{t.name}</h3><p>{t.description}</p></div><span className="template-plus"><Plus size={17}/></span></div></button>)}</div></section></>}
  <section className="recent-section"><div className="section-title"><h2>{overview ? 'Pick up where you left off' : favorites ? 'Starred boards' : 'All boards'}<span className="count-badge">{favorites ? projects.filter(p => p.favorite).length : projects.length}</span></h2>{overview && projects.length > 0 ? <Link className="text-link" to="/projects">View all boards <ArrowRight size={14}/></Link> : <span className="subtle"><span className="status-dot"/>Saved on this device</span>}</div><div className="boards-controls"><div className="board-search"><Search size={16}/><input aria-label="Search boards" placeholder="Search your boards…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="Clear search" onClick={() => setQuery('')}>×</button>}</div><div className="board-filters"><label className="sort-control"><ArrowDownUp size={14}/><select aria-label="Sort boards" value={sort} onChange={e => setSort(e.target.value as 'recent' | 'name')}><option value="recent">Last edited</option><option value="name">Name A–Z</option></select></label><div className="view-toggle"><button className={layout === 'grid' ? 'active' : ''} aria-label="Grid view" onClick={() => setLayout('grid')}><LayoutGrid size={16}/></button><button className={layout === 'list' ? 'active' : ''} aria-label="List view" onClick={() => setLayout('list')}><List size={16}/></button></div></div></div>
  {loading ? <div className="skeleton-grid">{[0, 1, 2].map(x => <div className="skeleton" key={x}/>)}</div> : error ? <div className="empty-state"><FolderOpen size={30}/><h3>Let’s try that again</h3><p>{error}</p><button className="btn secondary" onClick={load}>Retry</button></div> : filtered.length === 0 ? <div className="empty-state"><span className="empty-illustration">{favorites ? <Star size={27}/> : query ? <Search size={27}/> : <Pencil size={27}/>}<span>+</span></span><h3>{query ? 'No boards found' : favorites ? 'Your best ideas, one star away.' : 'Your first idea is waiting.'}</h3><p>{query ? 'Try another search, or make room for a new idea.' : favorites ? 'Star a board from its menu to keep it here.' : 'A sketch, a study session, a beautifully messy brainstorm. Start here.'}</p><button className="text-link" disabled={busy} onClick={() => create()}><Plus size={15}/>Create your first board<ArrowRight size={15}/></button></div> : <div className={`boards-grid ${layout === 'list' ? 'list-layout' : ''}`}>{(overview ? filtered.slice(0, 6) : filtered).map(p => <article className="board-card" key={p.id}><button className="board-preview" onClick={() => navigate(`/board/${p.id}`)}><BoardPreview project={p}/><span className="board-open">Open board <ArrowUpRight size={16}/></span></button><div className="board-info"><button className="board-name" onClick={() => navigate(`/board/${p.id}`)}>{p.name}{p.favorite && <Star size={13} fill="#f4bf62" color="#f4bf62"/>}</button><span className="board-meta"><Clock3 size={12}/>{new Date(p.updatedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}<i /> {p.pages.length} {p.pages.length === 1 ? 'page' : 'pages'}</span><div className="board-menu-wrap"><button className="icon-btn" aria-label={`Options for ${p.name}`} onClick={() => setMenu(menu === p.id ? null : p.id)}><Ellipsis size={19}/></button>{menu === p.id && <><button className="menu-scrim" aria-label="Close board menu" onClick={() => setMenu(null)}/><div className="dropdown"><button onClick={() => { setRename(p); setName(p.name); setMenu(null); }}><Pencil size={14}/>Rename</button><button onClick={() => { void change({ ...p, favorite: !p.favorite }); setMenu(null); }}><Star size={14}/>{p.favorite ? 'Unstar' : 'Add to favorites'}</button><button onClick={async () => { try {
        await repository.duplicate(p);
        await load();
        toast('Board duplicated.');
    }
    catch {
        toast('Could not duplicate the board.');
    } setMenu(null); }}><Copy size={14}/>Duplicate</button><button className="danger-text" onClick={() => { setDeleting(p); setMenu(null); }}><Trash2 size={14}/>Delete board</button></div></>}</div></div></article>)}</div>}</section>
  {overview && <div className="bottom-cards"><button className="gesture-callout" onClick={openGuide}><span className="callout-icon"><Hand size={22}/></span><span><strong>A new way to be hands-on.</strong><small>Five simple gestures. Your whole canvas.</small></span><span className="callout-cta">Meet the gestures <ChevronRight size={15}/></span></button><Link className="privacy-callout" to="/settings"><span className="privacy-orbit"><Check size={18}/></span><span><strong>A space that’s truly yours.</strong><small>Your boards live on your device.</small></span><ArrowUpRight size={16}/></Link></div>}
  {rename && <Modal title="Rename your board" onClose={() => setRename(null)}><form onSubmit={async (e) => { e.preventDefault(); if (name.trim()) {
        if (await change({ ...rename, name: name.trim() })) {
            setRename(null);
            toast('Board renamed.');
        }
    } }}><label className="field-label" htmlFor="board-name">Board name</label><input className="input" id="board-name" autoFocus maxLength={150} value={name} onChange={e => setName(e.target.value)}/><div className="modal-actions"><button className="btn secondary" type="button" onClick={() => setRename(null)}>Cancel</button><button className="btn primary" disabled={!name.trim()}>Save name</button></div></form></Modal>}{deleting && <Confirm title="Delete this board?" description={`“${deleting.name}” will be removed from this device. Export a copy first if you want to keep it.`} onClose={() => setDeleting(null)} onConfirm={async () => { try {
        await repository.delete(deleting.id);
        await load();
        toast('Board deleted.');
    }
    catch {
        toast('Could not delete this board.');
    } }}/>}</main>;
}
