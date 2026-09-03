/**
 * dem — ดึงข้อมูลความสูงมาเป็น Float32Array N×N ที่เรียงตรงกับกริดของเอนจิน
 *
 * แหล่งหลัก  AWS Terrain Tiles (terrarium) https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
 * แหล่งสำรอง Open-Meteo Elevation API (100 จุด/คำขอ) ดึงกริดหยาบแล้ว upsample
 *
 * กติกา fail-safe ของโปรเจกต์: ทุกทางล้ม → คืน {ok:false, reason} ภาษาไทย ห้าม throw ออกไป
 * ห้ามทำให้แอปพัง ผู้เรียกตัดสินเองว่าจะรันแบบพื้นราบต่อ
 *
 * โมเสกครอบ origin ± 1.4R (ไม่ขึ้นกับทิศลม) และ cache ด้วยคีย์ (origin, R)
 * เพราะ cx,cy ของกริดเลื่อนตามลมทุกครั้งที่พารามิเตอร์เปลี่ยน ถ้าผูกคีย์กับ cx,cy จะดึงใหม่ทุกครั้ง
 *
 * deps ฉีดได้เพื่อทดสอบใน node: { loadImage(url) → {width,height,draw(ctx,x,y)} , fetchJson(url), makeCanvas(w,h) }
 */
import {
  TILE, chooseZoom, tileRange, boundsAround, decodeMosaic, sampleGrid, bilinear, summarizeElev,
  groundResolution, M_LAT, mLon,
} from './dem-math.js';

export const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const OPEN_METEO_ELEV = 'https://api.open-meteo.com/v1/elevation';
const SPAN_FACTOR = 1.4;       // ครอบเกินกริด (cx,cy เลื่อนได้ถึง 0.32R) ให้พอทุกทิศลม
const COARSE_N = 20;           // กริดหยาบของ Open-Meteo 20×20 = 400 จุด = 4 คำขอ
const TIMEOUT_MS = 12_000;

const MAX_CACHE = 4;              // โมเสกละไม่เกิน ~2.4 MB · ผู้ใช้ย้ายจังหวัดไปเรื่อยๆ ไม่ควรสะสม
const mosaicCache = new Map();
function cacheSet(k, v) {
  if (mosaicCache.size >= MAX_CACHE) mosaicCache.delete(mosaicCache.keys().next().value);
  mosaicCache.set(k, v);
}

/** deps ค่าปริยายสำหรับเบราว์เซอร์ */
export const browserDeps = {
  loadImage: url => new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';               // ไม่ตั้ง → getImageData โดนบล็อก (HANDOFF)
    const t = setTimeout(() => rej(new Error('หมดเวลา')), TIMEOUT_MS);
    img.onload = () => { clearTimeout(t); res({ width: img.naturalWidth, height: img.naturalHeight, draw: (ctx, x, y) => ctx.drawImage(img, x, y) }); };
    img.onerror = () => { clearTimeout(t); rej(new Error('โหลดภาพไม่ได้')); };
    img.src = url;
  }),
  fetchJson: async url => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    finally { clearTimeout(t); }
  },
  makeCanvas: (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; },
};

const cacheKey = (origin, R) => `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)},${R}`;

/** ดึงโมเสก terrarium ครอบ origin ± span · ตรวจขนาดไทล์ทุกใบ ผิดขนาด = ล้ม (กันของปลอม/หน้า error) */
async function loadTerrariumMosaic(origin, span, deps) {
  const z = chooseZoom(origin.lat, span);
  const tr = tileRange(boundsAround(origin, span), z);
  const nx = tr.x1 - tr.x0 + 1, ny = tr.y1 - tr.y0 + 1;
  const canvas = deps.makeCanvas(nx * TILE, ny * TILE);
  const ctx = canvas.getContext('2d');
  const jobs = [];
  for (let ty = tr.y0; ty <= tr.y1; ty++) for (let tx = tr.x0; tx <= tr.x1; tx++) {
    const url = TERRARIUM.replace('{z}', z).replace('{x}', tx).replace('{y}', ty);
    jobs.push(deps.loadImage(url).then(img => {
      if (img.width !== TILE || img.height !== TILE) throw new Error(`ไทล์ผิดขนาด ${img.width}×${img.height}`);
      img.draw(ctx, (tx - tr.x0) * TILE, (ty - tr.y0) * TILE);
    }));
  }
  await Promise.all(jobs);                        // ใบเดียวล้ม = ทั้งโมเสกล้ม → ไปแหล่งสำรอง
  const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return { elev: decodeMosaic(rgba, canvas.width, canvas.height), w: canvas.width, h: canvas.height,
           z, px0: tr.x0 * TILE, py0: tr.y0 * TILE, tiles: nx * ny, source: 'terrarium' };
}

/** แหล่งสำรอง: กริดหยาบ COARSE_N×COARSE_N รอบ origin ± span จาก Open-Meteo แล้ว upsample ตอน sample */
async function loadOpenMeteoCoarse(origin, span, deps) {
  const lats = [], lons = [];
  const cell = 2 * span / COARSE_N;
  for (let j = 0; j < COARSE_N; j++) for (let i = 0; i < COARSE_N; i++) {
    lats.push(origin.lat + (span - (j + 0.5) * cell) / M_LAT);              // แถว 0 = เหนือ
    lons.push(origin.lng + (-span + (i + 0.5) * cell) / mLon(origin.lat));
  }
  const elev = new Float32Array(COARSE_N * COARSE_N);
  for (let k = 0; k < lats.length; k += 100) {                               // 100 จุด/คำขอ
    const url = `${OPEN_METEO_ELEV}?latitude=${lats.slice(k, k + 100).map(v => v.toFixed(5)).join(',')}` +
                `&longitude=${lons.slice(k, k + 100).map(v => v.toFixed(5)).join(',')}`;
    const j = await deps.fetchJson(url);
    if (!j || !Array.isArray(j.elevation) || j.elevation.length !== Math.min(100, lats.length - k))
      throw new Error('รูปแบบคำตอบไม่ตรงที่คาด');
    j.elevation.forEach((v, q) => { elev[k + q] = v; });
  }
  return { coarse: elev, nc: COARSE_N, span, source: 'open-meteo' };
}

/**
 * ดึง DEM สำหรับกริดของเอนจิน
 * @returns {Promise<{ok:true, elev:Float32Array, meta:{source,zoom?,tiles?,resM,minZ,maxZ,relief,cached:boolean}} | {ok:false, reason:string}>}
 */
/** แปลงโมเสก/กริดหยาบเป็น elev ของกริดเอนจิน */
function toGrid(src, grid, origin, span) {
  if (src.source === 'terrarium') return { elev: sampleGrid(src, grid, origin), resM: groundResolution(origin.lat, src.z) };
  // กริดหยาบครอบ origin ± span ส่วนกริดเอนจินครอบ (cx,cy) ± R → bilinear บนกริดหยาบตรงๆ
  const { N, R, cx, cy } = grid, cellG = 2 * R / N, cellC = 2 * span / src.nc;
  const elev = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const px = cx - R + (i + 0.5) * cellG, py = cy + R - (j + 0.5) * cellG;
    elev[j * N + i] = bilinear(src.coarse, src.nc, src.nc, (px + span) / cellC - 0.5, (span - py) / cellC - 0.5);
  }
  return { elev, resM: cellC };
}

export async function loadDem(origin, grid, deps = browserDeps) {
  const span = SPAN_FACTOR * grid.R;
  const key = cacheKey(origin, grid.R);
  const errs = [];

  // ลำดับแหล่ง: cache (ถ้ามี) → terrarium → Open-Meteo
  // **ตรวจค่าให้ผ่านก่อนถึงจะ cache** ไม่งั้นไทล์เสียใบเดียวจะทำให้ (origin, R) นั้น
  // ล้มถาวรทั้งเซสชันโดยไม่เคยลองแหล่งสำรองเลย (code review จับได้)
  // และค่าที่ผิดปกติต้องตกไปแหล่งถัดไป ไม่ใช่จบทันที
  const cachedSrc = mosaicCache.get(key);
  const loaders = [
    cachedSrc ? { name: 'cache', fn: async () => cachedSrc, cached: true } : null,
    { name: 'terrarium', fn: () => loadTerrariumMosaic(origin, span, deps) },
    { name: 'Open-Meteo', fn: () => loadOpenMeteoCoarse(origin, span, deps) },
  ].filter(Boolean);

  for (const ld of loaders) {
    let src;
    try { src = await ld.fn(); }
    catch (e) { errs.push(ld.name + ': ' + (e && e.message || e)); continue; }
    let elev, resM;
    try { ({ elev, resM } = toGrid(src, grid, origin, span)); }
    catch (e) { errs.push(ld.name + ': แปลงเป็นกริดไม่ได้ (' + (e && e.message || e) + ')'); continue; }
    const { minZ, maxZ, relief } = summarizeElev(elev);
    if (!Number.isFinite(minZ) || minZ < -500 || maxZ > 9000) {
      errs.push(`${ld.name}: ค่าความสูงผิดปกติ (${Number.isFinite(minZ) ? minZ.toFixed(0) : '—'}–${Number.isFinite(maxZ) ? maxZ.toFixed(0) : '—'} ม.)`);
      continue;                                    // ตกไปแหล่งถัดไป และไม่ cache ของเสีย
    }
    if (!ld.cached) cacheSet(key, src);
    return { ok: true, elev, meta: { source: src.source, zoom: src.z, tiles: src.tiles, resM, minZ, maxZ, relief, cached: !!ld.cached } };
  }
  return { ok: false, reason: 'ดึงข้อมูลความสูงไม่ได้ — ' + errs.join(' · ') };
}

/** ล้าง cache — ใช้ในเทสต์ */
export function _clearDemCache() { mosaicCache.clear(); }
