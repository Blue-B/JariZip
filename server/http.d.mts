import type { IncomingMessage, ServerResponse } from 'node:http';
import type { createEnvCredentialStore } from './credentials.js';
type CredentialStore = ReturnType<typeof createEnvCredentialStore>;
export function createApiHandler(options?: { env?: NodeJS.ProcessEnv; service?: unknown; credentials?: CredentialStore | null }): (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
export function createAppServer(options?: { directory?: string; service?: unknown; env?: NodeJS.ProcessEnv; credentials?: CredentialStore | null }): import('node:http').Server;
