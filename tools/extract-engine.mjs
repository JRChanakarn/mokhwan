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
