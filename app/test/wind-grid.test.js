import { describe, it, expect } from 'vitest';
import { windFieldForHour, attachWindField } from '../src/services/wind-grid.js';

const CNX = { lat: 18.7883, lng: 98.9853 };
const M_LAT = 111320, mLon = lat => 111320 * Math.cos(lat * Math.PI / 180);

/** กริดหยาบ n×n รอบ origin ครอบ ±R · fn(latIdx, lngIdx) → [u, v] */
function makeWG(n, R, fn, key = 'T') {
  const lats = [], lngs = [], cells = [];
  for (let j = 0; j < n; j++) lats.push(CNX.lat + (-R + 2 * R * j / (n - 1)) / M_LAT);
  for (let i = 0; i < n; i++) lngs.push(CNX.lng + (-R + 2 * R * i / (n - 1)) / mLon(CNX.lat));
  lats.forEach((_, j) => lngs.forEach((__, i) => cells.push(fn(j, i))));
  return { lats, lngs, n, byTime: { [key]: cells } };
}
const grid = { N: 20, R: 10000, cx: 0, cy: 0 };

describe('windFieldForHour', () => {
  it('ลมสม่ำเสมอ → ทุกเซลล์เท่ากัน', () => {
    const w = windFieldForHour(makeWG(6, 14000, () => [3, -1]), 'T', grid, CNX);
    expect(w.windU.length).toBe(400);
    for (let k = 0; k < 400; k++) { expect(w.windU[k]).toBeCloseTo(3, 4); expect(w.windV[k]).toBeCloseTo(-1, 4); }
    expect(w.meanWs).toBeCloseTo(Math.hypot(3, 1), 4);
    expect(w.spread).toBeCloseTo(0, 4);
  });

  it('ทิศเหนือ-ใต้ไม่กลับด้าน: กริดต้นทาง lats[0] = ใต้ แต่แถว j=0 ของเอนจิน = เหนือ', () => {
    // u = 10 ที่เหนือสุด, 0 ที่ใต้สุด (ไล่ตาม latIdx)
    const wg = makeWG(6, 14000, j => [j === 5 ? 10 : j === 0 ? 0 : j * 2, 0]);
    const w = windFieldForHour(wg, 'T', grid, CNX);
    const north = w.windU[0], south = w.windU[19 * 20];
    expect(north, 'แถวบนของกริดเอนจินต้องได้ค่าของละติจูดสูง').toBeGreaterThan(south);
  });

  it('ตะวันออก-ตะวันตกไม่กลับด้าน', () => {
    const wg = makeWG(6, 14000, (_j, i) => [0, i]);     // v เพิ่มไปทางตะวันออก
    const w = windFieldForHour(wg, 'T', grid, CNX);
    expect(w.windV[19]).toBeGreaterThan(w.windV[0]);
  });

  it('ค่าที่จุดกึ่งกลางเท่ากับค่ากลางของกริดหยาบ (bilinear ถูกต้อง)', () => {
    const wg = makeWG(6, 14000, (j, i) => [i, j]);
    const w = windFieldForHour(wg, 'T', grid, CNX);
    // เซลล์กลางกริดเอนจิน ≈ ตรงกลางโดเมน = ดัชนีหยาบ 2.5 ทั้งสองแกน
    const mid = w.windU[10 * 20 + 10];
    expect(mid).toBeGreaterThan(2.0); expect(mid).toBeLessThan(3.0);
  });

  it('spread จับความต่างของลมในโดเมนได้', () => {
    const wg = makeWG(6, 14000, (_j, i) => [i, 0]);
    expect(windFieldForHour(wg, 'T', grid, CNX).spread).toBeGreaterThan(2);
  });

  it('ไม่มีข้อมูลของชั่วโมงนั้น → null ไม่โยน', () => {
    expect(windFieldForHour(makeWG(6, 14000, () => [1, 1]), 'ไม่มี', grid, CNX)).toBe(null);
    expect(windFieldForHour(null, 'T', grid, CNX)).toBe(null);
    expect(windFieldForHour({ byTime: { T: [] }, n: 6, lats: [], lngs: [] }, 'T', grid, CNX)).toBe(null);
  });

  it('ครอบ 1.4R แล้วต้องไม่มีเซลล์ไหนถูก clamp แม้กริดเอนจินเลื่อนตามลม 0.32R', () => {
    // สนามลมไล่ระดับตามลองจิจูด ถ้าเซลล์ไหนถูก clamp ค่าจะไปกองที่ขอบ (0 หรือ 5)
    const wg = makeWG(6, 1.4 * 10000, (_j, i) => [i, 0]);
    const shifted = { N: 20, R: 10000, cx: 0.32 * 10000, cy: 0 };   // เลื่อนไปทางตะวันออกสุด
    const w = windFieldForHour(wg, 'T', shifted, CNX);
    const east = w.windU[19];                                        // เซลล์ขอบตะวันออกของแถวบน
    expect(east, 'ขอบท้ายลมต้องยังอยู่ในกริด ไม่ติดค่าสูงสุด 5').toBeLessThan(5 - 1e-6);
    expect(east).toBeGreaterThan(4);                                 // แต่ต้องใกล้ขอบ
  });

  it('กริดที่ครอบเล็กกว่าโดเมน → clamp ที่ขอบ ไม่ NaN', () => {
    const w = windFieldForHour(makeWG(6, 3000, () => [2, 2]), 'T', grid, CNX);
    for (const v of w.windU) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('attachWindField', () => {
  it('ใส่ให้ทุกชั่วโมงที่มีข้อมูล และรายงานจำนวน', () => {
    const wg = makeWG(6, 14000, () => [2, 0], 'A');
    wg.byTime.B = wg.byTime.A;
    const hours = [{ t: 'A' }, { t: 'B' }, { t: 'ไม่มี' }];
    const info = attachWindField(hours, wg, grid, CNX);
    expect(info).toMatchObject({ hours: 2, total: 3 });
    expect(hours[0].windU.length).toBe(400);
    expect(hours[2].windU).toBeUndefined();
  });
});
