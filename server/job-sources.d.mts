import type { Job } from '../src/lib/types.js';

export type SourceProvider = 'wanted' | 'saramin' | 'jumpit' | 'zighang';
export interface SourceConfiguration { id: SourceProvider; name: string; enabled: boolean; note: string }
export interface SourceResult { id: SourceProvider; name: string; count: number; status: 'ok' | 'error'; message?: string }
export interface SourceList { provider: SourceProvider | 'all'; jobs: Job[]; nextPage: number | null; checkedAt: string; warnings: string[]; cached: boolean; total?: number; sourceResults: SourceResult[]; nextCursor?: string | null }
export interface SourceDetail { job: Job; checkedAt: string; cached: boolean }
export class SourceError extends Error {
  status: number;
  code: string;
  constructor(message: string, status?: number, code?: string);
}
export function normalizeWanted(value: unknown, checkedAt: string): Job;
export function normalizeSaramin(value: unknown, checkedAt: string): Job;
export function normalizeJumpit(value: unknown, checkedAt: string): Job;
export function normalizeZighang(value: unknown, checkedAt: string): Job;
export function sourceConfiguration(env?: Record<string, string | undefined>): SourceConfiguration[];
export function createJobService(options?: { fetcher?: typeof fetch; env?: Record<string, string | undefined>; now?: () => Date }): {
  sources(): SourceConfiguration[];
  search(options?: { provider?: SourceProvider | 'all'; query?: string; page?: number; location?: string; category?: string; experience?: string; refresh?: boolean; cursor?: string }): Promise<SourceList>;
  detail(provider: SourceProvider, sourceId: string, refresh?: boolean): Promise<SourceDetail>;
};
