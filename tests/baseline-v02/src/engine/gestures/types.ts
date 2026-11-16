import type { Point } from '../../types';
import type { Landmark, Gesture } from '../gesture';
export type { Landmark, Gesture };
export interface Hand { landmarks: Landmark[]; worldLandmarks?: Landmark[]; side: string; score: number; }
export interface Frame { t: number; hands: Hand[]; inputMirrored?: boolean; aspect?: number; }
export type Smoothness = 'precise' | 'balanced' | 'fast';
export interface GestureSettings { dominantHand: 'Left'|'Right'; swapHands: boolean; mirror: boolean; region: number; smoothness: Smoothness; }
export const defaultGestureSettings: GestureSettings = {dominantHand:'Right',swapHands:false,mirror:true,region:.16,smoothness:'balanced'};
export interface Features { pinch: number; palm: number; extended: boolean[]; thumb: boolean; gesture: Gesture; }
export interface FilterState { value: number; raw: number; derivative: number; t: number; }
export interface Sample extends Point { ratio: number; }
export interface Identity { wrist: Landmark; velocity: Landmark; t: number; side: string; }
export interface CommandState { ready: number; wrist?: Landmark; lastT: number; fistSince?: number; fired: boolean; cooldown: number; swipe: {x:number;y:number;t:number}[]; }
export interface EngineState {
  t: number; identity?: Identity; identityConfig?: string; features?: Features; commandFeatures?: Features;
  fx?: FilterState; fy?: FilterState; pinching: boolean; closeFrames: number;
  mode: 'hover'|'ink'|'erase'|'transform'; ring: Sample[]; candidate?: number;
  pending: Sample[]; lastRatio?: number; eraseFrames: number; armed: boolean;
  command: CommandState; transform?: {distance:number;midpoint:{x:number;y:number}}; transformReady: number;
}
export interface Cursor {x:number;y:number;t:number;ratio:number;hand:string;gesture:Gesture;eraser:boolean;}
export type EngineEvent =
  | {type:'begin';point:Point;points:Point[];erase:boolean}
  | {type:'point';point:Point;erase:boolean}
  | {type:'end';reason:string;trimAfter?:number}
  | {type:'undo'}
  | {type:'page';direction:-1|1}
  | {type:'transform';scale:number;dx:number;dy:number;anchor:{x:number;y:number}};
export interface Context {paused?:boolean;overUI?:boolean;presentation?:boolean;allowInk?:boolean;}
export interface EngineOutput {state:EngineState;events:EngineEvent[];cursor?:Cursor;gesture:Gesture;status:string;activeHand:string;commandReady:boolean;}
export function initialEngineState():EngineState{return{t:-Infinity,pinching:false,closeFrames:0,mode:'hover',ring:[],pending:[],eraseFrames:0,armed:true,command:{ready:0,lastT:0,fired:false,cooldown:0,swipe:[]},transformReady:0};}
