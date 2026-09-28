import type { Job } from '../src/lib/types.js';
import type { XmlNode } from './xml.js';

export type SourceProvider = 'wanted' | 'saramin' | 'jumpit' | 'zighang' | 'jobkorea' | 'work24' | 'jooble' | 'jobalio';
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
/** Official Wanted OpenAPI V1 list item or detail record. */
export function normalizeWantedOpenApi(value: unknown, checkedAt: string): Job;
export function normalizeSaramin(value: unknown, checkedAt: string): Job;
export function normalizeJumpit(value: unknown, checkedAt: string): Job;
export function normalizeZighang(value: unknown, checkedAt: string): Job;
export function normalizeJooble(value: unknown, checkedAt: string): Job;
/** JOB-ALIO (잡알리오) data.go.kr list item, list-only. */
export function normalizeJobAlio(value: unknown, checkedAt: string): Job;
/** Normalize either a Work24 `<wanted>` list node or a `<wantedDtl>` detail node. */
export function normalizeWork24(value: XmlNode, checkedAt: string): Job;
export function normalizeWork24ListItem(node: XmlNode, checkedAt: string): Job;
export function normalizeWork24Detail(node: XmlNode, checkedAt: string): Job;
export const WORK24_LIST_URL: string;
export const WORK24_DETAIL_URL: string;
export const WORK24_PAGE_SIZE: number;
export const WORK24_MAX_PAGE: number;
export const JOOBLE_SEARCH_URL: string;
export const JOOBLE_PAGE_SIZE: number;
export const JOOBLE_CACHE_TTL_MS: number;
export const WANTED_LIST_URL: string;
export const WANTED_DETAIL_URL: string;
export const WANTED_PAGE_SIZE: number;
export const JOBALIO_LIST_URL: string;
export const JOBALIO_PAGE_SIZE: number;
export const JOBALIO_CACHE_TTL_MS: number;
export function normalizeServiceKey(value: unknown): string;
export const UNAPPROVED_SOURCES: readonly SourceProvider[];
export const APPROVED_SOURCES: readonly SourceProvider[];
export function sourceConfiguration(env?: Record<string, string | undefined>): SourceConfiguration[];
export function createJobService(options?: { fetcher?: typeof fetch; env?: Record<string, string | undefined>; now?: () => Date }): {
  sources(): SourceConfiguration[];
  search(options?: { provider?: SourceProvider | 'all'; query?: string; page?: number; location?: string; category?: string; experience?: string; refresh?: boolean; cursor?: string }): Promise<SourceList>;
  detail(provider: SourceProvider, sourceId: string, refresh?: boolean): Promise<SourceDetail>;
};
