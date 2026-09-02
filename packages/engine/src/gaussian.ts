import type { RunParams, RunResult, RunHooks } from './types.js';
import { sigmas } from './briggs.js';
import { prep, type Prepared } from './sources.js';

/* ย้ายมาจาก smoke-plume-studio-lasted.html บรรทัด 480-517 (concAt) และ 519-587 (run)
   พร้อมค่าคงที่บรรทัด 416 ซึ่ง concAt เป็นผู้ใช้เพียงรายเดียว

   run() เปลี่ยนชื่อเป็น runGauss และ **ตัดบรรทัด 520 ออก**
     if(P.model === 'puff') return runPuff(P);
   การ dispatch ย้ายไป index.ts เพื่อตัด cycle gaussian <-> puff
   พฤติกรรมเหมือนเดิมทุกกรณี */

var VD = 0.004;   // m/s ความเร็วตกสะสมแห้งของ PM2.5

export function concAt(C: Prepared, px: number, py: number): number {
  var c = 0, G = C.groups;
  for(var gi=0; gi<G.length; gi++){
    var g = G[gi], pts = g.pts, sy0 = g.sy0, Ls = g.layers;
    for(var k=0; k<pts.length; k++){
      var dx = px-pts[k][0], dy = py-pts[k][1];
      var x = dx*C.ux + dy*C.uy;
      if(x <= 1) continue;
      var y = dx*C.vx + dy*C.vy;
      var s = sigmas(x, C.st);
      var sy = Math.sqrt(s[0]*s[0] + sy0*sy0), sz = s[1];
      if(sz < 0.1) continue;
      var lat = Math.exp(-(y*y)/(2*sy*sy));
      if(lat < 1e-7) continue;
      for(var li=0; li<Ls.length; li++){
        var Ly = Ls[li], val;
        if(sz > 1.6*C.L){
          val = Ly.q/(Math.sqrt(2*Math.PI)*sy*Ly.u*C.L)*lat;
        }else{
          var v = 0;
          for(var n=-2; n<=2; n++){
            var a = (-Ly.H + 2*n*C.L)/sz, b = (Ly.H + 2*n*C.L)/sz;
            v += Math.exp(-0.5*a*a) + Math.exp(-0.5*b*b);
          }
          val = Ly.q/(2*Math.PI*Ly.u*sy*sz)*lat*v;
        }
        if(C.depo){
          var tt = x/Ly.u;
          var hef = Math.max(Ly.H, 1.25*sz, 20);
          val *= Math.exp(-VD*tt/hef);          // ตกสะสมแห้ง
          if(C.lam > 0) val *= Math.exp(-C.lam*tt);  // ฝนชะ
        }
        c += val;
      }
    }
  }
  return c*1e6*C.tf;
}

/** โหมดพื้นราบ — เดิมชื่อ run() */
export function runGauss(P: RunParams, hooks?: RunHooks): RunResult {
  var N = P.grid.N, R = P.grid.R, cx = P.grid.cx, cy = P.grid.cy;
  var cell = 2*R/N, nH = P.hours.length, K = N*N;
  var maxG = new Float32Array(K), doseG = new Float32Array(K);
  var grids = [], recPerHour = [];
  var nR = P.receptors.length;
  var recMax = new Float64Array(nR), recDose = new Float64Array(nR);
  var perHour = [];

  for(var h=0; h<nH; h++){
    var Hd = P.hours[h];
    var C = prep(P, Hd, h);
    var hrs = Hd.dt/3600;
    var hourMax = 0, hourMaxD = 0;
    var g = new Float32Array(K);

    for(var j=0; j<N; j++){
      var py = cy + R - (j+0.5)*cell;
      var base = j*N;
      for(var i=0; i<N; i++){
        var px = cx - R + (i+0.5)*cell;
        var v = concAt(C, px, py);
        g[base+i] = v;
        if(v > maxG[base+i]) maxG[base+i] = v;
        doseG[base+i] += v*hrs;
        if(v > hourMax){ hourMax = v; hourMaxD = Math.hypot(px, py); }
      }
    }
    grids.push(g);

    var rv = new Array(nR);
    for(var r=0; r<nR; r++){
      var val = concAt(C, P.receptors[r][0], P.receptors[r][1]);
      rv[r] = val;
      if(val > recMax[r]) recMax[r] = val;
      recDose[r] += val*hrs;
    }
    recPerHour.push(rv);

    perHour.push({t:Hd.t, ws:Hd.ws, wdir:Hd.wdir, stab:Hd.stab, mix:Hd.mix,
                  precip:Hd.precip, temp:Hd.temp, rh:Hd.rh,
                  max:hourMax, maxDist:hourMaxD, Hfl:C.Hfl, Hsm:C.Hsm,
                  qFl:C.qFl, qSm:C.qSm, uFl:C.uFl, uSm:C.uSm, sy0:C.sy0, tf:C.tf,
                  capped:C.capped, share:P.weights[h]});
    hooks?.onProgress?.(h+1, nH);
  }

  // ทิศลมเฉลี่ยตลอดการเผา
  var ux = 0, uy = 0;
  for(var q=0; q<nH; q++){
    var th = (270 - P.hours[q].wdir)*Math.PI/180;
    ux += Math.cos(th); uy += Math.sin(th);
  }
  var un = Math.hypot(ux,uy) || 1; ux /= un; uy /= un;

  var doseAvg = new Float32Array(K);
  for(var z=0; z<K; z++) doseAvg[z] = doseG[z]/24;

  var totG = 0, totFuel = 0;
  for(var fx=0; fx<P.fires.length; fx++){ totG += P.fires[fx].totalG; totFuel += P.fires[fx].fuelKg; }

  return {
    grids: grids, maxGrid: maxG, doseGrid: doseAvg,
    N:N, cell:cell, cx:cx, cy:cy, R:R,
    meanUx: ux, meanUy: uy, perHour: perHour,
    recPerHour: recPerHour, recMax: Array.from(recMax), recDose: Array.from(recDose),
    totalEmitKg: totG/1000, totalFuelT: totFuel/1000, reqId: P.reqId
  };
}
