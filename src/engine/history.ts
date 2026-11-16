export class History<T> {
    private past: T[] = [];
    private future: T[] = [];
    constructor(private limit = 80) { }
    push(value: T) { this.past.push(structuredClone(value)); if (this.past.length > this.limit)
        this.past.shift(); this.future = []; }
    undo(current: T) { const prior = this.past.pop(); if (prior === undefined)
        return; this.future.push(structuredClone(current)); return prior; }
    redo(current: T) { const next = this.future.pop(); if (next === undefined)
        return; this.past.push(structuredClone(current)); return next; }
    get canUndo() { return this.past.length > 0; }
    get canRedo() { return this.future.length > 0; }
}
