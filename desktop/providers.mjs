// Shared provider constants.
//
// This is the only module both the sandboxed preload and the main-process credential store
// import. It intentionally has no Node or Electron imports, so loading the preload never
// pulls filesystem or crypto code into the renderer process.
/** Officially approved providers only. Wanted/Jumpit/Zighang have no agreed API permission. */
export const PROVIDERS = Object.freeze(['work24', 'saramin']);
/** Environment variable each provider adapter reads at request time. */
export const PROVIDER_ENV = Object.freeze({ work24: 'WORK24_AUTH_KEY', saramin: 'SARAMIN_ACCESS_KEY' });
/** Longest accepted credential. Real Work24/Saramin keys are far shorter; this only bounds abuse. */
export const MAX_KEY_LENGTH = 512;
