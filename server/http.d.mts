import type { IncomingMessage, ServerResponse } from 'node:http';
export function createApiHandler(options?: { env?: NodeJS.ProcessEnv }): (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
