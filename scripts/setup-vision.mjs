import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const target=path.resolve('public/mediapipe');
await fs.mkdir(path.join(target,'wasm'),{recursive:true});
await fs.cp(path.resolve('node_modules/@mediapipe/tasks-vision/wasm'),path.join(target,'wasm'),{recursive:true});
await fs.copyFile(path.resolve('node_modules/@mediapipe/tasks-vision/vision_bundle.js'),path.join(target,'vision_bundle.js'));
const url='https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const model=path.join(target,'hand_landmarker.task');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const expected='fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1';
const existing=await fs.readFile(model).catch(()=>null);
if(existing && digest(existing)===expected){console.log('Local hand tracking assets ready.');process.exit(0);}
const response=await fetch(url,{signal:AbortSignal.timeout(60000)});
if(!response.ok)throw Error(`Model download failed: HTTP ${response.status}`);
const bytes=new Uint8Array(await response.arrayBuffer());
if(digest(bytes)!==expected)throw Error('The hand tracking model did not match the expected download.');
await fs.writeFile(path.join(target,'hand_landmarker.task'),bytes);
console.log(`Hand tracking assets installed (${(bytes.length/1e6).toFixed(1)} MB model).`);
