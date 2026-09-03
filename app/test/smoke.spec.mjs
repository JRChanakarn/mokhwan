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
check(/AWS Terrain Tiles|Open-Meteo/.test(demOk.txt) && /ม\.\/จุด/.test(demOk.txt) && /ต่างระดับในโดเมน/.test(demOk.txt),
      'ป้ายสถานะ DEM แสดงแหล่ง ความละเอียด และต่างระดับ')
// เดิมเช็คว่ามีคำว่า "Froude" ซึ่งไม่มีใครแปลออก ตอนนี้ต้องบอกเป็นภาษาคนว่า
// ชั่วโมงนั้นภูเขาเบนลมหรือลมพัดข้ามไป
check(/เบนอ้อม|ข้ามสันเขา/.test(demOk.txt), 'บอกเป็นภาษาคนว่าภูเขาเบนลมหรือลมข้ามไป')

// ระยะต้องวัดจากกองไฟที่**ใกล้ที่สุด** ไม่ใช่จาก origin ซึ่งเป็นศูนย์กลางของทุกแปลงรวมกัน
// วางหลายแปลงกระจายกันแล้ววัดจากศูนย์กลางจะคลาดเคลื่อนได้หลายเท่า (เจ้าของงานเจอจากภาพ)
const spread = await page.evaluate(async () => {
  const M = window.__MOKHWAN__;
  const c = M.map.getCenter();
  M.S.plots = [];
  [[0.05,-0.06],[0,0],[-0.05,0.06],[0.06,0.05]].forEach(([dy,dx]) =>
    M.addPlot({ type:'point', latlng:{lat:c.lat+dy, lng:c.lng+dx}, rai:150 }));
  const before = M.S.result ? M.S.result.reqId : 0;
  M.runSim();
  return before;
});
await page.waitForFunction(a => !window.__MOKHWAN__.S.computing && window.__MOKHWAN__.S.result.reqId > a,
  spread, { timeout: 60_000 });
const dist = await page.evaluate(() => {
  const M = window.__MOKHWAN__, r = M.S.result, st = M.S.stats;
  const fires = M.firePoints();
  // หาระยะจากศูนย์กลางไปยังกองไฟที่ไกลสุด ถ้าวัดผิดจะได้ค่าระดับนี้
  const spreadKm = Math.max(...fires.map(f => Math.hypot(f[0], f[1])))/1000;
  return { fires: fires.length, peakKm: st.dmaxD/1000, reachKm: st.reach/1000, spreadKm };
});
check(dist.fires === 4, `วางแปลงกระจาย ${dist.fires} แปลง ห่างจากศูนย์กลางถึง ${dist.spreadKm.toFixed(1)} กม.`);
check(dist.peakKm < dist.spreadKm * 0.6,
      `ระยะพีควัดจากกองไฟใกล้สุด ${dist.peakKm.toFixed(2)} กม. ไม่ใช่จากศูนย์กลาง (${dist.spreadKm.toFixed(1)} กม.)`);
// อากาศที่ stub ไว้ให้ค่าต่ำกว่าเกณฑ์ 37.5 จึงอาจได้ 0 = ไม่มีที่เกิน ซึ่งถูกต้อง
// ที่ต้องกันคือค่าที่โตเกินการกระจายของแปลง ซึ่งเป็นอาการของการวัดจากศูนย์กลาง
check(dist.reachKm >= 0 && dist.reachKm < dist.spreadKm * 1.5,
      `ระยะที่ยังเกินเกณฑ์ไม่โตเกินจริง (${dist.reachKm.toFixed(2)} กม.)`);
await page.evaluate(() => { const M = window.__MOKHWAN__;
  M.S.plots = []; M.addPlot({ type:'point', latlng: M.map.getCenter(), rai:20 }); });
await page.waitForFunction(() => !window.__MOKHWAN__.S.computing && window.__MOKHWAN__.S.result,
  null, { timeout: 60_000 });

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

/* ── ความเหมาะสมกับการใช้งานจริง ─────────────────────────────────── */

// แถบความน่าเชื่อถือต้องอยู่บนสุดของแผงสรุปตลอด ไม่ใช่ซ่อนในกล่องเลือกแบบจำลอง
// และต้องบอก**ทิศของอคติ** ไม่ใช่แค่ว่า "ไม่แม่น" ซึ่งฟังเหมือนพลาดได้สองทางเท่าๆ กัน
const trust = await page.evaluate(() => {
  const bar = document.querySelector('#panel .trustbar') || document.querySelector('.trustbar');
  const panel = document.getElementById('panel');
  return { has: !!bar, text: bar ? bar.textContent : '',
           first: !!(bar && panel && panel.querySelector('.trustbar') === panel.firstElementChild) ||
                  !!(bar && bar.parentElement && bar.parentElement.firstElementChild === bar) };
});
check(trust.has, 'มีแถบความน่าเชื่อถือในแผงสรุป');
check(trust.first, 'อยู่บนสุดของแผง ก่อนตัวเลขใดๆ');
check(/ต่ำกว่าจริง/.test(trust.text), 'บอกทิศของอคติว่าไปทางต่ำกว่าจริง');
check(/ห้ามใช้ออกใบอนุญาต|ห้ามใช้/.test(trust.text), 'บอกชัดว่าห้ามใช้ทำอะไร');

// ตัวเลขต้องไม่แสดงนัยสำคัญเกินกว่าที่แบบจำลองรองรับ
const nums = await page.evaluate(() => {
  const t = document.getElementById('panel').textContent;
  // อ่านจาก DOM ไม่ใช่จากข้อความรวม เพื่อให้ได้ค่าของแถวนั้นตรงๆ ไม่ปนกับ note ที่ต่อท้าย
  const row = [...document.querySelectorAll('#panel .st2')]
    .find(d => /คนที่อาจอยู่ในเขตเกิน/.test(d.textContent));
  return { peak: (t.match(/ค่าสูงสุดบนพื้น\s*([^µ]+)/) || [])[1] || '',
           pop: row ? (row.querySelector('b') || {}).textContent || '' : '(ไม่พบแถว)',
           note: t };
});
check(/~/.test(nums.peak), `ค่าสูงสุดแสดงเป็นค่าประมาณ (${nums.peak.trim()})`);
// แถวจำนวนคนต้องเป็น "ราว a–b คน" หรือ "ไม่มี" เท่านั้น ห้ามเป็นตัวเลขเดียว
check(/^(ราว [\d,]+–[\d,]+ คน|ไม่มี)$/.test(nums.pop.trim()),
      `แถวจำนวนคนไม่ใช่ตัวเลขเจาะจง ("${nums.pop.trim()}")`);
// ทดสอบตัวจัดรูปแบบตรงๆ เพราะเส้นทางแสดงช่วงต้องมีพื้นที่เกิน 37.5 ซึ่งขึ้นกับฉาก
// ขยายแปลงไม่ช่วยเพราะ sy0 โตตามขนาดแปลง ควันเจือจางกว้างขึ้นแทนที่จะเข้มขึ้น
const fmtChk = await page.evaluate(() => {
  const M = window.__MOKHWAN__;
  return { r0: M.popRange(0), r1: M.popRange(500), r2: M.popRange(12),
           n1: M.softNum(446), n2: M.softNum(26.4), n3: M.softNum(3.27) };
});
check(/^ราว [\d,]+–[\d,]+ คน$/.test(fmtChk.r1) && /^ราว [\d,]+–[\d,]+ คน$/.test(fmtChk.r2),
      `จำนวนคนแสดงเป็นช่วง (500 → ${fmtChk.r1})`);
check(fmtChk.r0 === 'ไม่มี', 'ไม่มีคนในเขตก็บอกว่าไม่มี ไม่ใช่ 0 คน');
check(fmtChk.n1 === '~450' && fmtChk.n2 === '~26',
      `ปัดนัยสำคัญตามขนาด (446 → ${fmtChk.n1} · 26.4 → ${fmtChk.n2} · 3.27 → ${fmtChk.n3})`);
check(/ไม่ใช่ข้อมูลทะเบียนประชากรจริง/.test(nums.note), 'บอกว่าจำนวนคนไม่ใช่ข้อมูลทะเบียนจริง');

// บันทึกการรันต้องมีเวอร์ชันและผลสรุป ไม่ใช่แค่อินพุต
const rec = await page.evaluate(() => {
  const M = window.__MOKHWAN__;
  // เรียกตัวสร้างบันทึกผ่านการบันทึกฉากจริงจะดาวน์โหลดไฟล์ จึงอ่านจากที่ export ไว้
  return M.runRecord ? M.runRecord() : null;
});
check(!!rec, 'สร้างบันทึกการรันได้');
check(!!rec && /^v\d{4}-\d{2}-\d{2}/.test(rec.appVer) && /^\d+\.\d+\.\d+$/.test(rec.engineVer),
      `ประทับเวอร์ชันแอปและเอนจิน (${rec && rec.appVer} · engine ${rec && rec.engineVer})`);
check(!!rec && typeof rec.peakGround === 'number' && Array.isArray(rec.hours) && rec.hours.length > 0,
      `บันทึกผลสรุปที่เห็นบนจอ (พีค ${rec && rec.peakGround} · ${rec && rec.hours.length} ชั่วโมง)`);
check(!!rec && /ต่ำกว่าจริง/.test(rec.note || ''), 'บันทึกพกคำเตือนไปด้วยในไฟล์');

await page.evaluate(() => {
  const M = window.__MOKHWAN__;
  M.S.plots[0].rai = 20; document.getElementById('pop').value = '0';
  document.getElementById('pop').oninput(); M.runSim();
});
await page.waitForFunction(() => !window.__MOKHWAN__.S.computing, null, { timeout: 45_000 });

/* ── ฝุ่นต่อ กก. แยกตามเฟสการเผา ────────────────────────────────────── */

// ปริยายต้องเป็น 1 = พฤติกรรมเดิม ขยับแล้วต้องย้ายมวลไม่ใช่เพิ่มมวล
const efBefore = await page.evaluate(() => ({
  ratio: window.__MOKHWAN__.S.efRatio,
  emit: window.__MOKHWAN__.S.result.totalEmitKg,
  peak: window.__MOKHWAN__.S.result.perHour[0].max,
  qFl: window.__MOKHWAN__.S.result.perHour[0].qFl,
  qSm: window.__MOKHWAN__.S.result.perHour[0].qSm,
  note: document.getElementById('efrationote').textContent,
}));
check(efBefore.ratio === 1, `ค่าปริยายของฝุ่นต่อ กก. เฟสคุกรุ่นเป็น 1 = พฤติกรรมเดิม`);
check(/Oanh/.test(efBefore.note) && /4\.3/.test(efBefore.note),
      'ป้ายอ้างอิงงานวิจัยที่วัดค่าไว้จริง ไม่ใช่ตัวเลขลอยๆ');

const beforeReq = await page.evaluate(() => window.__MOKHWAN__.S.result.reqId);
await page.evaluate(() => {
  const el = document.getElementById('efratio');
  el.value = '4.3'; el.oninput();
});
await page.waitForFunction(a => !window.__MOKHWAN__.S.computing && window.__MOKHWAN__.S.result.reqId > a,
  beforeReq, { timeout: 45_000 });
const efAfter = await page.evaluate(() => ({
  emit: window.__MOKHWAN__.S.result.totalEmitKg,
  peak: window.__MOKHWAN__.S.result.perHour[0].max,
  qFl: window.__MOKHWAN__.S.result.perHour[0].qFl,
  qSm: window.__MOKHWAN__.S.result.perHour[0].qSm,
  txt: document.getElementById('efratiotxt').textContent,
}));
check(Math.abs(efAfter.emit - efBefore.emit) < 1e-6,
      `มวลรวมที่ปล่อยไม่เปลี่ยน (${efBefore.emit.toFixed(1)} → ${efAfter.emit.toFixed(1)} กก.)`);
check(Math.abs((efAfter.qFl + efAfter.qSm) - (efBefore.qFl + efBefore.qSm)) < 1e-6,
      'อัตราปล่อยรวมสองเฟสไม่เปลี่ยน — ย้ายมวล ไม่ใช่เพิ่มมวล');
check(efAfter.qSm > efBefore.qSm && efAfter.qFl < efBefore.qFl,
      `มวลย้ายไปเฟสคุกรุ่น (${efBefore.qSm.toFixed(2)} → ${efAfter.qSm.toFixed(2)} ก./วิ)`);
check(efAfter.peak > efBefore.peak,
      `ค่าที่พื้นสูงขึ้นเพราะควันคุกรุ่นลอยต่ำ (${efBefore.peak.toFixed(1)} → ${efAfter.peak.toFixed(1)} µg/m³)`);
check(efAfter.txt === '4.3×', 'ป้ายแสดงค่าที่ตั้งไว้');

await page.evaluate(() => { const el = document.getElementById('efratio'); el.value = '1'; el.oninput(); });
await page.waitForFunction(() => !window.__MOKHWAN__.S.computing, null, { timeout: 45_000 });

/* ── สะพานเวิร์กเกอร์: ต้องไม่ค้างเงียบ ────────────────────────────── */

// คำขอซ้อนกันต้องได้ผลของ reqId ตัวเอง — ของเดิมเก็บ resolver ไว้ช่องเดียว
// ตัวหลังเขียนทับตัวแรก แล้วคำตอบใบแรกที่กลับมาถูกจับคู่กับ resolver ผิดตัว
const dual = await page.evaluate(async () => {
  const M = window.__MOKHWAN__, w = M.worker;
  if (!w) return null;
  let seen = null;
  const orig = w.postMessage.bind(w);
  w.postMessage = p => { seen = p; orig(p); };   // ขโมย payload จริงมาใช้ซ้ำ
  await M.runSim();
  w.postMessage = orig;
  if (!seen) return { noPayload: true };
  const a = M.engineRun({ ...seen, reqId: 90001 });
  const b = M.engineRun({ ...seen, reqId: 90002 });
  const wait = q => Promise.race([q, new Promise(r => setTimeout(() => r({ reqId: 'ค้าง' }), 20000))]);
  const [ra, rb] = await Promise.all([wait(a), wait(b)]);
  return { a: ra.reqId, b: rb.reqId, left: M.pending.size };
});
check(dual && dual.a === 90001 && dual.b === 90002,
      `คำขอซ้อนกันได้ผลของ reqId ตัวเอง ไม่สลับหรือค้าง (${dual && dual.a}, ${dual && dual.b})`);
check(dual && dual.left === 0, 'ไม่มี resolver ตกค้างหลังคำขอซ้อน');

// เวิร์กเกอร์ตายระหว่างมีคำขอค้าง ของเดิมแค่ตั้ง worker = null แล้ว promise ไม่ settle
// runSim ที่ await อยู่ค้างตลอดกาล S.computing เป็น true โดยไม่มีข้อความบอกผู้ใช้
const wkr = await page.evaluate(() => !!window.__MOKHWAN__.worker);
if (wkr) {
  const killed = await page.evaluate(async () => {
    const M = window.__MOKHWAN__;
    const w = M.worker;
    // กลืนคำตอบของเวิร์กเกอร์ไว้ก่อน เพื่อให้มีคำขอค้างใน pending แน่ๆ
    // ไม่งั้นเวิร์กเกอร์ตอบเร็วจนจับจังหวะไม่ทัน แล้วเทสต์จะผ่านแบบว่างเปล่า
    w.onmessage = () => {};
    const p = M.runSim();                       // ยิงคำขอแล้วอย่ารอ
    for (let i = 0; i < 300 && M.pending.size === 0; i++) await new Promise(r => setTimeout(r, 50));
    const before = M.pending.size;
    w.onerror(new Event('error'));              // จำลองเวิร์กเกอร์ตายด้วยตัวจัดการจริง
    const settled = await Promise.race([p.then(() => 'settled'),
      new Promise(r => setTimeout(() => r('ค้าง'), 15000))]);
    return { before, settled, after: M.pending.size, computing: M.S.computing,
             hasResult: !!M.S.result, note: document.getElementById('netnote').textContent };
  });
  check(killed.before > 0, `มีคำขอค้างใน pending จริงก่อนทดสอบ (${killed.before} รายการ)`);
  check(killed.settled === 'settled', `เวิร์กเกอร์ตายแล้ว promise ยัง settle (${killed.settled})`);
  check(killed.after === 0, 'ไม่มีคำขอค้างเหลือหลังเวิร์กเกอร์ตาย');
  check(killed.computing === false && killed.hasResult, 'ถอยไปคำนวณบนเธรดหลักแล้วได้ผลจริง');
  check(/เวิร์กเกอร์คำนวณหยุดทำงาน/.test(killed.note), 'บอกผู้ใช้ว่าเกิดอะไรขึ้น ไม่เงียบ');
} else {
  check(false, 'ไม่มีเวิร์กเกอร์ให้ทดสอบ');
}

/* ── การโหลดของภายนอก ───────────────────────────────────────────────── */

const mlBefore = await page.evaluate(() =>
  performance.getEntriesByType('resource').filter(x => /maplibre/i.test(x.name)).length);
check(mlBefore === 0, `maplibre ไม่ถูกโหลดจนกว่าจะกด 3D (โหลดแล้ว ${mlBefore} ไฟล์)`);

// เข้าโหมด 3D ต้องพร้อมเร็วและไม่ตันหลัก — ของเดิม poll m3.resize() ทุก 150 มิลลิวินาที
// สูงสุด 40 รอบ ทำให้แท็บค้าง 30-60 วินาที · วัดทั้งเวลาที่ใช้ และว่าเธรดหลักยังตอบสนอง
const t3d = Date.now();
await page.click('#b3d');
let blocked = 0;
const spin = setInterval(async () => {
  const t = Date.now();
  try { await page.evaluate('1'); if (Date.now() - t > 3000) blocked++; } catch { blocked++; }
}, 1000);
try {
  await page.waitForFunction(() => document.getElementById('m3diag').style.display === 'none', null, { timeout: 30_000 });
  check(true, `เข้าโหมด 3D พร้อมใน ${((Date.now() - t3d) / 1000).toFixed(1)} วินาที`);
} catch {
  check(false, `เข้าโหมด 3D ไม่พร้อมใน 30 วินาที — ${await page.textContent('#m3diag')}`);
}
clearInterval(spin);
check(blocked === 0, `เธรดหลักไม่ตันระหว่างเข้า 3D (ครั้งที่ตอบช้าเกิน 3 วินาที: ${blocked})`);

// ลบแปลงทิ้งตอนกำลังดึง DEM ต้องไม่ทิ้งสถานะ "กำลังดึง…" ค้างไว้ตลอดไป
await page.evaluate(() => { window.__MOKHWAN__.S.dem = { loading: true }; window.__MOKHWAN__.S.plots = []; });
await page.evaluate(() => window.__MOKHWAN__.runSim());
await page.waitForFunction(() => !window.__MOKHWAN__.S.computing, null, { timeout: 20_000 });
check(await page.evaluate(() => window.__MOKHWAN__.S.dem === null &&
        !/กำลังดึงข้อมูลความสูง/.test(document.getElementById('demstat').textContent)),
      'ลบแปลงทิ้งแล้วสถานะ DEM ไม่ค้างที่ "กำลังดึง…"');
await page.evaluate(() => { const M = window.__MOKHWAN__;
  M.addPlot({ type: 'point', latlng: M.map.getCenter(), rai: 20 }); });
await page.waitForFunction(() => window.__MOKHWAN__.S.result && !window.__MOKHWAN__.S.computing, null, { timeout: 45_000 });

// โหมดข้อมูลจริง — ต้องปิดตัวคูณเพื่อการมองเห็นทุกตัว แล้วบังคับใช้ข้อมูลที่วัดมาจริง
const tsBefore = await page.evaluate(() => ({
  exag: +document.getElementById('exag').value, pexag: +document.getElementById('pexag').value }));
await page.click('#trueScale');
await page.waitForFunction(() => !window.__MOKHWAN__.S.computing && window.__MOKHWAN__.S.trueScale, null, { timeout: 45_000 });
const ts = await page.evaluate(() => ({
  exag: +document.getElementById('exag').value, pexag: +document.getElementById('pexag').value,
  locked: document.getElementById('exag').disabled && document.getElementById('pexag').disabled,
  model: window.__MOKHWAN__.S.model, useWind: window.__MOKHWAN__.S.useWind,
  wxMode: window.__MOKHWAN__.S.wxMode,
  note: document.getElementById('truenote').textContent,
  height: window.__MOKHWAN__.plumeVolume().features.map(f => f.properties.height) }));
// ชั้น hillshade คือตัวที่ทำให้ "เห็นความชัน" — ภาพดาวเทียมของ Esri แทบไม่มีเงา
// ต่อให้ terrain ทำงานถูก ลาดชันก็อ่านไม่ออกถ้าไม่มีชั้นนี้
const hs = await page.evaluate(() => {
  const m3 = window.__MOKHWAN__.m3;
  const t = m3 && m3.getTerrain && m3.getTerrain();
  return { hillshade: !!(m3 && m3.getLayer('hillshade')),
           terrain: !!t, terrainSrc: t && t.source,
           order: m3 ? m3.getStyle().layers.map(l => l.id) : [] };
});
check(hs.hillshade, 'มีชั้น hillshade ทับภาพดาวเทียม');
check(hs.terrain && hs.terrainSrc === 'dem', 'เปิดภูมิประเทศจาก DEM จริง');
check(hs.order.indexOf('hillshade') > hs.order.indexOf('sat') &&
      hs.order.indexOf('hillshade') < hs.order.indexOf('vol-edge'),
      'ชั้น hillshade อยู่เหนือภาพดาวเทียมแต่ใต้ก้อนควัน');

check(ts.exag === 1 && ts.pexag === 1, `โหมดข้อมูลจริงตั้งสัดส่วนเป็น 1:1 (จาก ${tsBefore.exag}× / ${tsBefore.pexag}×)`);
check(ts.locked, 'ล็อกสไลเดอร์ที่เป็นการยกเพื่อมองเห็นไว้');
check(await page.evaluate(() => document.getElementById('exagRow').style.display === 'none'),
      'ซ่อนแถวสไลเดอร์การยกไปเลย ไม่ให้บังวิวภูเขา');
check(ts.model === 'puff' && ts.useWind === true && ts.wxMode === 'auto',
      'บังคับใช้ DEM จริง สนามลมจริง และพยากรณ์จริง');
check(/วัดมาจริง/.test(ts.note) && /คำนวณจากแบบจำลอง/.test(ts.note),
      'ป้ายแยกให้ชัดว่าเลขไหนวัดมา เลขไหนมาจากแบบจำลอง');
const lidTS = await page.evaluate(() => Math.max(window.__MOKHWAN__.S.result.perHour[window.__MOKHWAN__.S.hourIndex].mix, 60));
check(ts.height.every(h => h <= lidTS * 1.05 + 5),
      `ที่ 1:1 ความสูงควันไม่เกินชั้นผสมจริง (สูงสุด ${Math.max(...ts.height)} ม. ชั้นผสม ${Math.round(lidTS)} ม.)`);
// ปิดสนามลมจริงต้องปลดโหมดตาม ไม่งั้นป้าย "ข้อมูลจริง" จะโกหก
await page.click('#useWind');
await page.waitForFunction(() => !window.__MOKHWAN__.S.computing, null, { timeout: 45_000 });
check(await page.evaluate(() => !window.__MOKHWAN__.S.trueScale && !document.getElementById('exag').disabled),
      'ปิดสนามลมจริงแล้วปลดโหมดข้อมูลจริงตาม');
await page.click('#useWind');
await page.waitForFunction(() => !window.__MOKHWAN__.S.computing, null, { timeout: 45_000 });

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
