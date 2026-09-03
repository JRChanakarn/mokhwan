/**
 * volume — สร้างก้อนควันสามมิติจาก **กริดที่เอนจินคำนวณจริง**
 *
 * ของเดิม `plumeVolume()` ใน app.js มีสูตร Briggs ของตัวเองแล้วลากกรวยตรงตาม `wdir`
 * จากค่าสรุปรายชั่วโมง — ไม่เคยแตะ `S.result.grids` เลย เปิดโหมดภูมิประเทศแล้ว 2D
 * เปลี่ยนแต่ 3D ยังเป็นกรวยตรงเหมือนเดิม (เจ้าของงานสังเกตเห็นจากภาพ)
 *
 * ที่นี่ใช้กริดความเข้มข้นระดับพื้นของชั่วโมงนั้นเป็นรูปร่างแนวราบ จึงตรงกับ 2D เสมอ
 * ไม่ว่าจะโมเดลไหน เปิดภูมิประเทศหรือสนามลมจริงหรือไม่
 *
 * **ข้อจำกัดที่ต้องบอกตรงๆ** เอนจินคืนความเข้มข้น**ระดับพื้น**เท่านั้น ไม่มีสนาม 3 มิติ
 * ความหนาในแนวดิ่งจึง **สร้างขึ้นใหม่** จากค่าพลูมรายชั่วโมง (ความสูงพลูม H กับ σz
 * ที่ระยะนั้น) ไม่ใช่ผลการคำนวณ · รูปร่างแนวราบและความเข้มข้นคือของจริง ความหนาคือการประมาณ
 *
 * **base/height เป็นความสูงเหนือพื้นดิน ไม่ใช่จากระดับน้ำทะเล** — ห้ามบวกความสูงพื้นดิน
 * เองเด็ดขาด เพราะ shader ของ fill-extrusion ใน maplibre-gl 4 บวกให้แล้วเมื่อเปิดภูมิประเทศ
 *     #ifdef TERRAIN3D
 *     float height_terrain3d_offset = get_elevation(a_centroid);
 * และ get_elevation คืน `elevation * u_terrain_exaggeration` คือค่าที่**ยกแล้ว**
 * บวกซ้ำจะได้สองเท่าและควันจะลอยเหนือภูเขาไปเลย
 *
 * ผลคือควันเลาะไปตามผิวภูมิประเทศ ซึ่งตรงกับสิ่งที่เอนจินคำนวณ (ความเข้มข้นที่ระดับพื้น
 * ของเซลล์นั้น) แต่ไม่ใช่ภาพควันลอยค้างเป็นชั้นที่ระดับความสูงคงที่ในแอ่ง
 */

/** σ ของ Briggs open-country — ต้องตรงกับ packages/engine/src/briggs.ts */
export function sigmas(x, st) {
  const f = 1 / Math.sqrt(1 + 1e-4 * x);
  switch (st) {
    case 'A': return [0.22 * x * f, 0.20 * x];
    case 'B': return [0.16 * x * f, 0.12 * x];
    case 'C': return [0.11 * x * f, 0.08 * x / Math.sqrt(1 + 2e-4 * x)];
    case 'D': return [0.08 * x * f, 0.06 * x / Math.sqrt(1 + 1.5e-3 * x)];
    case 'E': return [0.06 * x * f, 0.03 * x / (1 + 3e-4 * x)];
    default:  return [0.04 * x * f, 0.016 * x / (1 + 3e-4 * x)];
  }
}

/**
 * ย่อกริด N×N เป็นบล็อก step×step โดยเอา**ค่าสูงสุด**ในบล็อก ไม่ใช่ค่าเฉลี่ย
 * ไม่งั้นแกนพลูมที่แคบกว่าบล็อกจะถูกเฉลี่ยจนจาง แล้วรูปร่างใน 3D จะไม่ตรงกับ 2D
 */
export function downsampleMax(grid, N, step) {
  const M = Math.ceil(N / step);
  const out = new Float32Array(M * M);
  for (let bj = 0; bj < M; bj++) for (let bi = 0; bi < M; bi++) {
    let m = 0;
    for (let j = bj * step; j < Math.min(N, (bj + 1) * step); j++)
      for (let i = bi * step; i < Math.min(N, (bi + 1) * step); i++) {
        const v = grid[j * N + i]; if (v > m) m = v;
      }
    out[bj * M + bi] = m;
  }
  return { data: out, M };
}

/**
 * สร้าง GeoJSON ของก้อนควันสำหรับชั้น fill-extrusion
 *
 * @param {Float32Array} grid   ความเข้มข้นระดับพื้น N×N (ยังไม่รวมพื้นหลัง)
 * @param {object} res          ผลจากเอนจิน {N, cell, cx, cy, R}
 * @param {object} hour         perHour[i] — ใช้ Hfl/Hsm, qSm, stab, mix
 * @param {number} bg           ค่าพื้นหลังที่ใช้แสดง (ใช้เลือกสีให้ตรงกับ 2D)
 * @param {(x:number,y:number)=>{lat:number,lng:number}} toLL
 * @param {(c:number)=>number} bandOf   ดัชนีแถบ AQI
 * @param {{lo:number,c:string}[]} bands
 * @param {number} [pexag]      ตัวคูณความหนาของควัน (เพื่อการมองเห็นเท่านั้น)
 * @param {number} [step]       ขนาดบล็อกย่อ หน่วยเซลล์
 * @param {number} [minC]       ความเข้มข้นต่ำสุดที่ยังวาด µg/m³
 */
export function buildVolume({ grid, res, hour, bg, toLL, bandOf, bands, pexag = 1, step = 4, minC = 1 }) {
  const feats = [];
  if (!grid || !res || !hour) return { type: 'FeatureCollection', features: feats };
  const { N, cell, cx, cy, R } = res;
  const { data, M } = downsampleMax(grid, N, step);
  const bcell = cell * step;
  const lid = Math.max(hour.mix, 60);
  // ความสูงพลูม: ใช้เฟสคุกรุ่นเป็นหลักเพราะเป็นตัวกำหนดค่าที่พื้น ถ้าไม่มีจึงใช้เฟสเปลวไฟ
  const H = (hour.qSm > 0 ? hour.Hsm : hour.Hfl) || 0;

  for (let bj = 0; bj < M; bj++) {
    for (let bi = 0; bi < M; bi++) {
      const c = data[bj * M + bi];
      if (c < minC) continue;
      const x0 = cx - R + bi * bcell, x1 = Math.min(cx + R, x0 + bcell);
      const y1 = cy + R - bj * bcell, y0 = Math.max(cy - R, y1 - bcell);
      const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;

      // ความหนาแนวดิ่ง: สร้างใหม่จาก σz ที่ระยะจากจุดกำเนิด (ดูหมายเหตุหัวไฟล์)
      const d = Math.hypot(xm, ym);
      const sz = Math.min(sigmas(Math.max(d, 12), hour.stab)[1], lid / 1.25);
      const bot = Math.max(0, H - 1.2 * sz), top = Math.min(lid * 1.05, H + 1.2 * sz);

      const b = bandOf(c + bg);
      const band = bands[Math.max(0, b)];
      const ring = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([px, py]) => {
        const ll = toLL(px, py);
        return [ll.lng, ll.lat];
      });
      feats.push({
        type: 'Feature',
        properties: {
          conc: c, tier: c + bg >= 37.5 ? 'core' : 'edge',
          color: band ? band.c : '#9fb0c4',
          base: Math.round(bot * pexag),
          height: Math.round(top * pexag + 4),
        },
        geometry: { type: 'Polygon', coordinates: [ring] },
      });
    }
  }
  return { type: 'FeatureCollection', features: feats };
}
