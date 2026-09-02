export type Stability = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** แปลงที่เผาหนึ่งแปลง พิกัดเป็นเมตรเทียบ origin */
export interface Fire {
  /** จุดย่อยกระจายในแปลง */
  pts:    [number, number][];
  /** √พื้นที่ (m) ใช้คำนวณ σy ตั้งต้น */
  side:   number;
  /** เชื้อเพลิงที่ไหม้จริง = ไร่ × load × 1000 × cc */
  fuelKg: number;
  /** PM2.5 ที่ปล่อยทั้งหมด (g) = fuelKg × ef */
  totalG: number;
  /** สัดส่วนเฟสคุกรุ่นตั้งต้น 0..1 = 0.18 + 0.62×ความชื้น */
  smold:  number;
  rai:    number;
}

export interface HourWx {
  /** คีย์ชั่วโมง เช่น '2026-03-15T06:00' */
  t:      string;
  /** ความยาวช่วง (วินาที) */
  dt:     number;
  /** ความเร็วลม (m/s) */
  ws:     number;
  /** องศา — ทิศที่ลม "พัดมาจาก" */
  wdir:   number;
  stab:   Stability;
  /** ความสูงชั้นผสม (m) */
  mix:    number;
  /** ฝน (mm/h) */
  precip: number;
  temp:   number | null;
  rh:     number | null;
}

/**
 * กริดสี่เหลี่ยมจัตุรัส N×N ครึ่งความกว้าง R เมตร
 * ศูนย์กลางเลื่อนไปทางท้ายลม (cx, cy)
 *
 * เซลล์ (i, j) คือจุด `(cx - R + (i+0.5)·cell, cy + R - (j+0.5)·cell)`
 * โดย `cell = 2R/N` — **แถว j=0 คือด้านเหนือ** และดัชนีคือ `j*N + i`
 */
export interface GridSpec { N: number; R: number; cx: number; cy: number }

export interface RunParams {
  /** ค่าปริยาย 'gauss' */
  model?:    'gauss' | 'puff';
  fires:     Fire[];
  hours:     HourWx[];
  /** สัดส่วนการปล่อยรายชั่วโมง รวม = 1 */
  weights:   number[];
  /** ความคืบหน้าการเผาสะสม 0..1 */
  progress:  number[];
  grid:      GridSpec;
  /** จุดรับผลกระทบ เมตรเทียบ origin */
  receptors: [number, number][];
  /** PM2.5 พื้นหลัง (µg/m³) */
  bg:        number;
  /** เวลาเฉลี่ย (นาที) ใช้ปรับ σy */
  avg:       number;
  /** เปิดการตกสะสมแห้ง + ชะด้วยฝน */
  depo:      boolean;
  /** ตัวกันผลค้าง ฝั่งเรียกเช็ค res.reqId เอง */
  reqId:     number;
  /** DEM N×N เมตร เรียงตรงกับกริด — โหมด puff เท่านั้น */
  elev?:     Float32Array | null;
}

export interface PerHour {
  t: string; ws: number; wdir: number; stab: Stability; mix: number;
  precip: number; temp: number | null; rh: number | null;
  /** ความเข้มข้นสูงสุดระดับพื้นในชั่วโมงนี้ (µg/m³) */
  max: number;
  /** ระยะจาก origin ที่เกิดค่าสูงสุด (m) */
  maxDist: number;
  /** ความสูงพลูมประสิทธิผล เฟสเปลวไฟ / คุกรุ่น (m) */
  Hfl: number; Hsm: number;
  /** อัตราการปล่อยแต่ละเฟส */
  qFl: number; qSm: number;
  /** ความเร็วลมที่ความสูงพลูมแต่ละเฟส (m/s) */
  uFl: number; uSm: number;
  sy0: number; tf: number;
  /** พลูมชนเพดานชั้นผสม */
  capped: boolean;
  /** = weights[h] */
  share: number;
  /** Froude number — โหมด puff เท่านั้น */
  Fr?: number;
  /** ความต่างระดับในโดเมน (m) — โหมด puff เท่านั้น */
  relief?: number;
  /** true = คำนวณบน DEM จริง — โหมด puff เท่านั้น (`terrain: !!Z` ใน runPuff) */
  terrain?: boolean;
}

export interface RunResult {
  /** ความเข้มข้นระดับพื้นรายชั่วโมง ยังไม่รวม bg */
  grids:      Float32Array[];
  /** ค่าสูงสุดตลอดช่วง */
  maxGrid:    Float32Array;
  /** หาร 24 มาแล้ว = ค่าเฉลี่ย 24 ชม. */
  doseGrid:   Float32Array;
  N: number; cell: number; cx: number; cy: number; R: number;
  /** เวกเตอร์หน่วยทิศลมเฉลี่ย */
  meanUx: number; meanUy: number;
  perHour:    PerHour[];
  /** [ชั่วโมง][จุดรับ] */
  recPerHour: number[][];
  recMax:     number[];
  recDose:    number[];
  totalEmitKg: number;
  totalFuelT:  number;
  reqId:       number;
  /** ใส่เฉพาะโหมด puff — ฝั่ง gaussian ไม่ใส่ ความไม่สมมาตรนี้มีมาแต่เดิม */
  model?:      'puff';
}

/**
 * hook ที่ผู้เรียกส่งมาได้ (optional) — เอนจินเรียก `onProgress(hourDone, totalHours)`
 * หลังจบแต่ละชั่วโมง ใช้ให้ UI แสดงความคืบหน้าแทนค้างเงียบ · ห้ามกระทบผลลัพธ์
 * ส่งผ่าน postMessage ไม่ได้ (ฟังก์ชัน clone ไม่ได้) worker.ts จึงเป็นคนผูกให้เอง
 */
export interface RunHooks {
  onProgress?(hourDone: number, totalHours: number): void;
}

/** ข้อความความคืบหน้าที่ worker ส่งก่อนผลสุดท้าย แยกจาก RunResult ด้วยฟิลด์ type */
export interface ProgressMessage {
  type: 'progress';
  h: number;
  nH: number;
  reqId: number;
}

/** สนามลมวินิจฉัยที่ถูกภูมิประเทศเบนแล้ว — array ทุกตัวขนาด N×N */
export interface WindField {
  /** องค์ประกอบลมที่ระดับพลูม (m/s) */
  u:  Float32Array;   v:  Float32Array;
  /** องค์ประกอบลมไหลลงลาด (m/s) */
  ud: Float32Array;   vd: Float32Array;
  /** ความต่างระดับในโดเมน (m) — Z ว่างคืน 0 */
  relief: number;
  /** Froude number — Z ว่างคืน 99 */
  Fr:     number;
  /** สัดส่วนการถูกกั้นด้วยภูมิประเทศ — Z ว่างคืน 0 */
  block:  number;
}
