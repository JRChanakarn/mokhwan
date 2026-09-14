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
  const { data: flatGrid, M: Nx } = downsampleMax(grid, N, step);
  const Ny = Nx, bcell = cell * step;

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
  const boxZ0 = -dz / 2, boxH = dz * Nz;

  const out = new Float32Array(Nx * Ny * Nz);
  let vmax = 0;

  for (let bj = 0; bj < Ny; bj++) {
    for (let bi = 0; bi < Nx; bi++) {
      const c0 = flatGrid[bj * Nx + bi];
      if (!(c0 > 0)) continue;                 // คอลัมน์ว่างข้ามไป (ดูข้อจำกัดข้อ 6 ข้างบน)

      // ศูนย์กลางบล็อกในพิกัดเอนจิน — กองไฟอยู่ที่ (0,0) ศูนย์กลางกริดเลื่อนไปท้ายลมที่ (cx,cy)
      const xm = cx - R + (bi + 0.5) * bcell;
      const ym = cy + R - (bj + 0.5) * bcell;
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
  return { data: out, Nx, Ny, Nz, zTop, dz, boxZ0, boxH, vmax };
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
