import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { createJobService, SourceError, APPROVED_SOURCES } from './job-sources.mjs';
import { MAX_BODY_BYTES } from './credentials.mjs';

/** Stable local origin used by the browser mode and by the desktop shell. */
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 4178;
export const serverUrl = (port = DEFAULT_PORT, host = DEFAULT_HOST) => `http://${host}:${port}/`;

const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
};

/** Read at most `limit` bytes from a request body, refusing anything larger. */
function readBoundedBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolveBody, rejectBody) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) { rejectBody(new SourceError('요청 본문이 너무 커요.', 413, 'BODY_TOO_LARGE')); req.resume(); return; }
    const chunks = [];
    let size = 0;
    let settled = false;
    const onData = chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        settled = true;
        req.off('data', onData);
        req.off('end', onEnd);
        rejectBody(new SourceError('요청 본문이 너무 커요.', 413, 'BODY_TOO_LARGE'));
        req.resume();
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => { if (settled) return; settled = true; resolveBody(Buffer.concat(chunks).toString('utf8')); };
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', () => { if (settled) return; settled = true; rejectBody(new SourceError('요청 본문을 읽지 못했어요.', 400, 'BAD_BODY')); });
  });
}

export function createApiHandler({ env = process.env, service = createJobService({ env }), credentials = null } = {}) {
  const requests = new Map();
  const allowed = new Set(['localhost', '127.0.0.1', '[::1]', ...(env.JARIZIP_ALLOWED_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean)]);
  return async function handle(req, res) {
    const path = (req.url || '').split('?')[0];
    if (!path.startsWith('/api/')) return false;
    const credentialPath = path === '/api/credentials' || /^\/api\/credentials\/[a-z0-9-]+$/i.test(path);
    try {
      const url = new URL(req.url, 'http://localhost');
      const host = new URL(`http://${req.headers.host || 'localhost'}`).hostname;
      let originOK = true;
      if (req.headers.origin) originOK = allowed.has(new URL(req.headers.origin).hostname);
      if (!allowed.has(host) || !originOK || req.headers['sec-fetch-site'] === 'cross-site') throw new SourceError('허용하지 않은 외부 출처의 요청이에요.', 403, 'FORBIDDEN');
      const address = req.socket.remoteAddress || 'local';
      const entry = requests.get(address); const time = Date.now();
      const rate = entry && time - entry.start < 60000 ? entry : { start: time, count: 0 };
      rate.count++; requests.set(address, rate);
      if (requests.size > 200) requests.delete(requests.keys().next().value);
      if (rate.count > 60) throw new SourceError('잠시 요청을 줄여주세요. 1분 뒤 다시 조회할 수 있어요.', 429, 'RATE_LIMIT');
      // Browser-mode credential management exists only when a store is explicitly
      // passed. The desktop host never passes one, so this route is absent there.
      if (credentialPath) {
        if (!credentials) throw new SourceError('없는 API 경로예요.', 404, 'NOT_FOUND');
        const match = /^\/api\/credentials\/([a-z0-9-]+)$/i.exec(path);
        if (!match) {
          if (req.method !== 'GET') throw new SourceError('조회 요청만 사용할 수 있어요.', 405, 'METHOD_NOT_ALLOWED');
          json(res, 200, { providers: credentials.providers() }); return true;
        }
        if (req.method === 'PUT') {
          if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw new SourceError('JSON 요청만 사용할 수 있어요.', 415, 'UNSUPPORTED_MEDIA_TYPE');
          const raw = await readBoundedBody(req);
          let body;
          try { body = JSON.parse(raw); } catch { throw new SourceError('요청 본문을 읽지 못했어요.', 400, 'BAD_BODY'); }
          if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.key !== 'string') throw new SourceError('API 키를 확인해주세요.', 400, 'BAD_BODY');
          const result = credentials.set(match[1], body.key);
          json(res, 200, { providers: credentials.providers(), provider: result.provider, configured: result.configured }); return true;
        }
        if (req.method === 'DELETE') {
          const result = credentials.clear(match[1]);
          json(res, 200, { providers: credentials.providers(), provider: result.provider, configured: result.configured }); return true;
        }
        throw new SourceError('지원하지 않는 요청 방식이에요.', 405, 'METHOD_NOT_ALLOWED');
      }
      if (req.method !== 'GET') throw new SourceError('조회 요청만 사용할 수 있어요.', 405, 'METHOD_NOT_ALLOWED');
      if (path === '/api/sources') { json(res, 200, { sources: service.sources(), personalDocumentsSent: false }); return true; }
      if (path === '/api/jobs') {
        const params = url.searchParams;
        const source = params.get('source') || 'all';
        if (source !== 'all' && !APPROVED_SOURCES.includes(source)) throw new SourceError('이 출처는 제공사의 사전 승인 없이 자동으로 조회하지 않아요. 원문 사이트에서 직접 확인해주세요.', 403, 'SOURCE_NOT_PERMITTED');
        const page = params.get('page') || '0';
        if (!/^\d{1,4}$/.test(page)) throw new SourceError('페이지 번호가 올바르지 않아요.', 400, 'BAD_QUERY');
        const result = await service.search({ provider: source, query: params.get('q') || '', page: Number(page), location: params.get('location') || 'all', category: params.get('category') || 'all', experience: params.get('experience') || 'all', refresh: params.get('refresh') === '1', cursor: params.has('cursor') ? params.get('cursor') : undefined });
        json(res, 200, result); return true;
      }
      const match = /^\/api\/jobs\/(wanted|saramin|jumpit|zighang|work24)\/([0-9A-Za-z-]{1,40})$/i.exec(path);
      if (match) {
        if (!APPROVED_SOURCES.includes(match[1])) throw new SourceError('이 출처는 제공사의 사전 승인 없이 자동으로 조회하지 않아요. 원문 사이트에서 직접 확인해주세요.', 403, 'SOURCE_NOT_PERMITTED');
        json(res, 200, await service.detail(match[1], match[2], url.searchParams.get('refresh') === '1')); return true;
      }
      throw new SourceError('없는 API 경로예요.', 404, 'NOT_FOUND');
    } catch (error) {
      const known = error instanceof SourceError || (error && typeof error.status === 'number' && typeof error.code === 'string');
      json(res, known ? error.status : 500, { error: { code: known ? error.code : 'SERVER_ERROR', message: known ? error.message : '요청을 처리하지 못했어요.' } });
      return true;
    }
  };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.map': 'application/json' };

export function createAppServer({ directory = resolve('dist'), service, env = process.env, credentials = null } = {}) {
  const api = createApiHandler({ service, env, credentials });
  return createServer(async (req, res) => {
    if (await api(req, res)) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      // Never expose env files even if a caller points the static root at a directory
      // that happens to contain them (e.g. an over-broad `directory` option).
      if (/(?:^|\/)\.env(?:\..*)?$/.test(pathname)) { res.writeHead(404); res.end(); return; }
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
