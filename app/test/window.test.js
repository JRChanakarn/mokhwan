import { describe, it, expect } from 'vitest';
import { run } from 'mokhwan-engine';
import { hourWeights } from '../src/services/emission.js';

/**
 * เทสนี้ตอบคำถามเดียว: **ตั้ง "ดูยาว" เกิน "เผานาน" แล้วเกิดอะไรขึ้นจริง**
 *
 * รันเอนจินตัวจริง ไม่ใช่ mock เพราะประเด็นทั้งหมดอยู่ที่พฤติกรรมของเอนจิน
 * เมื่อได้ weights = 0 ซึ่งเป็นสิ่งที่เราไม่ได้เขียนเองและห้ามแก้
 */

const RAI = 1600, N = 60, R = 10000;
const fire = (() => {
  const areaM2 = 20 * RAI, side = Math.sqrt(areaM2), step = side / 5;
  const pts = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) pts.push([(i - 2) * step, (j - 2) * step]);
  const fuelKg = 20 * 0.6 * 1000 * 0.89;
  return { pts, side, fuelKg, totalG: fuelKg * 9.5, smold: 0.18 + 0.62 * 0.35, rai: 20 };
})();

function build(win, burn, model) {
  const hours = Array.from({ length: win }, (_, i) => ({
    t: `2026-03-15T${String(8 + i).padStart(2, '0')}:00`,
    ws: 2, wdir: 45, stab: 'D', mix: 800, precip: 0, dt: 3600, temp: null, rh: null,
  }));
  const { w, p } = hourWeights(win, burn);
  const th = (270 - 45) * Math.PI / 180, ux = Math.cos(th), uy = Math.sin(th);
  return run({
    model, fires: [fire], hours, weights: w, progress: p,
    grid: { N, R, cx: 0.32 * R * ux, cy: 0.32 * R * uy },
    receptors: [], bg: 25, avg: 60, depo: true, reqId: 1,
  });
}

describe('ช่วงจำลองยาวกว่าช่วงเผา — เอนจินรับ weights = 0 ได้', () => {
  it('timeline ยาวเท่าช่วงที่จำลอง ไม่ใช่ช่วงที่เผา', () => {
    expect(build(8, 3, 'gauss').perHour.length).toBe(8);
  });

  it('share เป็นศูนย์เป๊ะหลังไฟดับ', () => {
    const r = build(8, 3, 'gauss');
    r.perHour.slice(0, 3).forEach(h => expect(h.share).toBeGreaterThan(0));
    r.perHour.slice(3).forEach(h => expect(h.share).toBe(0));
  });

  it('ไม่มี NaN หรือค่าติดลบหลุดออกมาสักตัว', () => {
    for (const m of ['gauss', 'puff']) {
      const r = build(8, 3, m);
      for (const g of r.grids) for (const v of g) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('มวลที่ปล่อยรวมเท่าเดิมไม่ว่าจะดูยาวแค่ไหน — ยืดหน้าต่างไม่ทำให้ควันเพิ่มหรือหาย', () => {
    const a = build(3, 3, 'gauss'), b = build(24, 3, 'gauss');
    const sum = r => r.perHour.reduce((s, h) => s + h.share, 0);
    expect(sum(a)).toBeCloseTo(1, 10);
    expect(sum(b)).toBeCloseTo(1, 10);
    // สามชั่วโมงแรกต้องได้ค่าเท่ากันเป๊ะ การต่อหางไม่ควรกระทบช่วงที่เผา
    for (let h = 0; h < 3; h++) expect(b.perHour[h].max).toBeCloseTo(a.perHour[h].max, 6);
  });
});

/**
 * **เอนจินไม่มีความจำข้ามชั่วโมง — ทั้งสองโมเดล**
 *
 * เคยเข้าใจผิดว่าโหมด puff เก็บก้อนควันข้ามชั่วโมงได้ เพราะเห็น `pf.t > 14400`
 * (4 ชม.) ใน `puff.ts` แต่ `var puffs = []` อยู่**ข้างในลูปชั่วโมง** (บรรทัด 61
 * เทียบกับลูปที่บรรทัด 37) ก้อนควันจึงถูกสร้างใหม่ทุกชั่วโมง และเงื่อนไขอายุ 4 ชม.
 * ไม่มีวันเป็นจริงเพราะหนึ่งชั่วโมงมีแค่ 3,600 วินาที
 *
 * ผลคือ "ดูควันหลังไฟดับ" ทำไม่ได้เลยถ้าไม่แก้เอนจิน เทสชุดนี้ตรึงข้อเท็จจริงนั้นไว้
 * เพื่อไม่ให้ใครสร้างฟีเจอร์บนความเข้าใจผิดเดิมซ้ำอีก
 */
describe('เอนจินไม่มีความจำข้ามชั่วโมง — ข้อเท็จจริงที่จำกัดว่าทำอะไรได้', () => {
  it('gauss ควันหายทันทีที่ไฟดับ', () => {
    const r = build(8, 3, 'gauss');
    expect(r.perHour[2].max).toBeGreaterThan(0);
    r.perHour.slice(3).forEach(h => expect(h.max).toBe(0));
  });

  it('puff ก็หายทันทีเหมือนกัน ไม่ได้เก็บก้อนควันข้ามชั่วโมง', () => {
    const r = build(10, 3, 'puff');
    expect(r.perHour[2].max).toBeGreaterThan(0);
    r.perHour.slice(3).forEach(h => expect(h.max).toBe(0));
  });

  it('ชั่วโมงที่ไม่มีการปล่อย ได้กริดว่างเปล่าทั้งผืน', () => {
    const r = build(6, 2, 'puff');
    for (let h = 2; h < 6; h++) for (const v of r.grids[h]) expect(v).toBe(0);
  });
});
