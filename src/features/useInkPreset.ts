import { useCallback, useEffect, useState } from 'react';
import type { Tool } from '../types';

type Preset = {color:string;width:number};
const defaults={pen:{color:'#26324f',width:3},highlighter:{color:'#e6a538',width:6}};
type Presets=typeof defaults;

function readPresets():Presets{
  try{
    const data=JSON.parse(localStorage.getItem('gestera:ink')??'{}');
    const read=(key:keyof Presets):Preset=>{
      const value=data?.[key];
      return value && /^#[0-9a-f]{6}$/i.test(value.color) && Number.isInteger(value.width)
        && value.width>=1 && value.width<=12?{color:value.color,width:value.width}:defaults[key];
    };
    return {pen:read('pen'),highlighter:read('highlighter')};
  }catch{return defaults;}
}
export function useInkPreset(tool:Tool){
  const [presets,setPresets]=useState(readPresets);
  useEffect(()=>{try{localStorage.setItem('gestera:ink',JSON.stringify(presets));}catch{}},[presets]);
  const slot=tool==='highlighter'?'highlighter':'pen';
  const update=useCallback((change:Partial<Preset>)=>{
    setPresets(current=>{
      const next={...current,[slot]:{...current[slot],...change}};
      return next;
    });
  },[slot]);
  return {...presets[slot],setColor:(color:string)=>update({color}),setWidth:(width:number)=>update({width})};
}
