import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import net from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LOCAL_PORT = 4178;
export const LOCAL_URL = `http://localhost:${LOCAL_PORT}/`;

export function supportedNode(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  return Boolean(match && (Number(match[1]) > 22 || (Number(match[1]) === 22 && Number(match[2]) >= 12)));
}

export function parseFlags(args) {
  const allowed = new Set(['--check', '--prepare', '--no-browser']);
  if (args.some(arg => !allowed.has(arg))) throw new Error('사용할 수 있는 옵션: --check, --prepare, --no-browser');
  if (args.includes('--check') && args.includes('--prepare')) throw new Error('--check와 --prepare는 함께 사용할 수 없어요.');
  return { check: args.includes('--check'), prepare: args.includes('--prepare'), browser: !args.includes('--no-browser') };
}

export async function portAvailable(port = LOCAL_PORT) {
  return new Promise((resolveAvailable, reject) => {
    const probe = net.createServer();
    probe.once('error', error => error.code === 'EADDRINUSE' ? resolveAvailable(false) : reject(error));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolveAvailable(true)));
  });
}

function runNpm(args) {
  // Commands and arguments here are fixed by this program, never external input.
  return new Promise((resolveRun, reject) => {
    const child = spawn('npm', args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    child.once('error', () => reject(new Error('npm을 실행하지 못했어요. Node.js와 npm 설치를 확인해주세요.')));
    child.once('exit', code => code === 0 ? resolveRun() : reject(new Error(`npm ${args.join(' ')} 작업이 끝나지 않았어요. 위 오류를 확인해주세요.`)));
  });
}

function openBrowser() {
  // User-invoked launcher only. Automated verification uses --no-browser.
  const [command, args] = process.platform === 'win32'
    ? ['cmd.exe', ['/d', '/c', 'start', '', LOCAL_URL]]
    : process.platform === 'darwin' ? ['open', [LOCAL_URL]] : ['xdg-open', [LOCAL_URL]];
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.once('error', () => console.log(`브라우저에서 ${LOCAL_URL} 를 직접 열어주세요.`));
  child.unref();
}

export async function main(args = process.argv.slice(2)) {
  const flags = parseFlags(args);
  if (!supportedNode(process.versions.node)) throw new Error('Node.js 22.12 이상이 필요해요. Node.js를 설치하거나 업데이트한 뒤 다시 실행해주세요.');
  await access(resolve(root, 'package.json'), constants.R_OK);
  await access(resolve(root, 'package-lock.json'), constants.R_OK);
  console.log(`Node.js ${process.versions.node} · 프로젝트 파일 확인 완료`);
  console.log(`자료를 계속 같은 곳에서 열 수 있도록 ${LOCAL_URL} 주소를 사용합니다.`);
  if (flags.check) {
    const free = await portAvailable();
    console.log(free ? '로컬 실행 포트를 사용할 수 있어요.' : '4178 포트가 사용 중이에요. 기존 자리집 실행 여부를 확인해주세요. 다른 프로세스는 종료하지 않았어요.');
    return;
  }
  if (!flags.prepare && !await portAvailable()) {
    throw new Error('4178 포트가 사용 중이에요. 기존 자리집 창을 확인하거나 직접 종료한 뒤 다시 실행해주세요. 자료 위치가 달라질 수 있어 다른 포트로 자동 변경하지 않았어요.');
  }
  let installed = true;
  try { await access(resolve(root, 'node_modules/.package-lock.json')); } catch { installed = false; }
  if (!installed) {
    console.log('첫 실행에 필요한 패키지를 설치합니다. 인터넷 연결이 필요해요.');
    await runNpm(['ci']);
  }
  console.log('화면을 준비합니다. 기존 브라우저 자료는 변경하지 않아요.');
  await runNpm(['run', 'build']);
  if (flags.prepare) { console.log('준비가 끝났어요. 시작 파일을 실행하면 자리집을 열 수 있어요.'); return; }
  // Local entry point deliberately pins the interface/port. Public hosting is not
  // enabled by this launcher and no secret or environment value is printed.
  const child = spawn(process.execPath, ['server/index.mjs', '--port', String(LOCAL_PORT)], {
    cwd: root, stdio: 'inherit', env: { ...process.env, JARIZIP_HOST: '127.0.0.1' },
  });
  let exited = false;
  const finish = new Promise((resolveExit, reject) => {
    child.once('error', error => { exited = true; reject(error); });
    child.once('exit', code => { exited = true; code && code !== 0 ? reject(new Error('자리집 서버가 오류로 종료됐어요.')) : resolveExit(); });
  });
  // Handle rejection even if the process exits during readiness checks.
  void finish.catch(() => {});
  const stop = () => { if (!exited) child.kill('SIGTERM'); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    const deadline = Date.now() + 15000;
    let ready = false;
    while (!exited && Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${LOCAL_PORT}/api/sources`, { signal: AbortSignal.timeout(1200) });
        const payload = response.ok ? await response.json() : null;
        if (Array.isArray(payload?.sources) && payload.personalDocumentsSent === false) { ready = true; break; }
      } catch { /* retry only while the owned server is starting */ }
      await new Promise(resolveWait => setTimeout(resolveWait, 150));
    }
    if (!ready && !exited) { stop(); throw new Error('서버가 준비되지 않았어요. 위 오류를 확인해주세요.'); }
    if (ready) {
      console.log(`자리집: ${LOCAL_URL}\n이 터미널을 유지해주세요. 종료는 Ctrl+C입니다.`);
      if (flags.browser) openBrowser();
    }
    await finish;
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
