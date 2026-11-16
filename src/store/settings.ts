import { useSyncExternalStore } from 'react';
import { validCalibration } from '../engine/gestures/calibration';
import type { Settings } from '../types';
const defaults: Settings = { guardCommands:true, eraserMode:'stroke', eraserRadius:24, dominantHand: 'Right', mirror: true, smoothing: .55, smoothness: 'balanced', swapHands: false, shapeSnap: true, region: .16, reducedMotion: false, highContrast: false, defaultBackground: 'dots' };
let saved: Partial<Settings> = {};
try {
    const data = JSON.parse(localStorage.getItem('gestera-settings') || '{}') as Partial<Settings>;
    saved = {calibration:validCalibration(data.calibration)?data.calibration:undefined,guardCommands:data.guardCommands!==false,eraserMode:data.eraserMode==='object'?'object':'stroke',eraserRadius:typeof data.eraserRadius==='number'?Math.max(8,Math.min(48,data.eraserRadius)):24, dominantHand: data.dominantHand === 'Left' ? 'Left' : 'Right', mirror: typeof data.mirror === 'boolean' ? data.mirror : true, smoothing: typeof data.smoothing === 'number' ? Math.max(0, Math.min(1, data.smoothing)) : .55, smoothness: ['precise','balanced','fast'].includes(data.smoothness??'')?data.smoothness:'balanced', swapHands: data.swapHands===true, shapeSnap: data.shapeSnap!==false, region: typeof data.region === 'number' ? Math.max(.05, Math.min(.3, data.region)) : .16, reducedMotion: data.reducedMotion === true, highContrast: data.highContrast === true, defaultBackground: ['blank', 'grid', 'dots', 'ruled'].includes(data.defaultBackground ?? '') ? data.defaultBackground : 'dots' };
}
catch { /* Defaults remain usable when browser storage is unavailable. */ }
const listeners = new Set<() => void>();
function update(partial: Partial<Settings>) { state = { ...state, ...partial }; try {
    localStorage.setItem('gestera-settings', JSON.stringify(state));
}
catch { /* Drawing remains usable without persisted preferences. */ } listeners.forEach(fn => fn()); }
let state = { ...defaults, ...saved, update };
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function useSettings() { return useSyncExternalStore(subscribe, () => state); }
