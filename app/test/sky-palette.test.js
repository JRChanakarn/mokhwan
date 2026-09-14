import { describe, it, expect } from 'vitest';
import { skyFor, sunDirection, isDaylight } from '../src/map3d/sky-palette.js';

const key = h => `2026-03-15T${String(h).padStart(2, '0')}:00`;

describe('skyFor — ต้องเหมือน app.js เดิมเป๊ะ', () => {
  it('กลางคืนมืด', () => expect(skyFor(key(3))).toEqual({ sky:'#0b1220', hor:'#1d2a3d', fog:'#141d2a' }));
  it('เช้าตรู่อุ่น',  () => expect(skyFor(key(7))).toEqual({ sky:'#4a5f86', hor:'#e0a765', fog:'#c8b49a' }));
  it('กลางวันสว่าง',  () => expect(skyFor(key(12))).toEqual({ sky:'#5f8fc4', hor:'#b9cbdc', fog:'#c3ceda' }));
  it('เย็นส้ม',       () => expect(skyFor(key(17))).toEqual({ sky:'#3f5c88', hor:'#e09a5e', fog:'#c2ae97' }));
  it('คีย์เสียใช้เที่ยงเป็นค่าสำรอง', () => expect(skyFor('')).toEqual(skyFor(key(12))));
  /* ตรึงข้อบกพร่องที่ยกมาจากของเดิมไว้ ไม่ใช่พฤติกรรมที่ต้องการ แต่ต้องพิสูจน์ว่าการย้าย
     ไม่เปลี่ยนอะไรของโหมด MapLibre — จดแก้ไว้ใน BACKLOG.md แล้ว */
  it('เที่ยงคืนถูกอ่านเป็นเที่ยงวัน (ข้อบกพร่องเดิม ตั้งใจคงไว้)', () =>
    expect(skyFor(key(0))).toEqual(skyFor(key(12))));
});

describe('sunDirection', () => {
  it('เที่ยงวันที่แม่ฮ่องสอน ดวงอาทิตย์อยู่สูง', () => {
    const d = sunDirection(key(12), 19.3);
    expect(d.z).toBeGreaterThan(0.8);
  });
  it('เป็นเวกเตอร์หนึ่งหน่วย', () => {
    const d = sunDirection(key(9), 19.3);
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 6);
  });
  it('เช้าอยู่ทางตะวันออก เย็นอยู่ทางตะวันตก', () => {
    expect(sunDirection(key(8),  19.3).x).toBeGreaterThan(0);
    expect(sunDirection(key(16), 19.3).x).toBeLessThan(0);
  });
  it('กลางคืนดวงอาทิตย์อยู่ใต้ขอบฟ้า', () => {
    expect(sunDirection(key(1), 19.3).z).toBeLessThan(0);
    expect(isDaylight(key(1))).toBe(false);
    expect(isDaylight(key(12))).toBe(true);
  });
});
