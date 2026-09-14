import { describe, it, expect } from 'vitest';
import { pickImageryZoom, esriTileUrl, loadImageryMosaic } from '../src/map3d/three/basemap.js';
import { chooseZoom } from '../src/services/dem-math.js';

const origin = { lat: 19.3, lng: 97.97 };   // แม่ฮ่องสอน

describe('pickImageryZoom', () => {
  it('ละเอียดกว่างบของ DEM เสมอ — DEM หยุดที่ z14 เพราะ SRTM 30 ม. ไม่มีมากกว่านั้น', () => {
    const span = 10_000;
    expect(pickImageryZoom(origin.lat, span)).toBeGreaterThan(chooseZoom(origin.lat, span));
  });
  it('โดเมนใหญ่ขึ้นได้ zoom ต่ำลง', () => {
    expect(pickImageryZoom(origin.lat, 40_000)).toBeLessThan(pickImageryZoom(origin.lat, 5_000));
  });
  it('ไม่เกิน z17 — Esri แถบนี้เริ่มคืน 404 หลังจากนั้น', () => {
    expect(pickImageryZoom(origin.lat, 500)).toBeLessThanOrEqual(17);
  });
});

describe('esriTileUrl', () => {
  it('ลำดับคือ z/y/x ไม่ใช่ z/x/y — สลับแล้วได้ภาพคนละซีกโลกแบบเงียบๆ', () => {
    expect(esriTileUrl(12, 3220, 1750)).toMatch(/MapServer\/tile\/12\/1750\/3220$/);
  });
});

describe('loadImageryMosaic', () => {
  const fakeDeps = () => ({
    loadImage: async () => ({ width: 256, height: 256, draw() {} }),
    makeCanvas: (w, h) => ({ width: w, height: h, getContext: () => ({ drawImage() {}, fillRect() {} }) }),
  });

  it('คืนผืนผ้าใบที่ครอบโดเมนและบอกขอบเขตจริงของโมเสก', async () => {
    const r = await loadImageryMosaic(origin, 10_000, fakeDeps());
    expect(r.ok).toBe(true);
    expect(r.canvas.width).toBeGreaterThan(0);
    expect(r.bounds.west).toBeLessThan(origin.lng);
    expect(r.bounds.east).toBeGreaterThan(origin.lng);
    expect(r.bounds.south).toBeLessThan(origin.lat);
    expect(r.bounds.north).toBeGreaterThan(origin.lat);
  });

  it('โหลดภาพไม่ได้ → ok:false พร้อมเหตุผลไทย ไม่ throw', async () => {
    const deps = fakeDeps();
    deps.loadImage = async () => { throw new Error('เน็ตหลุด'); };
    const r = await loadImageryMosaic(origin, 10_000, deps);
    expect(r.ok).toBe(false);
    expect(typeof r.reason).toBe('string');
    expect(r.reason.length).toBeGreaterThan(0);
  });

  it('ไทล์หายบางใบยังคืน ok — ภาพโหว่ดีกว่าไม่มีแผนที่', async () => {
    const deps = fakeDeps();
    let n = 0;
    deps.loadImage = async () => (++n === 2 ? Promise.reject(new Error('404')) : { width: 256, height: 256, draw() {} });
    const r = await loadImageryMosaic(origin, 10_000, deps);
    expect(r.ok).toBe(true);
  });
});
