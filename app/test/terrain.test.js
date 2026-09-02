import { describe, it, expect } from 'vitest';
import { hillshadeRGBA, contourLevels, terrainContourGeoJSON } from '../src/map2d/terrain.js';

const N = 40, cell = 100;
const grid = { N, R: N * cell / 2, cx: 0, cy: 0 };
const idLL = (x, y) => ({ lng: x, lat: y });      // toLL เอกลักษณ์: ตรวจคณิตกริด→เมตรตรงๆ

describe('hillshadeRGBA', () => {
  it('พื้นราบ → โปร่งใสหมด (ไม่บดบัง basemap)', () => {
    const rgba = hillshadeRGBA(new Float32Array(N * N).fill(300), N, cell);
    for (let p = 3; p < rgba.length; p += 4) expect(rgba[p]).toBe(0);
  });
  it('ลาดที่หันรับแสง 315° (สูงขึ้นทาง SE) เป็นขาวโปร่ง · ลาดตรงข้ามเป็นดำโปร่ง', () => {
    const se = new Float32Array(N * N), nw = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { se[j * N + i] = (i + j) * 20; nw[j * N + i] = -(i + j) * 20; }
    const a = hillshadeRGBA(se, N, cell), b = hillshadeRGBA(nw, N, cell);
    const p = (20 * N + 20) * 4;
    expect(a[p]).toBe(255); expect(a[p + 3]).toBeGreaterThan(30);
    expect(b[p]).toBe(0);   expect(b[p + 3]).toBeGreaterThan(30);
  });
  it('ความทึบไม่เกิน maxAlpha', () => {
    const cliff = new Float32Array(N * N); for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) cliff[j * N + i] = i * 5000;
    const rgba = hillshadeRGBA(cliff, N, cell, { maxAlpha: 0.5 });
    for (let p = 3; p < rgba.length; p += 4) expect(rgba[p]).toBeLessThanOrEqual(Math.round(0.5 * 255) + 1);
  });
});

describe('contourLevels', () => {
  it('174–860 ม. → ทุก 100 ม. (200…800)', () => expect(contourLevels(174, 860)).toEqual([200, 300, 400, 500, 600, 700, 800]));
  it('ช่วงแคบ 300–345 → ทุก 10 ม.', () => expect(contourLevels(300, 345)).toEqual([300, 310, 320, 330, 340]));
  it('ช่วงกว้าง 0–4200 → ทุก 500 ม.', () => expect(contourLevels(0, 4200)).toEqual([0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000]));
  it('พื้นราบไม่โยน', () => expect(contourLevels(300, 300)).toEqual([]));
});

describe('terrainContourGeoJSON — ใช้สูตรเดียวกับเส้นชั้นความเข้มข้น', () => {
  // กรวยกลางกริด: elev = 1000 − ระยะจากศูนย์กลาง (ม.) → เส้นชั้นระดับ v เป็นวงรัศมี 1000−v
  const elev = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = grid.cx - grid.R + (i + 0.5) * cell, y = grid.cy + grid.R - (j + 0.5) * cell;
    elev[j * N + i] = 1000 - Math.hypot(x, y);
  }
  const feats = terrainContourGeoJSON(elev, grid, [400, 600, 800], idLL);
  it('ได้หนึ่ง feature ต่อระดับ เป็น MultiPolygon [lng,lat]', () => {
    expect(feats.map(f => f.properties.elevation)).toEqual([400, 600, 800]);
    feats.forEach(f => expect(f.geometry.type).toBe('MultiPolygon'));
  });
  it('วงระดับ 600 อยู่ห่างศูนย์กลางราว 400 ม. (คลาดไม่เกินหนึ่งเซลล์)', () => {
    const ring = feats[1].geometry.coordinates[0][0];
    const r = ring.map(([x, y]) => Math.hypot(x, y));
    const mean = r.reduce((a, b) => a + b) / r.length;
    expect(Math.abs(mean - 400)).toBeLessThan(cell);
  });
  it('พิกัดผ่าน toLL ที่ฉีดมา (ทดสอบด้วยการเลื่อน origin)', () => {
    const f2 = terrainContourGeoJSON(elev, grid, [600], (x, y) => ({ lng: x + 10, lat: y - 5 }));
    const [x, y] = f2[0].geometry.coordinates[0][0][0];
    const [x0, y0] = feats[1].geometry.coordinates[0][0][0];
    expect(x - x0).toBeCloseTo(10, 6); expect(y - y0).toBeCloseTo(-5, 6);
  });
});
