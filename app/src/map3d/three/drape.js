/**
 * drape — ปูรูปหลายเหลี่ยมและภาพให้เลาะไปตามผิวภูมิประเทศ
 *
 * ถ้าวางแปลงเผาไว้ที่ z = 0 เฉยๆ มันจะจมหายใต้ภูเขาทันทีที่พื้นตรงนั้นสูงกว่าศูนย์
 * ซึ่งในเชียงใหม่คือ "เกือบทุกที่" ทุกจุดจึงต้องยกตามความสูงจริงของพื้นใต้จุดนั้น
 * แล้วยกเพิ่มอีกนิด (`lift`) กัน z-fighting กับเมชภูมิประเทศ
 *
 * นี่คือกับดักเดียวกับที่ทำให้ก้อนควันหายไปทั้งก้อนตอนแรก (ดู volume-field.js)
 * — ทุกอย่างที่เอนจินให้มาเป็นพิกัดบนพื้นราบ ผู้วาดต้องบวกความสูงพื้นเองเสมอ
 */

/**
 * ความสูงพื้นที่พิกัดเอนจิน (x, y) — bilinear บนกริดที่ค่าอยู่ตรง**ศูนย์กลางเซลล์**
 * จึงต้องลบ 0.5 ออกจากดัชนีก่อน ไม่งั้นจะเลื่อนไปครึ่งเซลล์ทั้งแผ่น
 */
export function elevAt(raw, res, x, y) {
  if (!raw) return 0;
  const { N, cell, cx, cy, R } = res;
  const fi = (x - (cx - R)) / cell - 0.5;
  const fj = ((cy + R) - y) / cell - 0.5;        // j เพิ่มลงทางใต้ ตรงกับกริดของเอนจิน
  const cl = (v, hi) => (v < 0 ? 0 : v > hi ? hi : v);
  const i0 = cl(Math.floor(fi), N - 1), j0 = cl(Math.floor(fj), N - 1);
  const i1 = cl(i0 + 1, N - 1), j1 = cl(j0 + 1, N - 1);
  const tx = cl(fi - i0, 1), ty = cl(fj - j0, 1);
  const a = raw[j0 * N + i0], b = raw[j0 * N + i1], c = raw[j1 * N + i0], d = raw[j1 * N + i1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/** วงรอบในพิกัดเอนจิน [[x,y],…] → จุดยอด 3 มิติที่เลาะผิวดิน */
export function drapeRing(points, { raw, res, exag = 1, lift = 6 }) {
  const out = new Float32Array(points.length * 3);
  for (let k = 0; k < points.length; k++) {
    const [x, y] = points[k];
    out[k * 3] = x;
    out[k * 3 + 1] = y;
    out[k * 3 + 2] = elevAt(raw, res, x, y) * exag + lift;
  }
  return out;
}
