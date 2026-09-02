import { describe, it, expect } from 'vitest';
import { ALL_CASES, summarise, BG, type GridStat } from './fixtures';
import expected from './golden.expected.json';
import * as ENGINE from '../src/index';

const REL = 1e-10;

function closeTo(actual: number, want: number, path: string) {
  if (want === 0) {
    expect(Math.abs(actual), `${path}: ได้ ${actual} ต้องการ 0`).toBeLessThan(1e-12);
    return;
  }
  const rel = Math.abs((actual - want) / want);
  expect(rel, `${path}: ได้ ${actual} ต้องการ ${want} (คลาด ${rel})`).toBeLessThan(REL);
}

function compareGridStat(a: GridStat, b: GridStat, path: string) {
  closeTo(a.sum, b.sum, `${path}.sum`);
  closeTo(a.max, b.max, `${path}.max`);
  expect(a.over, `${path}.over`).toBe(b.over);              // จำนวนเซลล์ ต้องเท่ากันเป๊ะ
  closeTo(a.overMaxKm, b.overMaxKm, `${path}.overMaxKm`);
  expect(a.truncated, `${path}.truncated`).toBe(b.truncated);
}

describe('golden — พฤติกรรมเอนจินต้องไม่ขยับจากฐานตั้งต้น', () => {
  for (const name of Object.keys(ALL_CASES) as (keyof typeof ALL_CASES)[]) {
    it(name, () => {
      const want = (expected as any)[name];
      const got = summarise(ENGINE.run(structuredClone(ALL_CASES[name])), BG);

      // รูปร่างกริด
      expect(got.N).toBe(want.N);
      for (const k of ['cell', 'cx', 'cy', 'R', 'meanUx', 'meanUy'] as const)
        closeTo(got[k], want[k], k);

      // โหมดที่เอนจินเลือกใช้ — คุม dispatch ของ index.ts (Task 2)
      expect(got.model, 'model').toBe(want.model);

      // ปริมาณรวม
      closeTo(got.totalEmitKg, want.totalEmitKg, 'totalEmitKg');
      closeTo(got.totalFuelT, want.totalFuelT, 'totalFuelT');

      // รายชั่วโมง — ทุกฟิลด์ที่เป็นตัวเลข
      expect(got.perHour.length).toBe(want.perHour.length);
      got.perHour.forEach((h: any, i: number) => {
        for (const [k, v] of Object.entries(want.perHour[i])) {
          if (typeof v === 'number') closeTo(h[k], v, `perHour[${i}].${k}`);
          else expect(h[k], `perHour[${i}].${k}`).toEqual(v);
        }
      });

      // กริดทุกใบ
      expect(got.grids.length).toBe(want.grids.length);
      got.grids.forEach((g, i) => compareGridStat(g, want.grids[i], `grids[${i}]`));
      compareGridStat(got.maxGrid, want.maxGrid, 'maxGrid');
      compareGridStat(got.doseGrid, want.doseGrid, 'doseGrid');

      // จุดรับผลกระทบ — ต้องเช็กความยาวก่อนวน ไม่งั้น array ที่หดจะผ่านเงียบๆ
      // เพราะ forEach วนแค่ดัชนีที่มีอยู่ ไม่เคยถามว่าดัชนีที่หายไปควรมีไหม
      expect(got.recMax.length, 'recMax.length').toBe(want.recMax.length);
      expect(got.recDose.length, 'recDose.length').toBe(want.recDose.length);
      expect(got.recPerHour.length, 'recPerHour.length').toBe(want.recPerHour.length);
      got.recMax.forEach((v: number, i: number) => closeTo(v, want.recMax[i], `recMax[${i}]`));
      got.recDose.forEach((v: number, i: number) => closeTo(v, want.recDose[i], `recDose[${i}]`));
      got.recPerHour.forEach((row: number[], h: number) => {
        expect(row.length, `recPerHour[${h}].length`).toBe(want.recPerHour[h].length);
        row.forEach((v, i) => closeTo(v, want.recPerHour[h][i], `recPerHour[${h}][${i}]`));
      });
    });
  }
});
