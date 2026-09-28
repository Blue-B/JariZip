// Local credential storage for the Electron desktop shell.
//
// Only officially approved job sources can hold configuration fields. Values are encrypted
// with Electron's `safeStorage`, which is backed by the OS keychain (DPAPI on Windows, the
// platform secret service on Linux). Plaintext values never touch disk, logs, URLs or the
// renderer. This module is intentionally free of Electron imports so it can be tested in
// plain Node with an injected `safeStorage` implementation.
//
// A provider may need one field (Saramin, Work24, Jooble, JOB-ALIO) or several (Wanted
// OpenAPI needs a client id and a client secret). On disk each provider maps field names to
// ciphertext; `get()` returns the decrypted `{ field: value }` record for main-process use.
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_KEY_LENGTH, PROVIDER_ENV, PROVIDER_FIELDS, PROVIDERS } from './providers.mjs';

export { MAX_KEY_LENGTH, PROVIDER_ENV, PROVIDER_FIELDS, PROVIDERS };
export const STORE_VERSION = 1;
export const STORE_FILE = 'api-keys.json';

export class CredentialError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CredentialError';
    this.code = code;
  }
}

const providerList = provider => PROVIDER_FIELDS[provider] || [];

export function normalizeProvider(value) {
  if (typeof value !== 'string' || !PROVIDERS.includes(value)) {
    throw new CredentialError('BAD_PROVIDER', 'API 설정은 사람인(saramin)·고용24(work24)·조블(jooble)·원티드(wanted)·잡알리오(jobalio)에만 저장할 수 있어요.');
  }
  return value;
}

/** Trim surrounding whitespace, reject empty, oversized or control-character values. */
export function normalizeKey(value) {
  if (typeof value !== 'string') throw new CredentialError('BAD_KEY', 'API 키는 문자열이어야 해요.');
  const key = value.trim();
  if (!key) throw new CredentialError('BAD_KEY', 'API 키를 입력해주세요.');
  if (key.length > MAX_KEY_LENGTH) throw new CredentialError('BAD_KEY', `API 키는 ${MAX_KEY_LENGTH}자를 넘을 수 없어요.`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(key)) throw new CredentialError('BAD_KEY', 'API 키에 사용할 수 없는 문자가 있어요.');
  return key;
}

/**
 * Normalize one provider's configuration into a `{ fieldName: value }` record.
 * A bare string is accepted only for single-field providers; every declared field must be present.
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

/**
 * Create the on-disk credential store.
 * @param {{ directory: string, safeStorage: object, logger?: Console }} options
 */
export function createCredentialStore({ directory, safeStorage, logger = console } = {}) {
  if (typeof directory !== 'string' || !directory) throw new Error('credential store requires a directory');
  if (!safeStorage || typeof safeStorage.encryptString !== 'function' || typeof safeStorage.decryptString !== 'function') {
    throw new Error('credential store requires Electron safeStorage');
  }
  const file = join(directory, STORE_FILE);

  const encryptionAvailable = () => {
    try { return safeStorage.isEncryptionAvailable() !== false; } catch { return false; }
  };
  const storageBackend = () => {
    try { return typeof safeStorage.getSelectedStorageBackend === 'function' ? safeStorage.getSelectedStorageBackend() : 'unknown'; }
    catch { return 'unknown'; }
  };

  /** Read the ciphertext map. Corrupt or foreign data is ignored, never rewritten eagerly. */
  function readCiphertext() {
    if (!existsSync(file)) return {};
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'));
      if (!parsed || parsed.version !== STORE_VERSION || typeof parsed.providers !== 'object' || !parsed.providers) return {};
      const entries = {};
      for (const provider of PROVIDERS) {
        const value = parsed.providers[provider];
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        const fields = {};
        for (const field of providerList(provider)) {
          if (typeof value[field.name] === 'string' && value[field.name]) fields[field.name] = value[field.name];
        }
        if (Object.keys(fields).length) entries[provider] = fields;
      }
      return entries;
    } catch {
      logger.warn?.('[credentials] 저장된 API 설정 파일을 읽지 못했습니다. 다시 입력해주세요.');
      return {};
    }
  }

  /** Atomic write: temp file in the same directory, 0600, then rename over the target. */
  function writeCiphertext(entries) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const body = `${JSON.stringify({ version: STORE_VERSION, providers: entries }, null, 2)}\n`;
    const temp = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
    writeFileSync(temp, body, { mode: 0o600 });
    try { chmodSync(temp, 0o600); } catch { /* Windows ignores POSIX modes. */ }
    renameSync(temp, file);
    try { chmodSync(file, 0o600); } catch { /* Windows ignores POSIX modes. */ }
  }

  function decrypt(value) {
    try {
      const text = safeStorage.decryptString(Buffer.from(value, 'base64'));
      return typeof text === 'string' && text.trim() ? text.trim() : null;
    } catch {
      // A different OS user or a reset keychain can make old ciphertext unreadable.
      return null;
    }
  }

  /** Decrypted `{ field: value }` record for main-process use only. Never hand this to the renderer. */
  function get(provider) {
    const id = normalizeProvider(provider);
    const ciphertext = readCiphertext()[id];
    if (!ciphertext || !encryptionAvailable()) return null;
    const record = {};
    for (const field of providerList(id)) {
      if (!ciphertext[field.name]) continue;
      const value = decrypt(ciphertext[field.name]);
      if (value) record[field.name] = value;
      else logger.warn?.(`[credentials] ${id} ${field.name} 값을 해독하지 못했습니다. 다시 입력해주세요.`);
    }
    return Object.keys(record).length ? record : null;
  }

  /** True only when every declared field for the provider is stored and readable. */
  function configured(provider) {
    const record = get(provider);
    return Boolean(record) && providerList(provider).every(field => Boolean(record[field.name]));
  }

  function set(provider, values) {
    const id = normalizeProvider(provider);
    const record = normalizeFields(id, values);
    if (!encryptionAvailable()) {
      throw new CredentialError('ENCRYPTION_UNAVAILABLE', '이 PC의 보안 저장소를 사용할 수 없어 API 키를 안전하게 보관하지 못했어요.');
    }
    if (storageBackend() === 'basic_text') {
      logger.warn?.('[credentials] 운영체제 보안 저장소 대신 기본 보관 방식을 사용합니다.');
    }
    const entries = readCiphertext();
    entries[id] = Object.fromEntries(providerList(id).map(field => [field.name, safeStorage.encryptString(record[field.name]).toString('base64')]));
    writeCiphertext(entries);
    return true;
  }

  function clear(provider) {
    const id = normalizeProvider(provider);
    const entries = readCiphertext();
    if (!Object.hasOwn(entries, id)) return false;
    delete entries[id];
    writeCiphertext(entries);
    return true;
  }

  /** Status only: booleans, never the secret or its ciphertext. */
  function providers() {
    return PROVIDERS.map(provider => ({ provider, configured: configured(provider) }));
  }

  return { file, get, configured, set, clear, providers, encryptionAvailable, storageBackend };
}
