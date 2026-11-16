import { openDB, type DBSchema } from 'idb';
import { z } from 'zod';
import { newPage, uid, type Project } from '../types';
interface Schema extends DBSchema {
    projects: {
        key: string;
        value: Project;
    };
}
const db = () => openDB<Schema>('gestera', 1, { upgrade(database) { database.createObjectStore('projects', { keyPath: 'id' }); } });
export const repository = {
    async list() { return (await (await db()).getAll('projects')).sort((a, b) => b.updatedAt - a.updatedAt); },
    async get(id: string) { return (await db()).get('projects', id); },
    async save(project: Project) { await (await db()).put('projects', project); },
    async create(name = 'Untitled board', background: Parameters<typeof newPage>[0] = 'dots') { const now = Date.now(); const p: Project = { id: uid(), name, pages: [newPage(background)], schemaVersion: 1, createdAt: now, updatedAt: now, favorite: false, accent: ['blue', 'teal', 'violet', 'amber'][Math.floor(Math.random() * 4)] }; await this.save(p); return p; },
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
export const projectSchema = z.object({ id: z.string(), name: z.string().min(1).max(150), schemaVersion: z.literal(1), createdAt: z.number(), updatedAt: z.number(), favorite: z.boolean(), accent: z.string().max(20), pages: z.array(z.object({ id: z.string(), background: z.enum(['blank', 'grid', 'ruled', 'dots']), objects: z.array(object).max(50000) })).min(1).max(100) });
export async function importProject(file: File) { if (file.size > 15 * 1024 * 1024)
    throw new Error('Please choose a board smaller than 15 MB.'); const p = projectSchema.parse(JSON.parse(await file.text())); p.id = uid(); p.updatedAt = Date.now(); await repository.save(p); return p; }
