/**
 * smoke test — ยืนยันว่าแอปเปิดได้ ปักแปลงได้ คำนวณออกผล และเปลี่ยนมุมมองไม่คำนวณใหม่
 *
 * รันด้วย: npm run test:smoke   (ต้องมี dev server อยู่ที่ 5180 ก่อน — `npm run dev -w app`)
 * หรือชี้ที่อื่น: APP_URL=http://localhost:5181/?debug npm run test:smoke
 *
 * ใช้ Chrome ที่ติดตั้งในเครื่องผ่าน channel:'chrome' จึงไม่ต้องดาวน์โหลดเบราว์เซอร์
 * ~150 MB ของ Playwright ถ้าไม่มีจะถอยไปใช้ chromium ที่ Playwright จัดมา
 *
 * ตั้งสภาพอากาศเป็นโหมดกำหนดเองโดยตั้งใจ เพื่อให้เทสต์ไม่พึ่ง Open-Meteo
 * ผลลัพธ์จึงคงที่และรันได้แม้ไม่มีเน็ต
 */
import { chromium } from 'playwright-core';

const APP_URL = process.env.APP_URL ?? 'http://localhost:5180/?debug';

const fails = [];
const check = (ok, msg) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`);
  if (!ok) fails.push(msg);
};

async function launch() {
  try { return await chromium.launch({ channel: 'chrome' }); }
  catch { return await chromium.launch(); }
}

const browser = await launch();
const page = await browser.newPage();

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

try {
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30_000 });
} catch (e) {
  console.error(`\nเปิด ${APP_URL} ไม่ได้ — dev server รันอยู่ที่ 5180 หรือยัง\n${e.message}`);
  await browser.close();
  process.exit(1);
}

check(await page.locator('#map').isVisible(), 'แผนที่แสดงผล');

const handleKeys = await page.evaluate(() =>
  window.__MOKHWAN__ ? Object.keys(window.__MOKHWAN__) : null);
check(Array.isArray(handleKeys), 'debug handle เปิดอยู่');
for (const k of ['S', 'addPlot', 'setWxMode', 'syncAllInputs', 'runSim', 'map'])
  check(!!handleKeys?.includes(k), `debug handle มี ${k}`);

// สภาพอากาศกำหนดเอง 1 ชั่วโมง แล้วปักแปลง 20 ไร่
await page.evaluate(() => {
  const M = window.__MOKHWAN__;
  M.setWxMode('man');
  M.S.man = { ws: 1.4, wdir: 35, stab: 'F', mix: 180 };
  M.S.dur = 1;
  M.syncAllInputs();
  M.addPlot({ type: 'point', latlng: M.map.getCenter(), rai: 20 });
});

await page.waitForFunction(() => window.__MOKHWAN__.S.result !== null, { timeout: 30_000 });

const r = await page.evaluate(() => {
  const res = window.__MOKHWAN__.S.result;
  return {
    hours: res.perHour.length,
    cells: res.maxGrid.length,
    peak: res.perHour[0].max,
    stab: res.perHour[0].stab,
    fuelT: res.totalFuelT,
    reqId: res.reqId,
  };
});

check(r.hours === 1, `ได้ผล 1 ชั่วโมง (ได้ ${r.hours})`);
check(r.cells === 180 * 180, `กริด 180×180 = ${180 * 180} เซลล์ (ได้ ${r.cells})`);
check(r.stab === 'F', `ใช้ความเสถียรที่ตั้งไว้ F (ได้ ${r.stab})`);
check(Math.abs(r.fuelT - 10.68) < 0.01, `เชื้อเพลิง 20 ไร่ฟางข้าว = 10.68 ตัน (ได้ ${r.fuelT})`);
check(r.peak > 10 && r.peak < 10_000, `พีคอยู่ในย่านที่สมเหตุสมผล: ${r.peak.toFixed(1)} µg/m³`);
check(!!(await page.locator('#map canvas, #map .leaflet-image-layer').first().count()),
  'ชั้นควันถูกวาดลงแผนที่');

// เปลี่ยนมุมมองต้องไม่คำนวณใหม่ — ต้องกดผ่าน DOM จริง
// การเซ็ต S.view ตรงๆ ไม่ทริกอะไร เทสต์จะผ่านฟรี
const before = r.reqId;
await page.click('#vMax');
await page.waitForFunction(() => window.__MOKHWAN__.S.view === 'max', { timeout: 5_000 });
const afterMax = await page.evaluate(() => window.__MOKHWAN__.S.result.reqId);
await page.click('#vDose');
await page.waitForFunction(() => window.__MOKHWAN__.S.view === 'dose', { timeout: 5_000 });
const afterDose = await page.evaluate(() => window.__MOKHWAN__.S.result.reqId);

check(before === afterMax && before === afterDose,
  `เปลี่ยนมุมมองไม่ทำให้คำนวณใหม่ (reqId ${before} → ${afterMax} → ${afterDose})`);

// maplibre ต้องไม่ถูกโหลดตอนเปิดหน้า
const mlBefore = await page.evaluate(() =>
  performance.getEntriesByType('resource').filter(x => /maplibre/i.test(x.name)).length);
check(mlBefore === 0, `maplibre ไม่ถูกโหลดจนกว่าจะกด 3D (โหลดแล้ว ${mlBefore} ไฟล์)`);

// ไม่มีคำขอไป CDN
const cdn = await page.evaluate(() =>
  performance.getEntriesByType('resource')
    .filter(x => /cdnjs|unpkg|jsdelivr/.test(x.name)).map(x => x.name));
check(cdn.length === 0, `ไม่มีคำขอไป CDN${cdn.length ? ' — ' + cdn.join(', ') : ''}`);

check(errors.length === 0,
  `console ไม่มี error${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);

await browser.close();

if (fails.length) {
  console.error(`\nไม่ผ่าน ${fails.length} ข้อ:`);
  fails.forEach(f => console.error('  - ' + f));
  process.exit(1);
}
console.log('\nผ่านทั้งหมด');
