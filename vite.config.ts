import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1100 },
  server: { host: '127.0.0.1', port: 5173 },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
