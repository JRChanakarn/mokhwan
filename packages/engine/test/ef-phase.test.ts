/**
 * แยกอัตราปล่อย PM2.5 ระหว่างเฟสเปลวไฟกับเฟสคุกรุ่น
 *
 * ก่อนหน้านี้โค้ดแยกเฉพาะ**แรงยกตัว** (SMOLD_HEAT = 0.06) แต่มวล PM2.5 ถูกหาร
 * ด้วยสัดส่วนมวลเฉยๆ เท่ากับสมมติว่า EF ของสองเฟสเท่ากัน ซึ่งขัดกับที่วัดได้
 *
 * Oanh et al. (2011) Atmos. Environ. 45(2):493-502 doi:10.1016/j.atmosenv.2010.09.023
 * ฟางข้าวในไทย · เผากระจาย (เฟสเปลวไฟเด่น) 4.7 ± 2.2 ก./กก. ·
 * เผากอง (เฟสคุกรุ่นหนัก) 20 ± 8 ก./กก. → อัตราส่วนราว 4.3 เท่า
 *
 * **มวลรวมต้องคงเดิม** ค่า EF ที่ผู้ใช้กรอกคือค่าเฉลี่ยทั้งไฟที่วัดมาจากสนาม
 * พารามิเตอร์ตัวนี้จึงย้ายมวลระหว่างสองความสูง ไม่ใช่เพิ่มมวลที่ปล่อย
 */
import { describe, it, expect } from 'vitest';
import { prep } from '../src/sources.js';
import { run } from '../src/index.js';
import type { RunParams, Fire, HourWx } from '../src/types.js';

const fire = (over: Partial<Fire> = {}): Fire => ({
  pts: [[0, 0]], side: 400, fuelKg: 50_000, totalG: 400_000, smold: 0.5, rai: 100, ...over,
});
const hour: HourWx = { t: '2026-03-01T09:00', dt: 3600, ws: 2, wdir: 180,
                       stab: 'D', mix: 800, precip: 0, temp: 30, rh: 40 };
const params = (f: Fire): RunParams => ({
  fires: [f], hours: [hour], weights: [1], progress: [0],
  grid: { N: 40, R: 4000, cx: 0, cy: 0 }, receptors: [], bg: 0, avg: 60,
  depo: false, reqId: 1,
});

describe('efRatio — EF ของเฟสคุกรุ่นเทียบเฟสเปลวไฟ', () => {
  it('ไม่ส่งมา = พฤติกรรมเดิมเป๊ะ (เท่ากับ efRatio 1)', () => {
    const a = prep(params(fire()), hour, 0);
    const b = prep(params(fire({ efRatio: 1 })), hour, 0);
    expect(a.qFl).toBeCloseTo(b.qFl, 12);
    expect(a.qSm).toBeCloseTo(b.qSm, 12);
  });

  it('มวลรวมที่ปล่อยคงเดิมทุกค่าของ efRatio — ย้ายมวล ไม่ใช่เพิ่มมวล', () => {
    const base = prep(params(fire()), hour, 0);
    const total = base.qFl + base.qSm;
    for (const r of [1, 2, 4.3, 10]) {
      const c = prep(params(fire({ efRatio: r })), hour, 0);
      expect(c.qFl + c.qSm, `efRatio ${r}`).toBeCloseTo(total, 9);
    }
  });

  it('efRatio สูงขึ้น = มวลย้ายไปเฟสคุกรุ่นมากขึ้น', () => {
    const one = prep(params(fire({ efRatio: 1 })), hour, 0);
    const four = prep(params(fire({ efRatio: 4.3 })), hour, 0);
    expect(four.qSm).toBeGreaterThan(one.qSm);
    expect(four.qFl).toBeLessThan(one.qFl);
  });

  it('ค่าที่คำนวณได้ตรงกับสูตรถ่วงน้ำหนัก', () => {
    const r = 4.3, fsm = 0.5;                       // smold 0.5 · progress 0 → f_sm = 0.5
    const c = prep(params(fire({ efRatio: r })), hour, 0);
    const Q = 400_000 / 3600;                       // ก./วิ ของทั้งไฟ
    const denom = (1 - fsm) + r * fsm;
    expect(c.qFl).toBeCloseTo(Q * (1 - fsm) / denom, 9);
    expect(c.qSm).toBeCloseTo(Q * r * fsm / denom, 9);
  });

  it('ไฟที่ไม่มีเฟสคุกรุ่นเลย efRatio ไม่มีผล', () => {
    const a = prep(params(fire({ smold: 0, efRatio: 1 })), hour, 0);
    const b = prep(params(fire({ smold: 0, efRatio: 4.3 })), hour, 0);
    expect(a.qFl).toBeCloseTo(b.qFl, 12);
    expect(a.qSm).toBeCloseTo(b.qSm, 12);
  });

  it('ค่าที่ไม่สมเหตุสมผลถูกกันไว้ ไม่ทำให้ได้ NaN', () => {
    for (const bad of [0, -3, NaN]) {
      const c = prep(params(fire({ efRatio: bad as number })), hour, 0);
      expect(Number.isFinite(c.qFl), `efRatio ${bad}`).toBe(true);
      expect(Number.isFinite(c.qSm), `efRatio ${bad}`).toBe(true);
      // อัตราปล่อยติดลบคือค่าที่ finite แต่ไม่มีความหมายทางกายภาพ ต้องกันด้วย
      expect(c.qFl, `efRatio ${bad} ห้ามติดลบ`).toBeGreaterThanOrEqual(0);
      expect(c.qSm, `efRatio ${bad} ห้ามติดลบ`).toBeGreaterThanOrEqual(0);
      // และต้องได้พฤติกรรมเดิม (efRatio 1) ไม่ใช่แค่ไม่พัง
      const one = prep(params(fire({ efRatio: 1 })), hour, 0);
      expect(c.qFl, `efRatio ${bad} ต้องถอยไปใช้ 1`).toBeCloseTo(one.qFl, 9);
      expect(c.qSm, `efRatio ${bad} ต้องถอยไปใช้ 1`).toBeCloseTo(one.qSm, 9);
    }
  });

  it('ผลที่พื้นสูงขึ้นเมื่อย้ายมวลไปเฟสคุกรุ่น เพราะควันนั้นลอยต่ำและกระจายแย่กว่า', () => {
    const one = run(params(fire({ efRatio: 1 })));
    const four = run(params(fire({ efRatio: 4.3 })));
    expect(four.perHour[0].max).toBeGreaterThan(one.perHour[0].max);
    // ความสูงพลูมของสองเฟสต้องต่างกันจริง ไม่งั้นการย้ายมวลจะไม่มีความหมาย
    expect(one.perHour[0].Hsm).toBeLessThan(one.perHour[0].Hfl);
  });
});
