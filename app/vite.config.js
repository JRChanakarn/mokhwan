import { defineConfig } from 'vite';

export default defineConfig({
  // asset ต้องอ้างแบบ relative ไม่ใช่ absolute
  // ปลายทางที่ตั้งใจคือ GitHub Pages (ซึ่งเป็น sub-path /<repo>/) และการฝังใน
  // เว็บอื่นซึ่งอาจอยู่ใต้ /demo/ · base ปริยาย '/' จะทำให้ asset 404 ทั้งหมด
  // และยังทำให้เปิดไฟล์จาก file:// ตรงๆ ได้ด้วย
  base: './',

  // 5173 (ค่าปริยายของ Vite) มีโปรเจกต์อื่นจองอยู่บนเครื่องที่พัฒนา
  // ตั้งเป็น 5180 ให้เดาได้แน่นอน ไม่ต้องไปดู log ว่าเลื่อนไปพอร์ตไหน
  // ถ้าชนบนเครื่องอื่น สั่ง `npm run dev -w app -- --port <n>` ทับได้
  server: { port: 5180 },
  preview: { port: 5181 },

  build: { target: 'es2020', sourcemap: true },
});
