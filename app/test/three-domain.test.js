/**
 * ฉาก 3 มิติต้องใช้ `res` ของรอบคำนวณล่าสุดเสมอ ไม่ใช่ของตอนสร้างฉาก
 *
 * บั๊กจริงที่เจ้าของงานเห็นจากภาพ: เปลี่ยนทิศลมแล้วก้อนควันลอยห่างจากกองไฟไปหลายกิโลเมตร
 * ทั้งที่ชั้นทาบพื้นยังถูก · ต้นตอคือศูนย์กลางโดเมน `(cx, cy)` **เลื่อนไปท้ายลมทุกรอบ**
 * แต่โมดูลฝั่ง three จำ `res` ไว้ตั้งแต่ตอน `create3D()` แล้วไม่รับใหม่อีกเลย
 * อาการหายเองเมื่อกด 2D→3D เพราะฉากถูกสร้างใหม่ — จึงหลอกให้คิดว่าเป็นบั๊กการวาด
 *
 * วัดจากแอปจริงตอนจับได้: สลับลม 270°→180° แล้วกล่องเหลื่อม (+3200, −3200) ม.
 * ซึ่งเท่ากับระยะที่ศูนย์กลางโดเมนขยับพอดี
 *
 * เทสต์นี้ตรึงที่ "ตำแหน่งที่วาดจริง" ไม่ใช่แค่ว่ามีการส่ง res เข้าไป เพราะจุดที่พังคือ
 * ค่าที่ไปโผล่บนจอ และต้องยืนยันด้วยว่าเทสต์แยกสองกรณีออกจากกันได้จริง (ดู sanity check)
 */
import { describe, it, expect } from 'vitest';
import { createVolume } from '../src/map3d/three/volume-mesh.js';
import { createMarkers, createGroundImage } from '../src/map3d/three/markers.js';
import { buildField } from '../src/map3d/three/volume-field.js';

const N = 24, R = 6000, cell = 2 * R / N;
/** โดเมนของ "รอบเก่า" กับ "รอบใหม่" — ต่างกันแค่ศูนย์กลาง เหมือนตอนลมเปลี่ยนทิศ */
const resOld = { N, cell, cx: 0, cy: 2000, R };
const resNew = { N, cell, cx: 2000, cy: -1000, R };

const hour = { Hsm: 40, Hfl: 90, qSm: 5, qFl: 3, stab: 'D', mix: 800 };
const bands = [{ lo: 15, c: '#9fd6ff' }, { lo: 25, c: '#5bc85b' }, { lo: 37.5, c: '#f2d24b' }];
const opts = { pexag: 1, exag: 1, smokeOpacity: 0.55 };

/** ควันเป็นหย่อมอยู่ค่อนไปทางหนึ่ง เพื่อให้กล่องที่ย่อแล้วไม่สมมาตรกับโดเมน */
const patch = () => {
  const g = new Float32Array(N * N);
  for (let j = 8; j < 13; j++) for (let i = 14; i < 21; i++) g[j * N + i] = 60;
  return g;
};

describe('ก้อนควัน 3 มิติต้องวางด้วยศูนย์กลางโดเมนของรอบล่าสุด', () => {
  const grid = patch();
  const volume = createVolume({ res: resOld, elevTexture: null, elevMin: 0, elevMax: 0, bands });
  volume.update({ res: resNew, grid, hour, opts, step: 1, bg: 0 });

  const want = buildField({ grid, res: resNew, hour, step: 1, Nz: 48, pexag: opts.pexag });
  const stale = buildField({ grid, res: resOld, hour, step: 1, Nz: 48, pexag: opts.pexag });

  it('กล่องอยู่ตรงที่ res ของรอบใหม่บอก', () => {
    expect(volume.mesh.position.x).toBeCloseTo(want.boxX, 6);
    expect(volume.mesh.position.y).toBeCloseTo(want.boxY, 6);
  });

  it('sanity check: res เก่ากับใหม่ให้คนละตำแหน่งจริง เทสต์ข้างบนจึงแยกสองกรณีได้', () => {
    expect(Math.hypot(want.boxX - stale.boxX, want.boxY - stale.boxY)).toBeGreaterThan(cell);
  });

  /* uElevOffsetUv บอก shader ว่ากล่องไปตกตรงไหนของ texture ความสูงซึ่งปูเต็มโดเมน
     ค่านี้วัด**เทียบกับโดเมน** จึงเท่ากันทั้งสอง res — กรณีค้างทั้งยวงจับด้วยเทสต์ตำแหน่งข้างบน
     ที่ตรึงตรงนี้คือการแก้ครึ่งเดียว: วางกล่องด้วย res ใหม่แต่คิด uniform ด้วย res เก่า
     แล้วควันจะถูกภูเขาคนละลูกบัง ซึ่งพังเงียบกว่าตำแหน่งกล่องอีก */
  it('uElevOffsetUv ใช้ res ตัวเดียวกับที่วางกล่อง — กันแก้ครึ่งเดียว', () => {
    const u = volume.mesh.material.uniforms.uElevOffsetUv.value;
    expect(u.x).toBeCloseTo((want.boxX - want.boxW / 2 - (resNew.cx - R)) / (2 * R), 6);
    expect(u.y).toBeCloseTo((want.boxY - want.boxD / 2 - (resNew.cy - R)) / (2 * R), 6);
  });

  it('ไม่ส่ง res มาก็ยังใช้ของตอนสร้างฉากได้เหมือนเดิม (ผู้เรียกเก่าไม่พัง)', () => {
    const v2 = createVolume({ res: resOld, elevTexture: null, elevMin: 0, elevMax: 0, bands });
    v2.update({ grid, hour, opts, step: 1, bg: 0 });
    expect(v2.mesh.position.x).toBeCloseTo(stale.boxX, 6);
    expect(v2.mesh.position.y).toBeCloseTo(stale.boxY, 6);
  });
});

describe('ชั้นทาบพื้นและหมุดก็ผูกกับโดเมนเดียวกัน', () => {
  it('ระนาบภาพที่พื้นย้ายตามศูนย์กลางโดเมนใหม่', () => {
    const ground = createGroundImage({ res: resOld });
    expect([ground.mesh.position.x, ground.mesh.position.y]).toEqual([resOld.cx, resOld.cy]);
    // visible:false ก็ต้องย้าย — ไม่งั้นเปิดชั้นนี้ทีหลังแล้วภาพไปตกนอกแผ่น
    ground.update({ res: resNew, visible: false });
    expect([ground.mesh.position.x, ground.mesh.position.y]).toEqual([resNew.cx, resNew.cy]);
  });

  /* หมุดตัวรับสุ่มความสูงพื้นด้วย elevAt(raw, res, …) ซึ่งแปลงพิกัดเอนจิน→ดัชนีกริดด้วย
     (cx,cy) ถ้าค้าง หมุดจะถูกยกด้วยความสูงของจุดอื่นในโดเมน */
  it('หมุดตัวรับยกด้วยความสูงที่จุดของตัวเอง ไม่ใช่ของโดเมนเก่า', () => {
    // ความสูงไล่ระดับตามแกน i: จุดเดียวกันในโลกจึงได้คนละค่าเมื่อโดเมนเลื่อน
    const raw = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) raw[j * N + i] = i * 10;

    const mk = createMarkers({ res: resOld });
    mk.setTerrain(raw, 1);
    mk.update({ res: resNew, receptors: [{ x: 1500, y: 0, color: '#fff' }] });
    const sphere = mk.group.children[0];

    // ดัชนี i ของจุด x=1500 ในโดเมนใหม่ · ความสูง = i·10 ตามที่ปูไว้
    const i = Math.round((1500 - (resNew.cx - R)) / cell - 0.5);
    expect(sphere.position.z).toBeGreaterThan(i * 10 - 10);
    expect(sphere.position.z).toBeLessThan(i * 10 + Math.max(cell * 0.5, 45) * 1.2 + 10);
  });
});
