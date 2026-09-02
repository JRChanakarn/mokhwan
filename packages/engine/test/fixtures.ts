/**
 * ชุด RunParams สำหรับ golden test
 *
 * ค่าทั้งหมดคัดลอกมาจากพฤติกรรมจริงของแอปตั้งต้น (smoke-plume-studio-lasted.html)
 * ไม่ได้เรียก buildFires / buildHours / hourWeights ของฝั่งแอปมาใช้ เพราะ task นี้
 * ล็อก "เอนจิน" ไม่ใช่ "ตัวสร้าง payload" — ตัวสร้าง payload จะมีเทสต์ของตัวเองในแผน B
 */

export const RAI = 1600;               // ตร.ม. ต่อไร่
export const RICE = { load: 0.60, ef: 9.5, cc: 0.89, moist: 0.35 };

/** สร้างแปลงจุดแบบเดียวกับ buildFires() — บรรทัด 277–305 ของบล็อกแอป (= 1142–1170 ของไฟล์ตั้งต้น) */
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

/** เหมือน hourWeights() — บรรทัด 244–249 ของบล็อกแอป (= 1109–1114 ของไฟล์ตั้งต้น) */
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
  hours: { t: string; ws: number; wdir: number; stab: string; mix: number; precip: number }[],
  model?: 'gauss' | 'puff',
) {
  const hs = hours.map(h => ({ ...h, dt: 3600, temp: null, rh: null }));
  const { w, p } = hourWeights(hs.length);
  const { ux, uy } = downwind(hs);
  const R = RANGE_KM * 1000;
  // จุดรับผลกระทบวางบนแกนท้ายลมที่ 1, 3, 8 กม. — ระยะเดียวกับเกณฑ์ puff-vs-gauss ใน HANDOFF
  const receptors: [number, number][] =
    [1000, 3000, 8000].map(d => [ux * d, uy * d] as [number, number]);
  return {
    ...(model ? { model } : {}),
    fires: [ricePointFire(20)],
    hours: hs,
    weights: w,
    progress: p,
    grid: { N: RES, R, cx: 0.32 * R * ux, cy: 0.32 * R * uy },
    receptors,
    bg: BG,
    avg: 60,
    depo: true,
    reqId: 1,
  };
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

  /** สามชั่วโมง เปลี่ยนความเสถียร + มีฝนชั่วโมงสุดท้าย เพื่อออกกำลังการชะด้วยฝนและ doseGrid */
  multi3h: buildCase([
    { t: '2026-03-15T06:00', ws: 1.4, wdir: 35, stab: 'F', mix: 180,  precip: 0 },
    { t: '2026-03-15T07:00', ws: 1.8, wdir: 50, stab: 'E', mix: 400,  precip: 0 },
    { t: '2026-03-15T08:00', ws: 2.4, wdir: 70, stab: 'D', mix: 900,  precip: 1.2 },
  ]),
};

export interface GridStat {
  sum: number;
  max: number;
  over: number;
  overMaxKm: number;
  /**
   * true = มีเซลล์ที่เกินเกณฑ์แตะขอบนอกสุดของกริด แปลว่า overMaxKm ถูกขอบโดเมนตัด
   * ไม่ใช่ระยะจริงของกลุ่มควัน ค่านี้ถูกล็อกไว้ด้วยเพื่อไม่ให้ใครอ่าน overMaxKm ผิด
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
