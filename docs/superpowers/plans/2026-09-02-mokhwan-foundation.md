# Mokhwan Foundation Implementation Plan (ก้าว 1–2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ล็อกพฤติกรรมเอนจินตั้งต้นด้วยเทสต์ แล้วย้ายเอนจินเป็นแพ็กเกจ TypeScript และย้ายแอปขึ้น Vite โดยผลลัพธ์ตัวเลขต้องไม่ขยับแม้แต่นิดเดียว

**Architecture:** เอนจินฟิสิกส์ที่บริสุทธิ์อยู่แล้ว (ไม่แตะ DOM เลย) ถูกดึงออกจาก `<script type="text/plain">` มาเป็นแพ็กเกจ TypeScript 8 ไฟล์ที่ dependency เป็น DAG · แอปยังเป็นก้อนเดียวในก้าวนี้ เปลี่ยนแค่วิธีโหลดเอนจิน (`?worker` แทน `eval`) และวิธีโหลด deps (npm แทน cdnjs) · การแตกแอปเป็นชั้นเป็นงานของแผน B

**Tech Stack:** Node 26 · npm workspaces · Vite · Vitest · TypeScript (เอนจินเท่านั้น) · playwright-core · Leaflet 1.9.4 · MapLibre GL 4.7.1 · d3 7.9.0

**Spec:** `docs/superpowers/specs/2026-09-02-mokhwan-restructure-design.md`

## Global Constraints

- **ห้ามแก้ตรรกะฟิสิกส์แม้แต่ค่าเดียวในแผนนี้** — ทุก task คือการย้าย ไม่ใช่การแก้ (สเปก N4)
- **ห้ามแก้ค่า expected ใน `golden.expected.json`** ถ้าเทสต์แดงคือย้ายผิด ให้ย้อนไปดูการย้าย
- ค่าความคลาดเคลื่อนที่ยอมรับของ golden test = **relative 1e-10**
- ฐานตั้งต้นคือ `smoke-plume-studio-lasted.html` เท่านั้น ห้ามอ้างไฟล์ `-2` `-3` หรือ `files/`
- เวอร์ชัน deps ต้องตรงกับ cdnjs เดิมเป๊ะ: `leaflet@1.9.4` · `maplibre-gl@4.7.1` · `d3@7.9.0`
- แอปต้องเปิดใช้งานได้จริงหลังจบทุก task ที่แตะฝั่งแอป
- ข้อความที่ผู้ใช้เห็นเป็น **ภาษาไทย** ทั้งหมด รวมข้อความตอน API ล่ม
- ทุกการเรียก API ภายนอกต้อง fail-safe ปิดเฉพาะฟีเจอร์ตัวเอง ห้ามพังทั้งแอป
- commit message เป็นไทย แบบ conventional commits ตามที่ repo ใช้อยู่
- ทำงานบน branch `restructure/mokhwan-foundation` ห้าม commit ลง `main`

---

## File Structure

```
mokhwan/                                    (repo root = โฟลเดอร์ปัจจุบัน)
  package.json                  ★ root workspace + scripts
  vitest.config.ts              ★ ตัวเดียวคุมทุกแพ็กเกจ (ไม่ใช้ workspace mode)
  tsconfig.base.json            ★ ตั้งค่า TS ที่แชร์กัน
  tools/
    extract-engine.mjs          ★ สกัดเอนจินจาก HTML → tmp/eng.cjs (ใช้ชั่วคราว ลบใน Task 2)
    record-golden.mjs           ★ รันเอนจินตั้งต้น พิมพ์ค่าอ้างอิงเป็น JSON (รันครั้งเดียว)
  tmp/eng.cjs                   ★ gitignored — ผลจากการสกัด
  packages/engine/
    package.json                ★ name: mokhwan-engine
    tsconfig.json               ★
    src/
      types.ts                  ★ สัญญาทั้งหมด ไม่มี runtime
      briggs.ts                 ★ sigmas, plumeRise            — ไม่พึ่งใคร
      sources.ts                ★ HEAT CONV SMOLD_HEAT STABP, prep  → briggs
      gaussian.ts               ★ VD, concAt, runGauss          → briggs, sources
      wind.ts                   ★ DTHETA DRAIN SHELT, boxBlur, windField, makeSampler — ไม่พึ่งใคร
      puff.ts                   ★ runPuff                       → briggs, sources, wind
      index.ts                  ★ run (dispatch) + re-export public API
      worker.ts                 ★ onmessage glue                → index
    test/
      fixtures.ts               ★ RunParams 3 เคส + summarise()
      golden.expected.json      ★ ค่าอ้างอิงที่ล็อกไว้ ห้ามแก้
      golden.test.ts            ★ เกราะ
      dist.test.ts              ★ ยืนยันว่า build แล้วยัง import ได้
  app/
    package.json                ★
    vite.config.js              ★
    index.html                  ★ ย้ายจาก HTML เดิม (ตัด engine + cdnjs ออก)
    src/
      styles.css                ★ ย้ายจาก <style> เดิม บรรทัด 7–211
      app.js                    ★ ย้ายจาก <script> เดิม บรรทัด 866–2434 ยกมาทั้งก้อน
    test/
      smoke.spec.mjs            ★ playwright-core
  BACKLOG.md                    ★
```

**ที่มาของแต่ละบล็อกใน `smoke-plume-studio-lasted.html`** (ตัวเลขบรรทัดของไฟล์นี้ อ้างได้ตลอดแผน)

| บรรทัด | เนื้อหา | ปลายทาง |
|---|---|---|
| 1–6 | doctype, meta, title, `<link>` cdnjs ×2 | `app/index.html` (ตัด `<link>` ทิ้ง) |
| 7–211 | `<style>` | `app/src/styles.css` |
| 213–407 | markup `#app` | `app/index.html` |
| 409–410 | คอมเมนต์ + `<script id="engine">` เปิด | **ลบ** |
| 411–412 | `(function(scope){ 'use strict';` | **ลบ** (IIFE ไม่ต้องใช้แล้ว) |
| 413–417 | `HEAT CONV SMOLD_HEAT VD STABP` | แยกไปตามผู้ใช้ (ดู Task 2) |
| 419–429 | `sigmas` | `briggs.ts` |
| 430–440 | `plumeRise` | `briggs.ts` |
| 441–479 | `prep` | `sources.ts` |
| 480–518 | `concAt` | `gaussian.ts` |
| 519–588 | `run` | `gaussian.ts` เป็น `runGauss` (ตัดบรรทัด 520 ออก) |
| 590–595 | คอมเมนต์ + `DTHETA DRAIN SHELT` | `wind.ts` |
| 597–615 | `boxBlur` | `wind.ts` |
| 616–678 | `windField` | `wind.ts` |
| 679–690 | `makeSampler` | `wind.ts` |
| 691–857 | `runPuff` | `puff.ts` |
| 858–859 | `scope.__ENGINE__ = {...}` + ปิด IIFE | `index.ts` (เปลี่ยนเป็น `export`) |
| 860 | `</script>` | **ลบ** |
| 862–864 | `<script>` cdnjs ×3 | **ลบ** → เปลี่ยนเป็น `import` ใน `app.js` |
| 865–2435 | `<script>` แอป | `app/src/app.js` |

---

### Task 1: เกราะ — golden test ที่ล็อกพฤติกรรมเอนจินตั้งต้น

เป้าหมาย: มีเทสต์ที่รันได้ก่อนแตะโค้ดจริงแม้แต่บรรทัดเดียว ถ้าการย้ายในภายหลังทำให้ตัวเลขขยับ เทสต์นี้ต้องแดง

**Files:**
- Create: `package.json`
- Create: `vitest.config.ts`
- Create: `tools/extract-engine.mjs`
- Create: `packages/engine/test/fixtures.ts`
- Create: `packages/engine/test/golden.test.ts`
- Create: `packages/engine/test/golden.expected.json` (สร้างจากการรัน ไม่พิมพ์มือ)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: ไม่มี — task แรก
- Produces:
  - `CASES: Record<'dawnF' | 'dayB' | 'multi3h', RunParamsLike>` จาก `test/fixtures.ts`
  - `summarise(res: any, bg: number): GoldenSummary` จาก `test/fixtures.ts`
  - `GoldenSummary` = `{ N, cell, cx, cy, R, meanUx, meanUy, totalEmitKg, totalFuelT, perHour: object[], grids: GridStat[], maxGrid: GridStat, doseGrid: GridStat, recMax: number[], recDose: number[], recPerHour: number[][] }`
  - `GridStat` = `{ sum: number, max: number, over: number, overMaxKm: number }`
  - `tmp/eng.cjs` — เอนจินตั้งต้นในรูป CommonJS ที่ `module.exports` คือ `{run, runPuff, windField, sigmas, plumeRise}`

- [ ] **Step 1: เพิ่ม `tmp/` ลง `.gitignore`**

แก้ `.gitignore` เพิ่มสองบรรทัดนี้ต่อท้ายบล็อก `# deps / build`

```
tmp/
```

- [ ] **Step 2: สร้าง root `package.json`**

```json
{
  "name": "mokhwan",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*", "app"],
  "engines": { "node": ">=20" },
  "scripts": {
    "extract:engine": "node tools/extract-engine.mjs",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "5.7.3",
    "vitest": "3.0.5"
  }
}
```

- [ ] **Step 3: สร้าง `vitest.config.ts`**

ตั้งใจไม่ใช้ workspace mode — คอนฟิกเดียวคุมทุกแพ็กเกจ ง่ายกว่าและพอสำหรับขนาดงานนี้

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,   // เอนจินรันกริด 180×180 หลายชั่วโมง ช้ากว่าเทสต์ทั่วไป
  },
});
```

- [ ] **Step 4: ติดตั้ง deps**

Run: `npm install`
Expected: สร้าง `node_modules/` และ `package-lock.json` สำเร็จ ไม่มี error

- [ ] **Step 5: เขียนสคริปต์สกัดเอนจิน**

สร้าง `tools/extract-engine.mjs` — ตั้ง `globalThis.self = globalThis` ให้เหมือนสภาพใน Web Worker
แล้วผูก `module.exports` เข้ากับสิ่งที่ IIFE ยัดใส่ scope

```js
// สกัดบล็อกเอนจินออกจาก HTML ตั้งต้น มาเป็น CommonJS ที่ require ได้
// ใช้ชั่วคราวใน Task 1 เท่านั้น — Task 2 จะลบสคริปต์นี้ทิ้งเมื่อเอนจินเป็นโมดูลจริงแล้ว
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const SRC = 'smoke-plume-studio-lasted.html';
const OUT = 'tmp/eng.cjs';

const html = readFileSync(SRC, 'utf8');
const m = html.match(/<script id="engine" type="text\/plain">([\s\S]*?)<\/script>/);
if (!m) throw new Error(`หาบล็อก <script id="engine"> ใน ${SRC} ไม่เจอ`);

const body = m[1];
if (!body.includes('scope.__ENGINE__')) throw new Error('บล็อกที่สกัดได้ไม่มี scope.__ENGINE__ — regex อาจจับผิดบล็อก');

mkdirSync('tmp', { recursive: true });
writeFileSync(OUT, [
  '/* สร้างอัตโนมัติจาก ' + SRC + ' — ห้ามแก้ไฟล์นี้ */',
  "globalThis.self = globalThis;",   // เลียนสภาพ Web Worker ให้ IIFE ผูกกับ globalThis
  body,
  'module.exports = globalThis.__ENGINE__;',
  '',
].join('\n'));

const engine = createRequire(import.meta.url)(process.cwd() + '/' + OUT);
console.log(`เขียน ${OUT} · export: ${Object.keys(engine).join(', ')}`);
```

- [ ] **Step 6: รันสคริปต์สกัด**

Run: `npm run extract:engine`
Expected: พิมพ์ `เขียน tmp/eng.cjs · export: run, runPuff, windField, sigmas, plumeRise`

ถ้าพิมพ์ export ไม่ครบ 5 ตัว ให้หยุดและรายงาน — แปลว่าการสกัดผิด

- [ ] **Step 7: เขียน `packages/engine/test/fixtures.ts`**

ค่าทุกตัวมาจากโค้ดจริงในไฟล์ตั้งต้น ไม่ได้คิดขึ้นเอง

- `FUELS.rice = {load: 0.60, ef: 9.5, cc: 0.89}` (บรรทัด 872)
- `addPlot` ตั้ง `moist: 0.35` เป็นค่าปริยาย (บรรทัด 1399 ของไฟล์ตั้งต้น)
- `RAI = 1600` ตร.ม. · `S.bg = 25` · `S.avg = 60` · `S.rangeKm = 10` · `S.res = 180` · `S.depo = true`
- `buildFires` แตกแปลงจุดเป็นตะแกรง 5×5 ระยะห่าง `side/5`
- `hourWeights(n)` ให้ `w[i] = exp(-1.6·(i+0.5)/n)` แล้ว normalize · `p[i] = (i+0.5)/n`

```ts
/**
 * ชุด RunParams สำหรับ golden test
 *
 * ค่าทั้งหมดคัดลอกมาจากพฤติกรรมจริงของแอปตั้งต้น (smoke-plume-studio-lasted.html)
 * ไม่ได้เรียก buildFires / buildHours / hourWeights ของฝั่งแอปมาใช้ เพราะ task นี้
 * ล็อก "เอนจิน" ไม่ใช่ "ตัวสร้าง payload" — ตัวสร้าง payload จะมีเทสต์ของตัวเองในแผน B
 */

export const RAI = 1600;               // ตร.ม. ต่อไร่
export const RICE = { load: 0.60, ef: 9.5, cc: 0.89, moist: 0.35 };

/** สร้างแปลงจุดแบบเดียวกับ buildFires() — บรรทัด 277–305 ของบล็อกแอป (= 1142–1170 ของไฟล์ตั้งต้น) */
function ricePointFire(rai: number) {
  const areaM2 = rai * RAI;
  const side = Math.sqrt(areaM2);
  const n = 5, step = side / n;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      pts.push([(i - 2) * step, (j - 2) * step]);
  const fuelKg = rai * RICE.load * 1000 * RICE.cc;
  return {
    pts, side, fuelKg,
    totalG: fuelKg * RICE.ef,
    smold: 0.18 + 0.62 * RICE.moist,
    rai,
  };
}

/** เหมือน hourWeights() — บรรทัด 244–249 ของบล็อกแอป (= 1109–1114 ของไฟล์ตั้งต้น) */
function hourWeights(n: number) {
  const w: number[] = [], p: number[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / n, v = Math.exp(-1.6 * x);
    w.push(v); p.push(x); s += v;
  }
  return { w: w.map(v => v / s), p };
}

/** เวกเตอร์หน่วยทิศท้ายลม — สูตรเดียวกับ runSim() — บรรทัด 325 ของบล็อกแอป (= 1190 ของไฟล์ตั้งต้น) */
function downwind(hours: { wdir: number }[]) {
  let ux = 0, uy = 0;
  for (const h of hours) {
    const th = (270 - h.wdir) * Math.PI / 180;
    ux += Math.cos(th); uy += Math.sin(th);
  }
  const un = Math.hypot(ux, uy) || 1;
  return { ux: ux / un, uy: uy / un };
}

const RANGE_KM = 10, RES = 180;
export const BG = 25;

function buildCase(
  hours: { t: string; ws: number; wdir: number; stab: string; mix: number; precip: number }[],
  model?: 'gauss' | 'puff',
) {
  const hs = hours.map(h => ({ ...h, dt: 3600, temp: null, rh: null }));
  const { w, p } = hourWeights(hs.length);
  const { ux, uy } = downwind(hs);
  const R = RANGE_KM * 1000;
  // จุดรับผลกระทบวางบนแกนท้ายลมที่ 1, 3, 8 กม. — ระยะเดียวกับเกณฑ์ puff-vs-gauss ใน HANDOFF
  const receptors: [number, number][] =
    [1000, 3000, 8000].map(d => [ux * d, uy * d] as [number, number]);
  return {
    ...(model ? { model } : {}),
    fires: [ricePointFire(20)],
    hours: hs,
    weights: w,
    progress: p,
    grid: { N: RES, R, cx: 0.32 * R * ux, cy: 0.32 * R * uy },
    receptors,
    bg: BG,
    avg: 60,
    depo: true,
    reqId: 1,
  };
}

export const CASES = {
  /** เช้ามืด เสถียรมาก ชั้นผสมต่ำ — เคสอ้างอิงข้อ 1 ใน HANDOFF (คาด ~126 µg/m³, เกิน 37.5 ถึง ~13 กม.) */
  dawnF: buildCase([
    { t: '2026-03-15T06:00', ws: 1.4, wdir: 35, stab: 'F', mix: 180, precip: 0 },
  ]),

  /** กลางวัน ไม่เสถียร ชั้นผสมสูง — เคสอ้างอิงข้อ 2 ใน HANDOFF (คาด ~490 µg/m³, เกิน 37.5 ถึง ~2 กม.) */
  dayB: buildCase([
    { t: '2026-03-15T13:00', ws: 2.0, wdir: 35, stab: 'B', mix: 1800, precip: 0 },
  ]),

  /** สามชั่วโมง เปลี่ยนความเสถียร + มีฝนชั่วโมงสุดท้าย เพื่อออกกำลังการชะด้วยฝนและ doseGrid */
  multi3h: buildCase([
    { t: '2026-03-15T06:00', ws: 1.4, wdir: 35, stab: 'F', mix: 180,  precip: 0 },
    { t: '2026-03-15T07:00', ws: 1.8, wdir: 50, stab: 'E', mix: 400,  precip: 0 },
    { t: '2026-03-15T08:00', ws: 2.4, wdir: 70, stab: 'D', mix: 900,  precip: 1.2 },
  ]),
};

export interface GridStat { sum: number; max: number; over: number; overMaxKm: number }

/**
 * ลายนิ้วมือของผลลัพธ์ — เก็บพอให้จับการเปลี่ยนแปลงได้ทุกแบบ
 * โดยไม่ต้องเก็บ float 32,400 ตัวต่อกริด
 */
export function summarise(res: any, bg: number) {
  const { N, cell, cx, cy, R } = res;
  const stat = (g: Float32Array): GridStat => {
    let sum = 0, max = 0, over = 0, overMaxD = 0;
    for (let j = 0; j < N; j++) {
      const py = cy + R - (j + 0.5) * cell;
      for (let i = 0; i < N; i++) {
        const px = cx - R + (i + 0.5) * cell;
        const v = g[j * N + i];
        sum += v;
        if (v > max) max = v;
        if (v + bg > 37.5) {
          over++;
          const d = Math.hypot(px, py);
          if (d > overMaxD) overMaxD = d;
        }
      }
    }
    return { sum, max, over, overMaxKm: overMaxD / 1000 };
  };
  return {
    N, cell, cx, cy, R,
    meanUx: res.meanUx, meanUy: res.meanUy,
    totalEmitKg: res.totalEmitKg, totalFuelT: res.totalFuelT,
    perHour: res.perHour.map((h: any) => ({ ...h })),
    grids: res.grids.map(stat),
    maxGrid: stat(res.maxGrid),
    doseGrid: stat(res.doseGrid),
    recMax: res.recMax,
    recDose: res.recDose,
    recPerHour: res.recPerHour,
  };
}
```

- [ ] **Step 8: เขียนตัวบันทึกค่าอ้างอิง**

Node รัน `.ts` ตรงๆ ไม่ได้ทุกเวอร์ชัน จึงบันทึกผ่าน Vitest ซึ่งมี esbuild อยู่แล้ว
ไฟล์นี้เป็นของใช้แล้วทิ้ง — Step 10 ลบ

สร้าง `packages/engine/test/_record.test.ts`

```ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { CASES, summarise, BG } from './fixtures';

const require = createRequire(import.meta.url);

it('บันทึกค่าอ้างอิงจากเอนจินตั้งต้น', () => {
  const ENGINE = require('../../../tmp/eng.cjs');
  const out: Record<string, unknown> = {};
  for (const [name, params] of Object.entries(CASES))
    out[name] = summarise(ENGINE.run(structuredClone(params)), BG);
  writeFileSync(
    new URL('./golden.expected.json', import.meta.url),
    JSON.stringify(out, null, 2) + '\n',
  );
});
```

- [ ] **Step 9: บันทึกค่าอ้างอิง**

Run: `npx vitest run packages/engine/test/_record.test.ts`
Expected: PASS และเกิดไฟล์ `packages/engine/test/golden.expected.json`

ตรวจด้วยตาว่าค่าสมเหตุสมผล:

Run: `node -e "const g=require('./packages/engine/test/golden.expected.json'); for(const k of ['dawnF','dayB']) console.log(k, 'พีค', g[k].maxGrid.max.toFixed(1), 'µg/m³ · เกิน 37.5 ถึง', g[k].maxGrid.overMaxKm.toFixed(1), 'กม.')"`

Expected: ค่าอยู่ในย่านของ `HANDOFF` — `dawnF` พีคหลักร้อยต้นๆ และระยะสิบกว่ากิโลเมตร · `dayB` พีคหลายร้อยและระยะไม่กี่กิโลเมตร

**ถ้าค่าหลุดจากย่านนี้มาก ให้หยุดและรายงาน** อย่าปรับ fixtures ให้ตัวเลขสวย — `HANDOFF`
ไม่ได้ระบุ `ws` ของเคสอ้างอิงไว้ ค่าที่ใช้ (1.4 และ 2.0) จึงเป็นการเลือกที่สมเหตุสมผล
แต่ยังไม่ยืนยัน ความต่างที่อธิบายได้ด้วย `ws` เป็นเรื่องปกติ ความต่างระดับสิบเท่าไม่ปกติ

- [ ] **Step 10: ลบสคริปต์บันทึกชั่วคราว**

Run: `rm packages/engine/test/_record.test.ts`

เหตุผล: ค่าอ้างอิงถูกล็อกแล้ว การเปิดทางให้สร้างใหม่ได้ง่ายคือการเปิดทางให้ทำลายเกราะ

- [ ] **Step 11: เขียน golden test ตัวจริง**

สร้าง `packages/engine/test/golden.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { CASES, summarise, BG, type GridStat } from './fixtures';
import expected from './golden.expected.json';

// Task 2 จะเปลี่ยนเฉพาะสองบรรทัดนี้ไปเป็น: import * as ENGINE from '../src/index';
const require = createRequire(import.meta.url);
const ENGINE = require('../../../tmp/eng.cjs');

const REL = 1e-10;

function closeTo(actual: number, want: number, path: string) {
  if (want === 0) {
    expect(Math.abs(actual), `${path}: ได้ ${actual} ต้องการ 0`).toBeLessThan(1e-12);
    return;
  }
  const rel = Math.abs((actual - want) / want);
  expect(rel, `${path}: ได้ ${actual} ต้องการ ${want} (คลาด ${rel})`).toBeLessThan(REL);
}

function compareGridStat(a: GridStat, b: GridStat, path: string) {
  closeTo(a.sum, b.sum, `${path}.sum`);
  closeTo(a.max, b.max, `${path}.max`);
  expect(a.over, `${path}.over`).toBe(b.over);          // จำนวนเซลล์ ต้องเท่ากันเป๊ะ
  closeTo(a.overMaxKm, b.overMaxKm, `${path}.overMaxKm`);
}

describe('golden — พฤติกรรมเอนจินต้องไม่ขยับจากฐานตั้งต้น', () => {
  for (const name of Object.keys(CASES) as (keyof typeof CASES)[]) {
    it(name, () => {
      const want = (expected as any)[name];
      const got = summarise(ENGINE.run(structuredClone(CASES[name])), BG);

      // รูปร่างกริด
      expect(got.N).toBe(want.N);
      for (const k of ['cell', 'cx', 'cy', 'R', 'meanUx', 'meanUy'] as const)
        closeTo(got[k], want[k], k);

      // ปริมาณรวม
      closeTo(got.totalEmitKg, want.totalEmitKg, 'totalEmitKg');
      closeTo(got.totalFuelT, want.totalFuelT, 'totalFuelT');

      // รายชั่วโมง — ทุกฟิลด์ที่เป็นตัวเลข
      expect(got.perHour.length).toBe(want.perHour.length);
      got.perHour.forEach((h: any, i: number) => {
        for (const [k, v] of Object.entries(want.perHour[i])) {
          if (typeof v === 'number') closeTo(h[k], v, `perHour[${i}].${k}`);
          else expect(h[k], `perHour[${i}].${k}`).toEqual(v);
        }
      });

      // กริดทุกใบ
      expect(got.grids.length).toBe(want.grids.length);
      got.grids.forEach((g, i) => compareGridStat(g, want.grids[i], `grids[${i}]`));
      compareGridStat(got.maxGrid, want.maxGrid, 'maxGrid');
      compareGridStat(got.doseGrid, want.doseGrid, 'doseGrid');

      // จุดรับผลกระทบ
      got.recMax.forEach((v: number, i: number) => closeTo(v, want.recMax[i], `recMax[${i}]`));
      got.recDose.forEach((v: number, i: number) => closeTo(v, want.recDose[i], `recDose[${i}]`));
      got.recPerHour.forEach((row: number[], h: number) =>
        row.forEach((v, i) => closeTo(v, want.recPerHour[h][i], `recPerHour[${h}][${i}]`)));
    });
  }
});
```

- [ ] **Step 12: รัน golden test — ต้องเขียว**

Run: `npm test`
Expected: PASS 3 เทสต์ (`dawnF`, `dayB`, `multi3h`)

- [ ] **Step 13: พิสูจน์ว่าเกราะทำงานจริง**

เกราะที่ไม่เคยแดงคือเกราะที่เชื่อไม่ได้ ทดลองทำให้แดงหนึ่งครั้ง

Run: `node -e "const f='tmp/eng.cjs',fs=require('fs');let s=fs.readFileSync(f,'utf8');fs.writeFileSync(f,s.replace('var CONV = 0.35','var CONV = 0.36'))" && npm test; npm run extract:engine`

Expected: `npm test` **FAIL** โดยบอกฟิลด์ที่เพี้ยน (เช่น `perHour[0].Hfl`) แล้วคำสั่งท้ายสุด
สกัดไฟล์คืนสภาพเดิม

Run: `npm test`
Expected: PASS กลับมาเขียวทั้ง 3 เทสต์

- [ ] **Step 14: commit**

```bash
git add .gitignore package.json package-lock.json vitest.config.ts tools/extract-engine.mjs packages/engine/test/
git commit -m "$(cat <<'MSG'
test(engine): เกราะ golden ล็อกพฤติกรรมเอนจินตั้งต้นก่อนรื้อ

ล็อกลายนิ้วมือของผลลัพธ์ 3 เคส ก่อนแตะโค้ดจริงแม้แต่บรรทัดเดียว

  dawnF    เช้ามืด stab F ชั้นผสม 180 ม.   เคสอ้างอิงข้อ 1 ใน HANDOFF
  dayB     กลางวัน stab B ชั้นผสม 1800 ม.  เคสอ้างอิงข้อ 2 ใน HANDOFF
  multi3h  สามชั่วโมง เปลี่ยนความเสถียร + ฝน ออกกำลัง doseGrid และการชะด้วยฝน

เก็บ sum/max/over/overMaxKm ของทุกกริด ทุกฟิลด์ใน perHour และทุกจุดรับ
ผลกระทบ ยอมคลาดได้ 1e-10 เชิงสัดส่วน

ทดลองแก้ CONV 0.35 -> 0.36 แล้วเทสต์แดงจริง เกราะใช้งานได้

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: แตกเอนจินเป็นแพ็กเกจ TypeScript

เป้าหมาย: เอนจินกลายเป็นโมดูล TypeScript 8 ไฟล์ที่ dependency เป็น DAG และ golden test เขียวโดยไม่แก้ค่า expected

**Files:**
- Create: `tsconfig.base.json`
- Create: `packages/engine/package.json`
- Create: `packages/engine/tsconfig.json`
- Create: `packages/engine/src/types.ts`
- Create: `packages/engine/src/briggs.ts`
- Create: `packages/engine/src/sources.ts`
- Create: `packages/engine/src/gaussian.ts`
- Create: `packages/engine/src/wind.ts`
- Create: `packages/engine/src/puff.ts`
- Create: `packages/engine/src/index.ts`
- Modify: `packages/engine/test/golden.test.ts` (สองบรรทัด import เท่านั้น)
- Delete: `tools/extract-engine.mjs`

**Interfaces:**
- Consumes: `CASES`, `summarise`, `BG`, `GridStat` จาก `test/fixtures.ts` (Task 1)
- Produces:
  - `packages/engine/src/types.ts` — `Stability`, `Fire`, `HourWx`, `GridSpec`, `RunParams`, `PerHour`, `RunResult`, `WindField`
  - `packages/engine/src/briggs.ts` — `sigmas(x, st): [number, number]`, `plumeRise(QH, u, st): number`
  - `packages/engine/src/sources.ts` — `prep(P, H, hi): Prepared`
  - `packages/engine/src/gaussian.ts` — `concAt(C, px, py): number`, `runGauss(P): RunResult`
  - `packages/engine/src/wind.ts` — `boxBlur`, `windField(Z, N, cell, H): WindField`, `makeSampler`
  - `packages/engine/src/puff.ts` — `runPuff(P): RunResult`
  - `packages/engine/src/index.ts` — `run`, `runPuff`, `windField`, `sigmas`, `plumeRise` + re-export types

**วิธีย้ายที่ใช้ในทุก step ของ task นี้ — ตั้งใจเลือก**

ฟังก์ชันยาว (`prep` 39 บรรทัด · `concAt` 39 · `runGauss` 68 · `windField` 62 · `runPuff` 167)
ระบุด้วย**ช่วงบรรทัดของไฟล์ตั้งต้น + คำสั่ง `sed`** ไม่คัดลอกเนื้อลงในแผน เพราะการคัดลอก
โค้ดฟิสิกส์ 400 บรรทัดด้วยมือคือความเสี่ยงพิมพ์ผิดที่ไม่ได้อะไรกลับมา แหล่งความจริงคือ
`smoke-plume-studio-lasted.html` ที่ commit `f59e983` เก็บไว้ถาวรแล้ว และ golden test
เป็นตัวตัดสินว่าย้ายถูกหรือผิด — ไม่ใช่การเทียบด้วยตา

ฟังก์ชันสั้น (`sigmas`, `plumeRise`) คัดลอกเต็มลงแผนเพราะสั้นพอและตรวจแล้วตรงกับต้นฉบับ

- [ ] **Step 1: ยืนยันกราฟ dependency ก่อนย้าย**

สำรวจไว้แล้วในสเปก บันทึกซ้ำที่นี่เพราะเป็นสิ่งที่ทำให้การแบ่งไฟล์ไม่วน

```
briggs      ไม่พึ่งใคร                        sigmas(489 ใน concAt, 759 ใน runPuff) plumeRise(457 ใน prep)
wind        ไม่พึ่งใคร                        boxBlur(634 ใน windField)
sources     → briggs                          prep เรียก plumeRise · ใช้ HEAT CONV SMOLD_HEAT STABP
gaussian    → briggs, sources                 concAt เรียก sigmas · ใช้ VD · runGauss เรียก prep, concAt
puff        → briggs, sources, wind           runPuff เรียก prep, windField, makeSampler, sigmas
index       → gaussian, puff, wind, briggs    run = dispatch ตาม model
```

**กับดักที่ต้องหลบ:** ในไฟล์เดิม `run` (บรรทัด 519) มีบรรทัด 520 เป็น
`if(P.model === 'puff') return runPuff(P);` ถ้ายก `run` ไปไว้ใน `gaussian.ts` ทั้งก้อน
จะได้ `gaussian → puff → sources` และ `puff → ...` วนกลับไม่ได้ แต่ `gaussian → puff`
กับ `puff → sources ← gaussian` ทำให้ import graph ซับซ้อนเกินจำเป็น
**ทางแก้: ตัดบรรทัด 520 ออกจาก `runGauss` แล้วย้าย dispatch ไป `index.ts`**

- [ ] **Step 2: สร้าง `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true
  }
}
```

`noUncheckedIndexedAccess` ปิดไว้โดยตั้งใจ — เอนจินเข้าถึง array ด้วยดัชนีคำนวณหลายพันจุด
เปิดแล้วจะต้องใส่ `!` ทั่วไฟล์ซึ่งคือ noise ไม่ใช่ความปลอดภัย

- [ ] **Step 3: สร้าง `packages/engine/package.json`**

```json
{
  "name": "mokhwan-engine",
  "version": "0.1.0",
  "description": "เอนจินคำนวณการฟุ้งกระจาย PM2.5 จากการเผาในที่โล่ง — Gaussian plume + Lagrangian puff พร้อมสนามลมจากภูมิประเทศ",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "require": "./dist/index.umd.cjs" },
    "./worker": "./src/worker.ts"
  },
  "files": ["dist", "src"],
  "sideEffects": false,
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

`"./worker"` ชี้ไปที่ซอร์สโดยตั้งใจ — ผู้ใช้ที่ต้องการรันในเบราว์เซอร์จะ import ผ่าน bundler
ของตัวเอง (`?worker` ของ Vite) ซึ่งต้องได้ซอร์สไม่ใช่ไฟล์ที่ bundle แล้ว
`worker.ts` สร้างใน Task 3

- [ ] **Step 4: สร้าง `packages/engine/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 5: เขียน `src/types.ts`**

คัดจากโค้ดจริงทั้งขาเข้าและขาออก **หมายเหตุความไม่สมมาตรที่พบ:** `runPuff` ใส่
`model: 'puff'` ในผลลัพธ์ (บรรทัด 855) แต่ `run` ฝั่ง gaussian ไม่ใส่ จึงเป็น optional

```ts
export type Stability = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** แปลงที่เผาหนึ่งแปลง พิกัดเป็นเมตรเทียบ origin */
export interface Fire {
  pts:    [number, number][];
  side:   number;
  fuelKg: number;
  totalG: number;
  smold:  number;
  rai:    number;
}

export interface HourWx {
  t:      string;
  dt:     number;
  ws:     number;
  wdir:   number;
  stab:   Stability;
  mix:    number;
  precip: number;
  temp:   number | null;
  rh:     number | null;
}

export interface GridSpec { N: number; R: number; cx: number; cy: number }

export interface RunParams {
  model?:    'gauss' | 'puff';
  fires:     Fire[];
  hours:     HourWx[];
  weights:   number[];
  progress:  number[];
  grid:      GridSpec;
  receptors: [number, number][];
  bg:        number;
  avg:       number;
  depo:      boolean;
  reqId:     number;
  elev?:     Float32Array | null;
}

export interface PerHour {
  t: string; ws: number; wdir: number; stab: Stability; mix: number;
  precip: number; temp: number | null; rh: number | null;
  max: number; maxDist: number;
  Hfl: number; Hsm: number;
  qFl: number; qSm: number;
  uFl: number; uSm: number;
  sy0: number; tf: number;
  capped: boolean;
  share: number;
  Fr?: number;
  relief?: number;
}

export interface RunResult {
  grids:      Float32Array[];
  maxGrid:    Float32Array;
  doseGrid:   Float32Array;
  N: number; cell: number; cx: number; cy: number; R: number;
  meanUx: number; meanUy: number;
  perHour:    PerHour[];
  recPerHour: number[][];
  recMax:     number[];
  recDose:    number[];
  totalEmitKg: number;
  totalFuelT:  number;
  reqId:       number;
  /** ใส่เฉพาะโหมด puff — ฝั่ง gaussian ไม่ใส่ ความไม่สมมาตรนี้มีมาแต่เดิม */
  model?:      'puff';
}

export interface WindField {
  u:  Float32Array;
  v:  Float32Array;
  ud: Float32Array;
  vd: Float32Array;
  relief: number;
  Fr:     number;
  block:  number;
}
```

- [ ] **Step 6: ย้าย `briggs.ts`**

Run: `sed -n '419,440p' smoke-plume-studio-lasted.html > /tmp/briggs-body.txt && cat /tmp/briggs-body.txt`

จากนั้นสร้าง `packages/engine/src/briggs.ts` โดยวางเนื้อฟังก์ชันที่ได้ **ไม่แก้สูตร**
เปลี่ยนแค่ `function` → `export function` และเพิ่ม type annotation

```ts
import type { Stability } from './types';

/** Briggs open-country — คืน tuple [σy, σz] เมตร */
export function sigmas(x: number, st: Stability): [number, number] {
  // ↓↓↓ วางเนื้อจากบรรทัด 420–428 ตามเดิมทุกตัวอักษร ↓↓↓
  var f = 1/Math.sqrt(1+1e-4*x);
  switch(st){
    case 'A': return [0.22*x*f, 0.20*x];
    case 'B': return [0.16*x*f, 0.12*x];
    case 'C': return [0.11*x*f, 0.08*x/Math.sqrt(1+2e-4*x)];
    case 'D': return [0.08*x*f, 0.06*x/Math.sqrt(1+1.5e-3*x)];
    case 'E': return [0.06*x*f, 0.03*x/(1+3e-4*x)];
    default : return [0.04*x*f, 0.016*x/(1+3e-4*x)];
  }
}

/** Briggs buoyant plume rise (m) · QH = ฟลักซ์ความร้อน (W) */
export function plumeRise(QH: number, u: number, st: Stability): number {
  var F = 8.83e-6*QH;
  if(F <= 0) return 0;
  if(st === 'E' || st === 'F'){
    var s = 9.81/293*(st === 'E' ? 0.02 : 0.035);
    return 2.6*Math.pow(F/(u*s), 1/3);
  }
  return F < 55 ? 21.4*Math.pow(F,0.75)/u : 38.7*Math.pow(F,0.6)/u;
}
```

**คง `var` ไว้ตามเดิม** ไม่เปลี่ยนเป็น `const/let` ในก้าวนี้ — เป้าหมายคือย้าย ไม่ใช่จัดสวย
การเปลี่ยนคำประกาศเพิ่มโอกาสพลาดโดยไม่ได้อะไรกลับมา จดลง `BACKLOG.md` แทน

- [ ] **Step 7: ย้าย `sources.ts`**

Run: `sed -n '413,417p;441,479p' smoke-plume-studio-lasted.html`

สร้าง `packages/engine/src/sources.ts` — เอาค่าคงที่ 4 ตัวที่ `prep` ใช้มาไว้ที่นี่
(`HEAT`, `CONV`, `SMOLD_HEAT`, `STABP`) ตัด `VD` ออกเพราะเป็นของ `gaussian.ts`

```ts
import type { RunParams, HourWx } from './types';
import { plumeRise } from './briggs';

var HEAT = 18e6;        // J/kg ค่าความร้อนชีวมวลแห้ง
var CONV = 0.35;        // สัดส่วนความร้อนที่ยกตัวเป็นพลูม
var SMOLD_HEAT = 0.06;  // แรงยกตัวที่เหลือของควันช่วงคุกรุ่น
var STABP: Record<string, number> = {A:0.07,B:0.07,C:0.10,D:0.15,E:0.35,F:0.55};

/** ชุดต้นกำเนิดของหนึ่งชั่วโมง — ใช้ทั้งโหมด gaussian และ puff */
export function prep(P: RunParams, H: HourWx, hi: number) {
  // ↓↓↓ วางเนื้อจากบรรทัด 442–478 ตามเดิมทุกตัวอักษร ↓↓↓
}

export type Prepared = ReturnType<typeof prep>;
```

**ตรวจก่อนไปต่อ:** ถ้าเนื้อ `prep` อ้างชื่ออื่นที่ไม่ใช่ `HEAT CONV SMOLD_HEAT STABP plumeRise`
และพารามิเตอร์ของตัวเอง ให้หยุดและรายงาน — แปลว่ากราฟ dependency ที่สำรวจไว้ไม่ครบ

- [ ] **Step 8: ย้าย `gaussian.ts`**

Run: `sed -n '480,588p' smoke-plume-studio-lasted.html`

สร้าง `packages/engine/src/gaussian.ts`

```ts
import type { RunParams, RunResult, PerHour } from './types';
import { sigmas } from './briggs';
import { prep, type Prepared } from './sources';

var VD = 0.004;   // m/s ความเร็วตกสะสมแห้งของ PM2.5

export function concAt(C: Prepared, px: number, py: number): number {
  // ↓↓↓ วางเนื้อจากบรรทัด 481–517 ตามเดิม ↓↓↓
}

/** โหมดพื้นราบ — เดิมชื่อ run() บรรทัด 519 ตัดบรรทัด dispatch (520) ออก */
export function runGauss(P: RunParams): RunResult {
  // ↓↓↓ วางเนื้อจากบรรทัด 521–588 ตามเดิม — ห้ามเอาบรรทัด 520 มาด้วย ↓↓↓
}
```

- [ ] **Step 9: ย้าย `wind.ts`**

Run: `sed -n '593,690p' smoke-plume-studio-lasted.html`

สร้าง `packages/engine/src/wind.ts` — เอา `DTHETA`, `DRAIN`, `SHELT`, `boxBlur`,
`windField`, `makeSampler` มาทั้งชุด ไม่พึ่งโมดูลอื่นเลย

```ts
import type { HourWx, WindField } from './types';

var DTHETA: Record<string, number> = {A:-0.020, B:-0.015, C:-0.008, D:0.0, E:0.020, F:0.035};
var DRAIN:  Record<string, number> = {A:0, B:0, C:0.10, D:0.30, E:0.85, F:1.25};
var SHELT:  Record<string, number> = {A:0.10, B:0.15, C:0.25, D:0.40, E:0.75, F:1.00};

export function boxBlur(src: Float32Array, N: number, r: number): Float32Array {
  // ↓↓↓ บรรทัด 598–614 ↓↓↓
}

/** Z เป็น null ได้ = พื้นราบ คืนสนามลมสม่ำเสมอ */
export function windField(
  Z: Float32Array | null, N: number, cell: number, H: HourWx,
): WindField {
  // ↓↓↓ บรรทัด 617–677 ↓↓↓
}

export function makeSampler(
  G: Float32Array, N: number, cx: number, cy: number, R: number, cell: number,
) {
  // ↓↓↓ บรรทัด 680–689 ↓↓↓
}
```

- [ ] **Step 10: ย้าย `puff.ts`**

Run: `sed -n '691,857p' smoke-plume-studio-lasted.html`

สร้าง `packages/engine/src/puff.ts`

```ts
import type { RunParams, RunResult } from './types';
import { sigmas } from './briggs';
import { prep } from './sources';
import { windField, makeSampler } from './wind';

/** โหมดตามภูมิประเทศ — Lagrangian puff บนสนามลมวินิจฉัยจาก DEM */
export function runPuff(P: RunParams): RunResult {
  // ↓↓↓ วางเนื้อจากบรรทัด 692–857 ตามเดิม ↓↓↓
}
```

**เทสต์นี้ยังจับบั๊กที่รู้อยู่ไม่ได้** — `runPuff` มีบั๊กความเข้มข้นระดับพื้นเป็นศูนย์
ซึ่งเป็นงานของก้าว 5 golden test ไม่ครอบโหมด puff เพราะฐานตั้งต้นก็ให้ผลผิดอยู่แล้ว
การล็อกผลที่ผิดไว้ไม่มีประโยชน์ **ห้ามแก้บั๊กนี้ในแผนนี้** (Global Constraints)

- [ ] **Step 11: เขียน `index.ts`**

```ts
import type { RunParams, RunResult } from './types';
import { runGauss } from './gaussian';
import { runPuff } from './puff';

export * from './types';
export { sigmas, plumeRise } from './briggs';
export { windField, makeSampler, boxBlur } from './wind';
export { runPuff } from './puff';
export { concAt, runGauss } from './gaussian';
export { prep } from './sources';

/**
 * จุดเข้าหลัก — เลือกแบบจำลองตาม P.model
 * ตรรกะเดียวกับบรรทัด 519–520 ของไฟล์ตั้งต้น
 */
export function run(P: RunParams): RunResult {
  if (P.model === 'puff') return runPuff(P);
  return runGauss(P);
}
```

- [ ] **Step 12: typecheck**

Run: `npx tsc --noEmit -p packages/engine`
Expected: ไม่มี error

ถ้ามี error เรื่อง implicit `any` ในเนื้อฟังก์ชันที่ยกมา ให้ใส่ type ที่ตรงกับ
การใช้งานจริง **ห้ามใช้ `as any` เพื่อให้ผ่าน** และห้ามแก้ตรรกะ

- [ ] **Step 13: เปลี่ยน golden test ให้ชี้โมดูลใหม่**

แก้ `packages/engine/test/golden.test.ts` — สองบรรทัดนี้เท่านั้น

ลบ

```ts
const require = createRequire(import.meta.url);
const ENGINE = require('../../../tmp/eng.cjs');
```

และลบ `import { createRequire } from 'node:module';` ด้านบน แล้วใส่แทน

```ts
import * as ENGINE from '../src/index';
```

- [ ] **Step 14: รัน golden — ต้องเขียวโดยไม่แก้ค่า expected**

Run: `npm test`
Expected: PASS 3 เทสต์ ค่าใน `golden.expected.json` ไม่ถูกแก้แม้แต่ตัวเดียว

**ถ้าแดง** ให้อ่านชื่อฟิลด์ในข้อความ error แล้วย้อนไปดูการย้ายของฟังก์ชันที่เกี่ยวข้อง
เช่น `perHour[0].Hfl` เพี้ยน → ดู `prep` · `maxGrid.sum` เพี้ยน → ดู `concAt` หรือ `runGauss`
**ห้ามแก้ `golden.expected.json` เด็ดขาด**

- [ ] **Step 15: ลบสคริปต์สกัดและไฟล์ชั่วคราว**

Run: `rm tools/extract-engine.mjs && rm -rf tmp && rmdir tools 2>/dev/null; true`

และลบ `"extract:engine"` ออกจาก `scripts` ใน root `package.json`
พร้อมลบบรรทัด `tmp/` ออกจาก `.gitignore`

- [ ] **Step 16: ยืนยันว่าเทสต์ยังเขียวหลังลบทุกอย่าง**

Run: `npm test`
Expected: PASS 3 เทสต์ — ยืนยันว่าไม่ได้พึ่ง `tmp/eng.cjs` อีกแล้ว

- [ ] **Step 17: commit**

```bash
git add -A packages/engine tsconfig.base.json package.json .gitignore
git rm -r --cached tools 2>/dev/null; true
git commit -m "$(cat <<'MSG'
refactor(engine): แตกเอนจินเป็นแพ็กเกจ TypeScript 8 ไฟล์

ยกฟิสิกส์ 450 บรรทัดออกจาก <script type="text/plain"> มาเป็นโมดูลจริง
ไม่แก้สูตรหรือค่าคงที่แม้แต่ตัวเดียว golden test เขียวโดยไม่แก้ค่า expected

  types.ts     สัญญาทั้งหมด ไม่มี runtime
  briggs.ts    sigmas plumeRise                      ไม่พึ่งใคร
  wind.ts      boxBlur windField makeSampler         ไม่พึ่งใคร
  sources.ts   prep + HEAT CONV SMOLD_HEAT STABP     -> briggs
  gaussian.ts  concAt runGauss + VD                  -> briggs sources
  puff.ts      runPuff                               -> briggs sources wind
  index.ts     run (dispatch) + public API           -> gaussian puff

แก้ cycle ที่มีอยู่เดิม: run() เคยเรียก runPuff() ซึ่งเรียก prep() กลับมา
ย้าย dispatch ออกไป index.ts แล้วกราฟกลายเป็น DAG

ค่าคงที่แต่ละตัวไปอยู่กับผู้ใช้เพียงรายเดียวของมัน ไม่ต้องมีไฟล์ constants ร่วม
คง var ไว้ตามเดิม การเปลี่ยนเป็น const/let จดไว้ใน BACKLOG

เลิกใช้ tmp/eng.cjs กับสคริปต์สกัด — เอนจินเป็น import ปกติที่ tsc ตรวจได้แล้ว

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: worker glue + build แพ็กเกจเอนจิน

เป้าหมาย: เอนจิน build ออกเป็น esm + umd + `.d.ts` ได้ และมี worker entry ที่ฝั่งแอปเรียกได้

**Files:**
- Create: `packages/engine/src/worker.ts`
- Create: `packages/engine/vite.config.ts`
- Create: `packages/engine/test/dist.test.ts`
- Modify: `packages/engine/package.json` (เพิ่ม script `build`)
- Modify: `.gitignore` (เพิ่ม `dist/` — มีอยู่แล้วจาก commit แรก ตรวจว่าครอบ `packages/*/dist`)

**Interfaces:**
- Consumes: `run` จาก `packages/engine/src/index.ts` (Task 2)
- Produces:
  - `packages/engine/src/worker.ts` — worker ที่รับ `RunParams` ทาง `postMessage` แล้วส่ง `RunResult` กลับ
  - `packages/engine/dist/index.js` (esm) · `dist/index.umd.cjs` (umd, global `MokhwanEngine`) · `dist/index.d.ts`

- [ ] **Step 1: เขียน `src/worker.ts`**

ตรรกะเดียวกับ glue เดิม (บรรทัด 1006 ของไฟล์ตั้งต้น) แต่เป็นโมดูลจริง

```ts
import { run } from './index';
import type { RunParams } from './types';

self.onmessage = (e: MessageEvent<RunParams>) => {
  (self as unknown as Worker).postMessage(run(e.data));
};
```

- [ ] **Step 2: เขียน `packages/engine/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'MokhwanEngine',        // ชื่อ global ของ build แบบ umd
      fileName: (fmt) => (fmt === 'es' ? 'index.js' : 'index.umd.cjs'),
      formats: ['es', 'umd'],
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
```

- [ ] **Step 3: เพิ่ม script `build` ใน `packages/engine/package.json`**

แก้บล็อก `scripts` ให้เป็น

```json
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "vite build && tsc --emitDeclarationOnly --declaration --outDir dist"
  },
```

`vite build` ทำ bundle · `tsc --emitDeclarationOnly` ทำ `.d.ts` — แยกกันเพราะ Vite lib mode
ไม่ออก declaration ให้เอง

- [ ] **Step 4: ติดตั้ง Vite ที่ root**

Run: `npm install -D vite@6.0.7`
Expected: ติดตั้งสำเร็จ

ลงที่ root ไม่ใช่ `-w mokhwan-engine` เพราะ Vitest 3 ที่ root ก็ใช้ Vite อยู่แล้ว
แยกลงในแพ็กเกจจะได้ Vite สองเวอร์ชันในต้นไม้เดียว

- [ ] **Step 5: build**

Run: `npm run build -w mokhwan-engine`
Expected: เกิด `packages/engine/dist/index.js`, `dist/index.umd.cjs`, `dist/index.d.ts`

Run: `ls -la packages/engine/dist`
Expected: เห็นไฟล์ทั้ง 3 ตัว พร้อม `.map`

- [ ] **Step 6: เขียนเทสต์ที่ยืนยันว่า build แล้วใช้ได้จริง**

สร้าง `packages/engine/test/dist.test.ts` — เทสต์นี้จับกรณีที่ซอร์สทำงานแต่ของที่ publish พัง

```ts
import { describe, it, expect } from 'vitest';
import { CASES, summarise, BG } from './fixtures';
import expected from './golden.expected.json';

describe('dist — ของที่ publish ต้องให้ผลเท่ากับซอร์ส', () => {
  it('esm build ให้พีคเท่ากับค่าอ้างอิง', async () => {
    const dist = await import('../dist/index.js');
    const got = summarise(dist.run(structuredClone(CASES.dawnF)), BG);
    const want = (expected as any).dawnF;
    expect(Math.abs((got.maxGrid.max - want.maxGrid.max) / want.maxGrid.max)).toBeLessThan(1e-10);
    expect(got.maxGrid.over).toBe(want.maxGrid.over);
  });

  it('export ครบ 5 ตัวตามสัญญาเดิม', async () => {
    const dist = await import('../dist/index.js');
    for (const k of ['run', 'runPuff', 'windField', 'sigmas', 'plumeRise'])
      expect(typeof (dist as any)[k], `ขาด export: ${k}`).toBe('function');
  });
});
```

- [ ] **Step 7: รันเทสต์ทั้งชุด**

Run: `npm run build -w mokhwan-engine && npm test`
Expected: PASS 5 เทสต์ (golden 3 + dist 2)

- [ ] **Step 8: ตรวจว่า dist ไม่ถูก commit**

Run: `git status --short packages/engine/dist`
Expected: ไม่มีอะไรแสดง (`dist/` อยู่ใน `.gitignore` จาก commit แรกแล้ว)

ถ้ามีไฟล์แสดงขึ้นมา ให้เพิ่ม `packages/*/dist/` ลง `.gitignore`

- [ ] **Step 9: commit**

```bash
git add packages/engine/src/worker.ts packages/engine/vite.config.ts packages/engine/package.json packages/engine/test/dist.test.ts package-lock.json .gitignore
git commit -m "$(cat <<'MSG'
build(engine): worker entry + build เป็น esm/umd/.d.ts

  worker.ts   glue เดิมบรรทัด 1006 ในรูปโมดูลจริง แทน Blob URL + string
  vite.config lib mode ออก esm กับ umd (global MokhwanEngine)
  dist.test   ยืนยันว่าของที่ publish ให้ผลเท่าซอร์ส และ export ครบ 5 ตัว

.d.ts ออกด้วย tsc --emitDeclarationOnly เพราะ Vite lib mode ไม่ทำให้

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: ย้ายแอปขึ้น Vite

เป้าหมาย: แอปรันบน Vite โหลด deps จาก npm และโหลดเอนจินผ่าน `?worker` โดยพฤติกรรมที่ผู้ใช้เห็นเหมือนเดิมทุกอย่าง — แอปยังเป็นก้อนเดียว การแตกชั้นเป็นงานของแผน B

**Files:**
- Create: `app/package.json`
- Create: `app/vite.config.js`
- Create: `app/index.html`
- Create: `app/src/styles.css`
- Create: `app/src/app.js`
- Modify: `packages/engine/package.json` (ไม่ต้อง — `exports["./worker"]` ทำใน Task 2 แล้ว)

**หากฎ anchor ด้วยเนื้อหา ไม่ใช่เลขบรรทัด**

เลขบรรทัดในทุก step ของ task นี้เป็น**ตัวช่วยหา** ไม่ใช่คำสั่ง `app/src/app.js` ถูกยกมา
จากบรรทัด 866 จึงมีเลขต่างจากไฟล์ตั้งต้น 865 บรรทัด ให้ `grep -n` หาด้วยข้อความจริงทุกครั้ง
แล้วแก้ที่นั่น ถ้า grep ไม่เจอข้อความที่ระบุ **ให้หยุดและรายงาน** ห้ามเดาตำแหน่ง

**Interfaces:**
- Consumes:
  - `mokhwan-engine` — `run(P)` สำหรับทางถอยบน main thread
  - `mokhwan-engine/worker` — worker entry สำหรับ `?worker`
- Produces:
  - `window.__MOKHWAN__` = `{ S, addPlot, setWxMode, syncAllInputs, runSim, engineRun, map }` — เปิดเมื่อ dev หรือมี `?debug` ใน URL
  - `app/src/app.js` — โมดูลเดียวที่ยังไม่แตกชั้น (แผน B แตกต่อ)

- [ ] **Step 1: สร้าง `app/package.json`**

เวอร์ชัน deps ต้องตรงกับ cdnjs เดิมเป๊ะตาม Global Constraints

```json
{
  "name": "app",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "d3": "7.9.0",
    "leaflet": "1.9.4",
    "maplibre-gl": "4.7.1",
    "mokhwan-engine": "*"
  },
  "devDependencies": {
    "vite": "6.0.7"
  }
}
```

- [ ] **Step 2: สร้าง `app/vite.config.js`**

```js
import { defineConfig } from 'vite';

export default defineConfig({
  // 5173 มีโปรเจกต์อื่นจองอยู่บนเครื่องที่พัฒนา ใช้ 5180 ให้เดาได้แน่นอน
  server: { port: 5180 },
  preview: { port: 5181 },
  build: { target: 'es2020', sourcemap: true },
});
```

- [ ] **Step 3: ติดตั้ง**

Run: `npm install`
Expected: ติดตั้งสำเร็จ และ `app/node_modules/mokhwan-engine` เป็น symlink ไป `packages/engine`

Run: `ls -la app/node_modules/mokhwan-engine 2>/dev/null || ls -la node_modules/mokhwan-engine`
Expected: เห็น symlink

- [ ] **Step 4: แยก CSS ออกมา**

Run: `sed -n '8,210p' smoke-plume-studio-lasted.html > app/src/styles.css && head -3 app/src/styles.css && wc -l app/src/styles.css`
Expected: ~203 บรรทัด และบรรทัดแรกไม่ใช่ `<style>`

ตรวจว่าไม่มีแท็กหลงมา

Run: `grep -n '</\?style' app/src/styles.css || echo "สะอาด ไม่มีแท็ก style"`
Expected: `สะอาด ไม่มีแท็ก style`

- [ ] **Step 5: สร้าง `app/index.html`**

Run: `sed -n '213,407p' smoke-plume-studio-lasted.html > /tmp/body.html && wc -l /tmp/body.html`

จากนั้นประกอบไฟล์ — เอา `<link>` cdnjs ทั้งสองตัวออก เพราะ CSS จะมาทาง `import` ใน `app.js`

```html
<!doctype html>
<html lang="th">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mokhwan Studio — จำลองการฟุ้งกระจายควันจากการเผา</title>

<!-- วางเนื้อจาก /tmp/body.html ตรงนี้ทั้งก้อน (บรรทัด 213–407 ของไฟล์ตั้งต้น) -->

<script type="module" src="/src/app.js"></script>
</html>
```

**ห้ามลืม:** `<script id="engine" type="text/plain">` ทั้งบล็อก (409–860) และ `<script>`
cdnjs สามตัว (862–864) **ต้องไม่อยู่ใน `index.html`**

Run: `grep -c 'id="engine"\|cdnjs' app/index.html`
Expected: `0`

- [ ] **Step 6: สร้าง `app/src/app.js` — ยกโค้ดแอปมาทั้งก้อน**

Run: `sed -n '866,2434p' smoke-plume-studio-lasted.html > app/src/app.js && wc -l app/src/app.js`
Expected: 1,569 บรรทัด

- [ ] **Step 7: ใส่ import ไว้หัวไฟล์**

เพิ่มบล็อกนี้ที่**บรรทัดแรก**ของ `app/src/app.js`

```js
import './styles.css';
import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import L from 'leaflet';
import * as d3 from 'd3';
import { run as engineRunSync } from 'mokhwan-engine';
import EngineWorker from 'mokhwan-engine/worker?worker';
```

**`mokhwan-engine/worker?worker` เป็นรูปแบบที่ยังไม่ยืนยัน** (สเปก §8 เตือนไว้) — การต่อ
`?worker` ข้ามขอบแพ็กเกจไปที่ `.ts` ในอีก workspace อาจให้ Vite resolve ไม่ได้
ถ้า `npm run dev -w app` ขึ้น error เรื่อง resolve บรรทัดนี้ **ให้เปลี่ยนเป็นทางถอยนี้แล้วไปต่อ**
ไม่ต้องหยุดถาม

```js
import EngineWorker from '../../packages/engine/src/worker.ts?worker';
```

แล้วบันทึกไว้ใน `BACKLOG.md` (Task 5) ว่าใช้ทางถอย เพราะมันกระทบคนที่จะ `npm i` แพ็กเกจนี้ไปใช้

`import L from 'leaflet'` ทำให้ตัวแปร `L` อยู่ใน module scope — การอ้าง `L.` ทั้ง 30 จุด
และ `map.` ทั้ง 32 จุดใช้ได้ตามเดิมโดยไม่ต้องแก้

- [ ] **Step 8: แทนบล็อก compute bridge**

หาบล็อกนี้ใน `app/src/app.js` (เดิมคือบรรทัด 1003–1021 ของไฟล์ตั้งต้น) แล้วแทนทั้งก้อน

ลบ

```js
const ENGINE_SRC = $('engine').textContent;
let worker = null;
try{
  const glue = "\nself.onmessage=function(e){ self.postMessage(self.__ENGINE__.run(e.data)); };";
  worker = new Worker(URL.createObjectURL(new Blob([ENGINE_SRC + glue], {type:'text/javascript'})));
}catch(err){ worker = null; }
if(!worker){ (0,eval)(ENGINE_SRC); }

let reqSeq = 0, pendingResolve = null;
if(worker){
  worker.onmessage = ev => { if(pendingResolve){ const r = pendingResolve; pendingResolve = null; r(ev.data); } };
  worker.onerror = () => { worker = null; (0,eval)(ENGINE_SRC); };
}
function engineRun(payload){
  if(worker){
    return new Promise(res => { pendingResolve = res; worker.postMessage(payload); });
  }
  return Promise.resolve(window.__ENGINE__.run(payload));
}
```

ใส่แทน — ตรรกะเหมือนเดิมทุกกรณี แต่ไม่มี `eval` และไม่อ่านโค้ดจาก DOM

```js
let worker = null;
try{ worker = new EngineWorker(); }catch(err){ worker = null; }

let reqSeq = 0, pendingResolve = null;
if(worker){
  worker.onmessage = ev => { if(pendingResolve){ const r = pendingResolve; pendingResolve = null; r(ev.data); } };
  worker.onerror = () => { worker = null; };
}
function engineRun(payload){
  if(worker){
    return new Promise(res => { pendingResolve = res; worker.postMessage(payload); });
  }
  return Promise.resolve(engineRunSync(payload));
}
```

`pendingResolve` เป็นช่องเดียวเหมือนเดิมโดยตั้งใจ — เป็นข้อจำกัดที่มีมาแต่เดิม
อยู่ใน `BACKLOG.md` ไม่แก้ในแผนนี้ (Global Constraints)

- [ ] **Step 9: แก้ guard ของ d3 — กับดักที่ทำให้เส้นชั้นความสูงหายเงียบ**

`d3` ถูกใช้แค่ 2 จุด และมี guard ที่เช็ค `window.d3` เมื่อ import จาก npm
`window.d3` จะเป็น `undefined` ทำให้บล็อกนี้ไม่ทำงานโดยไม่มี error ใดๆ

หาบรรทัด (เดิมคือ 1309 ของไฟล์ตั้งต้น)

```js
  if(window.d3 && d3.contours){
```

แก้เป็น

```js
  if(d3 && d3.contours){
```

- [ ] **Step 10: แก้การโหลด MapLibre ให้เป็น lazy**

`maplibregl` ถูกอ้าง 4 จุด ทั้งหมดอยู่ในโค้ด 3D — โหลดตอนกดปุ่ม 3D เท่านั้น
เพื่อไม่ให้ bundle แรกแบก ~800 KB (สเปก §13)

เพิ่มบรรทัดนี้ใกล้ๆ `let m3 = null, is3D = false, m3ready = false;` (บรรทัด 1827 ของไฟล์ตั้งต้น)

```js
let maplibregl = null;   // โหลดตอนกด 3D เท่านั้น
```

จากนั้นหาบรรทัดนี้ (เดิม 2013 — ต้นฟังก์ชัน `set3D`)

```js
  if(on && typeof maplibregl === 'undefined'){
```

แก้ให้โหลดก่อนแล้วค่อยเช็ค — `set3D` ต้องกลายเป็น `async`

```js
  if(on && !maplibregl){
    try{
      maplibregl = (await import('maplibre-gl')).default;
    }catch(err){
      maplibregl = null;
    }
  }
  if(on && !maplibregl){
```

**ต้องตรวจ:** `set3D` ถูกเรียกจากที่ไหนบ้าง ถ้าผู้เรียกไม่ `await` ให้ปล่อยไว้ได้
(ฟังก์ชันคืน promise ที่ไม่มีใครรอ พฤติกรรมยังถูก) แต่ถ้ามีโค้ดที่พึ่งค่าคืนแบบ sync
ให้หยุดและรายงาน

Run: `grep -n 'set3D(' app/src/app.js`
Expected: เห็นจุดเรียกทั้งหมด ตรวจด้วยตาว่าไม่มีใครใช้ค่าที่คืน

- [ ] **Step 11: เปิด debug handle**

เพิ่มต่อท้าย `app/src/app.js` (หลังบล็อก boot เดิม)

```js
/* ---------------- debug handle ---------------- */
/* ES module มี scope ของตัวเอง ตัวแปรระดับบนสุดจึงไม่ขึ้น global เหมือนก่อน
   เทสต์ UI และการดีบั๊กด้วยมือต้องเข้าถึงผ่านช่องทางที่ตั้งใจเปิด */
if(import.meta.env.DEV || new URLSearchParams(location.search).has('debug')){
  window.__MOKHWAN__ = { S, addPlot, setWxMode, syncAllInputs, runSim, engineRun, map };
}
```

- [ ] **Step 12: เปิดแอปดู**

Run: `npm run dev -w app`

แล้วเปิด `http://localhost:5180` ตรวจด้วยตา 6 ข้อ

1. แผนที่ขึ้น เห็นพื้นเทาเข้ม (basemap ปริยาย)
2. คลิกบนแผนที่ปักแปลงได้ แล้วมีชั้นควันวาดออกมา
3. ไทม์ไลน์กด play ได้ลื่น ไม่มีการคำนวณใหม่ตอนเปลี่ยนชั่วโมง
4. เปิด DevTools → Console ไม่มี error สีแดง
5. เปิด DevTools → Network เห็นไฟล์ worker ถูกโหลดแยก และ **ไม่มี** คำขอไป cdnjs
6. กดปุ่ม 3D — เห็นคำขอโหลด `maplibre-gl` เกิดขึ้น**ตอนกด** ไม่ใช่ตอนเปิดหน้า

**ถ้าข้อใดไม่ผ่าน หยุดและรายงาน** อย่าแก้แบบเดาสุ่ม

- [ ] **Step 13: build**

Run: `npm run build -w app`
Expected: build สำเร็จ

Run: `npm run preview -w app` แล้วเปิด `http://localhost:5181` ตรวจ 6 ข้อเดิมซ้ำ

Expected: ผ่านทั้ง 6 ข้อ (dev กับ build ต่างกันได้เรื่อง worker และ lazy import จึงต้องตรวจทั้งสองโหมด)

- [ ] **Step 14: commit**

```bash
git add app package.json package-lock.json
git commit -m "$(cat <<'MSG'
feat(app): ย้ายแอปขึ้น Vite เลิก eval เลิก cdnjs

แอปยังเป็นก้อนเดียว 1,569 บรรทัดตามเดิม ไม่แตะตรรกะ เปลี่ยนแค่วิธีโหลดของ

  เอนจิน   mokhwan-engine/worker?worker แทน Blob URL + (0,eval)
           ทางถอยบน main thread ยังอยู่ครบ เปลี่ยนเป็น import ปกติ
  deps     npm แทน cdnjs ล็อกเวอร์ชันตรงเดิม leaflet 1.9.4 maplibre 4.7.1 d3 7.9.0
  maplibre lazy import ตอนกด 3D bundle แรกไม่แบก ~800 KB
  d3       แก้ guard จาก window.d3 เป็น d3 — import แบบโมดูลไม่ตั้ง window.d3
           ถ้าไม่แก้ เส้นชั้นความสูงจะหายเงียบโดยไม่มี error
  debug    window.__MOKHWAN__ เปิดเมื่อ dev หรือมี ?debug ใน URL
           เพราะ ES module ไม่ยกตัวแปรขึ้น global เหมือนก่อน

ตรวจแล้วทั้งโหมด dev และ build: แผนที่ขึ้น ปักแปลงได้ ไทม์ไลน์ลื่น
console ไม่มี error ไม่มีคำขอไป cdnjs และ maplibre โหลดตอนกด 3D จริง

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: smoke test + พิสูจน์ความเสี่ยง R1

เป้าหมาย: มีเทสต์อัตโนมัติที่ยืนยันว่าแอปเปิดและรันได้ และได้คำตอบว่าคุณสมบัติ "ไฟล์เดียว" รอดหรือไม่

**Files:**
- Create: `app/test/smoke.spec.mjs`
- Create: `BACKLOG.md`
- Create: `LICENSE`
- Modify: `package.json` (เพิ่ม script `test:smoke`)

**Interfaces:**
- Consumes: `window.__MOKHWAN__` จาก Task 4
- Produces: `npm run test:smoke` · คำตอบเรื่อง R1 บันทึกใน `BACKLOG.md`

- [ ] **Step 1: ติดตั้ง playwright-core + เบราว์เซอร์**

Run: `npm install -D playwright-core@1.49.1 && npx --yes playwright@1.49.1 install chromium`
Expected: ติดตั้งสำเร็จ

- [ ] **Step 2: เขียน smoke test**

สร้าง `app/test/smoke.spec.mjs` — รันเป็นสคริปต์ธรรมดา ไม่ผูกกับ Vitest
เพราะต้องมี dev server จริง

```js
/* smoke test — ยืนยันว่าแอปเปิดได้ ปักแปลงได้ และคำนวณออกผล
   รันด้วย: npm run test:smoke  (ต้องมี dev server อยู่ที่ 5180 ก่อน) */
import { chromium } from 'playwright-core';

const URL_APP = process.env.APP_URL ?? 'http://localhost:5180/?debug';
const fails = [];
const check = (ok, msg) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails.push(msg); };

const browser = await chromium.launch();
const page = await browser.newPage();

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

await page.goto(URL_APP, { waitUntil: 'networkidle' });

check(await page.locator('#map').isVisible(), 'แผนที่แสดงผล');
check(await page.evaluate(() => !!window.__MOKHWAN__), 'debug handle เปิดอยู่');

// ตั้งสภาพอากาศแบบกำหนดเอง แล้วปักแปลง 20 ไร่ที่เชียงใหม่
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
  return { peak: res.perHour[0].max, hours: res.perHour.length, cells: res.maxGrid.length };
});

check(r.hours === 1, `ได้ผล 1 ชั่วโมง (ได้ ${r.hours})`);
check(r.cells === 180 * 180, `กริด 180×180 (ได้ ${r.cells})`);
check(r.peak > 10 && r.peak < 10_000, `พีคอยู่ในย่านที่สมเหตุสมผล: ${r.peak.toFixed(1)} µg/m³`);

// เปลี่ยนมุมมองต้องไม่คำนวณใหม่ — reqId ต้องไม่ขยับ
// ต้องกดผ่าน DOM จริง การเซ็ต S.view ตรงๆ ไม่ได้ทริกอะไรเลย เทสต์จะผ่านฟรี
// ให้ grep หา id ของตัวเลือกมุมมอง (max / dose / hour) ใน app/index.html
// แล้วใส่ selector จริงแทน VIEW_SELECTOR ถ้าหาไม่เจอ ให้รายงานแล้วข้ามข้อนี้ไป
const VIEW_SELECTOR = '__ใส่ selector จริงจาก index.html__';
const before = await page.evaluate(() => window.__MOKHWAN__.S.result.reqId);
await page.click(VIEW_SELECTOR);
await page.waitForTimeout(500);
const after = await page.evaluate(() => window.__MOKHWAN__.S.result.reqId);
check(before === after, 'เปลี่ยนมุมมองไม่ทำให้คำนวณใหม่');

check(errors.length === 0, `console ไม่มี error${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);

await browser.close();

if (fails.length) { console.error(`\nไม่ผ่าน ${fails.length} ข้อ`); process.exit(1); }
console.log('\nผ่านทั้งหมด');
```

- [ ] **Step 3: เพิ่ม script**

เพิ่มใน `scripts` ของ root `package.json`

```json
    "test:smoke": "node app/test/smoke.spec.mjs"
```

- [ ] **Step 4: รัน smoke test**

Run (สอง terminal): `npm run dev -w app` (เสิร์ฟที่ 5180) แล้ว `npm run test:smoke`
Expected: `ผ่านทั้งหมด`

- [ ] **Step 5: พิสูจน์ R1 — ไฟล์เดียวยังรอดไหม**

Run: `npm install -D vite-plugin-singlefile@2.1.0 -w app`

สร้างคอนฟิกทดลอง `app/vite.singlefile.config.js`

```js
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  build: { outDir: 'dist-single', target: 'es2020', assetsInlineLimit: 100_000_000 },
});
```

Run: `npx vite build --config app/vite.singlefile.config.js --root app && ls -la app/dist-single`
Expected: เกิด `index.html` ไฟล์เดียว — **บันทึกขนาดไฟล์ที่ได้**

Run: `npx serve app/dist-single -p 4174` (หรือ `python3 -m http.server 4174 -d app/dist-single`)

เปิด `http://localhost:4174/?debug` แล้วตรวจ 3 ข้อ

1. แผนที่ขึ้น
2. ปักแปลงแล้วได้ผลคำนวณ (แปลว่า worker หรือทางถอยทำงาน)
3. กด 3D แล้วไม่พัง

- [ ] **Step 6: บันทึกคำตอบ R1**

สร้าง `BACKLOG.md` — บันทึกผลจริงที่ได้ ไม่ว่าจะรอดหรือไม่

```markdown
# BACKLOG

รายการที่เจอตอนทำงานแต่อยู่นอกขอบเขตของงานนั้น จดไว้ทำภายหลัง

## ผลการพิสูจน์ความเสี่ยง

### R1 — คุณสมบัติ "ไฟล์เดียว" (สเปก §14)

- **ผล:** _(เขียนผลจริงที่ได้จาก Task 5 Step 5 — รอด / ไม่รอด และขนาดไฟล์)_
- **ถ้าไม่รอด:** ต้องถามเจ้าของงานว่าจะทิ้งคุณสมบัตินี้ หรือยอมให้โหมดไฟล์เดียว
  รันบน main thread เท่านั้น (ช้ากว่าแต่ทำงานได้)

## หนี้ทางเทคนิคที่รับไว้โดยตั้งใจ

1. **`pendingResolve` เป็นช่องเดียว** — กดรันซ้อนกันจะเขียนทับ resolver ตัวเก่า
   promise แรกไม่ settle ตลอดกาล ไม่ใช่บั๊กความถูกต้องเพราะ `reqId` กันลำดับผลไว้แล้ว
   แก้ด้วย `Map<reqId, resolver>`
2. **`var` ทั่วเอนจิน** — คงไว้ตอนย้ายโดยตั้งใจ เปลี่ยนเป็น `const`/`let` ได้ทีหลัง
   ต้องรัน golden test คุมทุกครั้ง
3. **Leaflet ซ้ำซ้อนกับ MapLibre** — MapLibre ทำ 2D ได้ ตัด Leaflet ออกได้ 62 จุด (สเปก N2)
4. **98 DOM id ผูกกับ HTML ตรงๆ** — เปลี่ยนชื่อ id แล้วพังเงียบ ทำ map กลางทีหลังได้
5. **ไม่มี i18n** — string ไทยกระจายอยู่ในโค้ด (สเปก N3)
6. **`runPuff` อาจไม่มีการตกสะสมแห้ง** — `VD` ถูกอ้างใน `concAt` เท่านั้น ไม่มีใน
   `runPuff` ต้องยืนยันตอนก้าว 5 ว่าจงใจหรือตกหล่น
```

- [ ] **Step 7: สร้างไฟล์ LICENSE**

`packages/engine/package.json` ประกาศ `"license": "MIT"` ไว้ตั้งแต่ Task 2
การประกาศโดยไม่มีไฟล์คือการอ้างสิทธิ์ที่ตรวจไม่ได้ สร้าง `LICENSE` ที่ root

```
MIT License

Copyright (c) 2026 JRChanakarn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

เครดิตแหล่งข้อมูล (Open-Meteo · OSM · Esri · AWS Terrain · NASA GIBS · RainViewer)
ไปอยู่ใน README ซึ่งเป็นงานของแผน B

- [ ] **Step 8: commit**

```bash
git add app/test app/vite.singlefile.config.js BACKLOG.md LICENSE package.json package-lock.json
git commit -m "$(cat <<'MSG'
test(app): smoke test ด้วย playwright + พิสูจน์ความเสี่ยง R1

smoke test ยืนยัน 6 ข้อ: แผนที่ขึ้น · debug handle เปิด · ปักแปลงแล้วได้ผล
1 ชั่วโมง · กริด 180x180 · เปลี่ยนมุมมองไม่คำนวณใหม่ · console ไม่มี error

พิสูจน์ R1 เรื่องไฟล์เดียวแล้ว ผลบันทึกใน BACKLOG.md พร้อมหนี้ทางเทคนิค
ที่รับไว้โดยตั้งใจอีก 6 ข้อ

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

## เสร็จแผนนี้แล้วได้อะไร

| | ก่อน | หลัง |
|---|---|---|
| เอนจิน | 450 บรรทัดใน `<script type="text/plain">` โหลดด้วย `eval` | แพ็กเกจ TypeScript 8 ไฟล์ dependency เป็น DAG · build ออก esm/umd/.d.ts |
| เทสต์ | ไม่มี | golden 6 + dist 3 + smoke 24 ข้อ |
| deps | cdnjs 3 ตัว | npm ล็อกเวอร์ชัน · maplibre lazy |
| การเทสต์เอนจิน | ต้อง regex ดึงจาก HTML | `import` ปกติ |
| แอป | 2,435 บรรทัดไฟล์เดียว | `index.html` + `styles.css` + `app.js` 1,586 บรรทัด |

## ส่วนของสเปกที่แผนนี้ยังไม่ครอบ — ตั้งใจ ไม่ใช่ตกหล่น

**แผน B (ก้าว 3–4)**

| สเปก | เรื่อง |
|---|---|
| §5 | แตก `app.js` เป็น 7 ชั้น (`core` `state` `services` `map2d` `map3d` `ui` `main`) |
| §7 | `core/bus.js` ตัดวงจร state→render |
| §9 | `services/net.js` รวมกฎ fail-safe ที่กระจายอยู่ 8 ที่ให้เป็นโครงเดียว + smoke test ต่อ service |
| §10 | `state/url.js` — URL param สำหรับ embed |
| §12 ก้าว 4 | ESLint `import/no-cycle` + กฎต่อชั้น · README + เครดิตแหล่งข้อมูล |

**ก้าว 5 (สเปกแยก ตาม `HANDOFF-terrain-mode.md`)**

| สเปก | เรื่อง |
|---|---|
| §11 | `puff-vs-gauss.test.ts` — puff ต่างจาก gaussian ≤25% ที่ 1/3/8 กม. **เทสต์นี้จะแดงตั้งแต่วันแรก** เพราะบั๊กที่ยังไม่แก้ จึงอยู่กับงานที่แก้บั๊ก ไม่ใช่งานรื้อ |
| §11 | `terrain.test.ts` — ภูมิประเทศสังเคราะห์ แอ่ง + สันเขา |
| — | ดึง DEM จริง · hillshade + เส้นชั้นความสูงใน 2D · UI เลือกแบบจำลอง + progress |
