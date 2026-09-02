import { run } from './index';
import type { RunParams } from './types';

/**
 * glue ของ Web Worker — ตรรกะเดียวกับบรรทัด 1006 ของ smoke-plume-studio-lasted.html
 * แต่เป็นโมดูลจริง ไม่ใช่สตริงที่ต่อกับ Blob URL แล้ว eval
 */
self.onmessage = (e: MessageEvent<RunParams>) => {
  (self as unknown as Worker).postMessage(run(e.data));
};
