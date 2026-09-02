import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'app/test/**/*.test.js'],   // smoke.spec.mjs ไม่เข้าเพราะไม่ใช่ .test.
    environment: 'node',
    testTimeout: 60_000,   // เอนจินรันกริด 180×180 หลายชั่วโมง ช้ากว่าเทสต์ทั่วไป
  },
});
