import type { Drill } from './HandDemo';
import type { EngineEvent } from '../engine/gestures/types';

export class PracticeMotion {
  private start?:{x:number;y:number};
  private maxTravel=0;
  private lastTravel=0;
  private spanX=0;
  private spanY=0;
  private panX=0;
  private panY=0;

  accepts(id:Drill,event:EngineEvent,openPalm:boolean){
    if(event.type==='begin'){
      this.start=event.point;
      this.lastTravel=this.spanX=this.spanY=this.maxTravel=0;
      return false;
    }
    if(event.type==='point' && this.start){
      const dx=Math.abs(event.point.x-this.start.x),dy=Math.abs(event.point.y-this.start.y);
      this.lastTravel=Math.hypot(dx,dy);
      this.maxTravel=Math.max(this.maxTravel,this.lastTravel);
      this.spanX=Math.max(this.spanX,dx);this.spanY=Math.max(this.spanY,dy);
      if(event.erase)return (id==='erase'||id==='whole') && this.maxTravel>.015;
      if(id==='shape')return dx>.025 && dy>.025;
      return (id==='write'||id==='highlight'||id==='move'||id==='handPan') && this.maxTravel>.035;
    }
    if(event.type==='end'){
      const dot=this.start && this.maxTravel<.014 && ['pinch released','short pinch dot'].includes(event.reason);
      this.start=undefined;
      return id==='dot' && !!dot || id==='lasso' && event.reason==='pinch released' && this.spanX>.03 && this.spanY>.03 && this.lastTravel<.025;
    }
    if(event.type==='page'){
      const expected=openPalm?(event.direction===1?'right':'left'):(event.direction===1?'thumbRight':'thumbLeft');
      return id===expected;
    }
    if(event.type==='toggle-lock')return id==='lock'||id==='unlock';
    if(event.type==='transform-start'){this.panX=this.panY=0;}
    if(event.type==='transform'){
      this.panX+=event.dx;this.panY+=event.dy;
      return id==='out' && event.factor>1.10 || id==='in' && event.factor<.90 ||
        id==='pan' && Math.hypot(this.panX,this.panY)>.035;
    }
    return id===event.type;
  }
}
