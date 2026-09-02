/**
 * ยามระดับ compile-time — ไม่มี runtime
 *
 * `golden.expected.json` คือบันทึกผลจริงจากเอนจิน ทุกคีย์ในนั้นคือฟิลด์ที่เอนจิน
 * **สร้างขึ้นจริง** ไฟล์นี้บังคับว่าทุกคีย์ต้องมีที่อยู่ใน type ด้วย
 *
 * ทำไมต้องมี: `runPuff` ใส่ `terrain: !!Z` ใน perHour แต่ `PerHour` ไม่มีฟิลด์นี้
 * และ `tsc` จับไม่ได้ เพราะ `var perHour = []` เป็น evolving array type
 * ส่วน excess property check ไม่ทำงานกับตัวแปร (ทำกับ object literal สดเท่านั้น)
 * บั๊กแบบนี้จึงรอดไปได้ทั้งที่เปิด strict — code review เป็นตัวจับ ไม่ใช่ compiler
 *
 * ตรวจด้วย `npm run typecheck` (ไฟล์นี้อยู่นอก tsconfig ของ build จึงไม่ไปโป่งใน dist)
 */
import type { PerHour, RunResult } from '../src/types';
import expected from './golden.expected.json';

type Golden = typeof expected;
type AnyCase = Golden[keyof Golden];

/**
 * `keyof` บน union ให้ผลเป็น **intersection** ของคีย์ คือได้แค่คีย์ที่มีในทุกสมาชิก
 * ต้อง distribute ก่อน ไม่งั้นฟิลด์ที่มีเฉพาะเคส puff (เช่น terrain) จะมองไม่เห็นเลย
 * และ guard จะเงียบทั้งที่ควรดัง — เคยพลาดตรงนี้มาแล้วรอบหนึ่ง
 */
type KeysOfUnion<T> = T extends unknown ? keyof T : never;

/** ฟิลด์ใน perHour ที่บันทึกไว้จริง แต่ไม่มีใน PerHour */
type MissingPerHour = Exclude<KeysOfUnion<AnyCase['perHour'][number]>, keyof PerHour>;

/**
 * ฟิลด์ระดับบนสุดที่บันทึกไว้จริง แต่ไม่มีใน RunResult
 *
 * ไม่มีการยกเว้นคีย์ใดเลยโดยตั้งใจ — `summarise()` แทน `grids`/`maxGrid`/`doseGrid`
 * ด้วยลายนิ้วมือ `GridStat` แต่**ชื่อคีย์ยังตรงกับ RunResult** ยามนี้เทียบแค่ชื่อคีย์
 * จึงไม่ต้องยกเว้น การใส่ Exclude ตามชื่อไว้เผื่อๆ คือการเปิดช่องให้ยามเงียบ
 * ถ้าวันหนึ่ง RunResult.grids ถูกเปลี่ยนชื่อหรือลบ (เคยมีเวอร์ชันที่ทำแบบนั้น)
 */
type MissingResult = Exclude<KeysOfUnion<AnyCase>, keyof RunResult>;

// ถ้าฟิลด์ไหนขาด ตัวแปรข้างล่างจะ error และ **บอกชื่อฟิลด์ที่ขาดตรงๆ**
const _perHourComplete: MissingPerHour extends never ? true : MissingPerHour = true;
const _resultComplete:  MissingResult  extends never ? true : MissingResult  = true;
void _perHourComplete; void _resultComplete;
