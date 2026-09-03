import { describe, it, expect } from 'vitest';
import { run } from '../src/index.js';
import { ALL_CASES } from './fixtures';

/**
 * พื้นความปั่นป่วนของ σ (`sigmaWsFloor`) — ปรับได้จากภายนอก
 *
 * เดิมเป็นค่าคงที่ 1.0 ฝังในโมดูล ซึ่งเป็นสมมติฐานเชิงแบบจำลองที่ผู้ใช้ควรทบทวนได้
 * (BACKLOG บั๊กข้อ 4) · ค่าปริยายต้องเท่าเดิมเป๊ะ ไม่งั้น golden ทั้งชุดขยับ
 */
describe('sigmaWsFloor', () => {
  const calm = () => structuredClone(ALL_CASES.puffTerrainCalm);
  const peak = (p: any) => Math.max(...run(p).perHour.map((h: any) => h.max));

  it('ไม่ส่งค่า = 1.0 เป๊ะ', () => {
    expect(peak(calm())).toBe(peak({ ...calm(), sigmaWsFloor: 1.0 }));
  });

  it('ยิ่งพื้นสูง ควันยิ่งลงถึงพื้นมากขึ้น (ลมนิ่ง 0.4 m/s)', () => {
    const p0 = peak({ ...calm(), sigmaWsFloor: 0 });
    const p1 = peak({ ...calm(), sigmaWsFloor: 1.0 });
    const p2 = peak({ ...calm(), sigmaWsFloor: 2.0 });
    expect(p0, `ไม่มีพื้น = อาการเดิม ${p0.toFixed(2)}`).toBeLessThan(1);
    expect(p1).toBeGreaterThan(p0 * 100);
    expect(p2).toBeGreaterThan(p1);
  });

  it('ไม่มีผลเมื่อลมแรงกว่าพื้นอยู่แล้ว', () => {
    const a = peak(structuredClone(ALL_CASES.puffTerrain));                       // ws 1.3
    const b = peak({ ...structuredClone(ALL_CASES.puffTerrain), sigmaWsFloor: 0 });
    expect(b).toBe(a);
  });

  it('ไม่กระทบโหมด gaussian', () => {
    const a = peak(structuredClone(ALL_CASES.dawnF));
    const b = peak({ ...structuredClone(ALL_CASES.dawnF), sigmaWsFloor: 5 });
    expect(b).toBe(a);
  });
});
