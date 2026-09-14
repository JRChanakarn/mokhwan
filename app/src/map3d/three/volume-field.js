/**
 * volume-field — แปลงกริดความเข้มข้น**ระดับพื้น**ของเอนจินเป็นสนาม 3 มิติสำหรับ raymarch
 *
 * ไฟล์นี้คือจุดที่ความซื่อสัตย์ของโหมด 3 มิติทั้งหมดอยู่ อ่านให้จบก่อนแก้
 *
 * **รูปร่างแนวราบกับความเข้มข้นเป็นของจริง** มาจาก `grids[hour]` ที่เอนจินคำนวณ
 * รวมการเบนตามภูมิประเทศและสนามลมจริงถ้าเปิดไว้
 *
 * **ความหนาแนวดิ่งถูกสร้างขึ้น ไม่ใช่ผลการคำนวณ** เอนจินไม่มีสนาม 3 มิติให้
 *   field(i,j,k) = C0(i,j) · vert(z_k) / vert(0)
 *   vert(z)      = exp(-(z-H)^2 / 2σz^2) + exp(-(z+H)^2 / 2σz^2)
 * เทอมหลังคือเงาสะท้อนที่พื้น ตัวเดียวกับใน `packages/engine/src/gaussian.ts`
 *
 * **ที่หาร vert(0) เพราะอยากให้ชั้น z=0 เท่ากับค่าที่เอนจินคำนวณเป๊ะ** ไม่ใช่ใกล้เคียง
 * นั่นคือสิ่งเดียวที่ทำให้พูดได้ว่า "ที่พื้นคือผลการคำนวณ เหนือพื้นคือการประมาณ"
 *
 * **ผลข้างเคียงที่ยอมรับแล้ว (ข้อจำกัดข้อ 6 ในสเปก)** ถ้าพลูมลอยสูงจนค่าที่พื้นเป็นศูนย์
 * ทั้งคอลัมน์จะเป็นศูนย์ คือ**มองไม่เห็นควันที่ลอยค้างอยู่ข้างบน** เกิดตอนอากาศเสถียรมาก
 * ตัวเลขในตารางยังถูก ภาพต่างหากที่บอกไม่ครบ ต้องมีป้ายบอกบนหน้าจอ
 * ทางเลือกคือคำนวณค่าบนอากาศจากสูตร Gaussian ใหม่ แต่จะทิ้งรูปร่างแนวราบที่เอนจิน
 * คำนวณจริงไป (รวมการเบนตามภูมิประเทศ) ซึ่งสำคัญกว่า จึงเลือกทางนี้
 *
 * `sigmas` กับ `downsampleMax` **import จาก volume.js ห้าม copy** ของเดิมเคยมีสูตร Briggs
 * สองชุดแล้วหลุดจากกันมาแล้วครั้งหนึ่ง (ดูคอมเมนต์หัวไฟล์ volume.js)
 */
import { sigmas, downsampleMax } from '../volume.js';

/** เพดานอัตราส่วน vert(z)/vert(0) — กันค่าระเบิดตอนพลูมลอยสูงจน vert(0) เข้าใกล้ศูนย์ */
export const RATIO_MAX = 1e4;

export function buildField({ grid, res, hour, step = 4, Nz = 48, pexag = 1 }) {
  const { N, cell, cx, cy, R } = res;
  const { data: flatGrid, M } = downsampleMax(grid, N, step);
  const bcell = cell * step;

  /**
   * **ย่อกล่องให้พอดีควันจริง ไม่คลุมทั้งโดเมน** — เรื่องประสิทธิภาพล้วนๆ แต่จำเป็น
   *
   * ครั้งแรกที่ลองจริง กล่องคลุมเต็ม 2R ทุกพิกเซลที่มองทะลุกล่องจึงต้องเดินรังสีเต็มความลึก
   * แม้บริเวณนั้นไม่มีควันเลยสักหยด รวมกับจอ retina แล้ว **เบราว์เซอร์ค้างตั้งแต่เฟรมแรก**
   * จนตัวลดคุณภาพอัตโนมัติไม่ทันได้ทำงาน
   *
   * พลูมกินพื้นที่เพียงเสี้ยวเดียวของกริด การย่อกล่องจึงลดงานลงหลายเท่า
   * และยังได้ความละเอียดของ texture ต่อเมตรสูงขึ้นฟรีๆ ด้วย
   */
  let bi0 = M, bi1 = -1, bj0 = M, bj1 = -1;
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < M; i++) {
      if (flatGrid[j * M + i] > 0) {
        if (i < bi0) bi0 = i;
        if (i > bi1) bi1 = i;
        if (j < bj0) bj0 = j;
        if (j > bj1) bj1 = j;
      }
    }
  }
  if (bi1 < 0) {
    return { data: new Float32Array(0), Nx: 0, Ny: 0, Nz, zTop: 0, dz: 0,
             aglZ0: 0, aglH: 0, bi0: 0, bj0: 0, boxX: cx, boxY: cy, boxW: 0, boxD: 0, vmax: 0 };
  }
  // เผื่อขอบหนึ่งบล็อกทุกด้าน ให้ LinearFilter มีค่าข้างเคียงให้ไล่จางแทนที่จะตัดขาด
  bi0 = Math.max(0, bi0 - 1); bi1 = Math.min(M - 1, bi1 + 1);
  bj0 = Math.max(0, bj0 - 1); bj1 = Math.min(M - 1, bj1 + 1);
  const Nx = bi1 - bi0 + 1, Ny = bj1 - bj0 + 1;

  // ความสูงพลูม: เฟสคุกรุ่นเป็นตัวกำหนดค่าที่พื้น ถ้าไม่มีจึงใช้เฟสเปลวไฟ (เหมือน volume.js)
  const H0 = (hour.qSm > 0 ? hour.Hsm : hour.Hfl) || 0;
  const lid0 = Math.max(hour.mix, 60);

  // pexag ยืดแกนดิ่งทั้งแกนอย่างสม่ำเสมอ ค่าที่ z=0 จึงไม่ขยับ เพราะ vert(0)/vert(0) = 1 เสมอ
  const H = H0 * pexag, lid = lid0 * pexag;

  // σz ตรงนี้ใช้ตัดสิน zTop เท่านั้น ตัวจริงคำนวณรายคอลัมน์ข้างล่าง
  const szMid = Math.min(sigmas(Math.max(R / 2, 12), hour.stab)[1], lid0 / 1.25) * pexag;
  const zTop = Math.min(lid, Math.max(H + 3 * szMid, 60 * pexag));

  /**
   * **ระยะห่างชั้นและตำแหน่งกล่อง — จุดที่พลาดง่ายที่สุดในไฟล์นี้**
   *
   * `Data3DTexture` + `LinearFilter` สุ่มที่**ศูนย์กลางเท็กเซล** คือ `uvw.z = (k+0.5)/Nz`
   * ถ้าวางชั้น k ไว้ที่ `z = (k+0.5)/Nz · zTop` ตามสัญชาตญาณ จะไม่มีชั้นไหนอยู่ที่ z = 0 เลย
   * ชั้นล่างสุดจะลอยอยู่เหนือพื้นครึ่งช่อง แล้วค่าที่พื้นจะเพี้ยนจากที่เอนจินคำนวณ
   * (วัดได้จริงราว 0.16% ตอนเขียนเทส) ซึ่งทำให้คำกล่าวอ้างทั้งหมดของไฟล์นี้ไม่จริง
   *
   * จึงวางชั้น k ไว้ที่ `z = k · dz` พอดี แล้วชดเชยที่กล่องแทน: กล่องเริ่มที่ `-dz/2`
   * สูง `dz · Nz` — แทนค่าแล้วศูนย์กลางเท็กเซล k ตกที่ `k · dz` เป๊ะ ชั้น 0 จึงอยู่ที่พื้นจริง
   * กล่องล้ำใต้ดินครึ่งช่องไม่เป็นไร เพราะ shader ตัดรังสีที่ผิวดินอยู่แล้ว
   */
  const dz = Nz > 1 ? zTop / (Nz - 1) : Math.max(zTop, 1);

  /**
   * **ชื่อ agl ไม่ใช่ box โดยตั้งใจ — ทั้งสองค่านี้เป็นความสูง "เหนือพื้นดิน"**
   *
   * รอบแรกตั้งชื่อว่า boxZ0/boxH แล้วเอาไปวางกล่องในฉากตรงๆ ผลคือกล่องควันฝังอยู่
   * ใต้ภูเขาทั้งก้อน (ควันสูง 0–865 ม. แต่ภูเขาสูง 450–2550 ม. เหนือระดับน้ำทะเล)
   * รังสีชนดินตั้งแต่ก้าวแรกทุกพิกเซล จอจึงว่างเปล่าโดยไม่มี error ให้จับ
   *
   * MapLibre บวกความสูงพื้นให้เองใน shader ของ fill-extrusion — ข้อนี้เขียนเตือนไว้
   * ตัวโตๆ ในหัวไฟล์ volume.js แล้ว แต่ three.js **ไม่บวกให้** ผู้เรียกต้องบวกเอง
   */
  const aglZ0 = -dz / 2, aglH = dz * Nz;

  const out = new Float32Array(Nx * Ny * Nz);
  let vmax = 0;

  for (let bj = 0; bj < Ny; bj++) {
    for (let bi = 0; bi < Nx; bi++) {
      const gi = bi0 + bi, gj = bj0 + bj;              // ดัชนีในกริดเต็ม
      const c0 = flatGrid[gj * M + gi];
      if (!(c0 > 0)) continue;                 // คอลัมน์ว่างข้ามไป (ดูข้อจำกัดข้อ 6 ข้างบน)

      // ศูนย์กลางบล็อกในพิกัดเอนจิน — กองไฟอยู่ที่ (0,0) ศูนย์กลางกริดเลื่อนไปท้ายลมที่ (cx,cy)
      const xm = cx - R + (gi + 0.5) * bcell;
      const ym = cy + R - (gj + 0.5) * bcell;
      const d = Math.hypot(xm, ym);

      const sz = Math.min(sigmas(Math.max(d, 12), hour.stab)[1], lid0 / 1.25) * pexag;
      const inv2s2 = 1 / (2 * sz * sz);
      const v0 = 2 * Math.exp(-H * H * inv2s2);        // vert(0): สองเทอมเท่ากันพอดีที่ z=0
      const invV0 = v0 > 0 ? 1 / v0 : 0;

      for (let k = 0; k < Nz; k++) {
        const z = k * dz;                            // ชั้น 0 อยู่ที่พื้นพอดี ดูหมายเหตุข้างบน
        const a = z - H, b = z + H;
        const vert = Math.exp(-a * a * inv2s2) + Math.exp(-b * b * inv2s2);
        const ratio = Math.min(vert * invV0, RATIO_MAX);
        const v = c0 * ratio;
        out[k * Nx * Ny + bj * Nx + bi] = v;
        if (v > vmax) vmax = v;
      }
    }
  }
  const boxW = Nx * bcell, boxD = Ny * bcell;
  return {
    data: out, Nx, Ny, Nz, zTop, dz, aglZ0, aglH, vmax, bi0, bj0, boxW, boxD,
    boxX: cx - R + (bi0 + Nx / 2) * bcell,        // ศูนย์กลางกล่องในพิกัดเอนจิน
    boxY: cy + R - (bj0 + Ny / 2) * bcell,
  };
}

/* ---------------- LUT สี ---------------- */

/**
 * สเกลของ LUT เป็นล็อก เพราะแถบ AQI ห่างกันแบบทวีคูณ (15 · 25 · 37.5 · 75 · 150 · 350)
 * สเกลเชิงเส้นจะยัดสี่แถบล่างไว้ในสิบเปอร์เซ็นต์แรกของ texture จนแยกสีไม่ออก
 */
export function lutCoord(c, { lo = 1, hi = 500 } = {}) {
  if (!(c > lo)) return 0;
  const t = Math.log(c / lo) / Math.log(hi / lo);
  return t >= 1 ? 1 : t;
}

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** สร้าง RGBA ไบต์ของ LUT จาก BANDS ชุดเดียวกับแผนที่ 2D — ห้ามคิดสีใหม่ที่นี่ */
export function buildLutBytes(bands, { lo = 1, hi = 500, size = 256 } = {}) {
  const out = new Uint8Array(size * 4);
  const below = [0x9f, 0xb0, 0xc4];                   // ต่ำกว่าแถบแรก: เทาอมฟ้า เหมือน volume.js
  for (let i = 0; i < size; i++) {
    const c = lo * Math.pow(hi / lo, i / (size - 1));
    let rgb = below;
    for (let b = bands.length - 1; b >= 0; b--) if (c >= bands[b].lo) { rgb = hex(bands[b].c); break; }
    out[i * 4] = rgb[0]; out[i * 4 + 1] = rgb[1]; out[i * 4 + 2] = rgb[2]; out[i * 4 + 3] = 255;
  }
  return out;
}
