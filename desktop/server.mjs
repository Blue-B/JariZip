// Desktop shell HTTP host.
//
// Wraps the existing `createAppServer` from the web/local-server mode so the packaged app
// serves exactly the same API and built assets. The listener is always bound to 127.0.0.1
// (never 0.0.0.0) and uses one stable port. IndexedDB is origin-scoped, so silently falling
// back to a random port would make a user's existing local data appear to have disappeared.
// If the port is occupied we fail clearly and leave the other process untouched.
import { createAppServer, DEFAULT_HOST, serverUrl } from '../server/http.mjs';

export const MIN_PORT = 1024;
export const MAX_PORT = 65535;

export function isValidPort(value) {
  return Number.isInteger(value) && value >= MIN_PORT && value <= MAX_PORT;
}

/**
 * Start the shared application server on the loopback interface.
 * @param {{ port?: number, preferredPort?: number, directory?: string, env?: NodeJS.ProcessEnv, service?: object, host?: string }} options
 * @returns {Promise<{ server: import('node:http').Server, port: number, url: string, fallback: false, close: () => Promise<void> }>}
 */
export async function startDesktopServer({ port, preferredPort, directory, env = process.env, service, host = DEFAULT_HOST } = {}) {
  if (host !== DEFAULT_HOST) throw new Error('The desktop shell only binds to 127.0.0.1.');
  const preferred = port ?? preferredPort;
  if (!isValidPort(preferred)) throw new Error(`Port must be an integer from ${MIN_PORT} to ${MAX_PORT}.`);
  const server = createAppServer({ ...(directory ? { directory } : {}), ...(service ? { service } : {}), env });
  return new Promise((resolveStart, rejectStart) => {
    let settled = false;
    const onError = error => {
      if (settled) return;
      settled = true;
      const wrapped = error?.code === 'EADDRINUSE'
        ? Object.assign(new Error(`JariZip이 사용하는 ${preferred} 포트가 이미 사용 중이에요. 기존 JariZip 창이나 로컬 실행을 종료한 뒤 다시 열어주세요.`), { code: 'EADDRINUSE' })
        : error;
      rejectStart(wrapped);
    };
    server.on('error', onError);
    server.once('listening', () => {
      if (settled) return;
      settled = true;
      server.removeListener('error', onError);
      resolveStart({
        server,
        port: preferred,
        url: serverUrl(preferred, host),
        fallback: false,
        close: () => new Promise(resolveClose => { server.closeAllConnections?.(); server.close(() => resolveClose()); }),
      });
    });
    server.listen(preferred, host);
  });
}
