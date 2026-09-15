import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { volumeVert, volumeFrag } from '../src/map3d/three/volume.glsl.js';

/**
 * shader เก็บเป็น template literal ของ JS · backtick ที่หลุดเข้าไปในคอมเมนต์ GLSL
 * จะปิดสตริงกลางคัน แล้ว build พังด้วยข้อความ "Expected a semicolon" ที่ชี้ไปคนละเรื่อง
 * เสียเวลาไล่สองรอบแล้ว จึงตรึงไว้
 */
describe('volume.glsl.js', () => {
  it('ไม่มี backtick หลุดในตัว shader', () => {
    expect(volumeVert).not.toContain('`');
    expect(volumeFrag).not.toContain('`');
  });

  it('คอมเมนต์ JS ด้านบนมี backtick ได้ แต่ต้องอยู่นอกสตริง shader', () => {
    const src = readFileSync(new URL('../src/map3d/three/volume.glsl.js', import.meta.url), 'utf8');
    // ตัวไฟล์ import ผ่านแล้วแปลว่า parse ได้ · ที่เหลือคือยืนยันว่าสตริงไม่ว่างเปล่า
    expect(src.length).toBeGreaterThan(1000);
    expect(volumeVert.trim().length).toBeGreaterThan(50);
    expect(volumeFrag.trim().length).toBeGreaterThan(500);
  });

  it('ประกาศ uniform ครบตามที่ volume-mesh.js ส่งให้', () => {
    for (const u of ['uBoxSize','uCamLocal','uField','uElev','uLut','uVmax','uK','uElevScale',
                     'uBoxZ0','uAglZ0','uAglH','uLutLo','uLutHi','uSteps','uBg','uCMin',
                     'uElevScaleUv','uElevOffsetUv','uSunDir','uAmbient','uAlphaCap','uKLight']) {
      expect(volumeFrag, `ขาด uniform ${u}`).toContain(u);
    }
  });

  it('ต้องเป็น GLSL3 — ใช้ texture() กับ sampler3D ซึ่งไม่มีใน GLSL1', () => {
    expect(volumeFrag).toContain('sampler3D');
    expect(volumeFrag).toContain('out vec4 fragColor');
    expect(volumeFrag).not.toContain('gl_FragColor');   // ของ GLSL1 ใช้ร่วมกันไม่ได้
  });
});
