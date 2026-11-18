import type { FilterState, Smoothness } from './types';
export const filterPresets:Record<Smoothness,{minCutoff:number;beta:number}>={precise:{minCutoff:1.1,beta:.025},balanced:{minCutoff:1.8,beta:.05},fast:{minCutoff:3.4,beta:.09}};
// Derivative is calculated from consecutive raw samples, not the delayed filtered value.
export function filter(value:number,t:number,previous:FilterState|undefined,preset:Smoothness,maxGap=150):FilterState {
  if(!previous||t<=previous.t||t-previous.t>maxGap)return{value,raw:value,derivative:0,t};
  const dt=(t-previous.t)/1000,a=(c:number)=>1/(1+1/(2*Math.PI*c*dt));
  const derivative=previous.derivative+a(1)*((value-previous.raw)/dt-previous.derivative),settings=filterPresets[preset];
  return{value:previous.value+a(settings.minCutoff+settings.beta*Math.abs(derivative))*(value-previous.value),raw:value,derivative,t};
}
