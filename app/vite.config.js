import { defineConfig } from 'vite';

export default defineConfig({
  // 5173 (ค่าปริยายของ Vite) มีโปรเจกต์อื่นจองอยู่บนเครื่องที่พัฒนา
  // ตั้งเป็น 5180 ให้เดาได้แน่นอน ไม่ต้องไปดู log ว่าเลื่อนไปพอร์ตไหน
  server: { port: 5180 },
  preview: { port: 5181 },
  build: { target: 'es2020', sourcemap: true },
});
