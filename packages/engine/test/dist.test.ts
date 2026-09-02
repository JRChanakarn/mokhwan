import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { ALL_CASES, summarise, BG } from './fixtures';
import expected from './golden.expected.json';

/**
 * เทสต์ชั้นนี้จับกรณีที่ซอร์สทำงานแต่ของที่ publish พัง
 * เช่น entry ผิด · export หาย · bundler ตัดโค้ดที่ยังต้องใช้
 *
 * `pretest` ของ root สั่ง build ก่อนทุกครั้ง จึงไม่มีกรณีที่ dist ไม่มีอยู่
 */
describe('dist — ของที่ publish ต้องให้ผลเท่ากับซอร์ส', () => {
  it('esm build ให้ผลตรงค่าอ้างอิงทุกเคส ทั้ง gaussian และ puff', async () => {
    const dist = await import('../dist/index.js');
    // ต้องวน ALL_CASES ไม่ใช่ CASES — CASES มีแต่ gaussian ส่วนโหมด puff
    // (runPuff + windField 229 บรรทัด ก้อนเสี่ยงสุดที่ Task 2 ย้าย) อยู่ใน PUFF_CASES
    // ถ้าวนแค่ CASES การถูก bundler ตัดทิ้งเฉพาะสาย puff จะผ่านเทสต์เขียว
    for (const name of Object.keys(ALL_CASES) as (keyof typeof ALL_CASES)[]) {
      const want = (expected as any)[name];
      const got = summarise(dist.run(structuredClone(ALL_CASES[name])), BG);
      const rel = Math.abs((got.maxGrid.max - want.maxGrid.max) / want.maxGrid.max);
      expect(rel, `${name}.maxGrid.max`).toBeLessThan(1e-10);
      expect(got.maxGrid.over, `${name}.maxGrid.over`).toBe(want.maxGrid.over);
      expect(got.perHour.length, `${name}.perHour.length`).toBe(want.perHour.length);
      expect(got.model, `${name}.model`).toBe(want.model);
    }
  });

  it('export ครบ 5 ตัวตามสัญญาเดิมของ scope.__ENGINE__', async () => {
    const dist = await import('../dist/index.js');
    for (const k of ['run', 'runPuff', 'windField', 'sigmas', 'plumeRise'] as const)
      expect(typeof (dist as any)[k], `ขาด export: ${k}`).toBe('function');
  });

  /**
   * UMD มีไว้ให้คนที่โหลดแบบ CJS หรือแปะ <script> ใช้ จึงโหลดด้วย require
   * แบบที่ผู้ใช้จริงโหลด ไม่ใช่ import แบบ ESM (ซึ่งไม่มี .d.cts ให้อยู่แล้ว)
   */
  it('umd build โหลดแบบ cjs ได้ และ export ครบเท่ากัน', () => {
    const req = createRequire(import.meta.url);
    const mod = req('../dist/index.umd.cjs');
    for (const k of ['run', 'runPuff', 'windField', 'sigmas', 'plumeRise'] as const)
      expect(typeof mod[k], `umd ขาด export: ${k}`).toBe('function');
    // ต้องให้ผลเท่ากับ esm ด้วย ไม่ใช่แค่มีฟังก์ชันครบ
    const got = summarise(mod.run(structuredClone(ALL_CASES.dawnF)), BG);
    const want = (expected as any).dawnF;
    expect(Math.abs((got.maxGrid.max - want.maxGrid.max) / want.maxGrid.max)).toBeLessThan(1e-10);
  });
});
