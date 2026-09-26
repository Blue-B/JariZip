import type { IncomingMessage, ServerResponse } from 'node:http';
export function createApiHandler(options?: { env?: NodeJS.ProcessEnv; service?: unknown }): (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
export function createAppServer(options?: { directory?: string; service?: unknown; env?: NodeJS.ProcessEnv }): import('node:http').Server;
