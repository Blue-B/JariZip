import { loadEnvFile } from 'node:process';
import { createAppServer } from './http.mjs';
try { loadEnvFile('.env.local'); } catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot load .env.local'); }
const args = process.argv.slice(2);
const index = args.lastIndexOf('--port');
const rawPort = index >= 0 ? args[index + 1] : process.env.PORT || '4178';
if (!/^\d+$/.test(rawPort || '') || Number(rawPort) < 1024 || Number(rawPort) > 65535) throw new Error('Port must be an integer from 1024 to 65535.');
const host = process.env.JARIZIP_HOST || '127.0.0.1';
const server = createAppServer();
server.on('error', error => { console.error(`자리집 서버를 시작하지 못했어요: ${error.code || 'SERVER_ERROR'}`); process.exitCode = 1; });
server.listen(Number(rawPort), host, () => console.log(`JariZip: http://${host}:${rawPort} · 실제 공고 조회 API 연결`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.closeAllConnections(); server.close(); });
