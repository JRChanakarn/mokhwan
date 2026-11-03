/**
 * ภาษาของหน้า — ไทยเป็นค่าปริยาย (เจ้าของงานเลือก เพราะผู้ใช้หลักเป็นคนไทย)
 * อังกฤษเมื่อลิงก์ขอ (?lang=en จากการ์ดใน hub ตอนดูเป็นอังกฤษ) หรือผู้ใช้เคยกดเลือกไว้
 */
import { describe, it, expect } from 'vitest';
import { resolveLang } from '../src/i18n.js';
import { HTML_EN } from '../src/i18n-html.js';

describe('resolveLang', () => {
  it('ไม่มีอะไรบอกเลยได้ไทย', () => {
    expect(resolveLang('', null)).toBe('th');
  });
  it('?lang= ในลิงก์ชนะค่าที่จำไว้ทั้งสองทาง', () => {
    expect(resolveLang('?lang=en', 'th')).toBe('en');
    expect(resolveLang('?lang=th', 'en')).toBe('th');
  });
  it('ไม่มี ?lang= ใช้ค่าที่จำไว้', () => {
    expect(resolveLang('?debug', 'en')).toBe('en');
  });
  it('ค่าแปลกๆ ทั้งในลิงก์และที่จำไว้ถูกเมิน ไม่ทำให้หน้าพัง', () => {
    expect(resolveLang('?lang=fr', null)).toBe('th');
    expect(resolveLang('?lang=EN', 'xx')).toBe('th');
  });
});

describe('HTML_EN', () => {
  it('ทุกคีย์เป็นภาษาไทยแบบยุบช่องว่างแล้ว และทุกค่าไม่มีตัวอักษรไทยเหลือ', () => {
    for (const [th, en] of Object.entries(HTML_EN)) {
      expect(th).toBe(th.replace(/\s+/g, ' ').trim());
      expect(th).toMatch(/[฀-๿]/);
      expect(en).not.toMatch(/[฀-๿]/);
    }
  });
});
