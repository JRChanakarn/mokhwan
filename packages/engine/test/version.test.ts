/** VERSION ที่ export ต้องไม่หลุดจาก package.json ไม่งั้นบันทึกการรันจะโกหก */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { VERSION } from '../src/index.js';

describe('VERSION', () => {
  it('ตรงกับ version ใน package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(VERSION).toBe(pkg.version);
  });
});
