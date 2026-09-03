import { describe, it, expect } from 'vitest';
import { downsampleMax, buildVolume, sigmas } from '../src/map3d/volume.js';

const BANDS = [{ lo: 15, c: '#4aa3d8' }, { lo: 25, c: '#5cb85c' }, { lo: 37.5, c: '#e8c33a' },
               { lo: 75, c: '#ef8a3c' }, { lo: 150, c: '#e04b4b' }, { lo: 350, c: '#8f4bc9' }];
const BLO = BANDS.map(b => b.lo);
const bandOf = c => { let b = -1; for (let i = 0; i < BLO.length; i++) if (c >= BLO[i]) b = i; return b; };
const idLL = (x, y) => ({ lng: x, lat: y });
const hour = { Hsm: 40, Hfl: 90, qSm: 5, qFl: 3, stab: 'F', mix: 200, sy0: 42 };

describe('sigmas ตรงกับเอนจิน', () => {
  it('ค่าที่รู้ (F ที่ 1000 ม.)', () => {
    const [sy, sz] = sigmas(1000, 'F');
    expect(sy).toBeCloseTo(0.04 * 1000 / Math.sqrt(1.1), 6);
    expect(sz).toBeCloseTo(0.016 * 1000 / 1.3, 6);
  });
});

describe('downsampleMax', () => {
  it('เอาค่าสูงสุดในบล็อก ไม่ใช่ค่าเฉลี่ย — แกนพลูมแคบต้องไม่หาย', () => {
    const N = 4, g = new Float32Array(N * N);
    g[0] = 100;                                  // จุดเดียวในบล็อก 2×2
    const { data, M } = downsampleMax(g, N, 2);
    expect(M).toBe(2);
    expect(data[0]).toBe(100);
  });
  it('ขนาดที่หารไม่ลงตัวก็ครอบครบ', () => {
    const N = 5, g = new Float32Array(N * N).fill(3);
    const { data, M } = downsampleMax(g, N, 2);
    expect(M).toBe(3);
    expect([...data].every(v => v === 3)).toBe(true);
  });
});

describe('buildVolume', () => {
  const N = 20, cell = 100, R = N * cell / 2;
  const res = { N, cell, cx: 0, cy: 0, R };
  const mkGrid = f => { const g = new Float32Array(N * N); for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) g[j * N + i] = f(i, j); return g; };

  it('กริดว่าง → ไม่มีก้อนควัน', () => {
    const fc = buildVolume({ grid: mkGrid(() => 0), res, hour, bg: 25, toLL: idLL, bandOf, bands: BANDS });
    expect(fc.features).toHaveLength(0);
  });

  it('รูปร่างตามกริดจริง — เซลล์ที่ต่ำกว่าเกณฑ์ไม่ถูกวาด', () => {
    const fc = buildVolume({ grid: mkGrid((i, j) => (i < 4 && j < 4 ? 80 : 0)), res, hour,
                             bg: 25, toLL: idLL, bandOf, bands: BANDS, step: 4 });
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties.conc).toBe(80);
  });

  // ค่าที่ส่งให้ maplibre ต้องเป็นความสูง**เหนือพื้นดิน** เพราะ shader ของ fill-extrusion
  // บวกความสูงภูมิประเทศที่ centroid ให้แล้วเมื่อเปิดโหมดภูมิประเทศ บวกเองซ้ำ = สูงสองเท่า
  it('ไม่บวกความสูงพื้นดินเอง — ทุกก้อนอยู่ในชั้นผสม ไม่ใช่หลักพันเมตร', () => {
    const fc = buildVolume({ grid: mkGrid(() => 90), res, hour, bg: 25, toLL: idLL, bandOf, bands: BANDS, step: 4 });
    const lid = Math.max(hour.mix, 60);
    for (const f of fc.features) {
      expect(f.properties.base).toBeGreaterThanOrEqual(0);
      expect(f.properties.height).toBeLessThanOrEqual(lid * 1.05 + 5);
    }
  });

  it('ฐานเริ่มจาก 0 และหนาเป็นบวกเสมอ', () => {
    const fc = buildVolume({ grid: mkGrid(() => 90), res, hour, bg: 25, toLL: idLL, bandOf, bands: BANDS, step: 4 });
    expect(Math.min(...fc.features.map(f => f.properties.base))).toBeGreaterThanOrEqual(0);
    expect(fc.features.every(f => f.properties.height > f.properties.base)).toBe(true);
  });

  it('สีและ tier ตามแถบ AQI ของความเข้มข้น + พื้นหลัง', () => {
    const fc = buildVolume({ grid: mkGrid((i, j) => (i < 4 && j < 4 ? 200 : i < 8 && j < 4 ? 5 : 0)),
                             res, hour, bg: 25, toLL: idLL, bandOf, bands: BANDS, step: 4 });
    const hi = fc.features.find(f => f.properties.conc === 200);
    const lo = fc.features.find(f => f.properties.conc === 5);
    expect(hi.properties.tier).toBe('core');
    expect(hi.properties.color).toBe('#e04b4b');            // 225 → แถบอันตราย
    expect(lo.properties.tier).toBe('edge');                // 30 → ต่ำกว่า 37.5
  });

  it('pexag คูณความหนาของควัน', () => {
    const a = buildVolume({ grid: mkGrid(() => 90), res, hour, bg: 25, toLL: idLL, bandOf, bands: BANDS, step: 4, pexag: 1 });
    const b = buildVolume({ grid: mkGrid(() => 90), res, hour, bg: 25, toLL: idLL, bandOf, bands: BANDS, step: 4, pexag: 4 });
    expect(b.features[0].properties.height).toBeGreaterThan(a.features[0].properties.height * 2);
  });

  it('ก้อนอยู่ในขอบเขตโดเมน ไม่ล้นออกนอกกริด', () => {
    const fc = buildVolume({ grid: mkGrid(() => 90), res, hour, bg: 25, toLL: idLL, bandOf, bands: BANDS, step: 4 });
    for (const f of fc.features) for (const [x, y] of f.geometry.coordinates[0]) {
      expect(x).toBeGreaterThanOrEqual(-R - 1e-6); expect(x).toBeLessThanOrEqual(R + 1e-6);
      expect(y).toBeGreaterThanOrEqual(-R - 1e-6); expect(y).toBeLessThanOrEqual(R + 1e-6);
    }
  });
});
