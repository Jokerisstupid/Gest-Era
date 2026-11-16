// Frozen v0.1 behavior. Do not tune: this is the before comparison, not the active engine.
import { classify, GestureStabilizer, OneEuroFilter } from '../src/engine/gesture';
import type { Point } from '../src/types';
import type { Frame,GestureSettings } from '../src/engine/gestures/types';
export type Recording = {source:string;metadata?:{settings?:Partial<GestureSettings>};frames:(Frame&{label?:string})[]};
export function replayBaseline(recording:Recording){
  const stable=new GestureStabilizer(),fx=new OneEuroFilter(),fy=new OneEuroFilter();
  let down=false,paused=false,lost=0,lastAction=0,held='',heldSince=0,skipped=0,current:Point[]=[];
  const actions:{type:string;t:number}[]=[],strokes:Point[][]=[],jumps:number[]=[];
  const release=()=>{if(down){if(current.length)strokes.push(current);current=[];down=false;}stable.reset();};
  for(const f of recording.frames){const now=f.t,draw=f.hands.find(h=>h.side==='Right')??(f.hands.length===1?f.hands[0]:undefined),command=f.hands.find(h=>h!==draw);const raw=draw&&draw.score>.6?classify(draw.landmarks,down):'NONE',g=stable.update(raw),cg=command?classify(command.landmarks):raw;
    const hold=cg==='OPEN_PALM'?'palm':cg==='FIST'?'fist':'';if(hold!==held){held=hold;heldSince=now;}const wait=(command?1:1.7)*(hold==='palm'?600:800);if(hold&&now-heldSince>wait&&now-lastAction>1500){lastAction=now;heldSince=Infinity;release();if(hold==='palm'){paused=!paused;actions.push({type:'pause-toggle',t:now});}else if(!paused)actions.push({type:'undo',t:now});}
    if(paused){release();continue;}if(!draw||raw==='NONE'){if(!lost)lost=now;if(now-lost>180)release();continue;}if(lost){release();lost=0;fx.reset();fy.reset();}
    const l=draw.landmarks,pinching=g==='PINCH',p=pinching?{x:(l[4].x+l[8].x)/2,y:(l[4].y+l[8].y)/2}:l[8],x=(1-p.x-.16)/.68,y=(p.y-.16)/.68;if(x<0||x>1||y<0||y>1){release();continue;}
    const point={x:fx.filter(x*1440,now,1.9),y:fy.filter(y*900,now,1.9),t:now},active=pinching||g==='PEACE';
    if(active&&!down){down=true;skipped=2;current=[point];if(pinching)jumps.push(Math.hypot((l[8].x-p.x)*1440/.68,(l[8].y-p.y)*900/.68));}
    else if(active&&down){if(skipped){skipped--;continue;}current.push(point);}else{if(down)release();}
  }release();return{actions,strokes,jumps};
}
