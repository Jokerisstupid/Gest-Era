export interface UITarget {element:HTMLElement;rect:DOMRect;}
export function activeDialog(){return document.activeElement?.closest('dialog[open]')??Array.from(document.querySelectorAll('dialog[open]')).at(-1);}
export function gestureTarget(x:number,y:number):UITarget|undefined {
  const hit=document.elementFromPoint(x,y),dialog=activeDialog();
  if(dialog&&hit&&!dialog.contains(hit))return;
  const element=hit?.closest<HTMLElement>('[data-gesture]');
  if(!element||element.matches(':disabled,[aria-disabled="true"]')||element.closest('[inert],[hidden]'))return;
  const rect=element.getBoundingClientRect();
  if(rect.width<8||rect.height<8)return;
  return{element,rect};
}
export interface DwellState {target?:unknown;lastFrame?:number;since:number;origin:{x:number;y:number};latched:boolean;lastPinch:boolean;cooldown:number;clickOrigin?:{x:number;y:number};}
export const initialDwellState=():DwellState=>({since:0,origin:{x:0,y:0},latched:false,lastPinch:false,cooldown:0});
// Pure timing logic is tested without a browser. DOM lookup and .click() live in the adapter.
export function dwellStep(previous:DwellState,input:{target?:unknown;x:number;y:number;t:number;pinching:boolean;allowDwell:boolean;typingKey?:boolean}){
  const s={...previous,lastFrame:input.t};let click=false;let progress=0;
  // A frozen camera frame is not time spent deliberately hovering.
  if(previous.lastFrame!==undefined && input.t-previous.lastFrame>200){
    s.since=input.t;s.origin={x:input.x,y:input.y};s.lastPinch=input.pinching;
  }
  if(s.clickOrigin&&Math.hypot(input.x-s.clickOrigin.x,input.y-s.clickOrigin.y)>24)s.clickOrigin=undefined;
  if(input.target!==s.target){s.target=input.target;s.since=input.t;s.origin={x:input.x,y:input.y};s.latched=false;}
  if(Math.hypot(input.x-s.origin.x,input.y-s.origin.y)>20){s.since=input.t;s.origin={x:input.x,y:input.y};}
  if(!input.target||input.pinching||!input.allowDwell)s.since=input.t;
  if(input.target&&input.t>=s.cooldown){
    const pinchClick=input.pinching&&!s.lastPinch&&input.target===previous.target;
    progress=input.allowDwell&&!input.pinching&&!s.latched&&!s.clickOrigin?Math.min(1,(input.t-s.since)/800):0;
    if(pinchClick||progress>=1){click=true;s.latched=true;s.clickOrigin={x:input.x,y:input.y};s.cooldown=input.t+(input.typingKey?260:900);progress=0;}
  }
  s.lastPinch=input.pinching;return{state:s,click,progress};
}
