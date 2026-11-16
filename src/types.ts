export type Tool = 'pen' | 'highlighter' | 'eraser' | 'select' | 'shape' | 'text' | 'laser' | 'hand';
export type Background = 'blank' | 'grid' | 'ruled' | 'dots';
export type Point = {
    x: number;
    y: number;
    t: number;
    pressure?: number;
};
type BaseObject = {
    id: string;
    color: string;
    width: number;
    createdAt: number;
};
export type Stroke = BaseObject & {
    kind: 'stroke';
    tool: 'pen' | 'highlighter';
    points: Point[];
};
export type ShapeObject = BaseObject & {
    kind: 'shape';
    shape: 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'triangle';
    x: number;
    y: number;
    w: number;
    h: number;
    vertices?: {x:number;y:number}[];
};
export type TextObject = BaseObject & {
    kind: 'text';
    x: number;
    y: number;
    text: string;
    fontSize: number;
};
export type BoardObject = Stroke | ShapeObject | TextObject;
export type Page = {
    id: string;
    title?: string;
    sectionId?: string;
    background: Background;
    objects: BoardObject[];
};
export type Project = {
    id: string;
    name: string;
    pages: Page[];
    sections?: NotebookSection[];
    schemaVersion: 1 | 2;
    createdAt: number;
    updatedAt: number;
    favorite: boolean;
    accent: string;
    thumbnail?: string;
};
export type NotebookSection = { id: string; name: string; color: string };
export type Settings = {
    calibration?: import('./engine/gestures/calibration').PinchCalibration;
    guardCommands: boolean;
    eraserMode: 'stroke' | 'object';
    eraserRadius: number;
    dominantHand: 'Left' | 'Right';
    mirror: boolean;
    smoothing: number;
    smoothness: 'precise' | 'balanced' | 'fast';
    swapHands: boolean;
    shapeSnap: boolean;
    region: number;
    reducedMotion: boolean;
    highContrast: boolean;
    defaultBackground: Background;
};
export type AIResult = {
    task: string;
    explanation?: string;
    recognized?: {
        text?: string;
        latex?: string;
        uncertain: {
            span: string;
            alternatives: string[];
            reason: string;
        }[];
    };
    needsConfirmation: boolean;
};
export const uid = () => crypto.randomUUID();
export const newPage = (background: Background = 'dots', sectionId?:string, title='Untitled page'): Page => ({ id: uid(), title, sectionId, background, objects: [] });
