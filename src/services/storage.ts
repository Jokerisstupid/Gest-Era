import { openDB, type DBSchema } from 'idb';
import { z } from 'zod';
import { newPage, uid, type Project } from '../types';
import { normalizeNotebook,sectionColors } from '../engine/notebooks';
interface Schema extends DBSchema {
    projects: {
        key: string;
        value: Project;
    };
}
const db = () => openDB<Schema>('gestera', 1, { upgrade(database) { database.createObjectStore('projects', { keyPath: 'id' }); } });
export const repository = {
    async list() { return (await (await db()).getAll('projects')).map(normalizeNotebook).sort((a, b) => b.updatedAt - a.updatedAt); },
    async get(id: string) { const p=await (await db()).get('projects', id);return p?normalizeNotebook(p):undefined; },
    async save(project: Project) { await (await db()).put('projects', normalizeNotebook(project)); },
    async create(name = 'Untitled notebook', background: Parameters<typeof newPage>[0] = 'dots') { const now = Date.now(),sectionId=uid(); const p: Project = { id: uid(), name, sections:[{id:sectionId,name:'Notes',color:sectionColors[0]}],pages: [newPage(background,sectionId,'Page 1')], schemaVersion: 2, createdAt: now, updatedAt: now, favorite: false, accent: ['blue', 'teal', 'violet', 'amber'][Math.floor(Math.random() * 4)] }; await this.save(p); return p; },
    async delete(id: string) { await (await db()).delete('projects', id); },
    async duplicate(project: Project) { const copy = structuredClone(project); copy.id = uid(); copy.name += ' (copy)'; copy.createdAt = copy.updatedAt = Date.now(); await this.save(copy); return copy; },
    async clear() { await (await db()).clear('projects'); },
};
const base = { id: z.string().min(1).max(100), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), width: z.number().min(.1).max(100), createdAt: z.number().finite() };
const num = z.number().finite().min(-1e6).max(1e6);
const object = z.discriminatedUnion('kind', [
    z.object({ ...base, kind: z.literal('stroke'), tool: z.enum(['pen', 'highlighter']), points: z.array(z.object({ x: num, y: num, t: z.number().finite(), pressure: z.number().optional() })).min(1).max(100000) }),
    z.object({ ...base, kind: z.literal('shape'), shape: z.enum(['rectangle', 'ellipse', 'line', 'arrow', 'triangle']), x: num, y: num, w: num, h: num, vertices: z.array(z.object({x:num,y:num})).min(3).max(4).optional() }),
    z.object({ ...base, kind: z.literal('text'), x: num, y: num, text: z.string().max(10000), fontSize: z.number().min(8).max(200) }),
]);
export const projectSchema = z.object({ id: z.string().min(1), name: z.string().min(1).max(150), schemaVersion: z.union([z.literal(1),z.literal(2)]), createdAt: z.number().finite(), updatedAt: z.number().finite(), favorite: z.boolean(), accent: z.string().max(20), sections:z.array(z.object({id:z.string().min(1).max(100),name:z.string().min(1).max(80),color:z.string().regex(/^#[0-9a-fA-F]{6}$/)})).min(1).max(50).optional(), pages: z.array(z.object({ id: z.string().min(1).max(100),title:z.string().min(1).max(150).optional(),sectionId:z.string().min(1).max(100).optional(), background: z.enum(['blank', 'grid', 'ruled', 'dots']), objects: z.array(object).max(50000) })).min(1).max(100) }).superRefine((p,ctx)=>{if(p.schemaVersion===2&&!p.sections)ctx.addIssue({code:'custom',message:'Notebook sections are required.'});if(new Set(p.pages.map(page=>page.id)).size!==p.pages.length)ctx.addIssue({code:'custom',message:'Page identifiers must be unique.'});if(p.sections){const ids=new Set(p.sections.map(s=>s.id));if(ids.size!==p.sections.length||p.pages.some(page=>page.sectionId&&!ids.has(page.sectionId)))ctx.addIssue({code:'custom',message:'Invalid section references.'});}});
export async function importProject(file: File) { if (file.size > 15 * 1024 * 1024)
    throw new Error('Please choose a notebook smaller than 15 MB.'); const p = normalizeNotebook(projectSchema.parse(JSON.parse(await file.text()))); p.id = uid(); p.updatedAt = Date.now(); await repository.save(p); return p; }
