/**
 * dem-math — ส่วนบริสุทธิ์ของงาน DEM ทดสอบใน node ได้ ไม่แตะ DOM ไม่แตะเครือข่าย
 *
 * หน้าที่: เลือก zoom ของไทล์ · แปลง lon/lat ↔ พิกเซลโลก (Web Mercator) · ถอดรหัส
 * terrarium · bilinear · แปลงโมเสกความสูงเป็น Float32Array N×N ที่เรียงตรงกับกริดของเอนจิน
 *
 * การเรียงกริดต้องตรงกับเอนจินทุกจุด (ดู packages/engine/src/types.ts GridSpec):
 *   เซลล์ (i, j) = จุด (cx − R + (i+0.5)·cell, cy + R − (j+0.5)·cell) เมตรเทียบ origin
 *   แถว j=0 คือด้านเหนือ · ดัชนี j*N + i
 * และการแปลงเมตร ↔ องศาต้องตรงกับ toLL() ในแอป (M_LAT / mLon) ไม่งั้นภูมิประเทศจะเลื่อน
 */

export const EARTH_CIRCUMFERENCE = 40075016.686;   // m ที่เส้นศูนย์สูตร
export const TILE = 256;
export const M_LAT = 111320;                        // m ต่อองศาละติจูด — ต้องเท่ากับ app.js
export const mLon = lat => 111320 * Math.cos(lat * Math.PI / 180);

/** ความละเอียดพื้นดิน (m/px) ของไทล์ 256px ที่ zoom z ณ ละติจูด lat */
export function groundResolution(lat, z) {
  return EARTH_CIRCUMFERENCE * Math.cos(lat * Math.PI / 180) / (TILE * 2 ** z);
}

/**
 * zoom ละเอียดสุดที่ทำให้สี่เหลี่ยม ±spanM รอบ origin ครอบด้วยไทล์ไม่เกิน maxTilesPerAxis ต่อแกน
 * +1 เพราะขอบโดเมนไม่ตรงกับขอบไทล์ · HANDOFF ให้เป้าราว 4–9 ไทล์
 */
export function chooseZoom(lat, spanM, { maxTilesPerAxis = 3, zMin = 8, zMax = 14 } = {}) {
  for (let z = zMax; z >= zMin; z--) {
    const tileM = groundResolution(lat, z) * TILE;
    if (Math.ceil(2 * spanM / tileM) + 1 <= maxTilesPerAxis) return z;
  }
  return zMin;
}

/** lon/lat → พิกเซลโลกที่ zoom z (มุมซ้ายบนคือ 0,0 · y ลงล่าง) */
export function lonLatToPixel(lon, lat, z) {
  const n = TILE * 2 ** z;
  const s = Math.sin(lat * Math.PI / 180);
  return [
    (lon + 180) / 360 * n,
    (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n,
  ];
}

/** ช่วงดัชนีไทล์ที่ครอบสี่เหลี่ยม lon/lat ที่ zoom z */
export function tileRange({ west, south, east, north }, z) {
  const [x0, y0] = lonLatToPixel(west, north, z);
  const [x1, y1] = lonLatToPixel(east, south, z);
  const max = 2 ** z - 1;
  const c = v => Math.max(0, Math.min(max, v));
  return { z, x0: c(Math.floor(x0 / TILE)), x1: c(Math.floor(x1 / TILE)),
              y0: c(Math.floor(y0 / TILE)), y1: c(Math.floor(y1 / TILE)) };
}

/** สี่เหลี่ยม lon/lat ที่ครอบ origin ± spanM (m) */
export function boundsAround(origin, spanM) {
  const dLat = spanM / M_LAT, dLon = spanM / mLon(origin.lat);
  return { west: origin.lng - dLon, east: origin.lng + dLon, south: origin.lat - dLat, north: origin.lat + dLat };
}

/** terrarium: elev = R·256 + G + B/256 − 32768 (m) */
export function decodeTerrarium(r, g, b) { return r * 256 + g + b / 256 - 32768; }

/** ถอด RGBA ทั้งโมเสก → Float32Array ความสูง w×h */
export function decodeMosaic(rgba, w, h) {
  const out = new Float32Array(w * h);
  for (let k = 0, p = 0; k < w * h; k++, p += 4) out[k] = decodeTerrarium(rgba[p], rgba[p + 1], rgba[p + 2]);
  return out;
}

/** bilinear บน array w×h ที่พิกัดพิกเซล (fx, fy) — 0,0 คือกลางพิกเซลแรก · clamp ที่ขอบ */
export function bilinear(arr, w, h, fx, fy) {
  // clamp ที่ w−1 พอดี — i1 ถูก min ไว้แล้ว จุดขอบจึงได้ค่าตรงเป๊ะ (เคยใช้ −1.000001 แล้วเพี้ยน 1e-5)
  const x = Math.max(0, Math.min(w - 1, fx));
  const y = Math.max(0, Math.min(h - 1, fy));
  const i0 = Math.floor(x), j0 = Math.floor(y), tx = x - i0, ty = y - j0;
  const i1 = Math.min(w - 1, i0 + 1), j1 = Math.min(h - 1, j0 + 1);
  const a = arr[j0 * w + i0], b = arr[j0 * w + i1], c = arr[j1 * w + i0], d = arr[j1 * w + i1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/**
 * แปลงโมเสกความสูงเป็น elev N×N ของกริดเอนจิน
 * mosaic = { elev, w, h, z, px0, py0 }  px0/py0 = พิกเซลโลกของมุมซ้ายบนโมเสก
 * grid   = { N, R, cx, cy }              origin = { lat, lng }
 */
export function sampleGrid(mosaic, grid, origin) {
  const { N, R, cx, cy } = grid, cell = 2 * R / N;
  const out = new Float32Array(N * N);
  const kLon = mLon(origin.lat);
  for (let j = 0; j < N; j++) {
    const py = cy + R - (j + 0.5) * cell;                 // เมตรไปทางเหนือ
    const lat = origin.lat + py / M_LAT;
    for (let i = 0; i < N; i++) {
      const px = cx - R + (i + 0.5) * cell;               // เมตรไปทางตะวันออก
      const lon = origin.lng + px / kLon;
      const [wx, wy] = lonLatToPixel(lon, lat, mosaic.z);
      out[j * N + i] = bilinear(mosaic.elev, mosaic.w, mosaic.h, wx - mosaic.px0 - 0.5, wy - mosaic.py0 - 0.5);
    }
  }
  return out;
}

/** upsample กริดหยาบ nc×nc (เรียง j*nc+i แถว 0 = เหนือ) เป็น N×N ด้วย bilinear — ใช้กับ Open-Meteo */
export function upsampleGrid(coarse, nc, N) {
  const out = new Float32Array(N * N);
  const s = (nc - 1) / (N - 1);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) out[j * N + i] = bilinear(coarse, nc, nc, i * s, j * s);
  return out;
}

/** min/max/ความต่างระดับ */
export function summarizeElev(elev) {
  let minZ = Infinity, maxZ = -Infinity;
  for (const v of elev) { if (v < minZ) minZ = v; if (v > maxZ) maxZ = v; }
  return { minZ, maxZ, relief: maxZ - minZ };
}
