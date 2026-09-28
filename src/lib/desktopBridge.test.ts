import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  connectedProviders,
  getDesktopBridge,
  hasSeenApiSetupWizard,
  markApiSetupWizardSeen,
  normalizeApiKeyStatus,
  shouldAutoOpenApiWizard,
  API_SETUP_SEEN_KEY,
} from './desktopBridge';

const desktop = (globalThis as { jarizipDesktop?: unknown });
afterEach(() => {
  delete desktop.jarizipDesktop;
  vi.unstubAllGlobals();
});

const noneConfigured = { work24: false, saramin: false, jooble: false };

describe('normalizeApiKeyStatus', () => {
  it('accepts the documented flat boolean status', () => {
    expect(normalizeApiKeyStatus({ work24: true, saramin: false, jooble: true })).toEqual({ work24: true, saramin: false, jooble: true });
  });
  it('accepts the shipped providers list without inventing results', () => {
    expect(normalizeApiKeyStatus({ providers: [
      { provider: 'saramin', configured: true },
      { provider: 'work24', configured: false },
      { provider: 'jooble', configured: true },
      { provider: 'wanted', configured: true },
    ], encryptionAvailable: true })).toEqual({ work24: false, saramin: true, jooble: true });
  });
  it('rejects malformed or unknown payloads instead of guessing', () => {
    for (const value of [null, undefined, 'work24', 7, {}, { providers: [] }, { providers: [{ provider: 'nope', configured: true }] }, { work24: 'yes', saramin: false, jooble: false }, { work24: true, saramin: false }]) {
      expect(normalizeApiKeyStatus(value)).toBeNull();
    }
  });
});

describe('getDesktopBridge', () => {
  it('returns null in normal browser / local-server mode', () => {
    expect(getDesktopBridge()).toBeNull();
  });
  it('refuses a partial contract so the wizard never half-works', () => {
    desktop.jarizipDesktop = { getApiKeyStatus: async () => ({ ...noneConfigured }) };
    expect(getDesktopBridge()).toBeNull();
  });
  it('normalizes the documented contract and never surfaces a key', async () => {
    const setApiKey = vi.fn(async () => ({ ok: true }));
    desktop.jarizipDesktop = {
      getInfo: async () => ({ platform: 'win32', version: '0.1.0' }),
      getApiKeyStatus: async () => ({ ...noneConfigured }),
      setApiKey,
      clearApiKey: async () => ({ ok: true }),
      openExternal: async () => undefined,
    };
    const bridge = getDesktopBridge();
    expect(bridge).not.toBeNull();
    expect(await bridge!.getInfo()).toEqual({ platform: 'win32', version: '0.1.0' });
    expect(await bridge!.getApiKeyStatus()).toEqual({ ...noneConfigured });
    expect(await bridge!.setApiKey('work24', 'secret-test-key')).toEqual({ ok: true });
    expect(setApiKey).toHaveBeenCalledWith('work24', 'secret-test-key');
  });
  it('normalizes the shipped getPlatform + providers status contract', async () => {
    desktop.jarizipDesktop = {
      getPlatform: async () => ({ platform: 'darwin', version: '9.9.9' }),
      getApiKeyStatus: async () => ({ providers: [{ provider: 'work24', configured: true }, { provider: 'saramin', configured: false }, { provider: 'jooble', configured: false }], encryptionAvailable: true }),
      setApiKey: async () => ({ provider: 'work24', configured: true }),
      clearApiKey: async () => ({ provider: 'work24', configured: false }),
      openExternal: async () => ({ opened: true }),
    };
    const bridge = getDesktopBridge()!;
    expect(await bridge.getInfo()).toEqual({ platform: 'darwin', version: '9.9.9' });
    expect(await bridge.getApiKeyStatus()).toEqual({ work24: true, saramin: false, jooble: false });
  });
  it('converts a rejected write into a plain failure result', async () => {
    desktop.jarizipDesktop = {
      getInfo: async () => ({ platform: 'linux', version: '1' }),
      getApiKeyStatus: async () => ({ ...noneConfigured }),
      setApiKey: async () => { throw new Error('디스크 암호화를 사용할 수 없어요.'); },
      clearApiKey: async () => ({ ok: true }),
      openExternal: async () => undefined,
    };
    const bridge = getDesktopBridge()!;
    expect(await bridge.setApiKey('saramin', 'x')).toEqual({ ok: false, message: '디스크 암호화를 사용할 수 없어요.' });
  });
  it('treats an explicit ok:false payload as a failure with its message', async () => {
    desktop.jarizipDesktop = {
      getInfo: async () => ({ platform: 'linux', version: '1' }),
      getApiKeyStatus: async () => ({ ...noneConfigured }),
      setApiKey: async () => ({ ok: false, message: '키를 저장하지 못했어요.' }),
      clearApiKey: async () => ({ ok: false, message: '해제 실패' }),
      openExternal: async () => undefined,
    };
    const bridge = getDesktopBridge()!;
    expect(await bridge.setApiKey('work24', 'x')).toEqual({ ok: false, message: '키를 저장하지 못했어요.' });
    expect(await bridge.clearApiKey('work24')).toEqual({ ok: false, message: '해제 실패' });
  });
});

describe('first-run decision', () => {
  it('opens only when no approved source is configured and it was never shown', () => {
    expect(shouldAutoOpenApiWizard(null, false)).toBe(false);
    expect(shouldAutoOpenApiWizard({ ...noneConfigured }, false)).toBe(true);
    expect(shouldAutoOpenApiWizard({ ...noneConfigured }, true)).toBe(false);
    expect(shouldAutoOpenApiWizard({ ...noneConfigured, work24: true }, false)).toBe(false);
    expect(shouldAutoOpenApiWizard({ ...noneConfigured, saramin: true }, false)).toBe(false);
    expect(shouldAutoOpenApiWizard({ ...noneConfigured, jooble: true }, false)).toBe(false);
  });
  it('reports connected providers in a stable order', () => {
    expect(connectedProviders(null)).toEqual([]);
    expect(connectedProviders({ ...noneConfigured, work24: true })).toEqual(['work24']);
    expect(connectedProviders({ work24: true, saramin: true, jooble: true })).toEqual(['work24', 'saramin', 'jooble']);
    expect(connectedProviders({ ...noneConfigured, jooble: true })).toEqual(['jooble']);
  });
  it('reads and writes only the non-secret marker, never a key', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
    });
    expect(hasSeenApiSetupWizard()).toBe(false);
    markApiSetupWizardSeen();
    expect(hasSeenApiSetupWizard()).toBe(true);
    expect(store.get(API_SETUP_SEEN_KEY)).toBe('1');
    expect([...store.values()].join('')).not.toMatch(/key|secret|token/i);
  });
});
