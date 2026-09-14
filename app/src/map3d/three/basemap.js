/**
 * basemap — โมเสกภาพดาวเทียมสำหรับปูผิวภูมิประเทศในฉาก three.js
 *
 * ใช้คณิตไทล์ของ `services/dem-math.js` ซ้ำทั้งชุด แต่**งบไทล์คนละตัวกับ DEM**
 * DEM จำกัด 3×3 ที่ z14 เพราะต้นทางแถบนี้คือ SRTM 30 ม. ขอละเอียดกว่านั้นได้ไทล์
 * เพิ่มสี่เท่าโดยไม่ได้ข้อมูลเพิ่มเลย (บันทึกไว้ใน app.js เดิม) ส่วน**ภาพ**ละเอียดขึ้น
 * จริงตาม zoom จึงให้งบ 6×6 และไล่ได้ถึง z17
 *
 * กติกา fail-safe เดิมของโปรเจกต์: ล้มเหลว → `{ok:false, reason}` ภาษาไทย ห้าม throw
 * ไทล์หายบางใบ**ไม่ถือว่าล้มเหลว** — ภาพโหว่เป็นหย่อมยังอ่านภูมิประเทศได้
 * ดีกว่าพื้นเรียบเปล่าที่บอกอะไรไม่ได้เลย
 *
 * `crossOrigin = 'anonymous'` **บังคับ** ต่างจาก `<img>` ธรรมดาที่ไม่สน:
 * WebGL ปฏิเสธการอัป texture จาก canvas ที่ปนเปื้อน ถ้าลืมจะได้ภูมิประเทศสีดำสนิท
 * โดยไม่มี error ขึ้นให้เห็นเลย
 */
import { TILE, chooseZoom, tileRange, boundsAround } from '../../services/dem-math.js';

export const ESRI_IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';
const TIMEOUT_MS = 12_000;

/** Esri เรียง z/y/x ไม่ใช่ z/x/y — สลับแล้วได้ภาพคนละที่โดยไม่มี error ให้จับ */
export const esriTileUrl = (z, x, y) => `${ESRI_IMAGERY}/${z}/${y}/${x}`;

export function pickImageryZoom(lat, spanM) {
  return chooseZoom(lat, spanM, { maxTilesPerAxis: 6, zMin: 8, zMax: 17 });
}

export const browserDeps = {
  loadImage: url => new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const t = setTimeout(() => rej(new Error('หมดเวลา')), TIMEOUT_MS);
    img.onload = () => {
      clearTimeout(t);
      res({ width: img.naturalWidth, height: img.naturalHeight,
            draw: (ctx, x, y) => ctx.drawImage(img, x, y) });
    };
    img.onerror = () => { clearTimeout(t); rej(new Error('โหลดภาพไม่ได้')); };
    img.src = url;
  }),
  makeCanvas: (w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  },
};

/**
 * ขอบเขตภูมิศาสตร์ของ**กรอบไทล์** ไม่ใช่ของโดเมน
 * โมเสกครอบกว้างกว่าโดเมนเสมอเพราะขอบไทล์ไม่มีทางลงตัวพอดี ผู้เรียกต้องใช้ค่านี้
 * map UV เอง ไม่งั้นภาพจะเลื่อนไปจากภูมิประเทศเป็นหลักร้อยเมตร
 */
function mosaicBounds({ z, x0, x1, y0, y1 }) {
  const n = 2 ** z, deg = 360 / n;
  const latOf = ty => {
    const t = Math.PI * (1 - 2 * ty / n);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(t) - Math.exp(-t)));
  };
  return { west: x0 * deg - 180, east: (x1 + 1) * deg - 180, north: latOf(y0), south: latOf(y1 + 1) };
}

export async function loadImageryMosaic(origin, spanM, deps = browserDeps) {
  try {
    const z = pickImageryZoom(origin.lat, spanM);
    const range = tileRange(boundsAround(origin, spanM), z);
    const { x0, x1, y0, y1 } = range;
    const cols = x1 - x0 + 1, rows = y1 - y0 + 1;
    const canvas = deps.makeCanvas(cols * TILE, rows * TILE);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2a3442';                      // สีรองพื้นตรงไทล์ที่หาย
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let got = 0;
    await Promise.all(Array.from({ length: cols * rows }, async (_, k) => {
      const cx = k % cols, cy = (k / cols) | 0;
      try {
        const img = await deps.loadImage(esriTileUrl(z, x0 + cx, y0 + cy));
        img.draw(ctx, cx * TILE, cy * TILE);
        got++;
      } catch { /* ไทล์เดียวหาย ไม่ล้มทั้งโมเสก */ }
    }));

    if (!got) {
      return { ok: false,
               reason: 'โหลดภาพดาวเทียมไม่ได้เลยสักไทล์ — จะแสดงภูมิประเทศเป็นสีเรียบ' };
    }
    return { ok: true, canvas, bounds: mosaicBounds(range), zoom: z, tiles: cols * rows, got };
  } catch (e) {
    return { ok: false,
             reason: 'โหลดภาพดาวเทียมไม่ได้ — ' + (e && e.message ? e.message : 'ไม่ทราบสาเหตุ') };
  }
}
