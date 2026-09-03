/**
 * wind-grid — แปลงกริดลมหยาบของ Open-Meteo เป็นสนามลมรายเซลล์ของกริดเอนจิน
 *
 * ต้นทาง: `fetchWindGrid()` ใน app.js ดึงลม 10 ม. รายชั่วโมงจากจุด n×n (ปัจจุบัน 6×6)
 * รอบจุดกึ่งกลางกองไฟ เก็บเป็น `{lats, lngs, n, byTime}` โดย `byTime[key]` เป็น
 * อาร์เรย์ [u, v] เรียงแบบ **lat นอก, lng ใน** (lats.forEach → lngs.forEach)
 * `lats[0]` คือใต้สุด (ค่าน้อยสุด) ต่างจากกริดเอนจินที่แถว j=0 คือเหนือสุด
 *
 * ปลายทาง: Float32Array N×N เรียงแบบกริดเอนจิน (ดู GridSpec ใน packages/engine)
 *   เซลล์ (i, j) = จุด (cx − R + (i+0.5)·cell, cy + R − (j+0.5)·cell) เมตรเทียบ origin
 *
 * **ข้อจำกัดที่ต้องบอกตรงๆ** 6 จุดต่อแกนบนโดเมน 20 กม. = ระยะห่าง ~4 กม. และข้อมูล
 * ต้นทางของ Open-Meteo เองก็ราว 11 กม. สิ่งที่ได้คือ **การไล่ระดับของลมระดับใหญ่**
 * ไม่ใช่ลมในหุบเขา · ลมในหุบมาจากการที่ภูมิประเทศเบนสนามลมนี้อีกทีใน windField
 */

const M_LAT = 111320;
const mLon = lat => 111320 * Math.cos(lat * Math.PI / 180);

/** bilinear บนกริดหยาบ n×n ที่ดัชนีเศษส่วน (fi, fj) — clamp ที่ขอบ */
function bilin(arr, n, fi, fj, comp) {
  const x = Math.max(0, Math.min(n - 1, fi)), y = Math.max(0, Math.min(n - 1, fj));
  const i0 = Math.floor(x), j0 = Math.floor(y), tx = x - i0, ty = y - j0;
  const i1 = Math.min(n - 1, i0 + 1), j1 = Math.min(n - 1, j0 + 1);
  const at = (i, j) => arr[j * n + i][comp];
  return (at(i0, j0) * (1 - tx) + at(i1, j0) * tx) * (1 - ty)
       + (at(i0, j1) * (1 - tx) + at(i1, j1) * tx) * ty;
}

/**
 * @param {{lats:number[], lngs:number[], n:number, byTime:Object}} wg  กริดจาก fetchWindGrid
 * @param {string} timeKey  คีย์ชั่วโมง เช่น '2026-09-03T08:00'
 * @param {{N:number,R:number,cx:number,cy:number}} grid  กริดเอนจิน
 * @param {{lat:number,lng:number}} origin
 * @returns {{windU:Float32Array, windV:Float32Array, meanWs:number, spread:number}|null}
 *          null เมื่อไม่มีข้อมูลของชั่วโมงนั้น · spread = ต่างระหว่างลมแรงสุด-เบาสุดในโดเมน
 */
export function windFieldForHour(wg, timeKey, grid, origin) {
  if (!wg || !wg.byTime) return null;
  const cellData = wg.byTime[timeKey];
  if (!cellData || cellData.length !== wg.n * wg.n) return null;

  const { N, R, cx, cy } = grid, cell = 2 * R / N, n = wg.n;
  const windU = new Float32Array(N * N), windV = new Float32Array(N * N);
  const lat0 = wg.lats[0], latSpan = wg.lats[n - 1] - wg.lats[0];
  const lng0 = wg.lngs[0], lngSpan = wg.lngs[n - 1] - wg.lngs[0];
  const kLon = mLon(origin.lat);
  let sum = 0, lo = Infinity, hi = 0;

  for (let j = 0; j < N; j++) {
    const py = cy + R - (j + 0.5) * cell;
    const lat = origin.lat + py / M_LAT;
    const fj = latSpan ? (lat - lat0) / latSpan * (n - 1) : 0;     // lats เรียงจากใต้ไปเหนือ
    for (let i = 0; i < N; i++) {
      const px = cx - R + (i + 0.5) * cell;
      const lon = origin.lng + px / kLon;
      const fi = lngSpan ? (lon - lng0) / lngSpan * (n - 1) : 0;
      const u = bilin(cellData, n, fi, fj, 0), v = bilin(cellData, n, fi, fj, 1);
      windU[j * N + i] = u; windV[j * N + i] = v;
      const sp = Math.hypot(u, v);
      sum += sp; if (sp < lo) lo = sp; if (sp > hi) hi = sp;
    }
  }
  return { windU, windV, meanWs: sum / (N * N), spread: hi - lo };
}

/** ใส่สนามลมให้ทุกชั่วโมงใน payload · คืนสรุปไว้แสดงสถานะ */
export function attachWindField(hours, wg, grid, origin) {
  let ok = 0, meanWs = 0, spread = 0;
  for (const h of hours) {
    const w = windFieldForHour(wg, h.t, grid, origin);
    if (!w) continue;
    h.windU = w.windU; h.windV = w.windV;
    ok++; meanWs += w.meanWs; spread = Math.max(spread, w.spread);
  }
  return { hours: ok, total: hours.length, meanWs: ok ? meanWs / ok : 0, spread };
}
