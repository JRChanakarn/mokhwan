import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * คอนฟิกทดลอง — พิสูจน์ความเสี่ยง R1 ในสเปก ข้อ 14
 * ว่าคุณสมบัติ "โยนไฟล์ .html เดียวให้ใครก็เปิดได้" ที่ของเดิมมี ยังรอดไหม
 * หลังย้ายมาใช้ Web Worker จริงและ MapLibre 802 kB
 */
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist-single',
    target: 'es2020',
    sourcemap: false,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
  },
});
