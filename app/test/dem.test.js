import { describe, it, expect, beforeEach } from 'vitest';
import { loadDem, _clearDemCache, TERRARIUM } from '../src/services/dem.js';
import { TILE, decodeTerrarium } from '../src/services/dem-math.js';

const CNX = { lat: 18.7883, lng: 98.9853 };
const grid = { N: 60, R: 10000, cx: -1835.44, cy: -2621.29 };

/** canvas ปลอม: เก็บ RGBA เอง · draw() ของภาพปลอมเขียนค่าคงที่ลงทั้งไทล์ */
function fakeCanvas(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  return { width: w, height: h, getContext: () => ({
    drawImage: () => {}, getImageData: () => ({ data }),
    _data: data, _w: w }) , _data: data };
}
/** ภาพไทล์ปลอม 256×256 ที่ทุกพิกเซลเป็นความสูง elevM (terrarium)
 *  ความสูงคงที่ทั้งใบ → ไฟล์นี้ทดสอบ "เส้นทาง" ไม่ใช่ "การวางตำแหน่ง"
 *  ความถูกต้องของ alignment อยู่ใน dem-math.test.js (sampleGrid กับโมเสกไล่ระดับ) */
function fakeTile(elevM, size = TILE) {
  const v = elevM + 32768, r = Math.floor(v / 256), g = Math.floor(v % 256), b = Math.round((v % 1) * 256);
  return { width: size, height: size, draw: (ctx, x, y) => {
    const d = ctx._data, w = ctx._w;
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) { const p = ((y + j) * w + (x + i)) * 4; d[p] = r; d[p+1] = g; d[p+2] = b; d[p+3] = 255; }
  } };
}
const deps = (over = {}) => ({
  loadImage: async () => fakeTile(300),
  fetchJson: async () => { throw new Error('ไม่มีเน็ต'); },
  makeCanvas: fakeCanvas,
  ...over,
});

beforeEach(() => _clearDemCache());

describe('loadDem — เส้นทางหลัก terrarium', () => {
  it('ได้ elev N×N ค่าตรงกับไทล์ และ meta ครบ', async () => {
    const r = await loadDem(CNX, grid, deps());
    expect(r.ok).toBe(true);
    expect(r.elev.length).toBe(60 * 60);
    expect(Math.abs(r.elev[0] - 300)).toBeLessThan(0.01);
    expect(r.meta.source).toBe('terrarium');
    expect(r.meta.zoom).toBe(11);
    expect(r.meta.tiles).toBeLessThanOrEqual(9);
    expect(r.meta.resM).toBeCloseTo(72.4, 0);
    expect(r.meta.relief).toBe(0);
    expect(r.meta.cached).toBe(false);
  });
  it('ครั้งที่สองใช้ cache — ไม่โหลดไทล์ซ้ำ', async () => {
    let n = 0;
    const d = deps({ loadImage: async () => { n++; return fakeTile(300); } });
    await loadDem(CNX, grid, d);
    const r2 = await loadDem(CNX, { ...grid, cx: 0, cy: 0 }, d);   // ลมเปลี่ยน cx,cy แต่คีย์เดิม
    expect(r2.meta.cached).toBe(true);
    expect(n).toBeLessThanOrEqual(9);
  });
  it('URL ที่ขอเป็น terrarium และ zoom ตรง', async () => {
    const urls = [];
    await loadDem(CNX, grid, deps({ loadImage: async u => { urls.push(u); return fakeTile(0); } }));
    expect(urls.every(u => u.startsWith(TERRARIUM.split('{z}')[0] + '11/'))).toBe(true);
  });
});

describe('loadDem — fail-safe', () => {
  it('ไทล์ผิดขนาด (เช่น 1×1 จาก stub) → ไปแหล่งสำรอง', async () => {
    const r = await loadDem(CNX, grid, deps({
      loadImage: async () => fakeTile(300, 1),
      fetchJson: async url => { const n = url.match(/latitude=([^&]+)/)[1].split(',').length; return { elevation: Array(n).fill(420) }; },
    }));
    expect(r.ok).toBe(true);
    expect(r.meta.source).toBe('open-meteo');
    expect(Math.abs(r.elev[1800] - 420)).toBeLessThan(0.01);
    expect(r.meta.resM).toBeGreaterThan(1000);     // กริดหยาบ 20×20 ครอบ 28 กม. ≈ 1.4 กม./จุด
  });
  it('ล้มทั้งสองแหล่ง → {ok:false} เหตุผลภาษาไทย ไม่ throw', async () => {
    const r = await loadDem(CNX, grid, deps({ loadImage: async () => { throw new Error('โหลดภาพไม่ได้'); } }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/ดึงข้อมูลความสูงไม่ได้/);
    expect(r.reason).toMatch(/terrarium/);
    expect(r.reason).toMatch(/Open-Meteo/);
  });
  it('คำตอบสำรองรูปแบบผิด → ล้มอย่างสุภาพ', async () => {
    const r = await loadDem(CNX, grid, deps({ loadImage: async () => { throw new Error('x'); }, fetchJson: async () => ({ nope: 1 }) }));
    expect(r.ok).toBe(false);
  });
  it('ค่าความสูงผิดปกติ (ไทล์ดำทั้งใบ = −32768) → ตกไปแหล่งสำรอง ไม่ใช่จบทันที', async () => {
    const r = await loadDem(CNX, grid, deps({
      loadImage: async () => fakeTile(-32768),
      fetchJson: async url => ({ elevation: Array(url.match(/latitude=([^&]+)/)[1].split(',').length).fill(500) }),
    }));
    expect(r.ok).toBe(true);
    expect(r.meta.source).toBe('open-meteo');
  });
  it('ค่าผิดปกติทั้งสองแหล่ง → ok:false และเหตุผลบอกทั้งคู่', async () => {
    const r = await loadDem(CNX, grid, deps({ loadImage: async () => fakeTile(-32768) }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/ผิดปกติ/);
    expect(r.reason).toMatch(/Open-Meteo/);
  });
  it('โมเสกเสียต้องไม่ถูก cache — ครั้งถัดไปยังลองใหม่ได้', async () => {
    let bad = true;
    const d = deps({ loadImage: async () => fakeTile(bad ? -32768 : 700) });
    const r1 = await loadDem(CNX, grid, d);
    expect(r1.ok).toBe(false);
    bad = false;                                  // เครือข่ายกลับมาปกติ
    const r2 = await loadDem(CNX, grid, d);
    expect(r2.ok, 'ถ้า cache เก็บของเสียไว้ ครั้งนี้จะยัง ok:false ตลอดเซสชัน').toBe(true);
    expect(Math.abs(r2.elev[0] - 700)).toBeLessThan(0.01);
  });
});
