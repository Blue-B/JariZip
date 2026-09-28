import type { ApiProvider } from './desktopBridge';

/**
 * Official key-issuance pages only. Both the desktop wizard and the browser-mode
 * settings panel read this so the provider names, env variable names and guide
 * links stay identical. The app opens these pages for the user; it never
 * automates a signup or contacts a job site on its own.
 */
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
  },
};
