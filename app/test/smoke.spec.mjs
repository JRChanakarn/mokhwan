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
import { readFileSync } from 'node:fs';

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
// เน็ตภายนอกถูก stub ด้วย PNG 1×1 → ไทล์ผิดขนาด → สำรองก็ได้ PNG แทน JSON → ล้มทั้งคู่
// นี่คือเกณฑ์ข้อ 6 ของ HANDOFF: API ล่มต้องไม่พัง แอปต้องคำนวณต่อบนพื้นราบพร้อมป้ายบอกภาษาไทย
check(puffRes.terrain === false, 'DEM ดึงไม่ได้ (เน็ตถูกบล็อก) → puff บนพื้นราบ terrain=false แอปไม่พัง');
const demFail = await page.evaluate(() => ({ ok: window.__MOKHWAN__.S.dem?.ok, txt: document.getElementById('demstat').textContent }));
check(demFail.ok === false && /ดึงข้อมูลความสูงไม่ได้/.test(demFail.txt) && /พื้นราบ/.test(demFail.txt),
  `ป้ายสถานะ DEM บอกเหตุผลภาษาไทยและว่าคำนวณแบบพื้นราบแทน`);
check(puffRes.peak > 10 && puffRes.peak < 10_000, `พีค puff อยู่ในย่านที่สมเหตุสมผล: ${puffRes.peak.toFixed(1)} µg/m³`);
check(puffRes.pressed === 'true' && /puff/i.test(puffRes.note), 'ปุ่มและคำอธิบายสะท้อนโหมด puff');

await page.click('#mGauss');
await page.waitForFunction(() => window.__MOKHWAN__.S.result && window.__MOKHWAN__.S.result.model === undefined, { timeout: 30_000 });
check(await page.evaluate(() => window.__MOKHWAN__.S.model === 'gauss'), 'สลับกลับเป็น gauss ได้');

/* ── DEM สำเร็จ: เสิร์ฟไทล์ terrarium ปลอม (แอ่งกลางไทล์) ─────────────────── */
const TERRARIUM_PNG = readFileSync(new URL('./fixtures/terrarium-basin.png', import.meta.url));
await page.unroute('**/*');
await page.route('**/*', route => {
  const u = new URL(route.request().url());
  if (APP_HOSTS.has(u.hostname)) return route.continue();
  externalHosts.set(u.hostname, (externalHosts.get(u.hostname) ?? 0) + 1);
  if (/elevation-tiles-prod\/terrarium\//.test(u.pathname)) return route.fulfill({ status: 200, contentType: 'image/png', body: TERRARIUM_PNG });
  // สนามลม: ลมไล่ระดับตามลองจิจูด เพื่อให้ spread > 0 พิสูจน์ว่าใช้ค่ารายจุดจริง
  if (u.hostname === 'api.open-meteo.com' && u.pathname.startsWith('/v1/forecast') && u.searchParams.get('hourly')?.includes('wind_speed_10m')) {
    const lons = (u.searchParams.get('longitude') ?? '').split(',').map(Number);
    // ต้องปัดเป็นต้นชั่วโมง — buildHours() สร้างคีย์เป็น 'YYYY-MM-DDTHH:00' เวลาท้องถิ่น
    // ถ้าไม่ปัด จะได้ '10:37' แล้วไม่ตรงกับคีย์ของแอปเลยสักชั่วโมง
    const h0 = new Date(); h0.setMinutes(0, 0, 0); h0.setHours(h0.getHours() - 24);
    const times = Array.from({ length: 72 }, (_, k) => {
      const d = new Date(h0.getTime() + k * 3600e3);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
    });
    const lo = Math.min(...lons), hi = Math.max(...lons);
    const body = lons.map(x => ({ hourly: { time: times,
      wind_speed_10m: times.map(() => 1 + 6 * (x - lo) / ((hi - lo) || 1)),
      wind_direction_10m: times.map(() => 90) } }));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  }
  return route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_PNG });
});
await page.click('#mPuff');
await page.waitForFunction(() => window.__MOKHWAN__.S.result?.model === 'puff' && window.__MOKHWAN__.S.result.perHour[0].terrain === true, { timeout: 45_000 });
const demOk = await page.evaluate(() => {
  const M = window.__MOKHWAN__, r = M.S.result;
  return { src: M.S.dem?.meta?.source, relief: r.perHour[0].relief, Fr: r.perHour[0].Fr, peak: r.perHour[0].max,
           zoom: M.S.dem?.meta?.zoom, tiles: M.S.dem?.meta?.tiles, txt: document.getElementById('demstat').textContent };
});
check(demOk.src === 'terrarium', `DEM มาจาก terrarium (zoom ${demOk.zoom} · ${demOk.tiles} ไทล์)`);
check(demOk.relief > 100, `เอนจินได้ภูมิประเทศจริง relief ${demOk.relief?.toFixed(0)} ม.`);
check(Number.isFinite(demOk.Fr) && demOk.Fr < 99, `Froude ถูกคำนวณจาก DEM (${demOk.Fr?.toFixed(3)})`);
check(demOk.peak > 1, `puff บนภูมิประเทศให้ค่าที่พื้นไม่เป็นศูนย์ (${demOk.peak?.toFixed(1)} µg/m³)`);
check(/AWS Terrain Tiles/.test(demOk.txt) && /Froude/.test(demOk.txt), 'ป้ายสถานะ DEM แสดงแหล่ง ความละเอียด ต่างระดับ และ Froude');

// HANDOFF ข้อ 3 / เกณฑ์ 4: โหมด 2D เห็นภูมิประเทศพร้อมชั้นควัน และภูมิประเทศต้องอยู่ *ใต้* ควัน
const terr = await page.evaluate(() => {
  const pane = document.querySelector('.leaflet-terrain-pane');   // createPane('terrainPane') → คลาส leaflet-terrain-pane (Leaflet ตัดคำ Pane)
  const overlay = document.querySelector('.leaflet-overlay-pane');
  const hill = pane?.querySelector('img');
  const cvs = pane?.querySelector('canvas');
  return { pane: !!pane, z: pane ? +getComputedStyle(pane).zIndex : null, zOverlay: overlay ? +getComputedStyle(overlay).zIndex : null,
           hill: !!hill && hill.getAttribute('src')?.startsWith('data:image/'), contours: !!cvs && cvs.width > 0 };
});
check(terr.pane && terr.hill, 'มี hillshade ภูมิประเทศใน pane ของตัวเอง');
check(terr.contours, 'มีเส้นชั้นความสูงวาดใน pane เดียวกัน');
check(terr.z !== null && terr.zOverlay !== null && terr.z < terr.zOverlay, `ภูมิประเทศอยู่ใต้ควัน (zIndex ${terr.z} < ${terr.zOverlay})`);

// สลับกลับพื้นราบ → ภูมิประเทศต้องหาย
await page.click('#mGauss');
await page.waitForFunction(() => window.__MOKHWAN__.S.result && window.__MOKHWAN__.S.result.model === undefined, { timeout: 30_000 });
check(await page.evaluate(() => !document.querySelector('.leaflet-terrain-pane img')), 'กลับโหมดพื้นราบแล้วภูมิประเทศหายไป');

// ข้อจำกัดที่บอกผู้ใช้ต้องตรงกับแบบจำลองที่ใช้อยู่ ไม่ใช่พูดว่า "สมมติพื้นราบ" ตอนรันโหมดภูมิประเทศ
const limGauss = await page.evaluate(() => document.getElementById('limitnote').textContent);
check(/พื้นราบ/.test(limGauss) && !/CALPUFF/.test(limGauss), 'โหมดพื้นราบ: ข้อจำกัดพูดถึงพื้นราบ');
await page.click('#mPuff');
await page.waitForFunction(() => window.__MOKHWAN__.S.result?.model === 'puff' && window.__MOKHWAN__.S.result.perHour[0].terrain === true, { timeout: 45_000 });
const limPuff = await page.evaluate(() => document.getElementById('limitnote').textContent);
check(/CALPUFF/.test(limPuff) && /คลื่นภูเขา/.test(limPuff) && !/สมมติพื้นราบ/.test(limPuff),
  'โหมดภูมิประเทศ: ข้อจำกัดเปลี่ยนตาม บอกว่าจับคลื่นภูเขาไม่ได้และอ้าง CALPUFF');

// พื้นความปั่นป่วนปรับได้จาก UI และมีผลจริง (ตั้งลมนิ่ง 0.4 เพื่อให้ค่านี้เป็นตัวชี้ขาด)
await page.evaluate(() => { const M = window.__MOKHWAN__; M.S.man = { ws: 0.4, wdir: 90, stab: 'F', mix: 150 }; M.syncAllInputs(); });
await page.waitForFunction(() => window.__MOKHWAN__.S.result?.perHour[0].ws === 0.4, { timeout: 45_000 });
const peakAt = async v => {
  // ต้องรอ "ผลชุดใหม่" ไม่ใช่แค่ !computing — schedule() หน่วง 90 ms ถ้าเช็คเร็วเกินไป
  // S.computing ยังเป็น false จากรอบก่อน เงื่อนไขผ่านทันทีแล้วอ่านผลเก่า (เจอตอนเขียนเทสต์)
  const before = await page.evaluate(() => window.__MOKHWAN__.S.result.reqId);
  await page.evaluate(x => {
    const el = document.getElementById('wsfloor');
    el.value = String(x); el.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);
  // playwright: waitForFunction(fn, arg, options) — เรียงสลับแล้ว arg จะกลายเป็น object ของ options
  await page.waitForFunction(
    a => window.__MOKHWAN__.S.wsFloor === a.v && !window.__MOKHWAN__.S.computing && window.__MOKHWAN__.S.result.reqId > a.before,
    { v, before }, { timeout: 45_000 });
  return page.evaluate(() => ({ peak: window.__MOKHWAN__.S.result.perHour[0].max, txt: document.getElementById('wsfloortxt').textContent }));
};
const off = await peakAt(0), on = await peakAt(1), hi = await peakAt(2);
check(off.peak < 1, `ปิดพื้นความปั่นป่วน → ค่าที่พื้นเกือบศูนย์ (${off.peak.toFixed(2)}) = พฤติกรรมก่อนแก้บั๊ก`);
check(on.peak > off.peak * 50, `ตั้ง 1.0 → ควันลงถึงพื้น (${on.peak.toFixed(1)} µg/m³)`);
check(hi.peak > on.peak, `ตั้ง 2.0 → มากกว่าเดิมอีก (${hi.peak.toFixed(1)} µg/m³)`);
check(off.txt === 'ปิด' && /1\.0/.test(on.txt), 'ป้ายค่าบอกสถานะถูก (ปิด / 1.0 ม./วิ)');
await peakAt(1);

// สนามลมจริงรายจุด — เปิดแล้วต้องคำนวณใหม่และผลต้องต่างจากลมค่าเดียว
const beforeWind = await page.evaluate(() => ({ reqId: window.__MOKHWAN__.S.result.reqId, peak: window.__MOKHWAN__.S.result.perHour[0].max }));
await page.click('#useWind');
await page.waitForFunction(a => window.__MOKHWAN__.S.useWind && !window.__MOKHWAN__.S.computing && window.__MOKHWAN__.S.result.reqId > a,
  beforeWind.reqId, { timeout: 45_000 });
const wind = await page.evaluate(() => ({
  info: window.__MOKHWAN__.S.windInfo, peak: window.__MOKHWAN__.S.result.perHour[0].max,
  txt: document.getElementById('windstat').textContent,
}));
check(wind.info?.ok === true && wind.info.hours > 0, `ใส่สนามลมให้ ${wind.info?.hours}/${wind.info?.total} ชั่วโมง`);
check(wind.info?.spread > 0.5, `ลมต่างกันในโดเมนจริง (spread ${wind.info?.spread?.toFixed(2)} ม./วิ)`);
check(wind.peak !== beforeWind.peak, `ผลเปลี่ยนเมื่อใช้สนามลมจริง (${beforeWind.peak.toFixed(1)} → ${wind.peak.toFixed(1)} µg/m³)`);
check(/ระยะห่างจุดข้อมูล/.test(wind.txt), 'สถานะบอกข้อจำกัดว่าจับลมในหุบไม่ได้');
await page.click('#useWind');
await page.waitForFunction(() => !window.__MOKHWAN__.S.useWind && !window.__MOKHWAN__.S.computing, { timeout: 45_000 });

// ก้อนควัน 3D ต้องอัดจากกริดจริง ไม่ใช่กรวย Gaussian ที่คำนวณซ้ำ
// กลับมาโหมดรายชั่วโมงก่อน เช็คก่อนหน้าเปลี่ยนเป็นสะสมค้างไว้
await page.click('#vHour');
const vol = await page.evaluate(() => {
  const M = window.__MOKHWAN__, fc = M.plumeVolume();
  const r = M.S.result, g = r.grids[M.S.hourIndex] || r.grids[0];
  // นับเซลล์ในกริดที่เกินเกณฑ์ แล้วเทียบว่าก้อนควันโผล่เฉพาะตรงที่กริดมีค่า
  let hot = 0; for (let q = 0; q < g.length; q++) if (g[q] >= 1) hot++;
  // นับบล็อกที่ควรมีควัน จากกริดจริงด้วยตรรกะย่อแบบเดียวกัน — ถ้า 3D ยังลากกรวยของตัวเอง
  // จำนวนจะไม่มีทางตรงกับตัวเลขนี้
  const step = Math.max(1, Math.round(r.N / 40)), MB = Math.ceil(r.N / step);
  let want = 0;
  for (let bj = 0; bj < MB; bj++) for (let bi = 0; bi < MB; bi++) {
    let m = 0;
    for (let j = bj * step; j < Math.min(r.N, (bj + 1) * step); j++)
      for (let i = bi * step; i < Math.min(r.N, (bi + 1) * step); i++) {
        const v = g[j * r.N + i]; if (v > m) m = v;
      }
    if (m >= 1) want++;
  }
  const lid = Math.max(r.perHour[M.S.hourIndex].mix, 60);
  return { n: fc.features.length, hot, want, N: r.N,
    props: fc.features.map(f => f.properties),
    lid, pexag: +document.getElementById('pexag').value,
    kinds: [...new Set(fc.features.map(f => f.properties.kind))] };
});
check(vol.n > 0, `3D มีก้อนควัน ${vol.n} ก้อน จากกริดที่มีค่า ${vol.hot}/${vol.N * vol.N} เซลล์`);
check(vol.n === vol.want,
      `จำนวนก้อนตรงกับบล็อกที่กริดมีค่าเป๊ะ (${vol.n} = ${vol.want}) — พิสูจน์ว่ารูปร่างมาจากกริด ไม่ใช่กรวย`);
check(vol.props.every(p => p.base >= 0 && p.height > p.base),
      'ทุกก้อนมีความหนาเป็นบวกและฐานไม่ติดลบ');
// เพดานคือชั้นผสมคูณตัวยกความสูงควัน (การมองเห็นล้วนๆ) ถ้าเผลอบวกความสูงพื้นดินเอง
// จะทะลุเพดานนี้ทันทีเพราะภูเขาแถวเชียงใหม่สูงหลายร้อยถึงพันเมตร
const capH = vol.lid * 1.05 * vol.pexag + 5;
check(vol.props.every(p => p.height <= capH),
      `ไม่บวกความสูงพื้นดินเอง (maplibre บวกให้แล้ว) — สูงสุด ${Math.max(...vol.props.map(p => p.height))} ม. ไม่เกินเพดาน ${Math.round(capH)} ม.`);
check(vol.props.every(p => typeof p.conc === 'number' && p.conc >= 1),
      'ทุกก้อนพกค่าความเข้มข้นจากกริดมาด้วย');
check(vol.kinds.every(k => k === undefined), 'ไม่มี kind flaming/smold แล้ว (กริดรวมสองเฟส)');

// เลื่อนมุมมองต้องไม่สร้างชั้นภูมิประเทศใหม่ (memoise) ไม่งั้นกระพริบตอนกด play
const beforeImg = await page.evaluate(() => document.querySelector('.leaflet-terrain-pane img')?.getAttribute('src')?.length);
await page.click('#vMax'); await page.waitForTimeout(600);
await page.click('#vHour'); await page.waitForTimeout(600);
const afterEl = await page.evaluate(() => {
  const im = document.querySelector('.leaflet-terrain-pane img');
  return { len: im?.getAttribute('src')?.length, same: im === window.__terrTest };
});
await page.evaluate(() => { window.__terrTest = document.querySelector('.leaflet-terrain-pane img'); });
await page.click('#vDose'); await page.waitForTimeout(600);
const stable = await page.evaluate(() => document.querySelector('.leaflet-terrain-pane img') === window.__terrTest);
check(beforeImg === afterEl.len && stable, 'เปลี่ยนมุมมองไม่สร้างชั้นภูมิประเทศใหม่ (element เดิม)');

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
