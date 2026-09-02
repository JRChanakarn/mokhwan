/**
 * smoke test — เทสต์อัตโนมัติตัวเดียวที่คุมชั้นแอป
 *
 * รันด้วย: npm run test:smoke   (ต้องมี dev server อยู่ที่ 5180 ก่อน — `npm run dev -w app`)
 * ชี้ที่อื่นได้: APP_URL=http://localhost:5181/?debug npm run test:smoke
 *
 * ใช้ Chrome ที่ติดตั้งในเครื่องผ่าน channel:'chrome' จึงไม่ต้องดาวน์โหลดเบราว์เซอร์
 * ~150 MB · **ต้องมี Google Chrome ในเครื่อง** เพราะ dependency คือ playwright-core
 * ซึ่งตั้งใจไม่พาเบราว์เซอร์มาเลย ถ้าไม่มี Chrome ให้สั่ง
 *   npx playwright install chromium
 * แล้วเทสต์จะถอยไปใช้ตัวนั้นเอง
 *
 * **ปลอดเน็ตจริง** ทุกคำขอที่ออกนอก origin ของแอปถูก intercept แล้วตอบด้วยไทล์ว่าง
 * เพราะไทล์แผนที่พื้นฐานโหลดตอน boot เสมอ (setBase(0)) ไม่เกี่ยวกับโหมดสภาพอากาศ
 * ถ้าไม่ stub เครื่องที่เน็ตถูกจำกัดจะได้ console error จากไทล์ที่โหลดไม่ได้
 * แล้วเทสต์แดงทั้งที่แอปไม่มีปัญหา — และการ stub ยังทำให้ยืนยันได้ว่าแอปคุยกับ
 * host ภายนอกตัวไหนบ้าง ซึ่งเป็นการตรวจที่แข็งกว่าการ grep หาชื่อ CDN
 */
import { chromium } from 'playwright-core';

const APP_URL = process.env.APP_URL ?? 'http://localhost:5180/?debug';
const APP_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** PNG โปร่งใส 1×1 ใช้ตอบแทนไทล์ทุกใบ */
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const fails = [];
const check = (ok, msg) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`);
  if (!ok) fails.push(msg);
};

async function launch() {
  // ลอง Chrome ในเครื่องก่อน แล้วถอยไป chromium ที่ผู้ใช้ install ไว้เอง
  // playwright-core ไม่พาเบราว์เซอร์มาให้ ถ้าไม่มีทั้งสองอย่างต้องบอกให้ชัด
  // ไม่ปล่อยให้ error ดิบของ Playwright โผล่มาแล้วเดาไม่ออกว่าต้องทำอะไร
  const tried = [];
  for (const opt of [{ channel: 'chrome' }, {}]) {
    try { return await chromium.launch(opt); }
    catch (e) { tried.push(`${opt.channel ?? 'chromium (ที่ติดตั้งไว้)'}: ${e.message.split('\n')[0]}`); }
  }
  console.error(
    '\nหาเบราว์เซอร์ไม่ได้ — dependency คือ playwright-core ซึ่งไม่พาเบราว์เซอร์มาให้\n' +
    'ทางเลือก: ติดตั้ง Google Chrome หรือสั่ง  npx playwright install chromium\n\n' +
    tried.map(t => '  - ' + t).join('\n'));
  process.exit(1);
}

const browser = await launch();
const page = await browser.newPage();

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

// ตัดทุกคำขอที่ออกนอก origin ของแอป และจดว่าไปหา host อะไร
const externalHosts = new Map();
await page.route('**/*', route => {
  const u = new URL(route.request().url());
  if (APP_HOSTS.has(u.hostname)) return route.continue();
  externalHosts.set(u.hostname, (externalHosts.get(u.hostname) ?? 0) + 1);
  return route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_PNG });
});

try {
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30_000 });
} catch (e) {
  console.error(`\nเปิด ${APP_URL} ไม่ได้ — dev server รันอยู่ที่ 5180 หรือยัง` +
                `\n  npm run dev -w app\n${e.message}`);
  await browser.close();
  process.exit(1);
}

/* ── แอปบูตขึ้นมาจริง ───────────────────────────────────────────────── */

// เช็คคลาสที่ Leaflet ใส่ให้ตัว #map เอง ไม่ใช่แค่ว่า div มีอยู่และมองเห็น
// (#map มีขนาดจาก CSS อยู่แล้ว isVisible() จึงเขียวได้แม้ L.map() จะโยน)
check(await page.evaluate(() =>
  !!document.getElementById('map')?.classList.contains('leaflet-container')),
  'Leaflet เริ่มต้นสำเร็จ (#map ได้คลาส leaflet-container)');

const handleKeys = await page.evaluate(() =>
  window.__MOKHWAN__ ? Object.keys(window.__MOKHWAN__) : null);
check(Array.isArray(handleKeys), 'debug handle เปิดอยู่');
for (const k of ['S', 'addPlot', 'setWxMode', 'setModel', 'syncAllInputs', 'runSim', 'engineRun', 'map'])
  check(!!handleKeys?.includes(k), `debug handle มี ${k}`);

// เอนจินต้องรันในเวิร์กเกอร์จริง ไม่ใช่ถอยไปเธรดหลักแบบเงียบๆ
// (engineRun มี try/catch ที่ถอยให้อยู่แล้ว เวิร์กเกอร์พังจึงไม่ทำให้เทสต์แดงเอง)
const workerLoaded = await page.evaluate(() =>
  performance.getEntriesByType('resource').filter(r => /worker/i.test(r.name)).length);
check(workerLoaded > 0, `เอนจินโหลดเป็น Web Worker จริง (${workerLoaded} ไฟล์) ไม่ได้ถอยไปเธรดหลัก`);

// ยังไม่ปักแปลง ต้องยังไม่มีชั้นภาพพลูม — เป็นฐานเทียบของเช็คถัดไป
const rasterBefore = await page.locator('#map .leaflet-image-layer').count();
check(rasterBefore === 0, `ก่อนปักแปลงยังไม่มีชั้นภาพพลูม (พบ ${rasterBefore})`);

/* ── ปักแปลงแล้วต้องคำนวณออกผล ──────────────────────────────────────── */

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
    hours: res.perHour.length, cells: res.maxGrid.length,
    peak: res.perHour[0].max, stab: res.perHour[0].stab,
    fuelT: res.totalFuelT, reqId: res.reqId,
  };
});

check(r.hours === 1, `ได้ผล 1 ชั่วโมง (ได้ ${r.hours})`);
check(r.cells === 180 * 180, `กริด 180×180 = ${180 * 180} เซลล์ (ได้ ${r.cells})`);
check(r.stab === 'F', `ใช้ความเสถียรที่ตั้งไว้ F (ได้ ${r.stab})`);
check(Math.abs(r.fuelT - 10.68) < 0.01, `เชื้อเพลิง 20 ไร่ฟางข้าว = 10.68 ตัน (ได้ ${r.fuelT})`);
check(r.peak > 10 && r.peak < 10_000, `พีคอยู่ในย่านที่สมเหตุสมผล: ${r.peak.toFixed(1)} µg/m³`);

/* ── ชั้นภาพพลูมต้องถูกวาดจริง ──────────────────────────────────────── */

// ต้องเช็ค .leaflet-image-layer ซึ่งเป็น L.imageOverlay ของ drawOverlay() เท่านั้น
// **ห้ามเช็ค `#map canvas`** เพราะ preferCanvas:true ทำให้วงขอบแปลงที่ redrawPlots()
// วาดด้วย L.circle ไปอยู่บน canvas ร่วม ตั้งแต่ก่อนการจำลองจะเริ่ม
// เช็คที่ยอมรับ canvas จึงเขียวได้แม้การวาดพลูมพังทั้งหมด (code review จับได้)
// ถอดภาพออกมานับพิกเซลจริง ไม่วัดด้วยความยาว data URL
// ความยาวขึ้นกับการบีบอัด PNG ซึ่งบีบไล่สีเรียบๆ ได้ดีมาก เกณฑ์ความยาวจึงเป็น
// ตัวแทนที่เดาได้ยากและไม่ได้วัดสิ่งที่อยากรู้ — ที่อยากรู้คือ "มีควันวาดอยู่จริงไหม"
const raster = await page.evaluate(async () => {
  const el = document.querySelector('#map .leaflet-image-layer');
  if (!el) return null;
  const src = el.getAttribute('src') ?? '';
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let opaque = 0;
  const colours = new Set();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 8) {
      opaque++;
      colours.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    }
  }
  return {
    src: src.slice(0, 16), px: img.naturalWidth * img.naturalHeight,
    opaque, colours: colours.size,
    w: el.clientWidth, h: el.clientHeight,
  };
});
check(!!raster, 'ชั้นภาพพลูมถูกวาดลงแผนที่ (.leaflet-image-layer)');
check(!!raster && raster.src.startsWith('data:image/'),
  `ภาพพลูมเป็น data URL (${raster ? raster.src + '…' : 'ไม่มี'})`);
// ควันต้องกินพื้นที่พอสมควร ภาพเปล่าจะได้ 0 และจุดเดียวจะได้น้อยกว่า 0.5%
check(!!raster && raster.opaque > raster.px * 0.005,
  `ภาพพลูมมีพิกเซลทึบจริง ${raster ? raster.opaque.toLocaleString() + '/' + raster.px.toLocaleString()
    + ' = ' + (raster.opaque / raster.px * 100).toFixed(1) + '%' : '—'} ของภาพ`);
// ต้องมีหลายสี เพราะเป็นการไล่ตามแถบ AQI ไม่ใช่ก้อนสีเดียว
check(!!raster && raster.colours >= 3,
  `ภาพพลูมไล่หลายสีตามแถบ AQI (${raster ? raster.colours : 0} สี)`);
check(!!raster && raster.w > 50 && raster.h > 50,
  `ภาพพลูมมีขนาดบนจอ (${raster ? raster.w + '×' + raster.h : '—'})`);

/* ── เปลี่ยนมุมมองต้องไม่คำนวณใหม่ ──────────────────────────────────── */

// ต้องกดผ่าน DOM จริง การเซ็ต S.view ตรงๆ ไม่ทริกอะไรและจะผ่านฟรี
// และต้องรอให้เกิน debounce ของ schedule() (90 ms) บวกเวลาไป-กลับเวิร์กเกอร์
// ไม่งั้น regression ที่ทำให้เปลี่ยนมุมมองแล้วเรียก schedule() จะเล็ดลอดไปได้
const DEBOUNCE_MARGIN = 1_200;
const before = r.reqId;
await page.click('#vMax');
await page.waitForFunction(() => window.__MOKHWAN__.S.view === 'max', { timeout: 5_000 });
await page.waitForTimeout(DEBOUNCE_MARGIN);
const afterMax = await page.evaluate(() => window.__MOKHWAN__.S.result.reqId);
await page.click('#vDose');
await page.waitForFunction(() => window.__MOKHWAN__.S.view === 'dose', { timeout: 5_000 });
await page.waitForTimeout(DEBOUNCE_MARGIN);
const afterDose = await page.evaluate(() => window.__MOKHWAN__.S.result.reqId);

check(before === afterMax && before === afterDose,
  `เปลี่ยนมุมมองไม่ทำให้คำนวณใหม่ (reqId ${before} → ${afterMax} → ${afterDose}` +
  ` · รอเกิน debounce ${DEBOUNCE_MARGIN} ms แล้ว)`);

/* ── สลับแบบจำลอง (ก้าว 5 ข้อ 4) ────────────────────────────────────── */

// กดปุ่มจริง ไม่เซ็ต S.model ตรงๆ · ตอนนี้ยังไม่มี DEM จึงเป็น puff บนพื้นราบ
// ถ้าการแยกข้อความ progress ใน onmessage ผิด promise จะถูก resolve ด้วย
// {type:'progress'} แทนผลจริง → model จะไม่ใช่ 'puff' และ type จะโผล่ เทสต์นี้จึงจับได้ด้วย
await page.click('#mPuff');
await page.waitForFunction(() => window.__MOKHWAN__.S.result?.model === 'puff', { timeout: 30_000 });
const puffRes = await page.evaluate(() => {
  const r = window.__MOKHWAN__.S.result;
  return { model: r.model, type: r.type, terrain: r.perHour[0].terrain, peak: r.perHour[0].max,
           pressed: document.getElementById('mPuff').getAttribute('aria-pressed'),
           note: document.getElementById('modelnote').textContent };
});
check(puffRes.model === 'puff' && puffRes.type === undefined, `สลับเป็น puff แล้วได้ผลจากโมเดล puff (ไม่ใช่ข้อความ progress)`);
check(puffRes.terrain === false, 'ยังไม่มี DEM จึงเป็น puff บนพื้นราบ (terrain=false)');
check(puffRes.peak > 10 && puffRes.peak < 10_000, `พีค puff อยู่ในย่านที่สมเหตุสมผล: ${puffRes.peak.toFixed(1)} µg/m³`);
check(puffRes.pressed === 'true' && /puff/i.test(puffRes.note), 'ปุ่มและคำอธิบายสะท้อนโหมด puff');

await page.click('#mGauss');
await page.waitForFunction(() => window.__MOKHWAN__.S.result && window.__MOKHWAN__.S.result.model === undefined, { timeout: 30_000 });
check(await page.evaluate(() => window.__MOKHWAN__.S.model === 'gauss'), 'สลับกลับเป็น gauss ได้');

/* ── การโหลดของภายนอก ───────────────────────────────────────────────── */

const mlBefore = await page.evaluate(() =>
  performance.getEntriesByType('resource').filter(x => /maplibre/i.test(x.name)).length);
check(mlBefore === 0, `maplibre ไม่ถูกโหลดจนกว่าจะกด 3D (โหลดแล้ว ${mlBefore} ไฟล์)`);

// host ภายนอกที่แอปคุยด้วยต้องเป็นแค่ผู้ให้บริการแผนที่พื้นฐาน
// ห้ามมี CDN ของไลบรารีหลุดกลับมา ซึ่งเป็นสิ่งที่งานรื้อโครงนี้กำจัดไป
const LIB_CDNS = ['cdnjs.cloudflare.com', 'unpkg.com', 'cdn.jsdelivr.net'];
const hosts = [...externalHosts.keys()];
const leaked = hosts.filter(h => LIB_CDNS.some(c => h.includes(c)));
check(leaked.length === 0, `ไม่มีการโหลดไลบรารีจาก CDN${leaked.length ? ' — ' + leaked.join(', ') : ''}`);
console.log(`    host ภายนอกที่ถูก stub: ${hosts.length ? hosts.join(', ') : 'ไม่มีเลย'}`);

check(errors.length === 0,
  `console ไม่มี error${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);

await browser.close();

if (fails.length) {
  console.error(`\nไม่ผ่าน ${fails.length} ข้อ:`);
  fails.forEach(f => console.error('  - ' + f));
  process.exit(1);
}
console.log(`\nผ่านทั้งหมด ${fails.length === 0 ? '' : ''}`);
