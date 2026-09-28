import type { ApiProvider } from './desktopBridge';

/**
 * Official key-issuance pages only. Both the desktop wizard and the browser-mode
 * settings panel read this so the provider names, env variable names and guide
 * links stay identical. The app opens these pages for the user; it never
 * automates a signup or contacts a job site on its own.
 *
 * `fields` is the list of configuration values a provider needs. Most providers
 * need one key; Wanted OpenAPI needs the documented client-id and client-secret
 * pair. Forms render one input per field and save them together.
 */
export interface ProviderCredentialField {
  /** Renderer-facing field key, matching the server credential store. */
  name: string;
  /** Human label shown next to the input. */
  label: string;
  /** Environment variable the server reads at request time. */
  env: string;
  hint?: string;
}

export interface ProviderGuide {
  id: ApiProvider;
  name: string;
  org: string;
  envKey: string;
  keyLabel: string;
  recommended: boolean;
  page: string;
  pageLabel: string;
  steps: string[];
  fields: ProviderCredentialField[];
}

export const PROVIDER_GUIDES: Record<ApiProvider, ProviderGuide> = {
  work24: {
    id: 'work24',
    name: '고용24',
    org: '한국고용정보원',
    envKey: 'WORK24_AUTH_KEY',
    keyLabel: '인증키',
    recommended: true,
    page: 'https://www.work24.go.kr/cm/e/a/0110/selectOpenApiIntro.do',
    pageLabel: '고용24 Open API 안내 열기',
    steps: [
      '고용24에 기업회원으로 로그인해요.',
      'Open API 서비스 이용을 신청해요.',
      '담당자 심사를 거쳐 인증키를 발급받아요.',
      '발급받은 인증키를 아래에 붙여넣어요.',
    ],
    fields: [{ name: 'authKey', label: '인증키', env: 'WORK24_AUTH_KEY' }],
  },
  saramin: {
    id: 'saramin',
    name: '사람인',
    org: '사람인',
    envKey: 'SARAMIN_ACCESS_KEY',
    keyLabel: 'access-key',
    recommended: false,
    page: 'https://oapi.saramin.co.kr/guide/info',
    pageLabel: '사람인 API 안내 열기',
    steps: [
      '사람인 채용정보 API 이용을 신청해요.',
      '승인을 받은 뒤 앱별 access-key를 발급받아요.',
      '발급받은 access-key를 아래에 붙여넣어요.',
    ],
    fields: [{ name: 'accessKey', label: 'access-key', env: 'SARAMIN_ACCESS_KEY' }],
  },
  jooble: {
    id: 'jooble',
    name: '조블',
    org: 'Jooble',
    envKey: 'JOOBLE_API_KEY',
    keyLabel: 'API 키',
    recommended: false,
    page: 'https://kr.jooble.org/api/about',
    pageLabel: '조블 API 안내 열기',
    steps: [
      '조블 API 페이지에서 API 키를 발급받아요.',
      '키는 서버에서만 보관하고 사용자 화면과 앱 로그에는 노출하지 않아요.',
      '발급받은 API 키를 아래에 붙여넣어요.',
    ],
    fields: [{ name: 'apiKey', label: 'API 키', env: 'JOOBLE_API_KEY' }],
  },
  wanted: {
    id: 'wanted',
    name: '원티드',
    org: '원티드랩',
    envKey: 'WANTED_CLIENT_ID · WANTED_CLIENT_SECRET',
    keyLabel: 'OpenAPI 인증 정보',
    recommended: false,
    page: 'https://openapi.wanted.jobs/apply/',
    pageLabel: '원티드 OpenAPI 인증 신청 열기',
    steps: [
      '원티드 OpenAPI 인증 신청 페이지에서 client-id와 client-secret을 신청해요.',
      '접수일 기준 3영업일 이내에 메일로 전달받아요.',
      '전달받은 client-id와 client-secret을 각각 아래에 붙여넣어요.',
    ],
    fields: [
      { name: 'clientId', label: 'client-id', env: 'WANTED_CLIENT_ID' },
      { name: 'clientSecret', label: 'client-secret', env: 'WANTED_CLIENT_SECRET' },
    ],
  },
  jobalio: {
    id: 'jobalio',
    name: '잡알리오',
    org: '재정경제부',
    envKey: 'JOBALIO_SERVICE_KEY',
    keyLabel: '일반 인증키',
    recommended: false,
    page: 'https://www.data.go.kr/data/15125273/openapi.do',
    pageLabel: '잡알리오 데이터셋 안내 열기',
    steps: [
      '공공데이터포털에 로그인해 공공기관 채용정보 조회서비스를 찾아요.',
      '활용신청 후 일반 인증키(serviceKey)를 발급받아요.',
      '발급받은 일반 인증키를 아래에 붙여넣어요.',
    ],
    fields: [{ name: 'serviceKey', label: '일반 인증키', env: 'JOBALIO_SERVICE_KEY' }],
  },
};
