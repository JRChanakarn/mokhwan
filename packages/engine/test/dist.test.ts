import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { CASES, summarise, BG } from './fixtures';
import expected from './golden.expected.json';

/**
 * เทสต์ชั้นนี้จับกรณีที่ซอร์สทำงานแต่ของที่ publish พัง
 * เช่น entry ผิด · export หาย · bundler ตัดโค้ดที่ยังต้องใช้
 *
 * `pretest` ของ root สั่ง build ก่อนทุกครั้ง จึงไม่มีกรณีที่ dist ไม่มีอยู่
 */
describe('dist — ของที่ publish ต้องให้ผลเท่ากับซอร์ส', () => {
  it('esm build ให้ผลตรงค่าอ้างอิงทุกเคส gaussian', async () => {
    const dist = await import('../dist/index.js');
    for (const name of Object.keys(CASES) as (keyof typeof CASES)[]) {
      const want = (expected as any)[name];
      const got = summarise(dist.run(structuredClone(CASES[name])), BG);
      const rel = Math.abs((got.maxGrid.max - want.maxGrid.max) / want.maxGrid.max);
      expect(rel, `${name}.maxGrid.max`).toBeLessThan(1e-10);
      expect(got.maxGrid.over, `${name}.maxGrid.over`).toBe(want.maxGrid.over);
      expect(got.perHour.length, `${name}.perHour.length`).toBe(want.perHour.length);
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
    const got = summarise(mod.run(structuredClone(CASES.dawnF)), BG);
    const want = (expected as any).dawnF;
    expect(Math.abs((got.maxGrid.max - want.maxGrid.max) / want.maxGrid.max)).toBeLessThan(1e-10);
  });
});
