import { describe, it, expect } from 'vitest';
import { hourWeights } from '../src/services/emission.js';

const sum = a => a.reduce((x, y) => x + y, 0);

describe('hourWeights — ช่วงที่จำลอง ยาวกว่าช่วงที่เผาได้', () => {
  it('ไม่ระบุช่วงจำลอง = เผาตลอดช่วง (พฤติกรรมเดิมเป๊ะ)', () => {
    const a = hourWeights(3);
    const b = hourWeights(3, 3);
    expect(a.w).toEqual(b.w);
    expect(a.p).toEqual(b.p);
  });

  it('มวลรวมที่ปล่อยยังเป็น 1 เสมอ ไม่ว่าช่วงจำลองจะยาวแค่ไหน', () => {
    for (const win of [3, 6, 12, 24]) expect(sum(hourWeights(win, 3).w)).toBeCloseTo(1, 12);
  });

  it('หลังไฟดับ น้ำหนักเป็นศูนย์เป๊ะ — เอนจินจะข้ามชั่วโมงนั้นไปเลย', () => {
    const { w } = hourWeights(24, 3);
    expect(w.length).toBe(24);
    for (let i = 0; i < 3; i++) expect(w[i]).toBeGreaterThan(0);
    for (let i = 3; i < 24; i++) expect(w[i]).toBe(0);
  });

  it('การปล่อยยังหนักสุดชั่วโมงแรกแล้วลดลง', () => {
    const { w } = hourWeights(24, 4);
    expect(w[0]).toBeGreaterThan(w[1]);
    expect(w[1]).toBeGreaterThan(w[2]);
    expect(w[2]).toBeGreaterThan(w[3]);
  });

  it('ความคืบหน้าการเผาไล่ถึง 1 ตอนไฟดับ แล้วค้างที่ 1', () => {
    const { p } = hourWeights(24, 3);
    expect(p.length).toBe(24);
    expect(p[0]).toBeGreaterThan(0);
    expect(p[0]).toBeLessThan(p[1]);
    expect(p[1]).toBeLessThan(p[2]);
    for (let i = 3; i < 24; i++) expect(p[i]).toBe(1);
  });

  it('เผานานกว่าช่วงจำลอง ถูกหนีบไว้ที่ช่วงจำลอง ไม่ทำให้มวลหาย', () => {
    const { w } = hourWeights(3, 10);
    expect(w.length).toBe(3);
    expect(sum(w)).toBeCloseTo(1, 12);
  });

  it('ค่าเพี้ยนไม่ทำให้พัง', () => {
    for (const [win, burn] of [[0, 3], [3, 0], [-5, -2], [1, 1]]) {
      const { w, p } = hourWeights(win, burn);
      expect(w.length).toBeGreaterThanOrEqual(1);
      expect(sum(w)).toBeCloseTo(1, 12);
      for (const v of p) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
