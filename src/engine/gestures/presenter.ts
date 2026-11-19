import type { Hand } from './types';

type Palm = { x:number; y:number; size:number; width:number; side:string; score:number; t:number };
export type HandRole = 'draw' | 'command';
export function palmOf(hand:Hand, aspect:number, t:number):Palm | undefined {
  const p=hand.landmarks;
  if(p.length!==21 || p.some(v=>!Number.isFinite(v.x)||!Number.isFinite(v.y)))return;
  const dist=(a:number,b:number)=>Math.hypot(p[a].x-p[b].x,(p[a].y-p[b].y)*aspect);
  const size=dist(0,9), width=dist(5,17);
  if(size<.018 || width<.009)return;
  return {x:(p[0].x+p[9].x+p[5].x+p[17].x)/4,y:(p[0].y+p[9].y+p[5].y+p[17].y)/4,
    size,width,side:hand.side,score:hand.score,t};
}
function rankPalm(previous:Palm, hands:Hand[], aspect:number,t:number) {
  const dt=t-previous.t;
  if(dt<0 || dt>400)return {ambiguous:false};
  const ranked=hands.flatMap(hand=>{
    const palm=palmOf(hand,aspect,t);
    if(!palm)return [];
    const distance=Math.hypot(palm.x-previous.x,(palm.y-previous.y)*aspect);
    const scale=Math.abs(Math.log(palm.size/previous.size));
    const width=Math.abs(Math.log(palm.width/previous.width));
    const reach=Math.min(.18,previous.size*.48+Math.min(dt,160)*.00065);
    if(distance>reach || scale>.46 || width>.8)return [];
    if(previous.score>.86 && palm.score>.86 && palm.side!==previous.side)return [];
    return [{hand,palm,cost:distance/reach+.7*scale+.25*width}];
  }).sort((a,b)=>a.cost-b.cost);
  const ambiguous=!!ranked[1] && ranked[1].cost-ranked[0].cost<.42;
  return {ambiguous,match:ambiguous?undefined:ranked[0]};
}

export function matchPalm(previous:Palm,hands:Hand[],aspect:number,t:number){
  return rankPalm(previous,hands,aspect,t).match;
}

// Only a physical selection in the live preview can create a presenter track.
export class PresenterHands {
  private draw?:Palm;
  private command?:Palm;
  private others:Palm[]=[];
  clear(){this.draw=this.command=undefined;this.others=[];}
  get paired(){return !!this.draw;}
  get hasCommand(){return !!this.command;}
  pair(role:HandRole, hand:Hand, aspect:number, t:number){
    const palm=palmOf(hand,aspect,t);
    if(!palm)return false;
    if(role==='command' && (!this.draw || matchPalm(this.draw,[hand],aspect,t)))return false;
    if(role==='draw'){this.command=undefined;this.others=[];}
    else this.others=this.others.filter(other=>!matchPalm(other,[hand],aspect,t));
    this[role]=palm;return true;
  }
  follow(hands:Hand[],aspect:number,t:number){
    if(!this.draw || t-this.draw.t>400){this.clear();return {};}
    const candidates=rankPalm(this.draw,hands,aspect,t);
    if(candidates.ambiguous){this.clear();return {};}
    const draw=candidates.match;
    if(this.command && t-this.command.t>400)this.command=undefined;
    const second=this.command && rankPalm(this.command,hands,aspect,t);
    if(second?.ambiguous)this.command=undefined;
    let command=second?.match;
    if(draw && draw.hand===command?.hand){this.clear();return {};}
    if(!draw)return {};
    // A previously ignored hand moving into the presenter's path is still a bystander.
    for(const other of this.others){
      const rival=rankPalm(other,[draw.hand],aspect,t).match;
      if(rival && rival.cost<=draw.cost+.10){this.clear();return {};}
      if(command){const otherMatch=rankPalm(other,[command.hand],aspect,t).match;
        if(otherMatch && otherMatch.cost<=command.cost+.10){this.command=undefined;command=undefined;}
      }
    }
    this.others=hands.filter(h=>h!==draw.hand && h!==command?.hand).flatMap(h=>palmOf(h,aspect,t)??[]);
    this.draw=draw.palm;
    if(command)this.command=command.palm;
    return {draw:draw.hand,command:command?.hand};
  }
}
