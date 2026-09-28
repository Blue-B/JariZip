// Shared provider constants.
//
// This is the only module both the sandboxed preload and the main-process credential store
// import. It intentionally has no Node or Electron imports, so loading the preload never
// pulls filesystem or crypto code into the renderer process.
/** Approved providers only. Jumpit/Zighang/JobKorea have no agreed API permission. */
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
/** Provider -> list of environment variable names. */
export const PROVIDER_ENV = Object.freeze(Object.fromEntries(PROVIDERS.map(provider => [provider, PROVIDER_FIELDS[provider].map(field => field.env)])));
/** Longest accepted credential. Real keys are far shorter; this only bounds abuse. */
export const MAX_KEY_LENGTH = 512;
