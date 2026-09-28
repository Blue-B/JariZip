// Browser/local-server credential store.
//
// In normal browser and `npm run dev`/`npm start` mode there is no Electron
// `safeStorage`, so Work24/Saramin keys are persisted into the project's
// `.env.local` file. The same env object handed to `createJobService` is mutated
// in place, so a saved key is live immediately without a restart. Values are
// never returned to the renderer, logged, or placed in a URL — callers only ever
// see booleans from `providers()`.
//
// The Electron desktop shell deliberately keeps its own encrypted store and IPC
// bridge; `createAppServer` exposes no credential route unless a store is passed
// explicitly, so the desktop host never reaches this module.
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Officially approved providers only. Wanted/Jumpit/Zighang have no agreed API permission. */
export const PROVIDERS = Object.freeze(['work24', 'saramin', 'jooble']);
/** Environment variable each provider adapter reads at request time. */
export const PROVIDER_ENV = Object.freeze({ work24: 'WORK24_AUTH_KEY', saramin: 'SARAMIN_ACCESS_KEY', jooble: 'JOOBLE_API_KEY' });
/** Longest accepted credential. Real Work24/Saramin keys are far shorter; this only bounds abuse. */
export const MAX_KEY_LENGTH = 512;
/** Upper bound for a credential request body, in bytes. */
export const MAX_BODY_BYTES = 4096;
/** Default persistence target, relative to the server process working directory. */
export const ENV_FILE = '.env.local';

export class CredentialError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CredentialError';
    this.code = code;
    this.status = code === 'BAD_PROVIDER' || code === 'BAD_KEY' ? 400 : 500;
  }
}

export function normalizeProvider(value) {
  if (typeof value !== 'string' || !PROVIDERS.includes(value)) {
    throw new CredentialError('BAD_PROVIDER', 'API 키는 고용24(work24)·사람인(saramin)·조블(jooble)에만 설정할 수 있어요.');
  }
  return value;
}

/**
 * Trim surrounding whitespace and reject empty, oversized or unsafe values.
 *
 * The key must round-trip through the env file exactly. It is written inside
 * single quotes, which Node's `process.loadEnvFile` treats literally, so only
 * control characters and a literal single quote (which cannot be escaped inside
 * single quotes) have to be refused. Everything else — spaces, `#`, `$`, `+`,
 * `/`, `=` and double quotes — is preserved.
 */
export function normalizeKey(value) {
  if (typeof value !== 'string') throw new CredentialError('BAD_KEY', 'API 키는 문자열이어야 해요.');
  const key = value.trim();
  if (!key) throw new CredentialError('BAD_KEY', 'API 키를 입력해주세요.');
  if (key.length > MAX_KEY_LENGTH) throw new CredentialError('BAD_KEY', `API 키는 ${MAX_KEY_LENGTH}자를 넘을 수 없어요.`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f']/.test(key)) throw new CredentialError('BAD_KEY', 'API 키에 사용할 수 없는 문자가 있어요.');
  return key;
}

const escapeForPattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Replace the provider's assignment in an env file body while preserving every
 * other line, comment and variable. `value === null` writes a cleared `NAME=`.
 */
export function patchEnvText(text, name, value) {
  const line = value === null ? `${name}=` : `${name}='${value}'`;
  const source = typeof text === 'string' ? text : '';
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source === '' ? [] : source.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const pattern = new RegExp(`^\\s*(?:export\\s+)?${escapeForPattern(name)}\\s*=`);
  let index = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (pattern.test(lines[i])) { index = i; break; }
  if (index >= 0) lines[index] = line;
  else lines.push(line);
  return `${lines.join(eol)}${eol}`;
}

/**
 * Create the browser-mode credential store.
 * @param {{ file: string, env?: Record<string, string | undefined>, logger?: Console }} options
 */
export function createEnvCredentialStore({ file, env = process.env, logger = console } = {}) {
  if (typeof file !== 'string' || !file) throw new Error('credential store requires a file path');
  if (!env || typeof env !== 'object') throw new Error('credential store requires an env object');

  const readFile = () => existsSync(file) ? readFileSync(file, 'utf8') : '';

  /** Atomic write: temp file in the same directory, 0600, then rename over the target. */
  function writeFile(body) {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
    writeFileSync(temp, body, { mode: 0o600 });
    try { chmodSync(temp, 0o600); } catch { /* Windows ignores POSIX modes. */ }
    renameSync(temp, file);
    try { chmodSync(file, 0o600); } catch { /* Windows ignores POSIX modes. */ }
  }

  /** Status only: booleans, never the secret value or the env-file contents. */
  function configured(provider) {
    return Boolean(env[PROVIDER_ENV[provider]]);
  }

  function providers() {
    return PROVIDERS.map(provider => ({ provider, configured: configured(provider) }));
  }

  function set(provider, key) {
    const id = normalizeProvider(provider);
    const value = normalizeKey(key);
    writeFile(patchEnvText(readFile(), PROVIDER_ENV[id], value));
    env[PROVIDER_ENV[id]] = value;
    return { provider: id, configured: true };
  }

  function clear(provider) {
    const id = normalizeProvider(provider);
    const removed = configured(id);
    writeFile(patchEnvText(readFile(), PROVIDER_ENV[id], null));
    delete env[PROVIDER_ENV[id]];
    return { provider: id, configured: false, removed };
  }

  return { file, configured, providers, set, clear };
}
