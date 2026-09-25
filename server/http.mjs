import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { createJobService, SourceError } from './job-sources.mjs';

const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
};

export function createApiHandler({ env = process.env, service = createJobService({ env }) } = {}) {
  const requests = new Map();
  const allowed = new Set(['localhost', '127.0.0.1', '[::1]', ...(env.JARIZIP_ALLOWED_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean)]);
  return async function handle(req, res) {
    const path = (req.url || '').split('?')[0];
    if (!path.startsWith('/api/')) return false;
    try {
      const url = new URL(req.url, 'http://localhost');
      const host = new URL(`http://${req.headers.host || 'localhost'}`).hostname;
      let originOK = true;
      if (req.headers.origin) originOK = allowed.has(new URL(req.headers.origin).hostname);
      if (!allowed.has(host) || !originOK || req.headers['sec-fetch-site'] === 'cross-site') throw new SourceError('허용하지 않은 외부 출처의 요청이에요.', 403, 'FORBIDDEN');
      if (req.method !== 'GET') throw new SourceError('조회 요청만 사용할 수 있어요.', 405, 'METHOD_NOT_ALLOWED');
      const address = req.socket.remoteAddress || 'local';
      const entry = requests.get(address); const time = Date.now();
      const rate = entry && time - entry.start < 60000 ? entry : { start: time, count: 0 };
      rate.count++; requests.set(address, rate);
      if (requests.size > 200) requests.delete(requests.keys().next().value);
      if (rate.count > 60) throw new SourceError('잠시 요청을 줄여주세요. 1분 뒤 다시 조회할 수 있어요.', 429, 'RATE_LIMIT');
      if (path === '/api/sources') { json(res, 200, { sources: service.sources(), personalDocumentsSent: false }); return true; }
      if (path === '/api/jobs') {
        const params = url.searchParams;
        const page = params.get('page') || '0';
        if (!/^\d{1,4}$/.test(page)) throw new SourceError('페이지 번호가 올바르지 않아요.', 400, 'BAD_QUERY');
        const result = await service.search({ provider: params.get('source') || 'wanted', query: params.get('q') || '', page: Number(page), location: params.get('location') || 'all', category: params.get('category') || 'all', experience: params.get('experience') || 'all', refresh: params.get('refresh') === '1', cursor: params.has('cursor') ? params.get('cursor') : undefined });
        json(res, 200, result); return true;
      }
      const match = /^\/api\/jobs\/(wanted|saramin|jumpit|zighang)\/([0-9a-f-]{1,36})$/i.exec(path);
      if (match) { json(res, 200, await service.detail(match[1], match[2], url.searchParams.get('refresh') === '1')); return true; }
      throw new SourceError('없는 API 경로예요.', 404, 'NOT_FOUND');
    } catch (error) {
      json(res, error instanceof SourceError ? error.status : 500, { error: { code: error instanceof SourceError ? error.code : 'SERVER_ERROR', message: error instanceof SourceError ? error.message : '요청을 처리하지 못했어요.' } });
      return true;
    }
  };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.map': 'application/json' };

export function createAppServer({ directory = resolve('dist'), service, env = process.env } = {}) {
  const api = createApiHandler({ service, env });
  return createServer(async (req, res) => {
    if (await api(req, res)) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const root = await realpath(directory);
      const file = await realpath(resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`));
      if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) { res.writeHead(404); res.end(); return; }
      const ext = extname(file); const bytes = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Length': bytes.byteLength,
        'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob: data:; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
      });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('찾을 수 없는 경로입니다. 앱 빌드 여부를 확인해주세요.'); }
  });
}
