import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import net from 'node:net';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = resolve(root, '.local');
const pidFile = resolve(runtime, 'preview.pid');
const logFile = resolve(runtime, 'preview.log');
const cli = resolve(root, 'node_modules/vite/bin/vite.js');
const port = 4178;
const action = process.argv[2] || 'start';

async function runningPid() {
  try {
    const pid = Number((await readFile(pidFile, 'utf8')).trim());
    if (!Number.isInteger(pid) || pid <= 1) return null;
    const cmdline = await readFile(`/proc/${pid}/cmdline`, 'utf8');
    return cmdline.includes(cli) && cmdline.includes('preview') ? pid : null;
  } catch { return null; }
}
function portAvailable() {
  return new Promise((resolveAvailable, reject) => {
    const server = net.createServer();
    server.once('error', error => error.code === 'EADDRINUSE' ? resolveAvailable(false) : reject(error));
    server.listen(port, '127.0.0.1', () => server.close(() => resolveAvailable(true)));
  });
}
async function main() {
  const pid = await runningPid();
  if (action === 'stop') {
    if (pid) { process.kill(pid, 'SIGTERM'); await unlink(pidFile).catch(() => {}); console.log(`JariZip preview stopped (PID ${pid}).`); }
    else console.log('No owned JariZip preview process is running.');
    return;
  }
  if (action !== 'start') throw new Error('Use npm run preview:start or npm run preview:stop.');
  if (pid) { console.log(`JariZip preview already running: http://localhost:${port} (PID ${pid})`); return; }
  if (!await portAvailable()) throw new Error(`Port ${port} is occupied. The other process was not changed. Use npm run preview -- --port <free-port> instead.`);
  await readFile(resolve(root, 'dist/index.html'));
  await mkdir(runtime, { recursive: true });
  const log = await open(logFile, 'a');
  const child = spawn(process.execPath, [cli, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, detached: true, stdio: ['ignore', log.fd, log.fd] });
  await new Promise((resolveSpawn, reject) => { child.once('spawn', resolveSpawn); child.once('error', reject); });
  if (!child.pid) throw new Error('Preview process did not return a process ID.');
  await writeFile(pidFile, String(child.pid), { mode: 0o600 });
  child.unref();
  await log.close();
  const timeout = Date.now() + 12000;
  while (Date.now() < timeout) {
    try { const result = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) }); if (result.ok) { console.log(`JariZip preview: http://localhost:${port}\nProcess: ${child.pid}\nLog: ${logFile}\nStop only this preview: npm run preview:stop`); return; } } catch { /* Readiness retry. */ }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 150));
  }
  throw new Error(`Preview did not become ready. Check ${logFile}; no unrelated processes were changed.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
