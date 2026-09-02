import type { RunParams, HourWx } from './types.js';
import { plumeRise } from './briggs.js';

/* ย้ายมาจาก smoke-plume-studio-lasted.html บรรทัด 441-478 (prep)
   พร้อมค่าคงที่บรรทัด 413-415, 417 ซึ่ง prep เป็นผู้ใช้เพียงรายเดียว */

var HEAT = 18e6;        // J/kg ค่าความร้อนชีวมวลแห้ง
var CONV = 0.35;        // สัดส่วนความร้อนที่ยกตัวเป็นพลูม
var SMOLD_HEAT = 0.06;  // แรงยกตัวที่เหลือของควันช่วงคุกรุ่น
var STABP: Record<string, number> = {A:0.07,B:0.07,C:0.10,D:0.15,E:0.35,F:0.55};

/** ชุดต้นกำเนิดของหนึ่งชั่วโมง — ใช้ทั้งโหมด gaussian และ puff */
export function prep(P: RunParams, H: HourWx, hi: number) {
  var st = H.stab, u10 = Math.max(H.ws, 0.3), L = Math.max(H.mix, 40);
  var w = P.weights[hi], dt = H.dt;             // dt = วินาที
  var groups = [], capped = false, Hfl = 0, Hsm = 0;
  var qFl = 0, qSm = 0, uFl = u10, uSm = u10, sy0max = 0;
  for(var fi=0; fi<P.fires.length; fi++){
    var fr = P.fires[fi];
    var Gh = fr.totalG*w;                        // กรัมที่ปล่อยในชั่วโมงนี้
    if(Gh <= 0 || dt <= 0) continue;
    var Q = Gh/dt;
    var QH = fr.fuelKg*w*HEAT*CONV/dt;
    var sm = Math.min(0.95, fr.smold + 0.5*P.progress[hi]);
    var parts = [{fr:1-sm, qh:QH*(1-sm)}, {fr:sm, qh:QH*sm*SMOLD_HEAT}];
    var layers = [];
    for(var li=0; li<parts.length; li++){
      if(parts[li].fr <= 0.001) continue;
      var h = plumeRise(parts[li].qh, u10, st);
      if(h > 0.9*L){ h = 0.9*L; capped = true; }
      layers.push({
        q: Q*parts[li].fr/fr.pts.length,
        H: h,
        u: Math.max(u10*Math.pow(Math.max(h,10)/10, STABP[st]), 0.4)
      });
      var uu = layers[layers.length-1].u;
      if(li===0){ qFl += Q*parts[li].fr; if(h>Hfl){ Hfl = h; uFl = uu; } }
      else      { qSm += Q*parts[li].fr; if(h>Hsm){ Hsm = h; uSm = uu; } }
    }
    if(fr.side/4.3 > sy0max) sy0max = fr.side/4.3;
    groups.push({pts: fr.pts, layers: layers, sy0: fr.side/4.3});
  }
  var th = (270 - H.wdir)*Math.PI/180;
  var ux = Math.cos(th), uy = Math.sin(th);
  var lam = (P.depo && H.precip > 0.05) ? 1e-4*Math.pow(H.precip, 0.7) : 0;  // washout 1/s
  return {groups:groups, ux:ux, uy:uy, vx:-uy, vy:ux, st:st, L:L,
          tf:Math.pow(10/P.avg, 0.2), lam:lam, depo:P.depo,
          capped:capped, Hfl:Hfl, Hsm:Hsm,
          qFl:qFl, qSm:qSm, uFl:uFl, uSm:uSm, sy0:sy0max};
}

export type Prepared = ReturnType<typeof prep>;
