import type { Drill } from './HandDemo';
import type { EngineEvent } from '../engine/gestures/types';

export class PracticeMotion {
  private start?:{x:number;y:number};
  private maxTravel=0;
  private lastTravel=0;
  private previousOffset={x:0,y:0};
  private twiceArea=0;
  private spanX=0;
  private spanY=0;
  private panX=0;
  private panY=0;

  accepts(id:Drill,event:EngineEvent,openPalm:boolean){
    if(event.type==='begin'){
      this.start=event.point;
      this.previousOffset={x:0,y:0};this.twiceArea=0;
      this.lastTravel=this.spanX=this.spanY=this.maxTravel=0;
      return false;
    }
    if(event.type==='point' && this.start){
      const x=event.point.x-this.start.x,y=event.point.y-this.start.y;
      if(id==='lasso'){
        // Signed polygon area rejects tracing the same diagonal out and back.
        this.twiceArea+=this.previousOffset.x*y-this.previousOffset.y*x;
        this.previousOffset={x,y};
      }
      const dx=Math.abs(x),dy=Math.abs(y);
      this.lastTravel=Math.hypot(dx,dy);
      this.maxTravel=Math.max(this.maxTravel,this.lastTravel);
      this.spanX=Math.max(this.spanX,dx);this.spanY=Math.max(this.spanY,dy);
      if(event.erase)return (id==='erase'||id==='whole') && this.maxTravel>.015;
      if(id==='shape')return dx>.025 && dy>.025;
      return (id==='write'||id==='highlight'||id==='move'||id==='handPan') && this.maxTravel>.035;
    }
    if(event.type==='end'){
      const closedLoop=!!this.start && Math.abs(this.twiceArea)>.32*this.spanX*this.spanY;
      const dot=this.start && this.maxTravel<.014 && ['pinch released','short pinch dot'].includes(event.reason);
      this.start=undefined;
      return id==='dot' && !!dot || id==='lasso' && closedLoop && event.reason==='pinch released' && this.spanX>.03 && this.spanY>.03 && this.lastTravel<.025;
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
