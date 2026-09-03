import type { HourWx, WindField } from './types.js';

/* ย้ายมาจาก smoke-plume-studio-lasted.html บรรทัด 597-610 (boxBlur),
   616-677 (windField), 679-689 (makeSampler)
   พร้อมค่าคงที่บรรทัด 593-595 ซึ่ง windField เป็นผู้ใช้เพียงรายเดียว
   โมดูลนี้ไม่พึ่งโมดูลอื่นเลย

   โหมดตามภูมิประเทศ: สนามลมวินิจฉัยจาก DEM
     u,v   = ลมหลักที่ถูกเบนให้ขนานเส้นชั้นความสูงและอับลงในแอ่ง
     ud,vd = ลมไหลลงลาด แยกไว้ต่างหากเพราะเป็นปรากฏการณ์ชั้นผิว
             ควันที่ลอยสูงจะไม่โดนลากไปด้วย */

var DTHETA: Record<string, number> = {A:-0.020, B:-0.015, C:-0.008, D:0.0, E:0.020, F:0.035};
var DRAIN:  Record<string, number> = {A:0, B:0, C:0.10, D:0.30, E:0.85, F:1.25};   // ลมไหลลงลาด (m/s)
var SHELT:  Record<string, number> = {A:0.10, B:0.15, C:0.25, D:0.40, E:0.75, F:1.00}; // การอับลมในแอ่ง

export function boxBlur(src: Float32Array, N: number, r: number): Float32Array {
  var tmp = new Float32Array(N*N), out = new Float32Array(N*N), i, j, k, sum, n;
  for(j=0;j<N;j++) for(i=0;i<N;i++){
    sum = 0; n = 0;
    for(k=-r;k<=r;k++){ var ii = i+k; if(ii<0||ii>=N) continue; sum += src[j*N+ii]; n++; }
    tmp[j*N+i] = sum/n;
  }
  for(j=0;j<N;j++) for(i=0;i<N;i++){
    sum = 0; n = 0;
    for(k=-r;k<=r;k++){ var jj = j+k; if(jj<0||jj>=N) continue; sum += tmp[jj*N+i]; n++; }
    out[j*N+i] = sum/n;
  }
  return out;
}

/** Z เป็น null ได้ = พื้นราบ คืนสนามลมสม่ำเสมอ */
export function windField(Z: Float32Array | null, N: number, cell: number, H: HourWx): WindField {
  var K = N*N;
  var u = new Float32Array(K), v = new Float32Array(K);
  var ud = new Float32Array(K), vd = new Float32Array(K);
  var th = (270 - H.wdir)*Math.PI/180;
  var u0 = H.ws*Math.cos(th), v0 = H.ws*Math.sin(th);
  var st = H.stab;

  // สนามลมรายเซลล์ถ้ามี (ดู types.ts HourWx.windU) ไม่งั้นใช้ค่าเดียวทั้งโดเมน
  var hasGrid = !!(H.windU && H.windV && H.windU.length === K && H.windV.length === K);
  var gu = hasGrid ? (H.windU as Float32Array) : u;    // ผูกให้ tsc รู้ว่าไม่ null · ใช้จริงเมื่อ hasGrid เท่านั้น
  var gv = hasGrid ? (H.windV as Float32Array) : v;

  // ความเร็วอ้างอิงสำหรับตัวเลขระดับโดเมน (Fr, ลมไหลลงลาด, เพดาน/พื้นของการหนีบ)
  // ใช้ค่าเฉลี่ยของกริดเมื่อมีสนามลม เพื่อให้ตัวเลขวินิจฉัยสอดคล้องกับลมที่ใช้จริง
  var spd0;
  if(hasGrid){
    var sacc = 0;
    for(var qs=0; qs<K; qs++) sacc += Math.hypot(gu[qs], gv[qs]);
    spd0 = Math.max(sacc/K, 0.3);
  } else spd0 = Math.max(H.ws, 0.3);

  if(!Z){
    if(hasGrid){ u.set(gu); v.set(gv); }
    else { u.fill(u0); v.fill(v0); }
    return {u:u, v:v, ud:ud, vd:vd, relief:0, Fr:99, block:0};
  }

  var dth = DTHETA[st] || 0;
  var Nb  = dth > 0 ? Math.sqrt(9.81/293*dth) : 0;
  var zmin = Infinity, zmax = -Infinity;
  for(var q=0;q<K;q++){ if(Z[q]<zmin) zmin=Z[q]; if(Z[q]>zmax) zmax=Z[q]; }
  var relief = Math.max(1, zmax - zmin);
  var Fr = Nb > 0 ? spd0/(Nb*relief) : 99;
  var block = Math.max(0, Math.min(0.9, 1 - Fr));
  var rBlur = Math.max(2, Math.round(1500/cell));
  var Zs = boxBlur(Z, N, rBlur);
  var drainK = (DRAIN[st]||0) * Math.max(0, 1 - spd0/6);
  var sheltK = SHELT[st] || 0.3;

  for(var j=0;j<N;j++){
    for(var i=0;i<N;i++){
      var k2 = j*N+i;
      var iL = i>0?i-1:i, iR = i<N-1?i+1:i;
      var jU = j>0?j-1:j, jD = j<N-1?j+1:j;
      var gx = (Z[j*N+iR] - Z[j*N+iL])/((iR-iL)*cell);
      var gy = (Z[jU*N+i] - Z[jD*N+i])/((jD-jU)*cell);
      var gm = Math.hypot(gx, gy);
      var uu = hasGrid ? gu[k2] : u0, vv = hasGrid ? gv[k2] : v0;
      var spdLocal = hasGrid ? Math.max(Math.hypot(uu, vv), 0.3) : spd0;

      if(gm > 1e-4){
        var nx = gx/gm, ny = gy/gm;                    // ชี้ขึ้นเนิน
        var tx = -ny, ty = nx;                         // ขนานเส้นชั้นความสูง
        var sgn = (uu*tx + vv*ty) >= 0 ? 1 : -1;
        var f = block*Math.min(1, gm/0.06);
        // หมุนทิศให้ขนานสันเขา โดยรักษาความเร็วไว้ ไม่ใช่หักลบจนพลิกทิศ
        // ใช้ความเร็วของเซลล์นั้นเมื่อมีสนามลม ไม่งั้นลมแรง-เบาในโดเมนจะถูกกลืนเป็นค่าเดียว
        uu = uu*(1-f) + tx*sgn*spdLocal*f;
        vv = vv*(1-f) + ty*sgn*spdLocal*f;
        if(drainK > 0){
          var d = drainK*Math.min(1, gm/0.10);
          ud[k2] = -nx*d; vd[k2] = -ny*d;
        }
      }
      var rel = Z[k2] - Zs[k2];
      if(rel < 0){
        var sh = 1/(1 + sheltK*Math.min(1.2, -rel/110));
        uu *= sh; vv *= sh;
      }
      var sp = Math.hypot(uu, vv);
      var ref = hasGrid ? spdLocal : spd0;
      var lo = Math.max(0.25, 0.15*ref), hi = 1.8*ref;
      if(sp < lo || sp > hi){
        var target = sp < lo ? lo : hi;
        if(sp < 1e-6){
          if(hasGrid){ uu = target; vv = 0; }        // ลมเป็นศูนย์สนิท ไม่มีทิศให้รักษา
          else { uu = u0/spd0*target; vv = v0/spd0*target; }
        }
        else { uu = uu/sp*target; vv = vv/sp*target; }
      }
      u[k2] = uu; v[k2] = vv;
    }
  }
  return {u:u, v:v, ud:ud, vd:vd, relief:relief, Fr:Fr, block:block};
}

export function makeSampler(G: Float32Array | null, N: number, cx: number, cy: number, R: number, cell: number) {
  var x0 = cx - R, y1 = cy + R;
  return function(arr: Float32Array, px: number, py: number): number {
    var fi = (px - x0)/cell - 0.5, fj = (y1 - py)/cell - 0.5;
    if(fi < 0) fi = 0; if(fj < 0) fj = 0;
    if(fi > N-1.001) fi = N-1.001; if(fj > N-1.001) fj = N-1.001;
    var i0 = fi|0, j0 = fj|0, tx = fi-i0, ty = fj-j0;
    var a = arr[j0*N+i0], b = arr[j0*N+i0+1], c = arr[(j0+1)*N+i0], d = arr[(j0+1)*N+i0+1];
    return (a*(1-tx)+b*tx)*(1-ty) + (c*(1-tx)+d*tx)*ty;
  };
}
