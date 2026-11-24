import {useEffect,useState} from 'react';
export const drills = [
  ['pair','Pair your writing hand','Show your whole hand. Close and open it three times, or tap its number in the preview.'],
  ['aim','Aim the cursor','Extend your index finger and point at the practice area.'],
  ['write','Draw a stroke','Touch thumb to index and move sideways while keeping the fingertips together.'],
  ['dot','Place a dot','Touch thumb to index briefly in one spot, then release.'],
  ['erase','Erase','Extend index and middle fingers together and move them across the paper.'],
  ['select','Choose a tool','Point at the practice target and hold still, or pinch over it.'],
  ['color','Change ink color','Point at the color swatch and hold still or pinch to choose it.'],
  ['highlight','Highlight a line','With the practice highlighter selected, pinch and move across the text.'],
  ['shape','Draw a shape','With the practice shape tool selected, pinch and drag diagonally to size a rectangle.'],
  ['text','Place a text note','Aim at the Text target and pinch or dwell to select it. In your notebook, place the text box and type.'],
  ['move','Move a selection','Pinch an object with Select active, then drag it to a new position.'],
  ['lasso','Lasso a group','With Lasso active, pinch, trace a loop around the group, and release near your starting point.'],
  ['handPan','Pan the canvas','With Pan active, pinch and drag sideways to move the sheet.'],
  ['whole','Erase a whole stroke','With whole-stroke erasing selected, sweep two raised fingers across the stroke.'],
  ['laser','Aim the laser','Point at the practice target with your index finger.'],
  ['right','Swipe right','Open your palm and sweep right to go forward.'],
  ['left','Swipe left','Pause for one second, then sweep your open palm left to go back.'],
  ['thumbRight','Next with your thumb','Fold your fingers and hold just your thumb pointing right.'],
  ['thumbLeft','Previous with your thumb','Relax, then hold just your thumb pointing left.'],
  ['lock','Lock or unlock','Hold only your pinky up for a moment. Lower it before repeating.'],
  ['unlock','Unlock','Lower your pinky, then raise it alone and hold again.'],
  ['second','Pair a second hand','Choose Pair second hand in the camera panel, then pair your other hand.'],
  ['out','Zoom in','Pinch with both hands and move them apart.'],
  ['in','Zoom out','Release, pinch with both hands again and bring them closer together.'],
  ['pan','Pan with two hands','Keep both pinches closed and move both hands sideways together.'],
  ['undo','Undo','Keep your writing hand relaxed. Open the second hand briefly, then hold a fist.'],
  ['redo','Redo','Open the second hand again, then hold two fingers up on that hand.']
] as const;
export type Drill = typeof drills[number][0];

export function HandDemo({id}:{id:Drill}){
  const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  const drag=id==='move'||id==='lasso'||id==='handPan';
  const zoom=id==='out'||id==='in'||id==='pan';
  const pinch=drag||zoom||id==='dot'||id==='write'||id==='highlight'||id==='shape';
  const closed=id==='pair'||id==='second'||id==='undo';
  const thumb=id==='thumbLeft'||id==='thumbRight';
  const point=id==='text'||id==='aim'||id==='select'||id==='color'||id==='laser';
  const peace=id==='whole'||id==='erase'||id==='redo';
  function hand(other:boolean){
    const dx=id==='right'?44:id==='left'?-44:id==='write'||id==='highlight'||id==='shape'||id==='pan'||drag||peace?29:zoom?(id==='out'?1:-1)*(other?18:-18):0;
    const starts=zoom?(other?130:55):91;
    return <g transform={`translate(${starts} 7)`}><g className={id==='lasso'?'demo-loop':id==='shape'?'demo-diagonal':'demo-motion'} style={{'--demo-dx':dx+'px'} as React.CSSProperties}><g transform={`scale(${other||id==='thumbRight'?-1:1} 1)`}>
      <path d="M-19 64 Q-24 49 -17 42 L15 40 Q24 44 20 61 L13 79 L-10 79 Z" fill="#ffc894"/>
      {[-15,-5,5,15,-20].map((x,i)=>{
        const y=i===4?55:47;
        const straight=i===4?`M${x} ${y} Q-32 46 -37 34`:`M${x} ${y} Q${x} 32 ${x+(i-1)*2} ${[14,9,13,23][i]}`;
        const bent=i===4?(thumb?'M-20 55 Q-34 55 -45 55':'M-20 55 Q-28 43 -13 36'):`M${x} ${y} Q${x-3} 28 ${x+1} 42`;
        const end=pinch&&i===0?'M-15 47 Q-13 24 -13 36':closed||thumb||((id==='lock'||id==='unlock')&&i!==3)||(point&&i!==0)||(peace&&i!==0&&i!==1)||(pinch&&i===4)?bent:straight;
        return <path key={i} d={end} fill="none" stroke="#ffc894" strokeWidth="8" strokeLinecap="round">{!reduced&&end!==straight&&<animate attributeName="d" values={[straight,end,end,straight].join(';')} dur={closed?'1s':'2.8s'} repeatCount="indefinite"/>}</path>
      })}
    </g></g></g>
  }
  return <svg className="hand-demo" viewBox="0 0 190 95" role="img" aria-label={drills.find(d=>d[0]===id)?.[1]}>{hand(false)}{zoom&&hand(true)}</svg>;
}
