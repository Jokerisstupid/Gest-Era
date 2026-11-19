import type { Point } from '../../types';

// Collapse a short, stationary contact to the confirmed pinch position.
// The approach frames can move as the thumb travels toward the index finger.
export function inkPoints(points:Point[],contact:Point,scale:number):Point[]{
  const held=points.filter(p=>p.t>=contact.t);
  if(!held.length)return [contact];
  if(held.at(-1)!.t-contact.t>380)return points;
  if(held.every(p=>Math.hypot(p.x-contact.x,p.y-contact.y)*scale<=4))
    return [contact];
  return points;
}
