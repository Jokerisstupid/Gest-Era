import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { step,releaseCutoff } from '../src/engine/gestures/engine';
import { cursorAnchor,extractFeatures } from '../src/engine/gestures/features';
import { physicalSide,selectHands } from '../src/engine/gestures/identity';
import { initialEngineState,defaultGestureSettings,type Hand,type Landmark,type EngineEvent } from '../src/engine/gestures/types';
import { dwellStep,initialDwellState } from '../src/features/gestureUI';
import { recognizeShape } from '../src/engine/gestures/snap';
import { filter } from '../src/engine/gestures/filter';
import { calibrate } from '../src/engine/gestures/calibration';
import { comparison,replay } from '../scripts/replay-gestures';
import type { Recording } from '../scripts/gesture-baseline';
import type { Point,Stroke } from '../src/types';

// All generated poses in this file are SYNTHETIC unit inputs, never accuracy/evaluation data.
function syntheticHand(pose:'open'|'point'|'peace'|'fist'|'pinch'='open',ratio?:number,shift=0,side='Right'):Hand{
  const l:Landmark[]=Array.from({length:21},()=>({x:.5+shift,y:.7,z:0}));l[0]={x:.5+shift,y:.85,z:0};
  [5,9,13,17].forEach((base,i)=>{const x=.4+i*.07+shift,extended=pose==='open'||pose==='pinch'||(pose==='point'&&i===0)||(pose==='peace'&&i<2);l[base]={x,y:.65,z:0};l[base+1]={x,y:.52,z:0};l[base+2]={x:x+(extended?0:.025),y:extended?.42:.64,z:0};l[base+3]={x:x+(extended?0:.02),y:extended?.32:.73,z:0};});
  l[1]={x:.37+shift,y:.78,z:0};l[2]={x:.30+shift,y:.70,z:0};l[3]={x:.25+shift,y:.62,z:0};l[4]={x:.2+shift,y:.55,z:0};
  if(pose==='fist'){l[2]={x:.36+shift,y:.69,z:0};l[3]={x:.42+shift,y:.70,z:0};l[4]={x:.44+shift,y:.75,z:0};}
  const hand={landmarks:l,side,score:.99};if(ratio!==undefined){const palm=extractFeatures(hand)!.palm;l[4]={x:l[8].x+ratio*palm,y:l[8].y,z:0};}return hand;
}
const settings={...defaultGestureSettings,region:.05};
function sequence(ratios:number[]){let state=initialEngineState();const out=[];for(let i=0;i<ratios.length;i++){const o=step({t:i*50,hands:[syntheticHand('pinch',ratios[i])]},state,settings);state=o.state;out.push(o);}return out;}
describe('real camera regression — supplied 541-frame session',{skip:!fs.existsSync(new URL('./fixtures/user-session.json',import.meta.url))},()=>{
  const recording=JSON.parse(fs.readFileSync(new URL('./fixtures/user-session.json',import.meta.url),'utf8')) as Recording;
  it('retains real provenance and reproduces the four old pause toggles',()=>{const result=comparison(recording);assert.equal(result.evidence.frames,541);assert.equal(result.evidence.handFrames,291);assert.equal(result.before.commands.filter(e=>e.type==='pause-toggle').length,4);});
  it('emits zero pause, undo or page actions with only one recorded hand',()=>{const result=replay(recording);assert.equal(result.events.filter(e=>['pause-toggle','undo','page'].includes(e.type)).length,0);assert.equal(result.strokes.length,3);});
  it('has no pen-state-induced jump, bounds onset displacement and trims opening samples',()=>{const result=replay(recording);assert.ok(result.modeSwitchJumps.length>0);assert.ok(Math.max(...result.modeSwitchJumps)<=8);assert.ok(Math.max(...result.confirmationMotion)<=8+1e-8);assert.ok(result.trimmedSamples.some(n=>n>0));assert.ok(result.recoveredStartMs.every(ms=>ms>=0));});
});
describe('intent and continuous cursor — synthetic inputs',()=>{
  it('starts at the first 0.6 crossing after two close frames, without skipped points',()=>{const out=sequence([.8,.57,.42,.28,.25]);const begin=out.at(-1)!.events.find(e=>e.type==='begin');assert.ok(begin?.type==='begin');assert.equal(begin.points[0].t,50);assert.deepEqual(begin.points.map(p=>p.t),[50,100,150,200]);});
  it('releases immediately at the exit threshold and trims the final opening samples',()=>{const out=sequence([.8,.55,.25,.24,.25,.34,.43,.55]);const end=out.at(-1)!.events.find(e=>e.type==='end');assert.ok(end?.type==='end');assert.equal(out.at(-1)!.state.pinching,false);assert.equal(end.trimAfter,200);});
  it('does not enter on a single-frame pinch spike',()=>{const out=sequence([.8,.2,.8]);assert.equal(out.flatMap(o=>o.events).filter(e=>e.type==='begin').length,0);});
  it('keeps the continuous anchor close on either side of enter/exit thresholds',()=>{const h=syntheticHand('pinch',.3);for(const r of [.30,.50]){const a=cursorAnchor(h,r-1e-6),b=cursorAnchor(h,r+1e-6);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)*1440<.01);}});
  it('ends an active stroke on hand loss and does not reconnect a held pinch',()=>{const out=sequence([.8,.2,.2]);let state=out.at(-1)!.state;const lost=step({t:150,hands:[]},state,settings);assert.ok(lost.events.some(e=>e.type==='end'));state=lost.state;for(const t of [200,250,300]){const o=step({t,hands:[syntheticHand('pinch',.2)]},state,settings);state=o.state;assert.ok(!o.events.some(e=>e.type==='begin'));}});
  it('ends and disarms when crossing a toolbar, with no ink until release',()=>{let s=sequence([.8,.2,.2]).at(-1)!.state;let o=step({t:150,hands:[syntheticHand('pinch',.2)]},s,settings,{overUI:true});assert.ok(o.events.some(e=>e.type==='end'));s=o.state;o=step({t:200,hands:[syntheticHand('pinch',.2)]},s,settings);assert.ok(!o.events.some(e=>e.type==='begin'));});
  it('keeps the release requirement through multiple lost frames',()=>{let s=sequence([.8,.2,.2]).at(-1)!.state;for(const t of [150,200,250])s=step({t,hands:[]},s,settings).state;for(const t of [300,350,400]){const o=step({t,hands:[syntheticHand('pinch',.2)]},s,settings);s=o.state;assert.ok(!o.events.some(e=>e.type==='begin'));}});
  it('rejects a tracker teleport mid-stroke rather than connecting it with a stray line',()=>{const s=sequence([.8,.2,.2]).at(-1)!.state;const o=step({t:150,hands:[syntheticHand('pinch',.2,.30)]},s,settings);assert.ok(o.events.some(e=>e.type==='end'));assert.ok(!o.events.some(e=>e.type==='point'||e.type==='begin'));});
  it('peace settles for 100 ms before erasing and releases without leaving ink',()=>{let s=initialEngineState();const all:EngineEvent[]=[];for(let i=0;i<5;i++){const o=step({t:i*50,hands:[syntheticHand(i<4?'peace':'open')]},s,settings);s=o.state;if(i<2)assert.ok(!o.events.some(e=>e.type==='begin'));all.push(...o.events);}assert.ok(all.some(e=>e.type==='begin'&&e.erase));assert.ok(all.some(e=>e.type==='end'));assert.ok(!all.some(e=>e.type==='begin'&&!e.erase));});
  it('does not mutate its previous state',()=>{const previous=initialEngineState(),copy=structuredClone(previous);step({t:0,hands:[syntheticHand()]},previous,settings);assert.deepEqual(previous,copy);});
  it('trims no stable tail and never removes more than two opening samples',()=>{const pts=[.2,.21,.2,.3,.4].map((ratio,i)=>({x:0,y:0,t:i,ratio}));assert.equal(releaseCutoff(pts),2);assert.equal(releaseCutoff(pts.slice(0,3)),undefined);});
});
describe('hand identity and command gates — synthetic inputs',()=>{
  it('one hand always draws, independent of preferred side',()=>{const h=syntheticHand('open',undefined,0,'Left');assert.equal(selectHands({t:0,hands:[h]},undefined,settings).draw,h);});
  it('corrects mirrored inference labels, without confusing CSS mirroring',()=>{const h=syntheticHand();assert.equal(physicalSide(h,false),'Right');assert.equal(physicalSide(h,true),'Left');const l=syntheticHand('open',undefined,.4,'Left');for(const mirror of [false,true])assert.equal(selectHands({t:0,hands:[h,l]},undefined,{...settings,mirror}).draw,h);});
  it('keeps the nearest wrist when detector order and handedness labels change',()=>{const first=selectHands({t:0,hands:[syntheticHand()]},undefined,settings);const draw=syntheticHand('open',undefined,.01,'Left'),other=syntheticHand('open',undefined,.4,'Right');assert.equal(selectHands({t:50,hands:[other,draw]},first.identity,settings).draw,draw);});
  it('can explicitly swap the initial two-hand preference',()=>{const right=syntheticHand(),left=syntheticHand('open',undefined,.4,'Left');assert.equal(selectHands({t:0,hands:[right,left]},undefined,{...settings,swapHands:true}).draw,left);});
  it('never fires holds from one visible open palm or fist',()=>{for(const pose of ['open','fist'] as const){let s=initialEngineState();const events:EngineEvent[]=[];for(let t=0;t<4000;t+=50){const o=step({t,hands:[syntheticHand(pose)]},s,settings);s=o.state;events.push(...o.events);}assert.equal(events.filter(e=>e.type==='undo'||e.type==='page').length,0);}});
  it('requires a stable high-score second hand before one held-fist undo',()=>{let s=initialEngineState();const events:EngineEvent[]=[];for(let t=0;t<2200;t+=50){const o=step({t,hands:[syntheticHand('open'),syntheticHand(t<500?'open':'fist',undefined,.35,'Left')]},s,settings);s=o.state;events.push(...o.events);}assert.equal(events.filter(e=>e.type==='undo').length,1);});
  it('rejects a weak second-hand classification and commands during writing',()=>{for(const weak of [true,false]){let s=initialEngineState();const events:EngineEvent[]=[];for(let t=0;t<1700;t+=50){const other=syntheticHand('fist',undefined,.35,'Left');if(weak)other.score=.65;const o=step({t,hands:[syntheticHand(weak?'open':'pinch',weak?undefined:.2),other]},s,settings);s=o.state;events.push(...o.events);}assert.equal(events.filter(e=>e.type==='undo').length,0);}});
  it('recognizes synthetic angle-based point, peace, palm and fist without distance-ratio fingers',()=>{for(const [pose,expected] of [['point','POINT'],['peace','PEACE'],['open','OPEN_PALM'],['fist','FIST']] as const)assert.equal(extractFeatures(syntheticHand(pose))?.gesture,expected);});
  it('two pinched hands transform without accidentally starting ink',()=>{let s=initialEngineState();const events:EngineEvent[]=[];for(let i=0;i<5;i++){const o=step({t:i*50,hands:[syntheticHand('pinch',.2,-i*.01),syntheticHand('pinch',.2,.35+i*.01,'Left')]},s,settings);s=o.state;events.push(...o.events);}assert.ok(events.some(e=>e.type==='transform'&&e.scale>1));assert.ok(!events.some(e=>e.type==='begin'));});
  it('a second-hand palm swipe changes a page once, and is blocked while writing',()=>{for(const writing of [false,true]){let s=initialEngineState();const events:EngineEvent[]=[];for(let i=0;i<10;i++){const o=step({t:i*50,hands:[syntheticHand(writing?'pinch':'open',writing?.2:undefined),syntheticHand('open',undefined,-.18-i*.04,'Left')]},s,settings);s=o.state;events.push(...o.events);}assert.equal(events.filter(e=>e.type==='page').length,writing?0:1);}});
  it('does not interpret an unarmed resting second-hand fist as Undo',()=>{let state=initialEngineState();for(let t=0;t<3000;t+=50){const o=step({t,hands:[syntheticHand('open'),syntheticHand('fist',undefined,.35,'Left')]},state,settings);state=o.state;assert.ok(!o.events.some(e=>e.type==='undo'||e.type==='redo'));}});
  it('fires one Redo from an armed second-hand peace, then requires an open-palm reset',()=>{let state=initialEngineState();const events:EngineEvent[]=[];for(let t=0;t<3500;t+=50){const o=step({t,hands:[syntheticHand('open'),syntheticHand(t<500?'open':'peace',undefined,.35,'Left')]},state,settings);state=o.state;events.push(...o.events);}assert.equal(events.filter(e=>e.type==='redo').length,1);assert.ok(!events.some(e=>e.type==='begin'&&e.erase));});
  it('keeps a captured two-hand transform active over controls and requires release before ink',()=>{let state=initialEngineState();const hands=[syntheticHand('pinch',.2),syntheticHand('pinch',.2,.35,'Left')];for(let t=0;t<=200;t+=50)state=step({t,hands},state,settings).state;const moving=step({t:250,hands},state,settings,{overUI:true,allowInk:false});assert.equal(moving.state.mode,'transform');assert.ok(moving.events.some(e=>e.type==='transform'));state=moving.state;for(const t of [300,350,400]){const o=step({t,hands:[hands[0]]},state,settings);state=o.state;assert.ok(!o.events.some(e=>e.type==='begin'));}});
  it('uses a valid personal profile for a pinch that default thresholds cannot close',()=>{const calibration=calibrate(Array(32).fill(1.2),Array(32).fill(.36),1).profile;assert.ok(calibration);let state=initialEngineState(),plain=initialEngineState();const events:EngineEvent[]=[],baseline:EngineEvent[]=[];for(const [i,ratio] of [1.2,.85,.6,.4,.39].entries()){const frame={t:i*50,hands:[syntheticHand('pinch',ratio)]};const output=step(frame,state,{...settings,calibration}),old=step(frame,plain,settings);state=output.state;plain=old.state;events.push(...output.events);baseline.push(...old.events);}assert.ok(events.some(e=>e.type==='begin'));assert.ok(!baseline.some(e=>e.type==='begin'));});
});
describe('tracking and destructive intent guards - synthetic poses',()=>{
  it('ignores a brief peace transition instead of erasing nearby ink',()=>{let state=initialEngineState();const events:EngineEvent[]=[];for(const [i,pose]of ['open','peace','peace','open'].entries()){const o=step({t:i*30,hands:[syntheticHand(pose as 'open'|'peace')]},state,settings);state=o.state;events.push(...o.events);}assert.ok(!events.some(e=>e.type==='begin'));});
  it('ends ink for an isolated implausible fingertip jump while the wrist stays still',()=>{const previous=sequence([.8,.2,.2]).at(-1)!.state,h=syntheticHand('pinch',.2);h.landmarks[8]={...h.landmarks[8],x:.9};const o=step({t:150,hands:[h]},previous,settings);assert.ok(o.events.some(e=>e.type==='end'&&e.reason==='fingertip tracking jumped'));assert.ok(!o.events.some(e=>e.type==='begin'||e.type==='point'));assert.equal(o.state.armed,false);});
  it('accepts whole-hand translation rather than imposing a global drawing speed cap',()=>{const previous=sequence([.8,.2,.2]).at(-1)!.state,h=syntheticHand('pinch',.2,.16),o=step({t:150,hands:[h]},previous,settings);assert.ok(o.events.some(e=>e.type==='point'));assert.ok(!o.events.some(e=>e.type==='end'));});
  it('does not immediately hand drawing to the command hand when the drawing hand disappears',()=>{const draw=syntheticHand('open',undefined,0,'Right'),other=syntheticHand('open',undefined,.16,'Left'),first=selectHands({t:0,hands:[draw,other]},undefined,settings);assert.equal(first.draw,draw);const lost=selectHands({t:50,hands:[other]},first.identity,settings);assert.equal(lost.draw,undefined);assert.equal(lost.ambiguous,true);assert.equal(selectHands({t:400,hands:[other]},first.identity,settings).draw,other);});
});
describe('gesture UI timing',()=>{
  it('clicks after 0.8 seconds of dwell, once, with a progress value',()=>{let s=initialDwellState(),clicks=0;const target={};for(let t=0;t<=2000;t+=50){const o=dwellStep(s,{target,x:20,y:20,t,pinching:false,allowDwell:true});s=o.state;if(t===400)assert.equal(o.progress,.5);clicks+=Number(o.click);}assert.equal(clicks,1);});
  it('pinch clicks once, and entering UI while already pinched does not click',()=>{const target={};let s=dwellStep(initialDwellState(),{x:0,y:0,t:0,pinching:true,allowDwell:false}).state;assert.equal(dwellStep(s,{target,x:0,y:0,t:50,pinching:true,allowDwell:false}).click,false);s=dwellStep(s,{target,x:0,y:0,t:100,pinching:false,allowDwell:false}).state;assert.equal(dwellStep(s,{target,x:0,y:0,t:150,pinching:true,allowDwell:false}).click,true);});
  it('does not chain a dwell click into a newly opened confirmation dialog',()=>{const a={},b={};let s=initialDwellState();for(let t=0;t<=800;t+=50)s=dwellStep(s,{target:a,x:20,y:20,t,pinching:false,allowDwell:true}).state;for(let t=850;t<3000;t+=50){const o=dwellStep(s,{target:b,x:20,y:20,t,pinching:false,allowDwell:true});s=o.state;assert.equal(o.click,false);}});
});
describe('timing, rendering geometry and shape fitting — synthetic',()=>{
  it('uses real time deltas and resets the filter across a camera gap',()=>{let f=filter(0,0,undefined,'balanced');f=filter(10,50,f,'balanced');assert.ok(f.value>0&&f.value<10);assert.equal(filter(90,300,f,'balanced').value,90);});
  const stroke=(points:Point[]):Stroke=>({id:'synthetic-shape',kind:'stroke',tool:'pen',color:'#26324f',width:3,createdAt:0,points});
  const path=(vertices:[number,number][])=>vertices.flatMap((a,i)=>i===vertices.length-1?[]:Array.from({length:12},(_,k)=>({x:a[0]+(vertices[i+1][0]-a[0])*k/12,y:a[1]+(vertices[i+1][1]-a[1])*k/12,t:i*12+k}))).concat([{x:vertices.at(-1)![0],y:vertices.at(-1)![1],t:1000}]);
  it('snaps a straight stroke into one line object with the same identity',()=>{const s=stroke(path([[0,0],[200,0]])),fit=recognizeShape(s);assert.equal(fit?.shape,'line');assert.equal(fit?.id,s.id);});
  it('fits a rectangle, ellipse, triangle and arrow',()=>{assert.equal(recognizeShape(stroke(path([[0,0],[200,0],[200,120],[0,120],[0,0]])))?.shape,'rectangle');const ellipse=Array.from({length:81},(_,i)=>({x:100+90*Math.cos(i/80*Math.PI*2),y:100+60*Math.sin(i/80*Math.PI*2),t:i}));assert.equal(recognizeShape(stroke(ellipse))?.shape,'ellipse');assert.equal(recognizeShape(stroke(path([[100,0],[200,150],[0,150],[100,0]])))?.shape,'triangle');assert.equal(recognizeShape(stroke(path([[0,0],[200,0],[160,-35],[200,0],[160,35]])))?.shape,'arrow');});
  it('leaves a complex scribble as handwriting',()=>{assert.equal(recognizeShape(stroke(path([[0,0],[100,50],[20,150],[170,20],[50,70],[200,140]]))),undefined);});
});

describe('cross-device pinch input',()=>{
  for(const fps of [15,30,60,120]){
    it('requires sustained contact and releases immediately at '+fps+' fps',()=>{
      let state=initialEngineState();
      const viewport={width:390,height:844};
      let starts=0;
      for(let i=0;i<Math.ceil(fps/4);i++){
        const t=i*1000/fps;
        const output=step({t,viewport,hands:[syntheticHand('pinch',.2)]},state,settings);
        state=output.state;
        if(t<24)assert.equal(state.pinching,false);
        starts+=output.events.filter(event=>event.type==='begin').length;
      }
      assert.equal(starts,1);
      const release=step({t:350,viewport,hands:[syntheticHand('open')]},state,settings);
      assert.equal(release.events.filter(e=>e.type==='end').length,1);
    });
  }
  it('requires release after rotating the viewport during a stroke',()=>{
    let state=initialEngineState();
    for(const t of [0,40,80])state=step({t,viewport:{width:390,height:844},hands:[syntheticHand('pinch',.2)]},state,settings).state;
    assert.equal(state.mode,'ink');
    const change=step({t:120,viewport:{width:844,height:390},hands:[syntheticHand('pinch',.2)]},state,settings);
    assert.ok(change.events.some(event=>event.type==='end'));
    const held=step({t:160,viewport:{width:844,height:390},hands:[syntheticHand('pinch',.2)]},change.state,settings);
    assert.equal(held.state.mode,'hover');
  });
});

describe('mobile pinch tolerance',()=>{
  it('keeps one Android stroke through a short dropout and near-threshold noise',()=>{
    let state=initialEngineState();
    const record=(t:number,ratio?:number)=>{
      const output=step({t,mobile:true,hands:ratio===undefined?[]:[syntheticHand('pinch',ratio)]},state,settings);
      state=output.state;
      return output.events.map(event=>event.type);
    };
    record(0,.9);
    record(165,.36);
    assert.deepEqual(record(330,.36),['begin']);
    assert.deepEqual(record(412),[]);
    assert.deepEqual(record(500,.36),['point']);
    assert.deepEqual(record(580,.59),['point']);
    assert.deepEqual(record(660,.36),['point']);
    assert.deepEqual(record(740,.85),['end']);
  });

  it('ends the stroke when the hand reappears far from the last point',()=>{
    let state=initialEngineState();
    for(const t of [0,80,145])state=step({t,mobile:true,hands:[syntheticHand('pinch',.24)]},state,settings).state;
    const missing=step({t:200,mobile:true,hands:[]},state,settings);
    const result=step({t:270,mobile:true,hands:[syntheticHand('pinch',.24,.12)]},missing.state,settings);
    assert.deepEqual(result.events.map(event=>event.type),['end']);
  });
});

import {PresenterHands} from '../src/engine/gestures/presenter';
import {presenterRegion,fullFrameHand} from '../src/engine/gesture-crop';
import {pinkyStep,type PinkyHold} from '../src/engine/gestures/board-lock';
import {inkPoints} from '../src/engine/gestures/dot';

describe('paired classroom controls',()=>{
  it('requires explicit selection, ignores a bystander and expires a lost hand',()=>{
    const owner=new PresenterHands(),teacher=syntheticHand(),student=syntheticHand('pinch',.2,-.3);
    assert.equal(owner.follow([teacher,student],1,0).draw,undefined);
    assert.ok(owner.pair('draw',teacher,1,0));
    assert.deepEqual(owner.follow([student,teacher],1,80),{draw:teacher,command:undefined});
    assert.equal(owner.follow([student],1,160).draw,undefined);
    assert.equal(owner.follow([teacher],1,510).draw,undefined);
    assert.equal(owner.paired,false);
  });
  it('requires a fresh selection after an ambiguous crossing',()=>{
    const owner=new PresenterHands(),teacher=syntheticHand();
    owner.pair('draw',teacher,1,0);
    assert.equal(owner.follow([teacher,syntheticHand('open',undefined,.008)],1,80).draw,undefined);
    assert.equal(owner.follow([teacher],1,120).draw,undefined);
  });
  it('gives zoom and commands exclusively to a separately selected hand',()=>{
    const owner=new PresenterHands(),teacher=syntheticHand('pinch',.2),second=syntheticHand('pinch',.2,-.30,'Left');
    owner.pair('draw',teacher,1,0);
    assert.equal(owner.pair('command',teacher,1,10),false);
    assert.ok(owner.pair('command',second,1,10));
    assert.deepEqual(owner.follow([second,teacher],1,70),{draw:teacher,command:second});
    assert.equal(owner.follow([second],1,140).draw,undefined);
  });
  it('maps cropped portrait landmarks back to camera coordinates without changing world measurements',()=>{
    const original=syntheticHand('pinch',.22);
    const small={...original,landmarks:original.landmarks.map(p=>({...p,x:.25+p.x*.38,y:.12+p.y*.38}))};
    const region=presenterRegion(small)!;
    assert.ok(region.size<1 && region.x>=0 && region.y>=0);
    const cropped={...small,worldLandmarks:small.landmarks,landmarks:small.landmarks.map(p=>({...p,x:(p.x-region.x)/region.size,y:(p.y-region.y)/region.size}))};
    const restored=fullFrameHand(cropped,region);
    assert.equal(restored.worldLandmarks,cropped.worldLandmarks);
    for(let i=0;i<21;i++) assert.ok(Math.hypot(restored.landmarks[i].x-small.landmarks[i].x,restored.landmarks[i].y-small.landmarks[i].y)<1e-8);
  });
  it('toggles a held pinky once and requires a deliberate release before unlocking',()=>{
    let state:PinkyHold={fired:false},count=0;
    for(let t=0;t<=3500;t+=70){const next=pinkyStep(state,t<1400||t>=1900,t);state=next.state;if(next.toggle)count++;}
    assert.equal(count,2);
    assert.equal(pinkyStep(pinkyStep({fired:false},true,0).state,true,1100).toggle,false);
  });
  it('uses brief stationary pinches for punctuation while preserving the motion of a line',()=>{
    const p=(x:number,t:number)=>({x,y:50,t});
    assert.deepEqual(inkPoints([p(41,0),p(50,50),p(51,100)],p(50,50),1),[p(50,50)]);
    const line=[p(54,50),p(65,100)];
    assert.deepEqual(inkPoints(line,line[0],1),line);
    const stationary=[.9,.52,.12,.86];
    let state=initialEngineState();const events:EngineEvent[]=[];
    for(const [i,r] of stationary.entries()){
      const out=step({t:i*75,hands:[syntheticHand('pinch',r)],mobile:true,viewport:{width:240,height:480}},state,settings,{allowDot:true});
      events.push(...out.events);state=out.state;
    }
    assert.deepEqual(events.map(e=>e.type),['begin','end']);
  });
  it('accepts the selected presenter palm for slides and keeps the same motion ink-free',()=>{
    let state=initialEngineState();const events:EngineEvent[]=[];
    for(let i=0;i<16;i++){
      const hand=syntheticHand('open',undefined,Math.max(0,i-7)*.033);
      const out=step({t:i*65,pairedRoles:true,hands:[hand],mobile:true},state,settings,{presentation:true});
      events.push(...out.events);state=out.state;
    }
    assert.deepEqual(events,[{type:'page',direction:1}]);
  });
  it('recovers visually closed tips when world depth drifts slightly, and rejects large disagreements',()=>{
    const image=syntheticHand('pinch',.08),world=syntheticHand('pinch',.39);
    assert.ok(extractFeatures({...image,worldLandmarks:world.landmarks})!.pinch<.30);
    assert.ok(extractFeatures({...image,worldLandmarks:syntheticHand('pinch',.8).landmarks})!.pinch>.7);
  });
});

import {paperAxis} from '../src/engine/gestures/reach';
it('gives a short portrait sheet more hand travel and still reaches both toolbar edges',()=>{
  const mapped=Array.from({length:101},(_,i)=>paperAxis(i/100,.46,.69));
  assert.ok(Math.abs(mapped[0])<1e-8 && Math.abs(mapped.at(-1)!-1)<1e-8);
  assert.ok(mapped.filter(v=>v>=.46 && v<=.69).length>=61);
  assert.ok(mapped.every((v,i)=>i===0||v>mapped[i-1]));
  assert.equal(paperAxis(.63,.07,.93),.63);
});
