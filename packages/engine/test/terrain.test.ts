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

/**
 * รวมค่าที่พื้นเฉพาะเซลล์ที่ภูมิประเทศสูงกว่า thr — วัด "ควันปีนขึ้นภูเขาไหม" ตรงๆ
 * เป็นการวัดแบบเดียวกับที่ใช้ตรวจรับด้วย DEM จริงของเชียงใหม่ (ดู design note)
 *
 * เลิกใช้วิธีเดิมที่นับ "เลยสันเขาไปหนึ่งความกว้าง" เพราะเขียนหน่วยปนกัน
 * (ลบ 1800 ม. ออกจากผลบวก x+y ซึ่งไม่ใช่ระยะตั้งฉาก) และจุดที่ได้อยู่ไกล 4.77 กม.
 * ซึ่งควันเดินไปไม่ถึงใน 1 ชม. อยู่แล้ว assertion จึงผ่านฟรี — code review จับได้
 */
function massAboveElev(res: any, elev: Float32Array, thr: number) {
  const { N, maxGrid } = res;
  let sum = 0, cells = 0;
  for (let k = 0; k < N * N; k++) if (elev[k] > thr) { sum += maxGrid[k]; cells++; }
  return { sum, cells };
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

  it('ควันไม่ปีนขึ้นสันเขา — มวลที่พื้นบนที่สูงน้อยกว่าพื้นราบชัดเจน', () => {
    const elev = (PUFF_CASES.puffTerrain as any).elev as Float32Array;
    const thr = 600;                                   // สันเขาสังเคราะห์สูงถึง ~920 ม. ฐาน ~300
    const t = massAboveElev(terrain, elev, thr), f = massAboveElev(flat, elev, thr);
    expect(f.cells, 'ต้องมีเซลล์บนที่สูงให้วัด').toBeGreaterThan(50);
    expect(f.sum, 'พื้นราบต้องมีควันขึ้นไปบนที่สูงให้เทียบ').toBeGreaterThan(0);
    const ratio = t.sum / f.sum;
    expect(ratio, `มวลที่พื้นเหนือ ${thr} ม. — terrain ${t.sum.toFixed(1)} vs flat ${f.sum.toFixed(1)} (${f.cells} เซลล์ · ×${ratio.toFixed(3)})`)
      .toBeLessThan(0.2);
  });

  it('พีคอยู่ใกล้จุดเผา — กระจุกจริง ไม่ใช่แค่ค่าสูง', () => {
    expect(terrain.perHour[0].maxDist, `terrain ${terrain.perHour[0].maxDist.toFixed(0)} ม. vs flat ${flat.perHour[0].maxDist.toFixed(0)} ม.`)
      .toBeLessThan(flat.perHour[0].maxDist / 3);
  });
});

describe('ลมนิ่งในแอ่ง — ฉากเช้ามืดที่เป็นหัวใจของเครื่องมือ', () => {
  const calm = run(structuredClone(PUFF_CASES.puffTerrainCalm));
  const peak = Math.max(...calm.perHour.map(h => h.max));

  it('ws 0.4 m/s ก็ยังให้ค่าที่พื้นใช้งานได้ (SIGMA_WS_FLOOR)', () => {
    expect(calm.perHour[0].terrain).toBe(true);
    expect(peak, `พีค ${peak.toFixed(2)} µg/m³ — ถ้าเกือบศูนย์แปลว่าพื้นความปั่นป่วนหายไป`).toBeGreaterThan(5);
  });
});
