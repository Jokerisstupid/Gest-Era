import type { BoardObject, Page, Point } from '../types';
export const BOARD_WIDTH = 1440, BOARD_HEIGHT = 900;
export function drawObject(ctx: CanvasRenderingContext2D, o: BoardObject) {
    ctx.save();
    ctx.strokeStyle = o.color;
    ctx.fillStyle = o.color;
    ctx.lineWidth = o.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (o.kind === 'stroke') {
        ctx.globalAlpha = o.tool === 'highlighter' ? .28 : 1;
        ctx.lineWidth = o.tool === 'highlighter' ? o.width * 4 : o.width;
        ctx.beginPath();
        if (o.points.length) {
            ctx.moveTo(o.points[0].x, o.points[0].y);
            for (let i = 1; i < o.points.length - 1; i++) {
                const p = o.points[i], next = o.points[i + 1];
                ctx.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
            }
            const last = o.points.at(-1)!;
            ctx.lineTo(last.x, last.y);
        }
        if (o.points.length === 1) {
            const p = o.points[0];
            ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        else
            ctx.stroke();
    }
    else if (o.kind === 'text') {
        ctx.font = `${o.italic ? "italic " : ""}${o.bold ? "bold " : ""}${o.fontSize}px "Inter", sans-serif`;
        o.text.split('\n').forEach((line, i) => ctx.fillText(line, o.x, o.y + i * o.fontSize * 1.4));
    }
    else {
        ctx.beginPath();
        if (o.vertices?.length) {
            ctx.moveTo(o.vertices[0].x, o.vertices[0].y);
            o.vertices.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
            ctx.closePath();
        }
        else if (o.shape === 'rectangle')
            ctx.rect(o.x, o.y, o.w, o.h);
        else if (o.shape === 'ellipse')
            ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, Math.abs(o.w / 2), Math.abs(o.h / 2), 0, 0, 2 * Math.PI);
        else if (o.shape === 'triangle') {
            ctx.moveTo(o.x + o.w / 2, o.y);
            ctx.lineTo(o.x + o.w, o.y + o.h);
            ctx.lineTo(o.x, o.y + o.h);
            ctx.closePath();
        }
        else {
            ctx.moveTo(o.x, o.y);
            ctx.lineTo(o.x + o.w, o.y + o.h);
            if (o.shape === 'arrow') {
                const a = Math.atan2(o.h, o.w), s = 16;
                ctx.moveTo(o.x + o.w - s * Math.cos(a - .5), o.y + o.h - s * Math.sin(a - .5));
                ctx.lineTo(o.x + o.w, o.y + o.h);
                ctx.lineTo(o.x + o.w - s * Math.cos(a + .5), o.y + o.h - s * Math.sin(a + .5));
            }
        }
        ctx.stroke();
    }
    ctx.restore();
}
export function background(ctx: CanvasRenderingContext2D, page: Page) { ctx.fillStyle = '#f7f8fc'; ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT); ctx.fillStyle = '#ccd3e2'; ctx.strokeStyle = '#e0e5ef'; ctx.lineWidth = 1; if (page.background === 'dots') {
    for (let x = 0; x < BOARD_WIDTH; x += 24)
        for (let y = 0; y < BOARD_HEIGHT; y += 24) {
            ctx.beginPath();
            ctx.arc(x, y, 1, 0, 7);
            ctx.fill();
        }
}
else if (page.background !== 'blank') {
    ctx.beginPath();
    for (let y = 0; y < BOARD_HEIGHT; y += 32) {
        ctx.moveTo(0, y);
        ctx.lineTo(BOARD_WIDTH, y);
    }
    if (page.background === 'grid')
        for (let x = 0; x < BOARD_WIDTH; x += 32) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, BOARD_HEIGHT);
        }
    ctx.stroke();
} }
export function renderPage(page: Page, width = BOARD_WIDTH) { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = width * BOARD_HEIGHT / BOARD_WIDTH; const ctx = canvas.getContext('2d')!; ctx.scale(width / BOARD_WIDTH, width / BOARD_WIDTH); background(ctx, page); page.objects.forEach(o => drawObject(ctx, o)); return canvas; }
export function bounds(o: BoardObject) { if (o.kind === 'stroke') {
    let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
    for(const p of o.points){left=Math.min(left,p.x);top=Math.min(top,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y);}
    return o.points.length?{x:left,y:top,w:right-left,h:bottom-top}:{x:0,y:0,w:0,h:0};
} if (o.kind === 'text')
    return { x: o.x, y: o.y - o.fontSize, w: Math.max(...o.text.split('\n').map(l => l.length)) * o.fontSize * .6, h: o.text.split('\n').length * o.fontSize * 1.4 }; return { x: Math.min(o.x, o.x + o.w), y: Math.min(o.y, o.y + o.h), w: Math.abs(o.w), h: Math.abs(o.h) }; }
function segmentDistance(p: Point, a: Point, b: Point) { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); }
export function hitTest(o: BoardObject, p: Point, tolerance = 10) { const b = bounds(o); if (p.x < b.x - tolerance || p.x > b.x + b.w + tolerance || p.y < b.y - tolerance || p.y > b.y + b.h + tolerance)
    return false;
    if(o.kind==='shape' && (o.shape==='line'||o.shape==='arrow')){
      return segmentDistance(p,{x:o.x,y:o.y,t:0},{x:o.x+o.w,y:o.y+o.h,t:0})<=tolerance+o.width/2;
    }
    if (o.kind === 'stroke')
    return o.points.some((q, i) => segmentDistance(p, q, o.points[Math.max(0, i - 1)]) < tolerance + o.width / 2); return true; }
export function moveObject(o: BoardObject, dx: number, dy: number): BoardObject { return o.kind === 'stroke' ? { ...o, points: o.points.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })) } : { ...o, x: o.x + dx, y: o.y + dy, ...(o.kind==='shape'&&o.vertices?{vertices:o.vertices.map(p=>({x:p.x+dx,y:p.y+dy}))}:{}) }; }
export function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export async function exportPNG(page: Page, name: string) { const canvas = renderPage(page); const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('Image export failed.')))); download(blob, `${name}.png`); }
export async function exportPDF(pages: Page[], name: string) { const { jsPDF } = await import('jspdf'); const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [BOARD_WIDTH, BOARD_HEIGHT] }); pages.forEach((p, i) => { if (i)
    pdf.addPage([BOARD_WIDTH, BOARD_HEIGHT], 'landscape'); pdf.addImage(renderPage(p).toDataURL('image/png'), 'PNG', 0, 0, BOARD_WIDTH, BOARD_HEIGHT); }); pdf.save(`${name}.pdf`); }
