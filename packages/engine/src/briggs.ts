import type { Stability } from './types.js';

/* ย้ายมาจาก smoke-plume-studio-lasted.html บรรทัด 419-438 โดยไม่แก้สูตร
   คง var ไว้ตามเดิม การเปลี่ยนเป็น const/let จดไว้ใน BACKLOG */

export function sigmas(x: number, st: Stability): [number, number] {   // Briggs open-country
  var f = 1/Math.sqrt(1+1e-4*x);
  switch(st){
    case 'A': return [0.22*x*f, 0.20*x];
    case 'B': return [0.16*x*f, 0.12*x];
    case 'C': return [0.11*x*f, 0.08*x/Math.sqrt(1+2e-4*x)];
    case 'D': return [0.08*x*f, 0.06*x/Math.sqrt(1+1.5e-3*x)];
    case 'E': return [0.06*x*f, 0.03*x/(1+3e-4*x)];
    default : return [0.04*x*f, 0.016*x/(1+3e-4*x)];
  }
}

export function plumeRise(QH: number, u: number, st: Stability): number {   // Briggs buoyant rise
  var F = 8.83e-6*QH;
  if(F <= 0) return 0;
  if(st === 'E' || st === 'F'){
    var s = 9.81/293*(st === 'E' ? 0.02 : 0.035);
    return 2.6*Math.pow(F/(u*s), 1/3);
  }
  return F < 55 ? 21.4*Math.pow(F,0.75)/u : 38.7*Math.pow(F,0.6)/u;
}
