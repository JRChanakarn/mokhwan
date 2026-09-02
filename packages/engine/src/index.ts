import type { RunParams, RunResult } from './types.js';
import { runGauss } from './gaussian.js';
import { runPuff } from './puff.js';

export * from './types.js';
export { sigmas, plumeRise } from './briggs.js';
export { boxBlur, windField, makeSampler } from './wind.js';
export { prep } from './sources.js';
export { concAt, runGauss } from './gaussian.js';
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
