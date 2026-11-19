import type { BoardObject,Picture } from '../types';
import { uid } from '../types';

export function decodePicture(url:string):Promise<HTMLImageElement>{
  const image=new Image();
  return new Promise((resolve,reject)=>{
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(Error('This picture could not be read. Try a PNG or JPEG.'));
    image.src=url;
  });
}
export async function pageImages(objects:BoardObject[],cached=new Map<string,HTMLImageElement>()){
  const urls=new Set(objects.flatMap(o=>o.kind==='picture'?[o.src]:[]));
  const images=new Map<string,HTMLImageElement>();
  await Promise.all([...urls].map(async url=>images.set(url,cached.get(url)??await decodePicture(url))));
  return images;
}
export function fitPicture(pixelWidth:number,pixelHeight:number,fill:boolean){
  const scale=Math.min((fill?1440:1152)/pixelWidth,(fill?900:720)/pixelHeight);
  const w=pixelWidth*scale,h=pixelHeight*scale;
  return {x:(1440-w)/2,y:(900-h)/2,w,h};
}
function picture(canvas:HTMLCanvasElement,name:string,fill:boolean):Picture{
  const src=canvas.toDataURL(fill?'image/jpeg':'image/webp',.88);
  if(src==='data:,')throw Error('This device could not prepare the picture.');
  return {id:uid(),kind:'picture',name:name.slice(0,150),src,color:'#000000',width:1,
    createdAt:Date.now(),...fitPicture(canvas.width,canvas.height,fill)};
}
export async function importPicture(file:File){
  const url=URL.createObjectURL(file);
  try{
    const img=await decodePicture(url),canvas=document.createElement('canvas');
    const scale=Math.min(1,1920/Math.max(img.naturalWidth,img.naturalHeight));
    canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);
    return picture(canvas,file.name,false);
  }finally{URL.revokeObjectURL(url);}
}

interface PdfPage {
  getViewport(options:{scale:number}):{width:number;height:number};
  render(options:{canvasContext:CanvasRenderingContext2D;viewport:{width:number;height:number}}):{promise:Promise<void>};
  cleanup():void;
}
interface PdfLibrary {
  GlobalWorkerOptions:{workerSrc:string};
  getDocument(options:{data:ArrayBuffer;isEvalSupported:false;useSystemFonts:true}):{promise:Promise<{
    numPages:number;getPage(n:number):Promise<PdfPage>;
  }>;destroy():Promise<void>};
}
export async function importPdf(file:File,available:number,onProgress:(page:number,total:number)=>void,signal:AbortSignal){
  const moduleUrl='/pdfjs/pdf.min.mjs';
  const pdf:PdfLibrary=await import(/* @vite-ignore */ moduleUrl);
  pdf.GlobalWorkerOptions.workerSrc='/pdfjs/pdf.worker.min.mjs';
  const task=pdf.getDocument({data:await file.arrayBuffer(),isEvalSupported:false,useSystemFonts:true});
  const slides:Picture[]=[],canvas=document.createElement('canvas');
  try{
    const doc=await task.promise;
    if(doc.numPages>available)throw Error('This PDF has '+doc.numPages+' pages. The notebook has room for '+available+'.');
    let bytes=0;
    for(let n=1;n<=doc.numPages;n++){
      signal.throwIfAborted();onProgress(n,doc.numPages);
      const page=await doc.getPage(n),base=page.getViewport({scale:1});
      const viewport=page.getViewport({scale:Math.min(1800/base.width,1400/base.height)});
      canvas.width=Math.max(1,Math.ceil(viewport.width));canvas.height=Math.max(1,Math.ceil(viewport.height));
      try{await page.render({canvasContext:canvas.getContext('2d')!,viewport}).promise;
        const slide=picture(canvas,file.name.replace(/\.pdf$/i,'').slice(0,136)+' · '+n,true);
        bytes+=slide.src.length;
        if(bytes>64*1024*1024)throw Error('This PDF is too large to store as slides. Import a shorter PDF.');
        slides.push(slide);
      }finally{page.cleanup();}
    }
    return slides;
  }finally{canvas.width=canvas.height=1;await task.destroy();}
}
