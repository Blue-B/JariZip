// Browser/local-server credential store.
//
// In normal browser and `npm run dev`/`npm start` mode there is no Electron
// `safeStorage`, so the approved providers' configuration fields are persisted into
// the project's `.env.local` file. The same env object handed to `createJobService` is
// mutated in place, so a saved key is live immediately without a restart. Values are
// never returned to the renderer, logged, or placed in a URL — callers only ever
// see booleans from `providers()`.
//
// A provider may need one field (Saramin, Work24, Jooble, JOB-ALIO) or several
// (Wanted OpenAPI needs a client id and a client secret). `set()` accepts either a
// single string for a one-field provider or a `{ field: value }` map for any provider.
//
// The Electron desktop shell deliberately keeps its own encrypted store and IPC
// bridge; `createAppServer` exposes no credential route unless a store is passed
// explicitly, so the desktop host never reaches this module.
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Officially approved providers only. Jumpit/Zighang have no approved API and JobKorea's official API is organization/server-IP approval based, so none are credential providers here. */
export const PROVIDERS = Object.freeze(['saramin', 'work24', 'jooble', 'wanted', 'jobalio']);
/**
 * Required configuration fields per provider. `name` is the renderer-facing field key,
 * `env` is the environment variable the adapter reads at request time.
 */
export const PROVIDER_FIELDS = Object.freeze({
  saramin: Object.freeze([Object.freeze({ name: 'accessKey', env: 'SARAMIN_ACCESS_KEY' })]),
  work24: Object.freeze([Object.freeze({ name: 'authKey', env: 'WORK24_AUTH_KEY' })]),
  jooble: Object.freeze([Object.freeze({ name: 'apiKey', env: 'JOOBLE_API_KEY' })]),
  wanted: Object.freeze([
    Object.freeze({ name: 'clientId', env: 'WANTED_CLIENT_ID' }),
    Object.freeze({ name: 'clientSecret', env: 'WANTED_CLIENT_SECRET' }),
  ]),
  jobalio: Object.freeze([Object.freeze({ name: 'serviceKey', env: 'JOBALIO_SERVICE_KEY' })]),
});
/** Provider -> list of environment variable names (kept for callers that just mirror env). */
export const PROVIDER_ENV = Object.freeze(Object.fromEntries(PROVIDERS.map(provider => [provider, PROVIDER_FIELDS[provider].map(field => field.env)])));
/** Longest accepted credential. Real keys are far shorter; this only bounds abuse. */
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

const providerList = provider => PROVIDER_FIELDS[provider] || [];

/** Human-readable provider list for errors. */
const providerNames = () => PROVIDERS.map(provider => {
  const fields = providerList(provider).map(field => field.env).join('·');
  return `${provider}(${fields})`;
}).join(', ');

export function normalizeProvider(value) {
  if (typeof value !== 'string' || !PROVIDERS.includes(value)) {
    throw new CredentialError('BAD_PROVIDER', `API 설정은 ${providerNames()}에만 저장할 수 있어요.`);
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

/**
 * Normalize one provider's configuration into a `{ fieldName: value }` record.
 * A bare string is accepted only for single-field providers so existing callers and
 * one-key adapters keep working; every declared field must be present.
 */
export function normalizeFields(provider, input) {
  const id = normalizeProvider(provider);
  const fields = providerList(id);
  if (typeof input === 'string') {
    if (fields.length !== 1) throw new CredentialError('BAD_KEY', `${id}는 ${fields.length}개의 설정값이 필요해요.`);
    return { [fields[0].name]: normalizeKey(input) };
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CredentialError('BAD_KEY', 'API 설정값을 확인해주세요.');
  const record = {};
  for (const field of fields) {
    if (!Object.hasOwn(input, field.name)) throw new CredentialError('BAD_KEY', `${id}의 ${field.env} 값을 입력해주세요.`);
    record[field.name] = normalizeKey(input[field.name]);
  }
  return record;
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
    return providerList(provider).every(field => Boolean(env[field.env]));
  }

  function providers() {
    return PROVIDERS.map(provider => ({ provider, configured: configured(provider) }));
  }

  function set(provider, values) {
    const id = normalizeProvider(provider);
    const record = normalizeFields(id, values);
    for (const field of providerList(id)) {
      const value = record[field.name];
      writeFile(patchEnvText(readFile(), field.env, value));
      env[field.env] = value;
    }
    return { provider: id, configured: configured(id) };
  }

  function clear(provider) {
    const id = normalizeProvider(provider);
    const removed = configured(id);
    for (const field of providerList(id)) {
      writeFile(patchEnvText(readFile(), field.env, null));
      delete env[field.env];
    }
    return { provider: id, configured: false, removed };
  }

  return { file, configured, providers, set, clear };
}
