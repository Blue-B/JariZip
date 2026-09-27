import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { createApiHandler } from './server/http.mjs';
import { createEnvCredentialStore, ENV_FILE } from './server/credentials.mjs';

export default defineConfig(({ mode }) => ({
  plugins: [react(), {
    name: 'jarizip-local-jobs',
    configureServer(server) {
      // One merged env object is shared by the credential store and the job service.
      // Saving a key mutates it in place, so the dev server needs no restart. The
      // server also avoids restarting on `.env.local` writes (see `server.watch`).
      const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
      const credentials = createEnvCredentialStore({ file: resolve(process.cwd(), ENV_FILE), env });
      const handle = createApiHandler({ env, credentials });
      server.middlewares.use((req, res, next) => { void handle(req, res).then(handled => { if (!handled) next(); }).catch(next); });
    },
  }],
  base: './',
  // Keep even small font subsets on the same origin; CSP intentionally excludes data: fonts.
  build: { target: 'es2022', chunkSizeWarningLimit: 1100, assetsInlineLimit: 0 },
  server: {
    host: '127.0.0.1',
    port: 5173,
    // The browser-mode credential store writes `.env.local`; ignoring it keeps Vite
    // from restarting the dev server and dropping the in-memory key update.
    watch: { ignored: ['**/.env.local'] },
  },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
}));
