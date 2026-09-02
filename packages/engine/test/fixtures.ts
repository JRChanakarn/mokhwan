import type { RunParams, Stability } from '../src/types';

/**
 * ชุด RunParams สำหรับ golden test
 *
 * ค่าทั้งหมดคัดลอกมาจากพฤติกรรมจริงของแอปตั้งต้น (smoke-plume-studio-lasted.html)
 * ไม่ได้เรียก buildFires / buildHours / hourWeights ของฝั่งแอปมาใช้ เพราะ task นี้
 * ล็อก "เอนจิน" ไม่ใช่ "ตัวสร้าง payload" — ตัวสร้าง payload จะมีเทสต์ของตัวเองในแผน B
 */

export const RAI = 1600;               // ตร.ม. ต่อไร่
export const RICE = { load: 0.60, ef: 9.5, cc: 0.89, moist: 0.35 };

/** สร้างแปลงจุดแบบเดียวกับ buildFires() — บรรทัด 274–306 ของบล็อกแอป (= 1139–1171 ของไฟล์ตั้งต้น) */
function ricePointFire(rai: number) {
  const areaM2 = rai * RAI;
  const side = Math.sqrt(areaM2);
  const n = 5, step = side / n;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      pts.push([(i - 2) * step, (j - 2) * step]);
  const fuelKg = rai * RICE.load * 1000 * RICE.cc;
  return {
    pts, side, fuelKg,
    totalG: fuelKg * RICE.ef,
    smold: 0.18 + 0.62 * RICE.moist,
    rai,
  };
}

/** เหมือน hourWeights() — บรรทัด 259–264 ของบล็อกแอป (= 1124–1129 ของไฟล์ตั้งต้น) */
function hourWeights(n: number) {
  const w: number[] = [], p: number[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / n, v = Math.exp(-1.6 * x);
    w.push(v); p.push(x); s += v;
  }
  return { w: w.map(v => v / s), p };
}

/** เวกเตอร์หน่วยทิศท้ายลม — สูตรเดียวกับ runSim() บรรทัด 325 ของบล็อกแอป (= 1190 ของไฟล์ตั้งต้น) */
function downwind(hours: { wdir: number }[]) {
  let ux = 0, uy = 0;
  for (const h of hours) {
    const th = (270 - h.wdir) * Math.PI / 180;
    ux += Math.cos(th); uy += Math.sin(th);
  }
  const un = Math.hypot(ux, uy) || 1;
  return { ux: ux / un, uy: uy / un };
}

const RANGE_KM = 10, RES = 180;
export const BG = 25;

function buildCase(
  hours: { t: string; ws: number; wdir: number; stab: Stability; mix: number; precip: number }[],
  model?: 'gauss' | 'puff',
  avg = 60,
  rai = 20,
) {
  const hs = hours.map(h => ({ ...h, dt: 3600, temp: null, rh: null }));
  const { w, p } = hourWeights(hs.length);
  const { ux, uy } = downwind(hs);
  const R = RANGE_KM * 1000;
  // จุดรับผลกระทบวางบนแกนท้ายลมที่ 1, 3, 8 กม. — ระยะเดียวกับเกณฑ์ puff-vs-gauss ใน HANDOFF
  const receptors: [number, number][] =
    [1000, 3000, 8000].map(d => [ux * d, uy * d] as [number, number]);
  const params: RunParams = {
    ...(model ? { model } : {}),
    fires: [ricePointFire(rai)],
    hours: hs,
    weights: w,
    progress: p,
    grid: { N: RES, R, cx: 0.32 * R * ux, cy: 0.32 * R * uy },
    receptors,
    bg: BG,
    avg,
    depo: true,
    reqId: 1,
  };
  return params;
}

/**
 * ภูมิประเทศสังเคราะห์จาก HANDOFF-terrain-mode.md — แอ่งกลางที่จุดเผา
 * + สันเขาขวางทางตะวันตกเฉียงใต้
 *
 * **ต้องใช้พิกัดชดเชย (cx, cy) ให้ตรงกับที่เอนจินอ่าน `elev`**
 * `makeSampler` (smoke-plume-studio-lasted.html:680) ตั้ง `x0 = cx - R, y1 = cy + R`
 * แปลว่าเอนจินตีความ `Z[j*N+i]` ว่าเป็นจุด `(cx - R + (i+0.5)cell, cy + R - (j+0.5)cell)`
 *
 * สคริปต์ใน HANDOFF เขียนเป็น `-R + (i+0.5)cell` เฉยๆ (คือถือว่า cx=cy=0)
 * ซึ่งใช้ไม่ได้จริง เพราะ `runSim` เลื่อนศูนย์กลางกริดไปทางท้ายลม `0.32·R` เสมอ
 * ถ้าละ (cx, cy) ภูมิประเทศจะเลื่อนจากจุดเผาไป ~2,263 ม. ทั้งสองแกน
 * ทำให้จุดเผาไปอยู่ไหล่แอ่งตื้นๆ แทนที่จะอยู่ก้นแอ่งตามที่ตั้งใจ
 */
function syntheticDem(N: number, R: number, cx: number, cy: number): Float32Array {
  const cell = 2 * R / N;
  const Z = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = cx - R + (i + 0.5) * cell, y = cy + R - (j + 0.5) * cell;
      Z[j * N + i] = Math.max(0,
          300
        + 620 * Math.exp(-Math.pow((x * 0.7071 + y * 0.7071 + 3500) / 1800, 2))  // สันเขา
        - 140 * Math.exp(-(x * x + y * y) / (2 * 2600 * 2600)));                  // แอ่ง
    }
  }
  return Z;
}

export const CASES = {
  /** เช้ามืด เสถียรมาก ชั้นผสมต่ำ — เคสอ้างอิงข้อ 1 ใน HANDOFF (คาด ~126 µg/m³, เกิน 37.5 ถึง ~13 กม.) */
  dawnF: buildCase([
    { t: '2026-03-15T06:00', ws: 1.4, wdir: 35, stab: 'F', mix: 180, precip: 0 },
  ]),

  /** กลางวัน ไม่เสถียร ชั้นผสมสูง — เคสอ้างอิงข้อ 2 ใน HANDOFF (คาด ~490 µg/m³, เกิน 37.5 ถึง ~2 กม.) */
  dayB: buildCase([
    { t: '2026-03-15T13:00', ws: 2.0, wdir: 35, stab: 'B', mix: 1800, precip: 0 },
  ]),

  /** สามชั่วโมง เปลี่ยนความเสถียร + มีฝนชั่วโมงสุดท้าย เพื่อออกกำลังการชะด้วยฝน */
  multi3h: buildCase([
    { t: '2026-03-15T06:00', ws: 1.4, wdir: 35, stab: 'F', mix: 180,  precip: 0 },
    { t: '2026-03-15T07:00', ws: 1.8, wdir: 50, stab: 'E', mix: 400,  precip: 0 },
    { t: '2026-03-15T08:00', ws: 2.4, wdir: 70, stab: 'D', mix: 900,  precip: 1.2 },
  ]),

  /**
   * เผายาว 6 ชม. ลมทิศคงที่ — มีไว้ให้ค่าเฉลี่ย 24 ชม. สูงพอข้ามเกณฑ์ 37.5
   *
   * ถ้าไม่มีเคสนี้ `doseGrid.over` / `.overMaxKm` / `.truncated` เป็น 0/0/false
   * ในทุกเคส = สามฟิลด์ที่เช็กแล้วแดงไม่ได้เลย
   *
   * เคสนี้ปลุกได้ **2 ใน 3** — `over` = 27 และ `overMaxKm` = 3.28 กม.
   * ส่วน `doseGrid.truncated` ยัง `false` ทุกเคสและรับไว้อย่างนั้น เพราะจะปลุกได้
   * ต้องให้ค่าเฉลี่ย 24 ชม. เกิน 37.5 ไปถึงขอบโดเมนที่ 10 กม. ซึ่งไม่ใช่สถานการณ์
   * ที่เกิดจากการเผาแปลงเดียว การจัดฉากให้เกิดคือการปั้น fixture เพื่อปลุกตัวชี้วัด
   * ไม่ใช่เพื่อคุ้มกันโค้ด · ความเสี่ยงต่ำเพราะการเปลี่ยนที่จะกระทบ `truncated`
   * แทบทั้งหมดกระทบ `over`/`overMaxKm` ซึ่งมีชีวิตแล้วด้วย
   *
   * ตัวแปรที่ใช้ได้คือ **ทิศลมคงที่** ไม่ใช่พื้นที่หรือระยะเวลา
   *   - เพิ่มเวลาเฉยๆ ไม่ช่วย เพราะ `weights` normalize เป็น 1 มวลรวมคงที่
   *     เผายาวขึ้น = มวลเดิมกระจายหลายชั่วโมง ความเข้มข้นรายชั่วโมงลดลงตามกัน
   *   - เพิ่มพื้นที่ยิ่งแย่ เพราะ `sy0` โตตาม `side` พีคเจือจาง
   *     (ทดลองแล้ว 120 ไร่ ได้ dose 9.69 น้อยกว่า 20 ไร่ ที่ได้ 10.35)
   *   - ทิศลมคงที่ทำให้ dose สะสมลงเซลล์เดิมทั้ง 6 ชั่วโมง
   *     (เวอร์ชันที่ทิศลมกวาด 35°→50° ได้แค่ 9.69 · ทิศคงที่ได้ ~18)
   */
  long6h: buildCase([
    { t: '2026-03-15T02:00', ws: 1.2, wdir: 35, stab: 'F', mix: 150, precip: 0 },
    { t: '2026-03-15T03:00', ws: 1.2, wdir: 35, stab: 'F', mix: 150, precip: 0 },
    { t: '2026-03-15T04:00', ws: 1.3, wdir: 35, stab: 'F', mix: 160, precip: 0 },
    { t: '2026-03-15T05:00', ws: 1.3, wdir: 35, stab: 'F', mix: 170, precip: 0 },
    { t: '2026-03-15T06:00', ws: 1.4, wdir: 35, stab: 'F', mix: 180, precip: 0 },
    { t: '2026-03-15T07:00', ws: 1.5, wdir: 35, stab: 'E', mix: 260, precip: 0 },
  ]),
};

/**
 * เคสโหมด puff — ครอบ `runPuff` และ `windField` ที่โหมด gaussian ไปไม่ถึงเลย
 *
 * ประวัติค่าอ้างอิง (ตั้งใจเปลี่ยน ไม่ใช่การย้ายพลาด)
 *   - รอบแรก ล็อกพฤติกรรมที่ **รู้ว่ายังผิด** ไว้ระหว่างรื้อโครง เพื่อพิสูจน์ว่าการย้าย
 *     ไม่เปลี่ยนอะไร: puffTerrain พีค 0.139 (0.135% ของพื้นราบ)
 *   - ก้าว 5 แก้บั๊ก σ ผูกกับระยะทางที่ puff เดิน (puff.ts ตรง xEff) แล้วบันทึกใหม่:
 *     puffTerrain พีค 1069 (×10.3 ของพื้นราบ = กระจุกในแอ่ง) · puffFlat พีค เท่าเดิมทุกบิต
 *     แต่ผลรวมกริดเลื่อน ~5e-9 จากลำดับทศนิยมลอยตัวของ max(pf.d, ws·t)
 *
 * ตอนนี้สองเคสนี้ล็อก **พฤติกรรมที่ถูก** และ test/terrain.test.ts คุมเกณฑ์รับงานทางฟิสิกส์
 */
export const PUFF_CASES = {
  /**
   * พื้นราบ (ไม่มี elev) — ออกกำลังทางแยก `Z=null` ของ `windField`
   * (คืนค่าที่ smoke-plume-studio-lasted.html:624 ก่อนถึงบรรทัดที่ใช้ DRAIN/DTHETA/SHELT)
   *
   * ใส่ฝน 0.8 mm/h เพื่อออกกำลังทางแยกการชะด้วยฝนใน `runPuff` ด้วย
   * ซึ่งเคส puff แบบไม่มีฝนไปไม่ถึง
   */
  puffFlat: buildCase([
    { t: '2026-03-15T06:00', ws: 1.3, wdir: 35, stab: 'F', mix: 180, precip: 0.8 },
  ], 'puff'),

  /** ภูมิประเทศสังเคราะห์ — ออกกำลังสนามลมวินิจฉัยเต็มเส้นทาง */
  puffTerrain: (() => {
    const c = buildCase([
      { t: '2026-03-15T06:00', ws: 1.3, wdir: 45, stab: 'F', mix: 180, precip: 0 },
    ], 'puff');
    return { ...c, elev: syntheticDem(c.grid.N, c.grid.R, c.grid.cx, c.grid.cy) };
  })(),
};

/** ทุกเคสรวมกัน — golden test วนทั้งหมดนี้ */
export const ALL_CASES = { ...CASES, ...PUFF_CASES };

export interface GridStat {
  sum: number;
  max: number;
  over: number;
  overMaxKm: number;
  /**
   * true = มีเซลล์ที่เกินเกณฑ์อยู่บนขอบนอกสุดของกริด
   *
   * เป็นสัญญาณเตือนว่า `overMaxKm` **อาจ**ถูกขอบโดเมนตัด ไม่ใช่ระยะจริงของกลุ่มควัน
   * ไม่ใช่การรับประกันเชิงตรรกะ — ถ้าควันมีหลายกลีบ เซลล์ที่แตะขอบอาจเป็นกลีบหนึ่ง
   * ขณะที่เซลล์ไกลสุดจริงอยู่ด้านใน ให้ถือเป็น "ต้องไปดูให้แน่" ไม่ใช่ข้อสรุป
   * ล็อกไว้ในค่าอ้างอิงเพื่อไม่ให้ใครอ่าน overMaxKm ผิดโดยไม่รู้ตัว
   */
  truncated: boolean;
}

/**
 * ลายนิ้วมือของผลลัพธ์ — เก็บพอให้จับการเปลี่ยนแปลงได้ทุกแบบ
 * โดยไม่ต้องเก็บ float 32,400 ตัวต่อกริด
 */
export function summarise(res: any, bg: number) {
  const { N, cell, cx, cy, R } = res;
  const stat = (g: Float32Array): GridStat => {
    let sum = 0, max = 0, over = 0, overMaxD = 0, truncated = false;
    for (let j = 0; j < N; j++) {
      const py = cy + R - (j + 0.5) * cell;
      const edgeRow = j === 0 || j === N - 1;
      for (let i = 0; i < N; i++) {
        const px = cx - R + (i + 0.5) * cell;
        const v = g[j * N + i];
        sum += v;
        if (v > max) max = v;
        if (v + bg > 37.5) {
          over++;
          const d = Math.hypot(px, py);
          if (d > overMaxD) overMaxD = d;
          if (edgeRow || i === 0 || i === N - 1) truncated = true;
        }
      }
    }
    return { sum, max, over, overMaxKm: overMaxD / 1000, truncated };
  };
  return {
    N, cell, cx, cy, R,
    // runPuff ใส่ model:'puff' ฝั่ง gaussian ไม่ใส่ (ความไม่สมมาตรที่มีมาแต่เดิม)
    // เก็บไว้เพื่อคุม dispatch ที่ index.ts ของ Task 2 จะเป็นเจ้าของ
    // เคส gaussian ได้ undefined ซึ่ง JSON.stringify ตัดทิ้ง ค่าอ้างอิงเดิมจึงไม่ขยับ
    model: res.model,
    meanUx: res.meanUx, meanUy: res.meanUy,
    totalEmitKg: res.totalEmitKg, totalFuelT: res.totalFuelT,
    perHour: res.perHour.map((h: any) => ({ ...h })),
    grids: res.grids.map(stat),
    maxGrid: stat(res.maxGrid),
    doseGrid: stat(res.doseGrid),
    recMax: res.recMax,
    recDose: res.recDose,
    recPerHour: res.recPerHour,
  };
}
