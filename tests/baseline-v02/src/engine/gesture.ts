export type Landmark = {
    x: number;
    y: number;
    z?: number;
};
export type Gesture = 'POINT' | 'PINCH' | 'PEACE' | 'OPEN_PALM' | 'FIST' | 'NONE';
const distance = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);
export function classify(landmarks: Landmark[], wasPinching = false): Gesture {
    if (landmarks.length !== 21 || landmarks.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
        return 'NONE';
    const scale = distance(landmarks[0], landmarks[9]);
    if (scale < .025)
        return 'NONE';
    if (distance(landmarks[4], landmarks[8]) / scale < (wasPinching ? .48 : .32))
        return 'PINCH';
    const extended = [8, 12, 16, 20].map(t => distance(landmarks[t], landmarks[0]) > distance(landmarks[t - 2], landmarks[0]) * 1.25);
    if (extended.every(Boolean))
        return 'OPEN_PALM';
    if (extended.every(x => !x))
        return 'FIST';
    if (extended[0] && extended[1] && !extended[2] && !extended[3])
        return 'PEACE';
    if (extended[0] && !extended[1] && !extended[2] && !extended[3])
        return 'POINT';
    return 'NONE';
}
export class GestureStabilizer {
    private last: Gesture = 'NONE';
    private stable: Gesture = 'NONE';
    private count = 0;
    update(g: Gesture) { if (g === this.last)
        this.count++;
    else {
        this.last = g;
        this.count = 1;
    } if (this.count >= 3)
        this.stable = g; return this.stable; }
    reset() { this.last = this.stable = 'NONE'; this.count = 0; }
}
export class OneEuroFilter {
    private value?: number;
    private derivative = 0;
    private time = 0;
    reset() { this.value = undefined; this.derivative = 0; this.time = 0; }
    filter(value: number, time: number, minCutoff = 1.6, beta = .02) { if (this.value === undefined) {
        this.value = value;
        this.time = time;
        return value;
    } const dt = Math.max(.001, (time - this.time) / 1000), alpha = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt)), d = (value - this.value) / dt; this.derivative += alpha(1) * (d - this.derivative); this.value += alpha(minCutoff + beta * Math.abs(this.derivative)) * (value - this.value); this.time = time; return this.value; }
}
