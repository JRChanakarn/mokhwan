import type { RunParams, RunResult } from './types';
import { runGauss } from './gaussian';
import { runPuff } from './puff';

export * from './types';
export { sigmas, plumeRise } from './briggs';
export { boxBlur, windField, makeSampler } from './wind';
export { prep } from './sources';
export { concAt, runGauss } from './gaussian';
export { runPuff } from './puff';

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
