import { describe, it, expect } from 'vitest';
import {
  groundResolution, chooseZoom, lonLatToPixel, tileRange, boundsAround,
  decodeTerrarium, decodeMosaic, bilinear, sampleGrid, summarizeElev, M_LAT, mLon,
} from '../src/services/dem-math.js';

const CNX = { lat: 18.7883, lng: 98.9853 };   // เชียงใหม่ — จุดตั้งต้นของแอป

describe('terrarium', () => {
  it('ถอดรหัสค่าที่รู้', () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0);          // ระดับน้ำทะเล
    expect(decodeTerrarium(128, 1, 0)).toBe(1);
    expect(decodeTerrarium(129, 0, 0)).toBe(256);
    expect(decodeTerrarium(127, 255, 0)).toBe(-1);
    expect(decodeTerrarium(128, 0, 128)).toBe(0.5);      // B/256
  });
  it('decodeMosaic เรียงตาม RGBA และดัชนี', () => {
    const rgba = new Uint8ClampedArray([128,0,0,255, 129,0,0,255, 128,1,0,255, 127,255,0,255]);
    expect(Array.from(decodeMosaic(rgba, 2, 2))).toEqual([0, 256, 1, -1]);
  });
});

describe('mercator / zoom', () => {
  it('ความละเอียดที่เส้นศูนย์สูตร z=0 ≈ 156,543 m/px และ ณ เชียงใหม่ z=11 ≈ 72 m/px', () => {
    expect(groundResolution(0, 0)).toBeCloseTo(156543.03, 1);
    expect(groundResolution(CNX.lat, 11)).toBeCloseTo(72.4, 0);
  });
  it('lonLatToPixel: (0,0) อยู่กลางโลก · เหนือขึ้น y ลด', () => {
    const n = 256 * 2 ** 3;
    const [x, y] = lonLatToPixel(0, 0, 3);
    expect(x).toBeCloseTo(n / 2, 6); expect(y).toBeCloseTo(n / 2, 6);
    expect(lonLatToPixel(0, 10, 3)[1]).toBeLessThan(y);
  });
  it.each([[3, 13], [5, 12], [10, 11], [20, 10], [40, 9]])(
    'R=%i กม. (span 1.4R) → z=%i และไทล์ต่อแกน ≤ 3', (rKm, zExp) => {
      const span = 1.4 * rKm * 1000;
      const z = chooseZoom(CNX.lat, span);
      expect(z).toBe(zExp);
      const tr = tileRange(boundsAround(CNX, span), z);
      expect(tr.x1 - tr.x0 + 1).toBeLessThanOrEqual(3);
      expect(tr.y1 - tr.y0 + 1).toBeLessThanOrEqual(3);
    });
  it('boundsAround สมมาตรรอบ origin ในหน่วยเมตร', () => {
    const b = boundsAround(CNX, 14000);
    expect((b.north - CNX.lat) * M_LAT).toBeCloseTo(14000, 3);
    expect((b.east - CNX.lng) * mLon(CNX.lat)).toBeCloseTo(14000, 3);
  });
});

describe('bilinear', () => {
  const ramp = new Float32Array([0, 1, 2, 10, 11, 12]);   // 3×2: z = x + 10y
  it('ค่าที่จุดกริดพอดี', () => { expect(bilinear(ramp, 3, 2, 1, 0)).toBe(1); expect(bilinear(ramp, 3, 2, 2, 1)).toBe(12); });
  it('เชิงเส้นระหว่างจุด', () => { expect(bilinear(ramp, 3, 2, 0.5, 0.5)).toBeCloseTo(5.5, 6); expect(bilinear(ramp, 3, 2, 1.25, 0.75)).toBeCloseTo(8.75, 6); });
  it('clamp นอกขอบ ไม่โยนและไม่ให้ค่าเพี้ยน', () => { expect(bilinear(ramp, 3, 2, -5, -5)).toBe(0); expect(bilinear(ramp, 3, 2, 99, 99)).toBeCloseTo(12, 4); });
});

describe('sampleGrid — เรียงตรงกับกริดเอนจิน', () => {
  // โมเสกสังเคราะห์ที่ zoom z: ความสูง = ละติจูด×1000 (เหนือสูงกว่า) เพื่อทดสอบทิศและการเรียง
  const z = 11, span = 14000;
  const b = boundsAround(CNX, span), tr = tileRange(b, z);
  const w = (tr.x1 - tr.x0 + 1) * 256, h = (tr.y1 - tr.y0 + 1) * 256;
  const px0 = tr.x0 * 256, py0 = tr.y0 * 256;
  const elev = new Float32Array(w * h);
  const n = 256 * 2 ** z;
  for (let j = 0; j < h; j++) {
    const yPix = py0 + j + 0.5;
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * yPix / n))) * 180 / Math.PI;   // inverse mercator
    for (let i = 0; i < w; i++) elev[j * w + i] = lat * 1000;
  }
  const mosaic = { elev, w, h, z, px0, py0 };
  const grid = { N: 60, R: 10000, cx: -1835.44, cy: -2621.29 };
  const out = sampleGrid(mosaic, grid, CNX);

  it('ขนาด N×N', () => expect(out.length).toBe(3600));
  it('แถว j=0 คือด้านเหนือ (ค่าสูงกว่าแถวล่างสุด)', () => {
    expect(out[0]).toBeGreaterThan(out[59 * 60]);
  });
  // เกณฑ์เดิม < 2 หน่วย = ±223 ม. บนพื้น (0.67 เซลล์) หลวมจนถอด −0.5 ออกก็ยังผ่าน
  // ของจริงคลาดสูงสุด 0.0017 จึงรัดเป็น 0.05 (≈ 5 ซม.) ให้เทสต์คุม alignment จริง
  it('ค่าตรงกับสูตร lat×1000 ที่จุดศูนย์กลางเซลล์ (คลาด < 0.05)', () => {
    const cell = 2 * grid.R / grid.N;
    for (const [i, j] of [[0, 0], [59, 59], [30, 30], [0, 59]]) {
      const py = grid.cy + grid.R - (j + 0.5) * cell;
      const lat = CNX.lat + py / M_LAT;
      expect(Math.abs(out[j * 60 + i] - lat * 1000)).toBeLessThan(0.05);
    }
  });
  it('ไม่ขึ้นกับ cx,cy ของกริดในทิศตะวันออก-ตะวันตก (ความสูงเปลี่ยนตามละติจูดเท่านั้น)', () => {
    expect(Math.abs(out[30 * 60 + 0] - out[30 * 60 + 59])).toBeLessThan(0.05);
  });
});

describe('summarizeElev', () => {
  it('min/max/ต่างระดับ', () => expect(summarizeElev(new Float32Array([300, 174, 860]))).toEqual({ minZ: 174, maxZ: 860, relief: 686 }));
});
