/**
 * host ภายนอกที่โค้ดยิงคำขอไปหา — ตรวจในซอร์สโดยตรง
 *
 * smoke ตรวจไม่ได้เพราะ URL ถูกรวมอยู่ในสตริงของ bundle การอ่าน document.scripts
 * จึงไม่มีความหมาย · เช็คนี้จับที่ต้นทางแทน และกันไม่ให้ host ที่ถอดออกไปแล้วหลุดกลับมา
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function srcFiles(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) srcFiles(p, out);
    else if (/\.(js|html|css)$/.test(f)) out.push(p);
  }
  return out;
}
const root = new URL('../', import.meta.url).pathname;
const files = [...srcFiles(join(root, 'src')), join(root, 'index.html')];
const text = files.map(f => readFileSync(f, 'utf8')).join('\n');

describe('host ภายนอกที่แอปคุยด้วย', () => {
  it('ไม่มี host ที่ถอดออกไปแล้วหลุดกลับมา', () => {
    // maps.mail.ru ถอดออกเพราะหน่วยงานรัฐไทยมีข้อพิจารณาเชิงนโยบายเรื่องปลายทางของคำขอ
    for (const banned of ['maps.mail.ru']) {
      expect(text.includes(banned), `${banned} ต้องไม่อยู่ในซอร์ส`).toBe(false);
    }
  });

  it('ทุก host ที่ยิงคำขอไปอยู่ในรายการที่ตั้งใจ — เพิ่มใหม่ต้องมาแก้เทสต์นี้', () => {
    const allowed = new Set([
      'server.arcgisonline.com',           // แผนที่พื้นฐานและภาพดาวเทียม (Esri)
      'tile.openstreetmap.org',            // แผนที่ถนน
      'tile.opentopomap.org',              // แผนที่ภูมิประเทศ
      's3.amazonaws.com',                  // AWS Terrain Tiles (DEM)
      'api.open-meteo.com',                // พยากรณ์อากาศ
      'archive-api.open-meteo.com',        // อากาศย้อนหลัง
      'air-quality-api.open-meteo.com',    // PM2.5 พื้นหลัง
      'nominatim.openstreetmap.org',       // ค้นหาสถานที่
      'overpass-api.de',                   // จุดอ่อนไหวจาก OSM
      'overpass.kumi.systems',
      'overpass.private.coffee',
      'gibs.earthdata.nasa.gov',           // ภาพดาวเทียมรายวันและจุดความร้อน
      'api.rainviewer.com',                // เรดาร์ฝน
      'fonts.googleapis.com', 'fonts.gstatic.com',
      'github.com', 'jrchanakarn.github.io', 'doi.org',   // ลิงก์ในเอกสาร ไม่ใช่คำขอข้อมูล
    ]);
    const hosts = new Set();
    for (const m of text.matchAll(/https?:\/\/(?:\{s\}\.)?([a-z0-9][a-z0-9.-]*\.[a-z]{2,})/gi))
      hosts.add(m[1].toLowerCase());
    const unknown = [...hosts].filter(h => !allowed.has(h));
    expect(unknown, `host ที่ไม่อยู่ในรายการ: ${unknown.join(', ')}`).toEqual([]);
  });
});
