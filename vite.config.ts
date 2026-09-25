import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createApiHandler } from './server/http.mjs';

export default defineConfig(({ mode }) => ({
  plugins: [react(), {
    name: 'jarizip-local-jobs',
    configureServer(server) {
      const handle = createApiHandler({ env: { ...loadEnv(mode, process.cwd(), ''), ...process.env } });
      server.middlewares.use((req, res, next) => { void handle(req, res).then(handled => { if (!handled) next(); }).catch(next); });
    },
  }],
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1100 },
  server: { host: '127.0.0.1', port: 5173 },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
}));
