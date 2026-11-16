import { uid, type Background, type Project } from '../types';
export const templates: {
    id: string;
    name: string;
    description: string;
    background: Background;
    tag: string;
    accent: string;
}[] = [{ id: 'blank', name: 'Blank canvas', description: 'A fresh start for anything.', background: 'dots', tag: 'MAKE IT YOURS', accent: 'blue' }, { id: 'math', name: 'Math notebook', description: 'Give your thinking some space.', background: 'grid', tag: 'WORK IT OUT', accent: 'violet' }, { id: 'brainstorm', name: 'Brainstorm map', description: 'Connect the dots between ideas.', background: 'dots', tag: 'THINK BIG', accent: 'teal' }, { id: 'lesson', name: 'Lesson canvas', description: 'Turn a topic into an aha moment.', background: 'ruled', tag: 'SHARE KNOWLEDGE', accent: 'amber' }];
export function applyTemplate(project: Project, id: string) { const p = project.pages[0]; const text = (value: string, x: number, y: number, size = 28, color = '#26324f') => p.objects.push({ id: uid(), kind: 'text', text: value, x, y, fontSize: size, color, width: 2, createdAt: Date.now() }); if (id === 'math') {
    text('Let’s work it out.', 130, 140, 40);
    text('Problem', 130, 230, 22, '#697698');
    text('Working', 130, 440, 22, '#697698');
} if (id === 'brainstorm') {
    p.objects.push({ id: uid(), kind: 'shape', shape: 'ellipse', x: 550, y: 350, w: 340, h: 160, color: '#2f6bff', width: 3, createdAt: Date.now() });
    text('The big idea', 610, 440, 30, '#2f6bff');
    ['What if…', 'Make it simpler', 'Explore this', 'Next steps'].forEach((v, i) => { const x = i % 2 ? 1040 : 170, y = i < 2 ? 240 : 650; text(v, x, y, 25, '#447d83'); p.objects.push({ id: uid(), kind: 'shape', shape: 'line', x: i % 2 ? 880 : 390, y: i < 2 ? 365 : 495, w: i % 2 ? 135 : 160, h: i < 2 ? -95 : 100, color: '#9dbec2', width: 2, createdAt: Date.now() }); });
} if (id === 'lesson') {
    text('Today’s big question', 130, 140, 42);
    text('1. Explore the idea', 130, 300, 27, '#6e7191');
    text('2. Try it together', 130, 490, 27, '#6e7191');
    text('3. What did we learn?', 130, 680, 27, '#6e7191');
} return project; }
