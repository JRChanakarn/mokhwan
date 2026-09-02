import type { RunParams, RunResult } from './types.js';
import { sigmas } from './briggs.js';
import { prep } from './sources.js';
import { windField, makeSampler } from './wind.js';

/* ย้ายมาจาก smoke-plume-studio-lasted.html บรรทัด 691-856 โดยไม่แก้ตรรกะ

   บั๊กตาม HANDOFF-terrain-mode.md ข้อ 1 (ค่าที่พื้นบนภูมิประเทศเกือบเป็นศูนย์) แก้แล้ว
   ที่การคำนวณ σ — ดูคอมเมนต์ตรง xEff · เกณฑ์รับงานอยู่ใน test/terrain.test.ts */

/** โหมดตามภูมิประเทศ — Lagrangian puff บนสนามลมวินิจฉัยจาก DEM */
export function runPuff(P: RunParams): RunResult {
  var N = P.grid.N, R = P.grid.R, cx = P.grid.cx, cy = P.grid.cy;
  var cell = 2*R/N, nH = P.hours.length, K = N*N;
  var Z = P.elev ? new Float32Array(P.elev) : null;
  var sample = makeSampler(null, N, cx, cy, R, cell);
  var maxG = new Float32Array(K), doseG = new Float32Array(K), grids = [];
  var nR = P.receptors.length;
  var recMax = new Float64Array(nR), recDose = new Float64Array(nR), recPerHour = [];
  var perHour = [];
  var zSrc = 0;
  if(Z){
    zSrc = 0;
    var cnt = 0;
    for(var fq=0; fq<P.fires.length; fq++){
      var pp = P.fires[fq].pts[0];
      zSrc += sample(Z, pp[0], pp[1]); cnt++;
    }
    zSrc /= Math.max(1,cnt);
  }
  var DT = 60;                                    // ก้าวเวลา (วินาที)

  for(var h=0; h<nH; h++){
    var Hd = P.hours[h];
    var C = prep(P, Hd, h);
    var WF = windField(Z, N, cell, Hd);
    var L = Math.max(Hd.mix, 40);
    var st = Hd.stab;
    var g = new Float32Array(K);
    var steps = Math.round(Hd.dt/DT);
    var Fr = WF.Fr === undefined ? 99 : WF.Fr;
    var ff = Math.max(0.25, Math.min(1, 0.45 + 0.55*Math.min(1, Fr)));  // พลูมไต่ตามภูมิประเทศแค่ไหน

    // เตรียมชุดต้นกำเนิด (รวมทุกแปลง สองชั้นความสูง)
    var srcs = [];
    for(var gi=0; gi<C.groups.length; gi++){
      var grp = C.groups[gi];
      var mid = [0,0];
      for(var pi=0; pi<grp.pts.length; pi++){ mid[0]+=grp.pts[pi][0]; mid[1]+=grp.pts[pi][1]; }
      mid[0]/=grp.pts.length; mid[1]/=grp.pts.length;
      for(var li=0; li<grp.layers.length; li++){
        var Ly = grp.layers[li];
        srcs.push({x:mid[0], y:mid[1], q:Ly.q*grp.pts.length, H:Ly.H, sy0:grp.sy0});
      }
    }

    var puffs = [];
    var hourMax = 0, hourMaxD = 0;
    var invHour = DT/Hd.dt;

    for(var s2=0; s2<steps; s2++){
      // ปล่อยก้อนควันใหม่
      for(var si=0; si<srcs.length; si++){
        var S0 = srcs[si];
        if(S0.q <= 0) continue;
        puffs.push({x:S0.x, y:S0.y, z:(Z?sample(Z,S0.x,S0.y):0) + S0.H,
                    m:S0.q*DT, d:0, sy0:S0.sy0, t:0});
      }
      // เคลื่อนที่ + สะสมความเข้มข้น
      for(var pi2=puffs.length-1; pi2>=0; pi2--){
        var pf = puffs[pi2];
        var zg = Z ? sample(Z, pf.x, pf.y) : 0;
        var aglNow = Math.max(2, pf.z - zg);
        var wDrain = Math.exp(-aglNow/140);            // ลมชั้นผิวมีผลเฉพาะควันที่อยู่ต่ำ
        var uu = sample(WF.u, pf.x, pf.y) + wDrain*sample(WF.ud, pf.x, pf.y);
        var vv = sample(WF.v, pf.x, pf.y) + wDrain*sample(WF.vd, pf.x, pf.y);
        var sp = Math.hypot(uu, vv);
        if(sp < 0.2){ sp = 0.2; }

        // σ ของ Briggs นิยามด้วยระยะทางท้ายลม x = u·t เดิมใช้ pf.d = ความยาวเส้นทางที่
        // puff เดินเอง ซึ่งหยุดโตเมื่อ puff ชะงักที่ก้นแอ่ง (ลมหลักถูก shelter จนเท่ากับ
        // ลมไหลลงลาดที่ดันสวน วัดได้ cos มุม = -1.00 ลมสุทธิ = 0.00) σz จึงแช่ที่ ~10 ม.
        // แผ่นควันคุกรุ่นค้างที่ 40 ม. เหนือพื้น exp(-½(40/10)²) ≈ 3×10⁻⁴ ฆ่าค่าที่พื้นหมด
        // ทั้งที่เวลาผ่านไปหนึ่งชั่วโมงและความปั่นป่วนไม่ได้หยุดตามลมเฉลี่ย
        //
        // ใช้ระยะเทียบเท่าลมแวดล้อม ws·t เป็นขั้นต่ำ บนพื้นราบ pf.d ≈ ws·t อยู่แล้ว
        // (ต่างกันระดับ 1e-16 จาก hypot ของ u0,v0) max() จึงสลับหยิบค่าที่ต่างกันเล็กน้อย
        // ผลรวมกริดของ puffFlat จึงเลื่อน ~5e-9 เชิงสัมพัทธ์ ส่วนพีค รายชั่วโมง จุดรับ
        // เท่าเดิมทุกบิต — golden ของ puffFlat จึงถูกบันทึกใหม่พร้อมกับ puffTerrain
        var xEff = Math.max(pf.d, Hd.ws*pf.t, 12);
        var sg = sigmas(xEff, st);
        var sy = Math.sqrt(sg[0]*sg[0] + pf.sy0*pf.sy0);
        var sz = Math.min(sg[1], L/1.25);
        if(sz < 1) sz = 1;
        var agl = Math.max(2, Math.min(pf.z - zg, L*1.05));

        // ฝากความเข้มข้นลงกริด
        var rad = 2.2*sy;
        var i0 = Math.max(0, Math.floor((pf.x - rad - (cx-R))/cell));
        var i1 = Math.min(N-1, Math.ceil((pf.x + rad - (cx-R))/cell));
        var j0 = Math.max(0, Math.floor(((cy+R) - pf.y - rad)/cell));
        var j1 = Math.min(N-1, Math.ceil(((cy+R) - pf.y + rad)/cell));
        if(i1 >= i0 && j1 >= j0 && (i1-i0) < 260 && (j1-j0) < 260){
          var vert = 0;
          for(var nn=-1; nn<=1; nn++){
            var aa = (agl + 2*nn*L)/sz;
            vert += Math.exp(-0.5*aa*aa);
          }
          vert *= 2;
          var norm = pf.m/(Math.pow(2*Math.PI, 1.5)*sy*sy*sz)*vert*1e6*C.tf*invHour;
          if(C.depo){
            var tt = pf.t;
            var hef = Math.max(agl, 1.25*sz, 20);
            norm *= Math.exp(-0.004*tt/hef);
            if(C.lam > 0) norm *= Math.exp(-C.lam*tt);
          }
          if(norm > 1e-4){
            for(var jj=j0; jj<=j1; jj++){
              var py2 = cy + R - (jj+0.5)*cell;
              var dy2 = py2 - pf.y;
              var ey = Math.exp(-(dy2*dy2)/(2*sy*sy));
              if(ey < 1e-4) continue;
              for(var ii=i0; ii<=i1; ii++){
                var px2 = cx - R + (ii+0.5)*cell;
                var dx2 = px2 - pf.x;
                var val = norm*ey*Math.exp(-(dx2*dx2)/(2*sy*sy));
                if(val < 1e-4) continue;
                g[jj*N+ii] += val;
              }
            }
          }
        }
        // ก้าวถัดไป
        var nx2 = pf.x + uu*DT, ny2 = pf.y + vv*DT;
        var zgN = Z ? sample(Z, nx2, ny2) : 0;
        pf.z += ff*(zgN - zg);
        if(pf.z - zgN > L) pf.z = zgN + L;
        pf.x = nx2; pf.y = ny2;
        pf.d += sp*DT; pf.t += DT;
        if(pf.x < cx-R-2000 || pf.x > cx+R+2000 || pf.y < cy-R-2000 || pf.y > cy+R+2000 || pf.t > 14400)
          puffs.splice(pi2, 1);
      }
    }

    for(var k3=0;k3<K;k3++){
      var vg = g[k3];
      if(vg > maxG[k3]) maxG[k3] = vg;
      doseG[k3] += vg*(Hd.dt/3600);
    }
    for(var jm=0;jm<N;jm++) for(var im=0;im<N;im++){
      var vv2 = g[jm*N+im];
      if(vv2 > hourMax){ hourMax = vv2; hourMaxD = Math.hypot(cx-R+(im+0.5)*cell, cy+R-(jm+0.5)*cell); }
    }
    grids.push(g);

    var rv = new Array(nR);
    for(var r2=0;r2<nR;r2++){
      var rx = P.receptors[r2][0], ry = P.receptors[r2][1];
      var val2 = sample(g, rx, ry);
      rv[r2] = val2;
      if(val2 > recMax[r2]) recMax[r2] = val2;
      recDose[r2] += val2*(Hd.dt/3600);
    }
    recPerHour.push(rv);
    perHour.push({t:Hd.t, ws:Hd.ws, wdir:Hd.wdir, stab:Hd.stab, mix:Hd.mix,
                  precip:Hd.precip, temp:Hd.temp, rh:Hd.rh,
                  max:hourMax, maxDist:hourMaxD, Hfl:C.Hfl, Hsm:C.Hsm,
                  qFl:C.qFl, qSm:C.qSm, uFl:C.uFl, uSm:C.uSm, sy0:C.sy0, tf:C.tf,
                  capped:C.capped, share:P.weights[h],
                  Fr:Fr, relief:WF.relief, terrain:!!Z});
  }

  var ux = 0, uy = 0;
  for(var qq=0; qq<nH; qq++){
    var th2 = (270 - P.hours[qq].wdir)*Math.PI/180;
    ux += Math.cos(th2); uy += Math.sin(th2);
  }
  var un = Math.hypot(ux,uy) || 1; ux /= un; uy /= un;
  var doseAvg = new Float32Array(K);
  for(var z2=0; z2<K; z2++) doseAvg[z2] = doseG[z2]/24;
  var totG = 0, totFuel = 0;
  for(var fx2=0; fx2<P.fires.length; fx2++){ totG += P.fires[fx2].totalG; totFuel += P.fires[fx2].fuelKg; }

  return {grids:grids, maxGrid:maxG, doseGrid:doseAvg, N:N, cell:cell, cx:cx, cy:cy, R:R,
          meanUx:ux, meanUy:uy, perHour:perHour, recPerHour:recPerHour,
          recMax:Array.from(recMax), recDose:Array.from(recDose),
          totalEmitKg:totG/1000, totalFuelT:totFuel/1000, model:'puff', reqId:P.reqId};
}
