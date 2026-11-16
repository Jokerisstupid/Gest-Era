import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { calibrate,thresholds,validCalibration } from '../src/engine/gestures/calibration';
import { transformStep,transformViewport } from '../src/engine/gestures/transform';
import { FrameGate } from '../src/engine/frameGate';
import { eraseSweep,splitStroke } from '../src/engine/erase';
import { initialEngineState,defaultGestureSettings } from '../src/engine/gestures/types';
import { step } from '../src/engine/gestures/engine';
import { History } from '../src/engine/history';
import type { Point,Stroke } from '../src/types';
describe('personal pinch calibration — synthetic distributions',()=>{
  const sample=(mid:number,noise=.015)=>Array.from({length:32},(_,i)=>mid+Math.sin(i)*noise);
  it('separates measured open and closed ranges and preserves hysteresis',()=>{const r=calibrate(sample(1.2),sample(.24),1);assert.ok(r.profile);assert.ok(validCalibration(r.profile));assert.ok(r.profile.enter>.24);assert.ok(r.profile.exit>r.profile.enter+.07);assert.equal(thresholds(r.profile).enter,r.profile.enter);});
  it('rejects too few, overlapping and highly variable samples',()=>{assert.ok(calibrate([1],[.2]).error);assert.ok(calibrate(sample(.5),sample(.46)).error);assert.ok(calibrate(sample(.8,.35),sample(.3,.25)).error);});
  it('does not trust corrupted saved profiles',()=>{assert.deepEqual(thresholds({enter:NaN} as never),{enter:.3,exit:.5,lead:.6});});
  it('rejects an open pose incorrectly recorded as a closed pinch',()=>{assert.ok(calibrate(sample(1.2),sample(.8)).error);});
});
const p=(x:number,y=0,t=x):Point=>({x,y,t});
const stroke=(points:Point[]):Stroke=>({id:'original',kind:'stroke',tool:'pen',color:'#26324f',width:2,createdAt:0,points});
describe('precise swept eraser',()=>{
  it('cuts the middle of a sparse stroke into two exact surviving fragments',()=>{let i=0;const result=splitStroke(stroke([p(0),p(100)]),p(50),p(50),10,()=>`part-${++i}`);assert.equal(result.length,2);assert.ok(Math.abs(result[0].points.at(-1)!.x-39)<.001);assert.ok(Math.abs(result[1].points[0].x-61)<.001);assert.equal(result[0].id,'original');assert.notEqual(result[1].id,'original');});
  it('does not miss ink between fast eraser samples',()=>{const s=stroke([p(50,-50),p(50,50)]),r=eraseSweep([s],p(0),p(100),5,'stroke',()=> 'new');assert.equal(r.changed,true);assert.equal(r.objects.length,2);});
  it('leaves untouched objects and point arrays unchanged',()=>{const s=stroke([p(0),p(100)]),copy=structuredClone(s),all=[s];assert.equal(eraseSweep(all,p(300),p(400),10,'stroke').objects,all);assert.deepEqual(s,copy);});
  it('supports whole-object mode and one history step for precise erasing',()=>{const s=stroke([p(0),p(100)]);assert.equal(eraseSweep([s],p(50),p(50),10,'object').objects.length,0);const h=new History<Stroke[]>();h.push([s]);const cut=splitStroke(s,p(50),p(50),10,()=> 'fragment');assert.deepEqual(h.undo(cut),[s]);assert.deepEqual(h.redo([s]),cut);});
  it('erases a dot and handles repeated points without non-finite geometry',()=>{assert.equal(splitStroke(stroke([p(10)]),p(10),p(10),4).length,0);const r=splitStroke(stroke([p(0),p(0),p(100)]),p(50),p(50),4,()=> 'fragment');assert.ok(r.every(s=>s.points.every(q=>Number.isFinite(q.x)&&Number.isFinite(q.y))));});
  it('touching the empty middle of a large rectangle does not erase its outline',()=>{const rect={id:'r',kind:'shape' as const,shape:'rectangle' as const,x:0,y:0,w:300,h:200,color:'#26324f',width:2,createdAt:0};assert.equal(eraseSweep([rect],p(150,100),p(150,100),10,'stroke').changed,false);assert.equal(eraseSweep([rect],p(0,100),p(0,100),10,'stroke').changed,true);});
  it('recognizes arrowheads outside the shaft bounds and the body of a text object',()=>{const arrow={id:'a',kind:'shape' as const,shape:'arrow' as const,x:0,y:0,w:200,h:0,color:'#26324f',width:2,createdAt:0};assert.equal(eraseSweep([arrow],p(186,7),p(186,7),2,'stroke').changed,true);const text={id:'t',kind:'text' as const,text:'An example',fontSize:40,x:0,y:100,color:'#26324f',width:2,createdAt:0};assert.equal(eraseSweep([text],p(100,80),p(100,80),4,'stroke').changed,true);});
});
describe('steady two-hand transforms',()=>{
  it('does not zoom or pan on small stationary hand noise',()=>{let state=transformStep(.3,{x:.5,y:.5},0).state;for(let i=1;i<80;i++){const r=transformStep(.3+Math.sin(i)*.003,{x:.5+Math.cos(i)*.002,y:.5},i*50,state);state=r.state;assert.equal(r.scale,1);assert.equal(r.dx,0);assert.equal(r.dy,0);}});
  it('responds cumulatively to intentional spread and translation without drift',()=>{let state=transformStep(.3,{x:.5,y:.5},0).state,scale=1,x=0;for(let i=1;i<=30;i++){const r=transformStep(.45,{x:.6,y:.5},i*50,state);state=r.state;scale*=r.scale;x+=r.dx;}assert.ok(scale>1.4&&scale<1.5);assert.ok(x>.09&&x<.1);});
  it('returns to the session scale after spreading past a viewport zoom limit',()=>{let view={zoom:2,pan:{x:0,y:0}};const anchor={x:700,y:300},size={w:1000,h:600};for(const factor of [2,2.5,2,1.5,1.1,1])view=transformViewport(view,2,{factor,anchor,dx:0,dy:0},size);assert.equal(view.zoom,2);assert.ok(Math.abs(view.pan.x)<1e-8);assert.ok(Math.abs(view.pan.y)<1e-8);});
  it('keeps the world location under a stationary zoom anchor fixed',()=>{const original={zoom:1.2,pan:{x:40,y:-30}},anchor={x:740,y:250},size={w:1000,h:700},next=transformViewport(original,1.2,{factor:1.4,anchor,dx:0,dy:0},size);assert.ok(Math.abs((anchor.x-500-original.pan.x)/original.zoom-(anchor.x-500-next.pan.x)/next.zoom)<1e-8);assert.ok(Math.abs((anchor.y-350-original.pan.y)/original.zoom-(anchor.y-350-next.pan.y)/next.zoom)<1e-8);});
});
describe('asynchronous capture and cleanup',()=>{
  it('processes only one frame in flight and discards late results after stop',async()=>{const gate=new FrameGate();let finish!:(v:number)=>void,count=0;const pending=gate.run(()=>new Promise<number>(r=>finish=r),()=>count++,()=>{});assert.equal(await gate.run(async()=>2,()=>count++,()=>{}),false);gate.stop();finish(1);await pending;assert.equal(count,0);assert.equal(gate.busy,false);});
  it('releases backpressure when a backend rejects',async()=>{const gate=new FrameGate();let errors=0;await gate.run(async()=>{throw Error('test')},()=>{},()=>errors++);assert.equal(errors,1);assert.equal(await gate.run(async()=>1,()=>{},()=>{}),true);});
  it('ships the matching classic-worker SDK namespace',()=>{const source=fs.readFileSync(new URL('../node_modules/@mediapipe/tasks-vision/vision_bundle.js',import.meta.url),'utf8'),context=vm.createContext({self:{},navigator:{userAgent:'Synthetic test'}});vm.runInContext(source,context);assert.equal(typeof context.Vision.FilesetResolver,'function');assert.equal(typeof context.Vision.HandLandmarker,'function');});
});
describe('new real recordings — unlabeled regression, no accuracy claims',()=>{
  for(let i=0;i<3;i++)it(`replays session ${i} with finite cursors and no single-hand undo/redo/swipe`,{skip:!fs.existsSync(new URL(`./fixtures/session-v03-${i}.json`,import.meta.url))},()=>{const recording=JSON.parse(fs.readFileSync(new URL(`./fixtures/session-v03-${i}.json`,import.meta.url),'utf8'));let state=initialEngineState();for(const f of recording.frames){const r=step(f,state,{...defaultGestureSettings,...recording.metadata.settings});state=r.state;if(r.cursor)assert.ok(Number.isFinite(r.cursor.x)&&Number.isFinite(r.cursor.y));if(f.hands.length<2)assert.ok(!r.events.some(e=>['undo','redo','page'].includes(e.type)));}assert.ok(recording.frames.every((f:{label:string})=>f.label==='unlabeled'));});
});
