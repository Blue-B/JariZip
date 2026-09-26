// Local credential storage for the Electron desktop shell.
//
// Only two officially approved job sources can hold a key. Values are encrypted with
// Electron's `safeStorage`, which is backed by the OS keychain (DPAPI on Windows, the
// platform secret service on Linux). Plaintext keys never touch disk, logs, URLs or the
// renderer. This module is intentionally free of Electron imports so it can be tested in
// plain Node with an injected `safeStorage` implementation.
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_KEY_LENGTH, PROVIDER_ENV, PROVIDERS } from './providers.mjs';

export { MAX_KEY_LENGTH, PROVIDER_ENV, PROVIDERS };
export const STORE_VERSION = 1;
export const STORE_FILE = 'api-keys.json';

export class CredentialError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CredentialError';
    this.code = code;
  }
}

export function normalizeProvider(value) {
  if (typeof value !== 'string' || !PROVIDERS.includes(value)) {
    throw new CredentialError('BAD_PROVIDER', 'API 키는 고용24(work24)와 사람인(saramin)에만 설정할 수 있어요.');
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
        if (typeof value === 'string' && value) entries[provider] = value;
      }
      return entries;
    } catch {
      logger.warn?.('[credentials] 저장된 API 키 파일을 읽지 못했습니다. 다시 입력해주세요.');
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

  /** Decrypted value for main-process use only. Never hand this to the renderer. */
  function get(provider) {
    const id = normalizeProvider(provider);
    const ciphertext = readCiphertext()[id];
    if (!ciphertext || !encryptionAvailable()) return null;
    try {
      const value = safeStorage.decryptString(Buffer.from(ciphertext, 'base64'));
      return typeof value === 'string' && value.trim() ? value.trim() : null;
    } catch {
      // A different OS user or a reset keychain can make old ciphertext unreadable.
      logger.warn?.(`[credentials] ${id} 키를 해독하지 못했습니다. 다시 입력해주세요.`);
      return null;
    }
  }

  function set(provider, key) {
    const id = normalizeProvider(provider);
    const value = normalizeKey(key);
    if (!encryptionAvailable()) {
      throw new CredentialError('ENCRYPTION_UNAVAILABLE', '이 PC의 보안 저장소를 사용할 수 없어 API 키를 안전하게 보관하지 못했어요.');
    }
    if (storageBackend() === 'basic_text') {
      logger.warn?.('[credentials] 운영체제 보안 저장소 대신 기본 보관 방식을 사용합니다.');
    }
    const entries = readCiphertext();
    entries[id] = safeStorage.encryptString(value).toString('base64');
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
    return PROVIDERS.map(provider => ({ provider, configured: get(provider) !== null }));
  }

  return { file, get, set, clear, providers, encryptionAvailable, storageBackend };
}
