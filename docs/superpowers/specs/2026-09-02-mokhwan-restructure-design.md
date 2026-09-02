# Mokhwan — รื้อโครงจาก HTML ไฟล์เดียว เป็นเอนจิน library + แอป demo

| | |
|---|---|
| วันที่ | 2026-09-02 |
| สถานะ | รออ่านทวน แล้วต่อด้วยแผนลงมือ |
| repo | https://github.com/JRChanakarn/mokhwan (private) |
| branch | `restructure/mokhwan-foundation` |
| ฐานตั้งต้น | `smoke-plume-studio-lasted.html` @ commit `f59e983` |
| งานที่รออยู่ปลายทาง | `HANDOFF-terrain-mode.md` — โหมดตามภูมิประเทศ 4 ข้อ |

---

## 1. ทำไปทำไม

ของเดิมเป็น `.html` ไฟล์เดียว ไม่มี build step ทำงานได้จริงในโหมดพื้นราบ และตัวเลขตรงกับ
ค่าอ้างอิงที่ตรวจแล้ว สิ่งที่เปลี่ยนคือ**ปลายทาง** ซึ่งเจ้าของงานยืนยันว่า

1. **เอนจินเป็น library** — คนอื่น `npm i` ไปคำนวณในแอปของเขาเองได้ ทั้งในเบราว์เซอร์และบน node
2. **แอปเป็น demo ที่ใช้งานได้จริง** และ **ฝัง (embed)** ในเว็บอื่นได้
3. **open source** ให้คนอื่นอ่าน แก้ ต่อยอด
4. เปิด public เมื่อผ่านเกณฑ์ใน `HANDOFF` แล้ว — จนถึงตอนนั้นเก็บ private

สามข้อแรกเปลี่ยน "ความอ่านง่ายของโค้ด" จากของแถมให้กลายเป็น requirement และทำให้
**สัญญาของเอนจินต้องมั่นคง** เพราะจะมีคนเรียกมันจากข้างนอก การรื้อโครงตอนนี้จึงไม่ใช่
การจัดบ้านเพื่อความสวย แต่เป็นการสร้างของที่ข้อกำหนดใหม่ต้องการ

**ทำตอนนี้ ไม่ใช่ทีหลัง** เพราะงานคงเหลือ 4 ข้อในโหมดภูมิประเทศเป็นงานฝั่งแอปเกือบทั้งหมด
(ดึง DEM, hillshade, เส้นชั้นความสูง, UI, progress) ถ้าทำในไฟล์เดียวก่อนแล้วรื้อทีหลัง
คือการรื้อของที่ใหญ่ขึ้นอีก ~900 บรรทัด

---

## 2. สภาพตั้งต้น — วัดจริง ไม่ประมาณ

| | |
|---|---|
| `smoke-plume-studio-lasted.html` | 2,435 บรรทัด · 124 KB |
| บล็อกเอนจิน (บรรทัด 410–860) | 450 บรรทัด · 9 ฟังก์ชัน |
| บล็อกแอป (บรรทัด 865–2435) | 1,570 บรรทัด · 24 section |
| ตัวแปร/ฟังก์ชันระดับบนสุดที่แชร์ scope เดียวกัน | **115** |
| การอ้าง `S.` (state ก้อนเดียว mutable) | **201** จุด |
| DOM id ที่เรียกผ่าน `$('…')` | **98** |
| การอ้าง Leaflet (`map.` 32 + `L.` 30) | 62 |
| deps | Leaflet 1.9.4 · MapLibre GL 4.7.1 · d3 7.9.0 — cdnjs ทั้งหมด |
| API ภายนอก | Open-Meteo ×2 · RainViewer · NASA GIBS · Overpass ×4 mirror · Nominatim · AWS terrarium · ArcGIS/OSM basemap |
| เทสต์ | ไม่มี |
| git | ไม่มี (เก็บเวอร์ชันด้วยการตั้งชื่อไฟล์ `-2` `-3` `-lasted`) |

### รอยที่ดีอยู่แล้ว อย่าทำหาย

บล็อกเอนจิน**บริสุทธิ์ 100%** — `document`, `window`, `L.`, `d3.`, `maplibre`, `fetch`,
`localStorage`, `navigator` เป็น **0 ครั้งทั้งหมด** คุยกับโลกภายนอกผ่านรอยต่อเดียว

```js
scope.__ENGINE__ = { run, runPuff, windField, sigmas, plumeRise };   // บรรทัด 858
```

การแยกเอนจินออกเป็นแพ็กเกจของตัวเองจึงแทบไม่มีต้นทุน รอยตัดถูกวางไว้ให้แล้ว

### รอยที่เป็นปัญหา

**ก. เอนจินถูกโหลดด้วย `eval` จาก DOM**

```js
const ENGINE_SRC = $('engine').textContent;               // อ่านโค้ดออกมาเป็น string
worker = new Worker(URL.createObjectURL(new Blob([ENGINE_SRC + glue])));
if(!worker){ (0,eval)(ENGINE_SRC); }                      // fallback
```

ผลข้างเคียง: จะเทสต์เอนจินต้อง regex ดึงบล็อกออกจาก HTML มาเขียนเป็น `eng.js` ก่อน
(วิธีที่ `HANDOFF` เขียนไว้จริง) — เป็น workaround ของการเป็นไฟล์เดียว ไม่ใช่ของที่ควรมี

**ข. 115 ชื่อใน scope เดียว ไม่มีขอบเขต**

การแตกเป็น ES module ทำให้ทุกการอ้างข้าม section กลายเป็น import/export ที่ต้องระบุชัด
ถ้าแตกแบบตรงๆ ตาม section เดิมจะได้ import วนกันทันที

**ค. มีวงจร state → render → compute → render**

```
addPlot()  →  redrawPlots()  (map2d)
           →  syncEditor()   (ui)
           →  schedule()  →  runSim()  →  engineRun()  →  refresh()  →  drawOverlay()
                                                                     →  renderPanel()
```

state mutator เรียก render โดยตรง ซึ่งขัดกับกฎ "import ไหลลงล่างเท่านั้น" ที่จะตั้ง

---

## 3. เป้าหมาย

- **G1** เอนจินเป็นแพ็กเกจ TypeScript แยก มีเทสต์ ไม่พึ่ง DOM รันได้ทั้งบน node และเบราว์เซอร์
- **G2** แอปแตกเป็นโมดูลตามชั้น import ไหลทางเดียว ไม่มี cycle
- **G3** มีเกราะเทสต์ที่ล็อกตัวเลขฟิสิกส์ **ก่อน** เริ่มรื้อ
- **G4** เลิก `eval` และเลิก regex-extraction ในการเทสต์
- **G5** embed ได้จริง — รับค่าผ่าน URL param + ฝังด้วย iframe
- **G6** พร้อมเปิด public — license, README, เครดิตแหล่งข้อมูลครบตามเงื่อนไขเจ้าของข้อมูล

## 4. ไม่ใช่เป้าหมาย (YAGNI — ตัดออกโดยตั้งใจ)

- **N1 ไม่เปลี่ยน UI เป็น framework** — vanilla JS 1,570 บรรทัดที่ใช้งานได้อยู่ ไม่มีเหตุผล
  ต้องเขียนใหม่ ความเสี่ยงสูงและไม่ตอบข้อกำหนดใดข้อหนึ่ง
- **N2 ไม่รวม Leaflet + MapLibre เป็นตัวเดียว** — ซ้ำซ้อนจริง (MapLibre ทำ 2D ได้)
  แต่คือการเขียนชั้น 2D ใหม่ 62 จุด จดไว้ใน BACKLOG
- **N3 ไม่ทำ i18n** — UI ไทยล้วน string ทั้งหมดจะไปกองที่ `core/constants.js` และตัวโมดูล
  ทำทีหลังได้ถ้ามีคนขอ
- **N4 ไม่แก้ฟิสิกส์แม้แต่ค่าเดียวในเฟสรื้อ** — การแก้บั๊ก `runPuff` เป็นงาน**หลัง**รื้อเสร็จ
  ห้ามปนกัน ถ้าปนแล้วตัวเลขเพี้ยน จะแยกไม่ออกว่าเพราะย้ายหรือเพราะแก้
- **N5 ไม่มี backend ไม่มี database** — static ทั้งหมด เรียก public API จากเบราว์เซอร์เท่านั้น

---

## 5. สถาปัตยกรรม

### กฎเดียวที่ต้องรักษา

```
engine  ←  core  ←  state  ←  services  ←  map2d / map3d  ←  ui  ←  main
```

**import ไหลลงล่างเท่านั้น** ชั้นล่างไม่รู้จักชั้นบนเลย ตัวบังคับกฎคือ ESLint
`import/no-cycle` + `no-restricted-imports` ต่อชั้น ไม่ใช่ความตั้งใจของคนเขียน

### โครงไฟล์

```
mokhwan/
  packages/engine/            ← npm: mokhwan-engine
    src/
      types.ts                สัญญาทั้งหมด (ดูข้อ 6)
      briggs.ts               sigmas, plumeRise
      gaussian.ts             prep, concAt, run, boxBlur
      wind.ts                 windField  (สนามลมวินิจฉัยจาก DEM)
      puff.ts                 runPuff, makeSampler
      index.ts                public API
      worker.ts               onmessage glue
    test/
      golden.test.ts          ★ เกราะ — ตัวเลขฟิสิกส์ห้ามขยับ
      puff-vs-gauss.test.ts   ★ ข้อ 1 ของ HANDOFF
      terrain.test.ts         ★ ภูมิประเทศสังเคราะห์
    package.json  tsconfig.json  README.md

  app/                        ← Mokhwan Studio (demo + embed)
    index.html
    src/
      core/
        constants.js          RAI FUELS STAB BANDS BLO REC_ICON REC_TH DIRS
        geo.js                M_LAT mLon toXY toLL fmt compass polyArea inPoly
                              plotCentroid plotArea
        dom.js                $
        bus.js                ★ใหม่ on/emit ~15 บรรทัด — ตัวตัดวงจร
      state/
        index.js              S + mutator: setMode selectPlot addPlot currentPlot
                              bindPlotNum setWxMode syncView setTab stim
        derive.js             curBg currentGrid recValue computeStats viewLabel
                              (อ่าน S คืนค่า ไม่ mutate ไม่ render)
        scenario.js           saveScenario loadScenario
        url.js                ★ใหม่ อ่าน/เขียน URL param สำหรับ embed (G5)
      services/
        net.js                OFFLINE netFail — ตัวกลาง fetch + กฎ fail-safe
        compute.js            engineRun (worker + fallback main-thread)
        payload.js            fireCentroid buildFires buildHours hourWeights pasquill
        run.js                schedule runSim reqSeq
        weather.js            fetchWeather  (Open-Meteo forecast + air-quality)
        osm.js                fetchOsm  (Overpass 4 mirror + Nominatim)
        rainviewer.js         WL rvData wlSay ensureRV rvFrame rvUrl toggleRV
        gibs.js               GIBS gibsUrl toggleGibs
        dem.js                ★ใหม่ terrarium + Open-Meteo elevation fallback + cache
      map2d/
        map.js                map (Leaflet instance)
        basemap.js            BASEMAPS baseIdx setBase nextBase showTileWarn
        plots.js              gPlots gDraft redrawPlots
        receptors.js          gRec recColor redrawRecs
        overlay.js            rasterL clearOverlay bandOf drawOverlay
        windflow.js           fetchWindGrid sampleWind startWind stopWind
        terrain.js            ★ใหม่ gCont hillshade + d3.contours
      map3d/
        index.js              m3 DEM SATURL sig mixHex plumeVolume plotsGeo recsGeo
                              skyFor init3D diag update3D set3D   (lazy import)
      ui/
        render.js             refresh — จุดวาดใหม่จุดเดียว ตัวรับจาก bus
        panel.js              renderPanel renderSummary renderRecs renderMet
                              renderPlotList setWxStatus
        editor.js             syncEditor syncAllInputs
        timeline.js           playTimer renderTimeline highlightHour gotoHour setPlaying
        export.js             download exportCsv exportGeo
        wiring.js             currentHourKey syncWeather + event listener ทั้งหมด
      main.js                 boot: subscribe bus → เรียก wiring → เปิด debug handle
    vite.config.js  package.json
  docs/superpowers/specs/     spec ทั้งหมด
  HANDOFF-terrain-mode.md     งานคงเหลือ 4 ข้อ (ยังใช้อยู่)
  LICENSE  README.md  BACKLOG.md
```

★ = ของใหม่ที่งานโหมดภูมิประเทศต้องใช้ ที่เหลือคือ**การย้ายเฉยๆ**

---

## 6. สัญญาของเอนจิน — public API

นี่คือส่วนที่คนอื่นจะเรียก อ่านจากโค้ดจริงทั้งขาเข้าและขาออก ไม่ได้คิดขึ้นเอง

```ts
export type Stability = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** แปลงที่เผาหนึ่งแปลง พิกัดเป็นเมตรเทียบ origin */
export interface Fire {
  pts:    [number, number][];  // จุดย่อยกระจายในแปลง
  side:   number;              // √พื้นที่ (m) ใช้เป็น σy ตั้งต้น
  fuelKg: number;              // เชื้อเพลิงที่ไหม้จริง = ไร่ × load × 1000 × cc
  totalG: number;              // PM2.5 ที่ปล่อยทั้งหมด (g) = fuelKg × ef
  smold:  number;              // สัดส่วนเฟสคุกรุ่นตั้งต้น 0..1 = 0.18 + 0.62×ความชื้น
  rai:    number;
}

export interface HourWx {
  t:      string;      // คีย์ชั่วโมง เช่น '2026-09-02T08:00'
  dt:     number;      // ความยาวช่วง (วินาที)
  ws:     number;      // ความเร็วลม (m/s)
  wdir:   number;      // องศา — ทิศที่ลม "พัดมาจาก"
  stab:   Stability;
  mix:    number;      // ความสูงชั้นผสม (m)
  precip: number;      // ฝน (mm/h)
  temp:   number | null;
  rh:     number | null;
}

/** กริดสี่เหลี่ยมจัตุรัส N×N ครึ่งความกว้าง R เมตร ศูนย์กลางเลื่อนไปทางท้ายลม (cx,cy) */
export interface GridSpec { N: number; R: number; cx: number; cy: number }

export interface RunParams {
  model?:    'gauss' | 'puff';    // ปริยาย 'gauss'
  fires:     Fire[];
  hours:     HourWx[];
  weights:   number[];            // สัดส่วนการปล่อยรายชั่วโมง รวม = 1
  progress:  number[];            // ความคืบหน้าการเผาสะสม 0..1
  grid:      GridSpec;
  receptors: [number, number][];  // จุดรับผลกระทบ เมตรเทียบ origin
  bg:        number;              // PM2.5 พื้นหลัง (µg/m³)
  avg:       number;              // เวลาเฉลี่ย (นาที) ใช้ปรับ σy
  depo:      boolean;             // เปิดการตกสะสมแห้ง + ชะด้วยฝน
  reqId:     number;              // ตัวกันผลค้าง ฝั่งเรียกเช็ค res.reqId เอง
  elev?:     Float32Array | null;        // DEM N×N เมตร เรียงตรงกับกริด — โหมด puff เท่านั้น
}

export interface PerHour {
  t: string; ws: number; wdir: number; stab: Stability; mix: number;
  precip: number; temp: number | null; rh: number | null;
  max: number;        // ความเข้มข้นสูงสุดระดับพื้นในชั่วโมงนี้ (µg/m³)
  maxDist: number;    // ระยะจาก origin ที่เกิดค่าสูงสุด (m)
  Hfl: number; Hsm: number;   // ความสูงพลูมประสิทธิผล เฟสเปลวไฟ / คุกรุ่น
  qFl: number; qSm: number;   // อัตราการปล่อยแต่ละเฟส
  uFl: number; uSm: number;   // ความเร็วลมที่ความสูงพลูมแต่ละเฟส
  sy0: number; tf: number;
  capped: boolean;    // พลูมชนเพดานชั้นผสม
  share: number;      // = weights[h]
  Fr?: number;        // Froude number — โหมด puff เท่านั้น
  relief?: number;    // ความต่างระดับในโดเมน (m) — โหมด puff เท่านั้น
  terrain?: boolean;  // true = คำนวณบน DEM จริง — โหมด puff เท่านั้น
}

export interface RunResult {
  grids:      Float32Array[];  // ความเข้มข้นระดับพื้นรายชั่วโมง ยังไม่รวม bg
  maxGrid:    Float32Array;    // ค่าสูงสุดตลอดช่วง
  doseGrid:   Float32Array;    // หาร 24 มาแล้ว = ค่าเฉลี่ย 24 ชม.
  N: number; cell: number; cx: number; cy: number; R: number;
  meanUx: number; meanUy: number;   // เวกเตอร์หน่วยทิศลมเฉลี่ย
  perHour:    PerHour[];
  recPerHour: number[][];      // [ชั่วโมง][จุดรับ]
  recMax:     number[];
  recDose:    number[];
  totalEmitKg: number;
  totalFuelT:  number;
  reqId:       number;
  model?:      'puff';   // ใส่เฉพาะโหมด puff — ฝั่ง gaussian ไม่ใส่
}

/** สนามลมวินิจฉัยที่ถูกภูมิประเทศเบนแล้ว — array ทุกตัวขนาด N×N */
export interface WindField {
  u:  Float32Array;   v:  Float32Array;   // องค์ประกอบลมที่ระดับพลูม (m/s)
  ud: Float32Array;   vd: Float32Array;   // องค์ประกอบลมไหลลงลาด (m/s)
  relief: number;     // ความต่างระดับในโดเมน (m) — Z ว่างคืน 0
  Fr:     number;     // Froude number — Z ว่างคืน 99
  block:  number;     // สัดส่วนการถูกกั้นด้วยภูมิประเทศ — Z ว่างคืน 0
}

export function run(p: RunParams): RunResult;       // dispatch ตาม p.model
export function runPuff(p: RunParams): RunResult;

/** Z เป็น null ได้ = พื้นราบ คืนสนามลมสม่ำเสมอ */
export function windField(
  Z: Float32Array | null, N: number, cell: number, H: HourWx,
): WindField;

/** คืน tuple [σy, σz] เมตร — ไม่ใช่ object ระวังตอนเขียน type */
export function sigmas(x: number, st: Stability): [number, number];

/** Briggs buoyant plume rise (m) · QH = ฟลักซ์ความร้อน (W) · u = ลมที่ปากปล่อง */
export function plumeRise(QH: number, u: number, st: Stability): number;
```

**ข้อตกลงเรื่องกริดที่ห้ามลืม** — กริดเป็นสี่เหลี่ยมจัตุรัส แถว `j=0` คือ**ด้านเหนือ**
ดัชนีคือ `j*N + i` และ `cell = 2R/N` ทั้งสองโหมดต้องคืนรูปร่างเดียวกันเป๊ะ

---

## 7. การตัดวงจร state → render

**การเปลี่ยนพฤติกรรมมีจุดเดียวในงานรื้อทั้งหมด** คือ mutator เลิกเรียก render เอง

```js
// core/bus.js  — ทั้งไฟล์
const subs = new Map();

export function on(key, fn) {
  if (!subs.has(key)) subs.set(key, []);
  subs.get(key).push(fn);
}

export function emit(key, payload) {
  for (const fn of subs.get(key) ?? []) fn(payload);
}
```

```js
// เดิม — state เรียกขึ้นไปหา render
function addPlot(p){ S.plots.push(p); redrawPlots(); syncEditor(); schedule(); }

// ใหม่ — state แค่ประกาศว่ามีอะไรเปลี่ยน
function addPlot(p){ S.plots.push(p); emit('plots'); }
```

```js
// main.js — ชั้นบนสุดเท่านั้นที่ต่อสายได้
on('plots',  () => { redrawPlots(); syncEditor(); schedule(); });
on('result', () => { renderTimeline(); refresh(); });
on('wx',     () => { syncWeather(); schedule(); });
```

**คีย์ทั้งหมดที่จะมี** — `plots`, `receptors`, `wx`, `result`, `view`, `params`, `sel`
ลำดับการเรียกใน subscriber ต้องเหมือนลำดับเดิมทุกตัว ตรวจด้วย smoke test

**ทำไมไม่ใช้ framework** — สิ่งที่ขาดคือการตัดวงจร ไม่ใช่ระบบ reactive 15 บรรทัดพอ
เพิ่ม dependency ไม่ได้แก้ปัญหาที่มีอยู่จริง (N1)

---

## 8. Worker — เลิก eval

```js
// services/compute.js
// รูปแบบการ import worker ยังต้องยืนยันตอนก้าว 2 — ใน workspace ตัวที่ชัวร์ที่สุดคือ
// ชี้ไปที่ซอร์สตรงๆ (Vite transform ให้) ส่วน '<pkg>/worker?worker' ข้ามขอบแพ็กเกจ
// ยังไม่ได้ทดสอบ ห้ามถือว่าใช้ได้จนพิสูจน์แล้ว
import EngineWorker from '../../../packages/engine/src/worker.ts?worker';
import { run } from 'mokhwan-engine';          // ทางถอยบน main thread

let worker = null, pending = null;
try { worker = new EngineWorker(); } catch { worker = null; }
if (worker) worker.onerror = () => { worker = null; };

export function engineRun(payload) {
  if (!worker) return Promise.resolve(run(payload));   // ตรรกะเดิม ไม่มี eval
  return new Promise(res => { pending = res; worker.postMessage(payload); });
}
```

ได้อะไร — `eval` หาย · `$('engine').textContent` หาย · regex-extraction ในการเทสต์หาย ·
ทางถอยบน main thread **ยังอยู่ครบเหมือนเดิม** · เอนจินกลายเป็น import ปกติที่ tsc ตรวจได้

---

## 9. กฎ fail-safe ของบริการภายนอก

กฎเดิมจาก `HANDOFF` ที่ต้องรักษา: *ทุกการเรียก API ภายนอกต้อง fail-safe ปิดตัวเองแล้วบอก
เหตุผลเป็นภาษาไทย ห้ามพังทั้งแอป*

ทำให้เป็นโครงเดียวใน `services/net.js` แทนที่จะกระจายอยู่ 8 ที่

```js
export async function tryFetch(url, { label, timeout = 8000, mirrors = [] }) {
  // ไล่ mirror ตามลำดับ · AbortController ตาม timeout · คืน null เมื่อพังทุกตัว
  // ไม่ throw ขึ้นไปข้างบนเด็ดขาด · ผู้เรียกเช็ค null แล้วปิดฟีเจอร์ตัวเอง
}
```

ทุก service ต้องมี: สถานะของตัวเอง (`ok | loading | failed`) · ข้อความไทยเมื่อพัง ·
และปิดเฉพาะฟีเจอร์ตัวเอง แอปที่เหลือต้องใช้งานต่อได้ **มี smoke test ต่อ service**
ที่บล็อก network แล้วยืนยันว่าแอปยังเปิดและรันแบบกำหนดเองได้

---

## 10. Embed (G5)

ตอนนี้แอปรับ input ทางเดียวคือคลิกบนแผนที่ ถ้าใครฝัง iframe จะได้หน้าเปล่า

```
https://<host>/?lat=18.7883&lon=98.9853&rai=20&fuel=rice&date=2026-09-02
  &time=06:00&dur=1&ws=1.4&wdir=35&stab=F&mix=180&model=puff&panel=0
```

- `state/url.js` อ่าน param ตอน boot → เขียนลง `S` → รันเลยโดยไม่ต้องคลิก
- `panel=0` ซ่อนแผงควบคุม เหลือแต่แผนที่ (โหมดฝังแบบอ่านอย่างเดียว)
- ทุก param เป็น optional ไม่มีก็ได้พฤติกรรมเดิมเป๊ะ
- เขียนสวนกลับ URL ตอนผู้ใช้เปลี่ยนค่าด้วย `replaceState` → ได้ลิงก์แชร์ฟรี

---

## 11. เทสต์

| ชั้น | เครื่องมือ | คุมอะไร |
|---|---|---|
| golden | Vitest (node) | ตัวเลขฟิสิกส์ห้ามขยับ — **เกราะของการรื้อ** |
| unit | Vitest (node) | puff เทียบ gaussian, สนามลม, sigma, plume rise |
| terrain | Vitest (node) | ภูมิประเทศสังเคราะห์ — แอ่ง + สันเขา |
| smoke | playwright-core | แอปเปิดได้ ปักแปลง กดรัน เล่นไทม์ไลน์ · network ล่มไม่พัง |

### golden test — เขียนก่อนแตะโค้ดแม้แต่บรรทัดเดียว

ค่าอ้างอิงจาก `HANDOFF` เผาฟางข้าว 20 ไร่ 1 ชั่วโมง

| สภาพ | พีคระดับพื้น | ระยะที่เกิน 37.5 µg/m³ |
|---|---|---|
| เช้ามืด · stab F · ชั้นผสม 180 ม. | ~126 µg/m³ | ~13 กม. |
| กลางวัน · stab B · ชั้นผสม 1800 ม. | ~490 µg/m³ | ~2 กม. |

รอบแรกรันเอนจินตั้งต้น (สกัดด้วย regex ตามวิธีใน `HANDOFF` — ครั้งเดียวครั้งสุดท้าย)
บันทึกค่าที่ได้จริงเป็น expected แล้วล็อกไว้ พร้อม snapshot ของ `maxGrid` และ `perHour`
ทั้งชุด

**เกณฑ์ว่าการรื้อสำเร็จ = golden test ผ่านโดยไม่แก้ค่า expected แม้แต่ตัวเดียว**
ถ้าต้องแก้ค่า แปลว่าย้ายผิด ไม่ใช่ค่าผิด

### unit test — puff vs gaussian (ข้อ 1 ของ HANDOFF)

บนพื้นราบสมบูรณ์ (`elev` เป็น `null`) ผล `runPuff` ต้องต่างจาก `run` ไม่เกิน **25%**
ที่ระยะ **1, 3, 8 กม.** เทสต์นี้จะ**แดงตั้งแต่วันแรก** เพราะบั๊กที่ยังไม่แก้ —
ตั้งใจให้แดง เป็นตัวชี้ว่าแก้เสร็จเมื่อไหร่ ทำเป็น `test.fails()` ไว้ก่อน

### terrain test — ภูมิประเทศสังเคราะห์

ใช้ชุดใน `HANDOFF` ตรงๆ (แอ่งกลาง + สันเขาขวางทางตะวันตกเฉียงใต้ ลมจาก 45°)
ยืนยันสามอย่าง: กระจุกในแอ่งมากกว่าพื้นราบ · เลี้ยวเลาะสันเขา · ข้ามสันเขาน้อยกว่าพื้นราบ
อย่างมีนัยสำคัญ

---

## 12. ลำดับการย้าย — แอปต้องเปิดใช้ได้ทุก commit

| ก้าว | ทำอะไร | เสร็จเมื่อ |
|---|---|---|
| **0** ✅ | `git init` + commit สภาพตั้งต้น 5 เวอร์ชัน + repo ส่วนตัว (private) | `f59e983` |
| **1** | **golden test ก่อนแตะโค้ด** — สกัดเอนจิน รันใน node ล็อกตัวเลข + snapshot | เทสต์เขียว |
| **2** | ตั้ง monorepo + Vite · เอนจิน → TS แตก 6 ไฟล์ · `?worker` แทน eval · แอปยกมาทั้งก้อนเป็น `app.js` **ไม่แก้ตรรกะ** · เปิด `window.__MOKHWAN__` | golden เขียวเท่าเดิม + แอปเปิดได้ |
| **3** | แตก `app.js` เป็นชั้น ล่างขึ้นบน commit ละชั้น: `core` → `state` → `services` → `map2d` → `map3d` → `ui` → `main` + ต่อ bus | golden เขียวทุก commit · smoke เขียว |
| **4** | ตั้ง ESLint `import/no-cycle` + กฎต่อชั้น · README · LICENSE · เครดิตข้อมูล | lint เขียว |
| **5** | เริ่มงาน terrain 4 ข้อจาก `HANDOFF` | เกณฑ์ 6 ข้อใน `HANDOFF` |

ก้าว 1–4 คืองาน "ไม่เปลี่ยนพฤติกรรม" ทั้งหมด (ยกเว้นข้อ 7 จุดเดียว)
งานที่เปลี่ยนพฤติกรรมจริงเริ่มที่ก้าว 5

**ขอบเขตของ spec ฉบับนี้คือก้าว 1–4 เท่านั้น** ก้าว 5 (งาน terrain 4 ข้อ) เป็นงาน
เปลี่ยนพฤติกรรมที่มีเกณฑ์ของตัวเองอยู่ใน `HANDOFF` แล้ว จะแยก spec + แผนของตัวเอง
หลังก้าว 4 ผ่าน — ห้ามเอามาปนกับงานรื้อ (N4)

### เทสต์ย้ายที่ตอนก้าว 2 — ค่าไม่ย้าย

`golden.test.ts` ที่เขียนในก้าว 1 จะ import จาก `eng.js` ที่สกัดด้วย regex
พอถึงก้าว 2 ให้เปลี่ยน **เฉพาะบรรทัด import** ไปชี้ `packages/engine/src/index.ts`
แล้วลบ `eng.js` กับสคริปต์สกัดทิ้ง

**"ห้ามแก้ค่า expected" หมายถึงตัวเลขที่ล็อกไว้และ snapshot** การเปลี่ยน import path
ไม่นับ แต่ถ้าเปลี่ยน import แล้วค่าไม่ตรง แปลว่าย้ายเอนจินผิด ให้ย้อนกลับไปดูการย้าย
ห้ามแก้ตัวเลขให้ตรงกับผลใหม่เด็ดขาด

### `window.__MOKHWAN__` — จำเป็น ไม่ใช่ของแถม

ES module มี scope ของตัวเอง วิธีเทสต์ UI ที่ `HANDOFF` เขียนไว้จะพังทันที

```js
// วิธีเดิมใน HANDOFF — พึ่งว่า const ระดับบนสุดอยู่ใน global lexical environment
await page.evaluate(() => { S.man = {ws:1.4, wdir:35, stab:'F', mix:200}; addPlot({...}); });
```

จึงต้องเปิด handle ให้ตั้งใจ ใน `main.js`

```js
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug'))
  window.__MOKHWAN__ = { S, addPlot, setWxMode, syncAllInputs, runSim, engineRun, bus };
```

---

## 13. การตัดสินใจที่เคาะแล้ว

| เรื่อง | เคาะว่า | เพราะ |
|---|---|---|
| ชื่อ | **Mokhwan** · repo `mokhwan` · npm `mokhwan-engine` · แอป `Mokhwan Studio` | คำที่คนไทยใช้เรียกวิกฤตนี้ตรงๆ ไม่ผูกกับชื่อเจ้าของ |
| repo | private ที่ `JRChanakarn/mokhwan` | public เมื่อผ่านเกณฑ์ `HANDOFF` |
| ภาษา | เอนจิน **TypeScript** · แอป **JS** (`allowJs`) | เอนจินเป็น public API — type คือเอกสารที่ไม่มีวันเก่า ส่วนแอปไม่ต้องแปลง 1,570 บรรทัดทีเดียว |
| build | **Vite** · เอนจิน lib mode (esm + umd + `.d.ts`) · แอป static | UMD ให้คนที่แปะ `<script>` ใช้ได้ด้วย |
| เทสต์ | **Vitest** + playwright-core | Vitest เข้าคู่ Vite เอนจิน pure จึงรันใน node ได้ ไม่ต้องเปิดเบราว์เซอร์ |
| deps | ลงจาก **npm** + **lazy-load MapLibre** ตอนกด 3D | 3D เป็นโหมด opt-in อยู่แล้ว bundle แรกไม่แบก ~800 KB · ล็อกเวอร์ชัน · offline ได้ |
| license | **MIT** + เครดิต Open-Meteo · OSM · Esri · AWS Terrain · NASA GIBS · RainViewer | เจตนาคือให้เอาไปฝังและต่อยอด MIT ตรงที่สุด |
| ไฟล์เก่า | commit แรกเก็บครบ 5 ตัว · commit ถัดไปลบตัวที่ถูกแทน | git เก็บให้แล้ว ไม่ต้องกองในโฟลเดอร์ |
| `files/` `files.zip` | `.gitignore` — ตรวจ md5 แล้วว่าเหมือน `-lasted` ไบต์ต่อไบต์ | สำเนาซ้ำ ไม่ต้องเก็บสองที่ |
| ที่โฮสต์ | **ยังไม่เคาะ** | ไม่จำเป็นจนถึงก้าว public |

---

## 14. ความเสี่ยง — จะพิสูจน์ ไม่เดา

| # | ความเสี่ยง | จะรู้เมื่อไหร่ | ถ้าเป็นจริงทำอะไร |
|---|---|---|---|
| R1 | **`vite-plugin-singlefile` + worker + maplibre อาจเข้ากันไม่ได้** — คุณสมบัติ "โยนไฟล์เดียวให้ใครก็เปิดได้" ที่มีอยู่เดิมอาจหาย | ก้าว 2 | รายงานแล้วให้เจ้าของงานเลือก: ทิ้งคุณสมบัติไฟล์เดียว หรือให้โหมดไฟล์เดียวรันบน main thread เท่านั้น (ช้ากว่าแต่ทำงานได้) |
| R2 | **แตกชั้นแล้วเจอ cycle ที่ลึกกว่าที่สำรวจ** — สำรวจจาก `addPlot` เป็นตัวอย่าง ยังไม่ได้ไล่ทั้ง 115 ชื่อ | ก้าว 3 | ชั้นที่พันกันให้รวมเป็นชั้นเดียวไปก่อน ห้ามฝืนแตกจนต้อง import ขึ้น |
| R3 | **ลำดับการเรียกใน subscriber เพี้ยนจากเดิม** ทำให้ UI กระพริบหรือคำนวณซ้ำ | ก้าว 3 · smoke test | ไล่เทียบลำดับเดิมจาก git แล้วแก้ให้ตรง |
| R4 | **golden test อ่อนเกินไป** จับการย้ายที่ผิดไม่ได้ | ก้าว 1 | เพิ่ม snapshot `maxGrid` ทั้งกริดและ `perHour` ทุกฟิลด์ ไม่ใช่แค่ค่าพีค |
| R5 | **DEM API ไม่มี CORS หรือโดน rate limit** (งานก้าว 5) | ก้าว 5 | มี fallback สองชั้นตาม `HANDOFF` แล้ว (terrarium → Open-Meteo elevation) |

---

## 15. เจอตอนอ่าน แต่ไม่แก้ในงานนี้ → `BACKLOG.md`

1. **`pendingResolve` เป็นช่องเดียว** — กดรันซ้อนกันจะเขียนทับ resolver ตัวเก่า
   promise แรกไม่ settle ตลอดกาล (ค้างเงียบๆ ไม่ leak หนัก และ `reqId` กันลำดับผลไว้แล้ว
   จึงไม่ใช่บั๊กความถูกต้อง) แก้ด้วย map จาก `reqId` → resolver
2. **Leaflet ซ้ำซ้อนกับ MapLibre** — MapLibre ทำ 2D ได้ ตัด Leaflet ออกได้ 62 จุด (N2)
3. **`(0,eval)` ในฐานเดิม** — หายไปเองที่ก้าว 2 บันทึกไว้ว่าเคยมี
4. **98 DOM id ผูกกับ HTML ตรงๆ** — เปลี่ยนชื่อ id แล้วพังเงียบ ทำ map กลางทีหลังได้
5. **ไม่มี i18n** (N3) — string ไทยกระจายอยู่ในโมดูล
