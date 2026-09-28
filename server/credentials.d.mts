export type CredentialProvider = 'saramin' | 'work24' | 'jooble' | 'wanted' | 'jobalio';
export type CredentialFieldName = 'accessKey' | 'authKey' | 'apiKey' | 'clientId' | 'clientSecret' | 'serviceKey';
export interface CredentialField { name: CredentialFieldName; env: string }
export interface ProviderStatus { provider: CredentialProvider; configured: boolean }
export class CredentialError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string);
}
export const PROVIDERS: readonly CredentialProvider[];
export const PROVIDER_FIELDS: Readonly<Record<CredentialProvider, readonly CredentialField[]>>;
export const PROVIDER_ENV: Readonly<Record<CredentialProvider, readonly string[]>>;
export const MAX_KEY_LENGTH: number;
export const MAX_BODY_BYTES: number;
export const ENV_FILE: string;
export function normalizeProvider(value: unknown): CredentialProvider;
export function normalizeKey(value: unknown): string;
export function normalizeFields(provider: unknown, input: unknown): Record<string, string>;
export function patchEnvText(text: string | null | undefined, name: string, value: string | null): string;
export function createEnvCredentialStore(options: { file: string; env?: Record<string, string | undefined>; logger?: Console }): {
  file: string;
  configured(provider: CredentialProvider): boolean;
  providers(): ProviderStatus[];
  set(provider: CredentialProvider, values: string | Record<string, string>): { provider: CredentialProvider; configured: boolean };
  clear(provider: CredentialProvider): { provider: CredentialProvider; configured: false; removed: boolean };
};
