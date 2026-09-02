import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'MokhwanEngine',        // ชื่อ global ของ build แบบ umd
      fileName: (fmt) => (fmt === 'es' ? 'index.js' : 'index.umd.cjs'),
      formats: ['es', 'umd'],
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
