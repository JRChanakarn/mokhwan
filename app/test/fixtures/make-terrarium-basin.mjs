/**
 * สร้าง terrarium-basin.png — ไทล์ terrarium ปลอม 256×256 สำหรับ smoke test
 * แอ่ง 300 ม. กลางไทล์ ไล่ขึ้นเป็น 800 ม. ที่ขอบ (elev = 300 + 500·min(1, r²))
 * รัน: node app/test/fixtures/make-terrarium-basin.mjs
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const W = 256, H = 256;
const rows = [];
for (let j = 0; j < H; j++) {
  const row = [0];                                   // filter: none
  for (let i = 0; i < W; i++) {
    const dx = (i - 128) / 128, dy = (j - 128) / 128;
    const v = 300 + 500 * Math.min(1, dx * dx + dy * dy) + 32768;
    row.push(Math.floor(v / 256), Math.floor(v % 256), Math.round((v % 1) * 256) % 256);
  }
  rows.push(Buffer.from(row));
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
});
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const t = Buffer.from(type), len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;   // 8-bit RGB
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })), chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(new URL('./terrarium-basin.png', import.meta.url), png);
console.log(`terrarium-basin.png · ${png.length} ไบต์ · แอ่ง 300–800 ม.`);
