import { newPage,uid,type Project,type NotebookSection } from '../types';
export const sectionColors=['#7c83ff','#3dbfa8','#e0ab58','#d887b6','#6da8e8','#b49adb'];
export function normalizeNotebook(project:Project):Project {
  const sections=project.sections?.length?project.sections:[{id:`section-${project.id}`,name:'Notes',color:sectionColors[0]}];
  const ids=new Set(sections.map(s=>s.id));
  const pages=project.pages.map((p,i)=>({...p,title:p.title?.trim()||`Page ${i+1}`,sectionId:p.sectionId&&ids.has(p.sectionId)?p.sectionId:sections[0].id}));
  return{...project,schemaVersion:2,sections,pages:sections.flatMap(s=>pages.filter(p=>p.sectionId===s.id))};
}
const title=(text:string,max=150)=>text.trim().slice(0,max)||'Untitled';
export const sectionsOf=(p:Project):NotebookSection[]=>normalizeNotebook(p).sections!;
function section(p:Project,id:string){if(!sectionsOf(p).some(s=>s.id===id))throw Error('That section no longer exists.');}
export function addSection(project:Project,name:string):Project {
  const p=normalizeNotebook(project);if(p.sections!.length>=50)throw Error('This notebook has reached its 50 section limit.');
  return{...p,sections:[...p.sections!,{id:uid(),name:title(name,80),color:sectionColors[p.sections!.length%sectionColors.length]}]};
}
export function renameSection(project:Project,id:string,name:string):Project {const p=normalizeNotebook(project);section(p,id);return{...p,sections:p.sections!.map(s=>s.id===id?{...s,name:title(name,80)}:s)};}
export function deleteEmptySection(project:Project,id:string):Project {const p=normalizeNotebook(project);section(p,id);if(p.pages.some(page=>page.sectionId===id))throw Error('Move this section’s pages before removing it.');return{...p,sections:p.sections!.filter(s=>s.id!==id)};}
export function addPageToSection(project:Project,id:string):Project {const p=normalizeNotebook(project);section(p,id);if(p.pages.length>=100)throw Error('This notebook has reached its 100 page limit.');const background=p.pages.find(page=>page.sectionId===id)?.background??p.pages[0].background;return normalizeNotebook({...p,pages:[...p.pages,newPage(background,id,`Page ${p.pages.filter(page=>page.sectionId===id).length+1}`)]});}
export function renamePage(project:Project,id:string,name:string):Project {return{...project,pages:project.pages.map(page=>page.id===id?{...page,title:title(name)}:page)};}
export function movePage(project:Project,id:string,to:string):Project {const p=normalizeNotebook(project);section(p,to);const page=p.pages.find(page=>page.id===id);if(!page)throw Error('That page no longer exists.');const pages=p.pages.filter(page=>page.id!==id);let insert=pages.length;for(let i=pages.length-1;i>=0;i--)if(pages[i].sectionId===to){insert=i+1;break;}pages.splice(insert,0,{...page,sectionId:to});return normalizeNotebook({...p,pages});}
export function reorderPage(project:Project,id:string,direction:-1|1):Project {const p=normalizeNotebook(project),page=p.pages.find(page=>page.id===id);if(!page)return p;const group=p.pages.filter(q=>q.sectionId===page.sectionId),target=group[group.findIndex(q=>q.id===id)+direction];if(!target)return p;const pages=[...p.pages],a=pages.findIndex(q=>q.id===id),b=pages.findIndex(q=>q.id===target.id);[pages[a],pages[b]]=[pages[b],pages[a]];return{...p,pages};}
export function duplicatePage(project:Project,id:string):Project {const p=normalizeNotebook(project);if(p.pages.length>=100)throw Error('This notebook has reached its 100 page limit.');const at=p.pages.findIndex(q=>q.id===id);if(at<0)throw Error('That page no longer exists.');const copy=structuredClone(p.pages[at]);copy.id=uid();copy.title=`${copy.title} copy`.slice(0,150);const pages=[...p.pages];pages.splice(at+1,0,copy);return{...p,pages};}
export function removePage(project:Project,id:string):Project {if(project.pages.length<=1)throw Error('Keep at least one page in a notebook.');return{...project,pages:project.pages.filter(p=>p.id!==id)};}
export function findPages(project:Project,query:string){const q=query.trim().toLocaleLowerCase();return normalizeNotebook(project).pages.filter(p=>!q||p.title!.toLocaleLowerCase().includes(q)||p.objects.some(o=>o.kind==='text'&&o.text.toLocaleLowerCase().includes(q)));}
