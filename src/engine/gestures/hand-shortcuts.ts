import { angle, distance, extractFeatures } from './features';
import { matchPalm, palmOf } from './presenter';
import type { Features, Hand } from './types';

export function fingerCount(hand:Hand,aspect:number){
  const features=extractFeatures(hand,undefined,aspect);
  if(!features || features.gesture==='FIST')return 0;
  const fingers=features.extended.filter(Boolean).length;
  const p=hand.landmarks, dx=p[5].x-p[17].x,dy=(p[5].y-p[17].y)*aspect;
  // A straight thumb resting across the palm should not turn a four into a five.
  const outward=(p[4].x-p[5].x)*dx+(p[4].y-p[5].y)*aspect*dy;
  const thumb=features.thumb && (!fingers || outward>.04*(dx*dx+dy*dy));
  return fingers+Number(thumb);
}

type Palm=NonNullable<ReturnType<typeof palmOf>>;
export class NumberPairing {
  requested=0;
  private palm?:Palm;
  private since=0;
  request(count:number){this.requested=count;this.palm=undefined;}
  observe(hands:Hand[],aspect:number,t:number){
    if(!this.requested)return;
    const matches=hands.filter(h=>fingerCount(h,aspect)===this.requested);
    const hand=matches[0],palm=hand&&palmOf(hand,aspect,t);
    if(matches.length!==1 || !palm || Math.abs(palm.x-.5)>.23 || Math.abs(palm.y-.5)>.30){
      this.palm=undefined;return;
    }
    if(!this.palm || t-this.palm.t>240 || matchPalm(this.palm,hands,aspect,t)?.hand!==hand)this.since=t;
    this.palm=palm;
    if(t-this.since>=800){this.request(0);return palm;}
  }
}

// Pairing measures finger curl independently of the pen/pinch classifier.
export function palmPose(hand:Hand,aspect:number){
  const world=hand.worldLandmarks;
  const points=world?.length===21 && world.every(p=>[p.x,p.y,p.z??0].every(Number.isFinite))
    ?world:hand.landmarks.map(p=>({...p,y:p.y*aspect}));
  if(points.length!==21)return '';
  let folded=0, open=0;
  for(const base of [5,9,13,17]){
    const wrist=points[0],knuckle=points[base],tip=points[base+3];
    const reach=distance(tip,wrist)/Math.max(.00001,distance(knuckle,wrist));
    const bend=angle(knuckle,points[base+1],points[base+2]);
    if(bend<125 && reach<1.55)folded++;
    if(bend>140 && reach>1.42)open++;
  }
  return folded>=3?'FIST':open>=3?'OPEN_PALM':'';
}

export class HandCyclePairing {
  private palm?:Palm;
  private stable='';
  private pending='';
  private since=0;
  private started=0;
  cycles=0;

  reset(){
    this.palm=undefined;
    this.stable=this.pending='';
    this.cycles=0;
  }

  observe(hands:Hand[],aspect:number,t:number){
    if(!hands.length && this.palm && t-this.palm.t<=350){
      this.pending='';
      return;
    }
    let hand=this.palm && matchPalm(this.palm,hands,aspect,t)?.hand;
    if(!hand || t-this.started>10000){
      this.reset();
      const fists=hands.filter(h=>palmPose(h,aspect)==='FIST');
      if(fists.length!==1)return;
      hand=fists[0];
      this.started=t;
    }
    this.palm=palmOf(hand,aspect,t);
    if(!this.palm)return;
    const pose=palmPose(hand,aspect);
    if(pose!=='FIST' && pose!=='OPEN_PALM'){this.pending='';return;}
    if(this.pending!==pose){this.pending=pose;this.since=t;return;}
    if(t-this.since<30 || pose===this.stable)return;
    if(pose==='OPEN_PALM' && this.stable==='FIST')this.cycles++;
    this.stable=pose;
    if(this.cycles===3){const palm=this.palm;this.reset();return palm;}
  }
}

export function thumbDirection(hand:Hand,features:Features,aspect:number,mirror:boolean):0|1|-1 {
  if(!features.thumb || features.extended.some(Boolean) || features.pinch<.55)return 0;
  const p=hand.landmarks,dx=p[4].x-p[2].x,dy=(p[4].y-p[2].y)*aspect;
  const palm=Math.hypot(p[0].x-p[9].x,(p[0].y-p[9].y)*aspect);
  if(Math.abs(dx)<Math.max(.012,palm*.42) || Math.abs(dx)<Math.abs(dy)*1.65)return 0;
  return (mirror?-dx:dx)>0?1:-1;
}
