// Headless desktop smoke test.
//
// Launches the real Electron main process against the built `dist/` assets, then asks the
// rendered page (through the preload bridge only) to confirm the shell is alive: the bridge
// exposes exactly the five agreed methods, and the credential status contains no keys.
// On a headless Linux box it wraps Electron in `xvfb-run` when DISPLAY is missing.
import { spawn, spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRIDGE_METHODS } from './ipc.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const electron = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
const EXPECTED = [...BRIDGE_METHODS].sort();

/** Run Electron once and resolve with the JSON object the main process prints. */
function launchElectron({ command, args, env }) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', rejectRun);
    child.once('exit', (code, signal) => resolveRun({ code, signal, stdout, stderr }));
  });
}

function parseReport(stdout) {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(stdout.slice(start, end + 1)); } catch { return null; }
}

async function main() {
  await access(join(root, 'dist', 'index.html'), constants.R_OK);
  const env = { ...process.env, JARIZIP_DESKTOP_SMOKE: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' };
  // Only the test harness relaxes Chromium's sandbox; the packaged app never sets this.
  const electronArgs = ['--no-sandbox', '--disable-gpu', 'desktop/main.mjs'];
  let command = electron;
  let args = electronArgs;
  if (process.platform === 'linux' && !process.env.DISPLAY) {
    // A bare container or CI runner has no X server; the virtual framebuffer is only used here.
    const available = spawnSync('xvfb-run', ['--help'], { stdio: 'ignore' }).status !== null;
    if (!available) throw new Error('A display or xvfb-run is required to smoke-test the Electron window on Linux.');
    command = 'xvfb-run';
    args = ['-a', '--server-args=-screen 0 1280x900x24', electron, ...electronArgs];
  }
  const run = await launchElectron({ command, args, env });
  const report = parseReport(run.stdout);
  if (!report || report.smoke !== 'ok') {
    console.error(run.stdout);
    console.error(run.stderr.slice(-2000));
    throw new Error(`Electron smoke test did not produce a report (exit ${run.code}).`);
  }
  const problems = [];
  if (report.bridge !== 'object') problems.push('preload bridge is not exposed');
  if (JSON.stringify(report.methods) !== JSON.stringify(EXPECTED)) problems.push(`bridge methods are ${JSON.stringify(report.methods)}, expected ${JSON.stringify(EXPECTED)}`);
  if (report.hasRoot !== true) problems.push('renderer root element is missing');
  if (typeof report.title !== 'string' || !report.title) problems.push('document title is missing');
  if (!report.platform || report.platform.platform !== process.platform) problems.push('platform payload is missing or wrong');
  if (typeof report.encryptionAvailable !== 'boolean') problems.push('encryption availability was not reported');
  const seen = values => values?.map(entry => entry.provider).join(',');
  if (seen(report.before?.providers) !== 'work24,saramin') problems.push('credential status does not cover both providers');
  if (typeof report.before?.providers?.[0]?.configured !== 'boolean') problems.push('credential status is not boolean-only');
  if (report.encryptionAvailable) {
    if (report.setError) problems.push(`setApiKey failed with a synthetic key: ${report.setError}`);
    if (report.during?.providers?.[0]?.configured !== true) problems.push('stored key was not reported as configured');
    if (report.after?.providers?.[0]?.configured !== false) problems.push('cleared key is still reported as configured');
  } else if (report.setError === null) {
    problems.push('setApiKey unexpectedly succeeded without OS encryption');
  }
  if (typeof report.badUrl !== 'string') problems.push('an http URL was not refused by openExternal');
  if (report.wizardVisible !== true) problems.push('the first-run API setup wizard did not open in the desktop shell');
  if (typeof report.wizardText !== 'string' || !report.wizardText.includes('이 기기에만 저장')) problems.push('the wizard copy does not explain on-device storage');
  if (String(report.browserStorage ?? '').includes('smoke-test-key')) problems.push('the synthetic key reached browser storage');
  if ((report.leakedEnv ?? []).length) problems.push('the synthetic key leaked into process.env');
  if (report.stillStored !== false) problems.push('the synthetic key is still present in the credential store');
  // The only secret-shaped token in the output must be nothing at all.
  if (/smoke-test-key/.test(run.stdout)) problems.push('the synthetic key text appeared in the smoke output');
  if (/"key"|"secret"|\baccess-key\b/i.test(run.stdout)) problems.push('smoke output looks like it contains credential text');
  if (problems.length) throw new Error(`Desktop smoke test failed:\n- ${problems.join('\n- ')}`);
  console.log(`desktop smoke ok · title=${JSON.stringify(report.title)} · bridge=${report.methods.join(',')} · encryptionAvailable=${report.encryptionAvailable}${report.encryptionAvailable ? ' · credential round-trip ok' : ' · credential storage correctly refused'}`);
  if (run.code !== 0) throw new Error(`Electron exited with code ${run.code} after the smoke report.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
