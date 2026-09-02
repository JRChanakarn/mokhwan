import type { RunParams, RunResult } from './types.js';
import { runGauss } from './gaussian.js';
import { runPuff } from './puff.js';

/**
 * พื้นผิวสาธารณะ — ตรงตามสเปก §6 เท่านั้น
 *
 * เดิม re-export ของภายในออกไปด้วย (`concAt` `prep` `runGauss` `boxBlur`
 * `makeSampler`) ซึ่งไม่มีใครในโปรเจกต์ต้องใช้จากข้างนอก และ `concAt`/`prep`
 * ยังใช้ type `Prepared` ที่ไม่ได้ export ทำให้ผู้ใช้เรียกในโค้ดที่มี type ไม่ได้เลย
 * ตอนนี้ยังเป็น 0.1.0 การหุบให้แคบไม่มีต้นทุน หลัง publish แล้วจะเป็น breaking change
 * ถ้าวันหนึ่งต้องเปิดของภายใน ให้เปิดพร้อม type ที่จำเป็นด้วย
 */
export * from './types.js';
export { sigmas, plumeRise } from './briggs.js';
export { windField } from './wind.js';
export { runPuff } from './puff.js';

/**
 * จุดเข้าหลัก — เลือกแบบจำลองตาม P.model
 *
 * ตรรกะเดียวกับบรรทัด 519-520 ของ smoke-plume-studio-lasted.html
 * ย้าย dispatch มาไว้ที่นี่เพื่อตัด cycle gaussian <-> puff
 * (เดิม run() ใน gaussian เรียก runPuff() ซึ่งเรียก prep() กลับมา)
 */
export function run(P: RunParams): RunResult {
  if (P.model === 'puff') return runPuff(P);
  return runGauss(P);
}
