import { describe, it, expect } from 'vitest';
import { run } from '../src/index.js';
import { ALL_CASES } from './fixtures';

/**
 * ก้าว 5 ข้อ 4 — โหมด puff ใช้เวลานาน ต้องมีความคืบหน้าไม่ใช่ค้างเงียบ
 * เอนจินรับ hooks.onProgress(hourDone, totalHours) แบบ optional เรียกเมื่อจบแต่ละชั่วโมง
 * ห้ามเปลี่ยนผลลัพธ์ ไม่ว่าจะส่ง hooks หรือไม่
 */
describe('run(P, hooks) — ความคืบหน้ารายชั่วโมง', () => {
  it.each([['dawnF', 1], ['multi3h', 3], ['long6h', 6], ['puffFlat', 1], ['puffTerrain', 1]])(
    '%s เรียก onProgress %i ครั้ง ตามลำดับ', (name, nH) => {
      const calls: [number, number][] = [];
      run(structuredClone((ALL_CASES as any)[name]), { onProgress: (h, t) => calls.push([h, t]) });
      expect(calls).toEqual(Array.from({ length: nH as number }, (_, i) => [i + 1, nH]));
    });

  it('ผลลัพธ์เท่ากันทุกบิตไม่ว่าจะส่ง hooks หรือไม่', () => {
    for (const name of ['multi3h', 'puffTerrain']) {
      const a = run(structuredClone((ALL_CASES as any)[name]));
      const b = run(structuredClone((ALL_CASES as any)[name]), { onProgress: () => {} });
      expect(b.perHour.map(h => h.max)).toEqual(a.perHour.map(h => h.max));
      expect(Array.from(b.maxGrid)).toEqual(Array.from(a.maxGrid));
    }
  });

  it('ไม่ส่ง hooks หรือส่งวัตถุว่าง ก็ต้องรันได้', () => {
    expect(() => run(structuredClone(ALL_CASES.dawnF))).not.toThrow();
    expect(() => run(structuredClone(ALL_CASES.dawnF), {})).not.toThrow();
  });
});
