import { describe, it, expect } from 'vitest';
import { run } from '../src/index.js';
import { PUFF_CASES } from './fixtures';

/**
 * เกณฑ์รับงานข้อ 2 ของ HANDOFF-terrain-mode.md — ภูมิประเทศสังเคราะห์
 *
 * แอ่งอยู่ที่จุดเผา สันเขาขวางทางตะวันตกเฉียงใต้ ลมพัดจาก 45° ไปทาง SW
 * ต้องเห็นสามอย่างเมื่อเทียบกับพื้นราบด้วยพารามิเตอร์เดียวกัน
 *   1. ควันกระจุกในแอ่ง — พีคระดับพื้นสูงกว่าพื้นราบชัดเจน
 *   2. ควันข้ามสันเขาไปอีกฝั่งน้อยกว่าพื้นราบชัดเจน
 *   3. ค่าที่พื้นต้องไม่หายเป็นศูนย์ (บั๊กเดิม: σ ผูกกับระยะทางที่ puff เดิน
 *      พอ puff ชะงักที่ก้นแอ่ง σz แช่ ควันค้างกลางอากาศไม่ลงถึงพื้น)
 */

/** รวมค่าในกริดเฉพาะเซลล์ที่อยู่อีกฝั่งของสันเขา
 *  สันเขาใน syntheticDem อยู่ที่ x + y = -3500/0.7071 ≈ -4950 กว้าง ~1800 ม.
 *  "อีกฝั่ง" = เลยยอดไปหนึ่งความกว้าง ทางท้ายลม */
function beyondRidge(res: any) {
  const { N, cell, cx, cy, R, maxGrid } = res;
  let sum = 0, n = 0;
  for (let j = 0; j < N; j++) {
    const y = cy + R - (j + 0.5) * cell;
    for (let i = 0; i < N; i++) {
      const x = cx - R + (i + 0.5) * cell;
      if (x + y < -4950 - 1800) { sum += maxGrid[j * N + i]; n++; }
    }
  }
  return { sum, cells: n };
}

describe('ภูมิประเทศสังเคราะห์ (HANDOFF เกณฑ์ข้อ 2)', () => {
  // เทียบกับพื้นราบที่ใช้ลม/ความเสถียร/ชั้นผสมเดียวกันกับเคส terrain
  const flatP = structuredClone(PUFF_CASES.puffTerrain);
  delete (flatP as any).elev;
  const terrain = run(structuredClone(PUFF_CASES.puffTerrain));
  const flat = run(flatP);
  const peak = (r: any) => Math.max(...r.perHour.map((h: any) => h.max));

  it('ใช้ DEM จริง', () => {
    expect(terrain.perHour[0].terrain).toBe(true);
    expect(terrain.perHour[0].relief).toBeGreaterThan(500);
  });

  it('ค่าที่พื้นต้องไม่หายเป็นศูนย์', () => {
    expect(peak(terrain), `พีค terrain ${peak(terrain).toFixed(3)} µg/m³`).toBeGreaterThan(1);
  });

  it('ควันกระจุกในแอ่ง — พีคสูงกว่าพื้นราบชัดเจน', () => {
    const ratio = peak(terrain) / peak(flat);
    expect(ratio, `terrain ${peak(terrain).toFixed(1)} vs flat ${peak(flat).toFixed(1)} (×${ratio.toFixed(2)})`)
      .toBeGreaterThan(1.5);
  });

  it('ควันข้ามสันเขาน้อยกว่าพื้นราบชัดเจน', () => {
    const t = beyondRidge(terrain), f = beyondRidge(flat);
    expect(f.sum, 'พื้นราบต้องมีควันข้ามไปให้เทียบ').toBeGreaterThan(0);
    const ratio = t.sum / f.sum;
    expect(ratio, `อีกฝั่งสันเขา terrain ${t.sum.toFixed(1)} vs flat ${f.sum.toFixed(1)} (${f.cells} เซลล์ · ×${ratio.toFixed(3)})`)
      .toBeLessThan(0.5);
  });
});
