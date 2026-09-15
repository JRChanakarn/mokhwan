/**
 * sky-palette — ฟ้าและดวงอาทิตย์ตามชั่วโมง ใช้ร่วมกันระหว่างตัววาดสองตัว
 *
 * `skyFor` ย้ายมาจาก `app.js` ทั้งดุ้น **ไม่แก้ค่าสีแม้แต่ตัวเดียว** เพราะถ้าสองโหมด
 * ใช้จานสีคนละชุด คนที่สลับไปมาจะเห็นเวลาในวันไม่ตรงกัน แล้วจะไม่มีใครรู้ว่าอันไหนถูก
 *
 * `sunDirection` เป็นของใหม่ — MapLibre ใช้ hillshade ที่ล็อกมุมแสงไว้ที่ 315°
 * ส่วน three.js ใช้แสงจริงส่องเมช จึงต้องรู้ว่าดวงอาทิตย์อยู่ตรงไหนจริงๆ
 */

/**
 * อ่านชั่วโมงจากคีย์ — **คัดลอกพฤติกรรมของ `app.js` เดิมมาทั้งข้อบกพร่อง**
 *
 * ของเดิมคือ `+(hourKey||'').slice(11,13) || 12` ซึ่งทำให้ `T00` (เที่ยงคืน) กลายเป็น 12
 * เพราะ `0 || 12` ได้ 12 — ฟ้าจึงสว่างตอนตีสิบสองเมื่อการจำลองข้ามเที่ยงคืน
 *
 * ตั้งใจไม่แก้ตรงนี้ เพราะงานนี้คือ**ย้ายที่** ถ้าแก้ไปด้วยจะพิสูจน์ไม่ได้ว่าการย้าย
 * ไม่เปลี่ยนพฤติกรรมของโหมด MapLibre ที่ใช้ฟังก์ชันนี้อยู่ — จดไว้ใน BACKLOG.md แล้ว
 */
function hourOf(hourKey) {
  return +(hourKey || '').slice(11, 13) || 12;
}

/** จานสีฟ้า/ขอบฟ้า/หมอก — ย้ายมาจาก app.js ห้ามแก้ค่า */
export function skyFor(hourKey) {
  const hh = hourOf(hourKey);
  if (hh < 6 || hh >= 19) return { sky: '#0b1220', hor: '#1d2a3d', fog: '#141d2a' };
  if (hh < 8)  return { sky: '#4a5f86', hor: '#e0a765', fog: '#c8b49a' };
  if (hh < 16) return { sky: '#5f8fc4', hor: '#b9cbdc', fog: '#c3ceda' };
  return { sky: '#3f5c88', hor: '#e09a5e', fog: '#c2ae97' };
}

export function isDaylight(hourKey) {
  const h = hourOf(hourKey);
  return h >= 6 && h < 19;
}

/**
 * ทิศดวงอาทิตย์ในระบบพิกัดฉาก (x ตะวันออก · y เหนือ · z ขึ้น)
 *
 * ใช้สูตรตำแหน่งดวงอาทิตย์แบบย่อ คลาดเคลื่อนระดับองศา ซึ่งพอสำหรับ**ทิศเงาเขา**
 * ไม่ได้เอาไปคำนวณรังสีหรือค่าใดๆ ที่รายงานเป็นตัวเลข จึงไม่ต้องใช้สูตรเต็ม
 * วันที่ตรึงกลางเดือนมีนาคมเมื่อคีย์ไม่มีวันที่ เพราะฤดูเผาของภาคเหนืออยู่แถวนั้น
 */
export function sunDirection(hourKey, lat) {
  const h = hourOf(hourKey);
  const iso = (hourKey || '').slice(0, 10);
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '2026-03-15');
  const doy = Number.isFinite(d.getTime())
    ? Math.floor((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 0))) / 86400000)
    : 74;
  const rad = Math.PI / 180;
  const decl = 23.44 * rad * Math.sin(2 * Math.PI * (284 + doy) / 365);
  const ha = (h - 12) * 15 * rad;          // มุมชั่วโมง เที่ยง = 0 เช้าเป็นลบ
  const la = lat * rad;
  const alt = Math.asin(Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(ha));
  // อะซิมุทวัดจากทิศเหนือตามเข็มนาฬิกา
  const az = Math.atan2(-Math.sin(ha), Math.tan(decl) * Math.cos(la) - Math.sin(la) * Math.cos(ha));
  return { x: Math.sin(az) * Math.cos(alt), y: Math.cos(az) * Math.cos(alt), z: Math.sin(alt) };
}
