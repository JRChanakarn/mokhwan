import { run } from './index.js';
import type { RunParams, ProgressMessage } from './types.js';

/**
 * glue ของ Web Worker — ตรรกะเดียวกับบรรทัด 1006 ของ smoke-plume-studio-lasted.html
 * แต่เป็นโมดูลจริง ไม่ใช่สตริงที่ต่อกับ Blob URL แล้ว eval
 *
 * **ไฟล์นี้ถูก export เป็นซอร์ส `.ts` โดยตั้งใจ** (`mokhwan-engine/worker`)
 * เพราะการสร้าง Worker ต้องให้ bundler ของผู้ใช้เป็นคนแยกไฟล์ออกมาเอง เช่น
 *
 *   import EngineWorker from 'mokhwan-engine/worker?worker';   // Vite
 *   const worker = new EngineWorker();
 *
 * จึง **ต้องมี bundler ที่ resolve และแปลง TypeScript ได้** (Vite / esbuild /
 * webpack + ts-loader) — โหลดด้วย Node เปล่าหรือ Deno ที่ไม่ตั้งค่าจะไม่ทำงาน
 * ถ้าไม่ต้องการ Worker ให้ import `run` จาก `mokhwan-engine` ตรงๆ แล้วรันบน
 * เธรดหลักได้เลย ผลลัพธ์เหมือนกันทุกกรณี
 */
self.onmessage = (e: MessageEvent<RunParams>) => {
  const P = e.data;
  // ส่งความคืบหน้าทุกชั่วโมงก่อนผลสุดท้าย ฝั่งรับแยกด้วย data.type === 'progress'
  // (RunResult ไม่มีฟิลด์ type จึงไม่ชนกัน) และเทียบ reqId เพื่อทิ้งของคำขอเก่า
  const res = run(P, {
    onProgress: (h, nH) => {
      const msg: ProgressMessage = { type: 'progress', h, nH, reqId: P.reqId };
      self.postMessage(msg);
    },
  });
  self.postMessage(res);
};
