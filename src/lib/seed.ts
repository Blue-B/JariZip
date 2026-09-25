import type {
  Application,
  DocumentRecord,
  DocumentTemplate,
  Job,
  PracticeEntry,
  WorkspaceState,
} from './types';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;

function isoDaysFromNow(days: number, hour = 9): string {
  const date = new Date(Date.now() + days * DAY_MS);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function dateOnlyDaysFromNow(days: number): string {
  return isoDaysFromNow(days).slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Documents                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Four demo document groups. Every record is explicitly `isDemo: true` and
 * contains only fictional, generic content. Versions matter: a newer version
 * is intentionally never referenced by a submission so grounding can be tested.
 */
function createDemoDocuments(): DocumentRecord[] {
  const base = Date.now();
  const at = (days: number) => new Date(base - days * DAY_MS).toISOString();

  return [
    {
      id: 'doc-resume-v1',
      groupId: 'group-resume',
      title: '샘플 이력서 (1차)',
      kind: '이력서',
      version: 1,
      text:
        '가상의 지원자 이력서입니다. 백엔드 API 개발 경험과 Python, FastAPI, SQL, Docker 사용 경험을 정리했습니다. 실제 인물 정보가 아닙니다.',
      createdAt: at(40),
      isDemo: true,
    },
    {
      id: 'doc-resume-v2',
      groupId: 'group-resume',
      title: '샘플 이력서 (2차)',
      kind: '이력서',
      version: 2,
      text:
        '가상의 지원자 이력서 2차 버전입니다. 주문 API 응답 시간을 320ms에서 90ms로 줄인 가상의 개선 사례를 추가했습니다. 실제 인물 정보가 아닙니다.',
      createdAt: at(18),
      isDemo: true,
    },
    {
      id: 'doc-cover-v1',
      groupId: 'group-cover',
      title: '샘플 자기소개서 (1차)',
      kind: '자기소개서',
      version: 1,
      text:
        '가상의 자기소개서입니다. 협업과 문서화를 중요하게 생각한다는 내용을 담았습니다. 실제 지원자가 작성한 글이 아닙니다.',
      createdAt: at(36),
      isDemo: true,
    },
    {
      id: 'doc-cover-v2',
      groupId: 'group-cover',
      title: '샘플 자기소개서 (2차)',
      kind: '자기소개서',
      version: 2,
      text:
        '가상의 자기소개서 2차 버전입니다. 장애 대응 경험과 회고 문화에 대한 생각을 추가했습니다. 실제 지원자가 작성한 글이 아닙니다.',
      createdAt: at(15),
      isDemo: true,
    },
    {
      id: 'doc-career-v1',
      groupId: 'group-career',
      title: '샘플 경력기술서',
      kind: '경력기술서',
      version: 1,
      text:
        '가상의 경력기술서입니다. 결제 서비스의 배치 작업을 개선한 가상의 프로젝트를 정리했습니다. 실제 회사나 프로젝트가 아닙니다.',
      createdAt: at(30),
      isDemo: true,
    },
    {
      id: 'doc-portfolio-v1',
      groupId: 'group-portfolio',
      title: '샘플 포트폴리오 (1차)',
      kind: '포트폴리오',
      version: 1,
      text:
        '가상의 포트폴리오입니다. 사내 관리 도구를 만든 가상의 사이드 프로젝트를 소개합니다. 실제 결과물이 아닙니다.',
      createdAt: at(28),
      isDemo: true,
    },
    {
      id: 'doc-portfolio-v2',
      groupId: 'group-portfolio',
      title: '샘플 포트폴리오 (2차)',
      kind: '포트폴리오',
      version: 2,
      text:
        '가상의 포트폴리오 2차 버전입니다. 아직 어떤 지원에도 제출하지 않은 최신 버전입니다. 실제 결과물이 아닙니다.',
      createdAt: at(6),
      isDemo: true,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Jobs                                                                       */
/* -------------------------------------------------------------------------- */

function createDemoJob(partial: Omit<Job, 'isDemo' | 'verification' | 'verifiedAt'>): Job {
  return {
    ...partial,
    verification: 'demo',
    verifiedAt: '',
    isDemo: true,
  };
}

function createDemoJobs(): Job[] {
  return [
    createDemoJob({
      id: 'job-1',
      company: '모래언덕소프트 (가상)',
      title: '백엔드 개발자',
      role: '백엔드 개발',
      location: '서울 성동구',
      experience: '경력 2년 이상',
      employment: '정규직',
      salary: '연 4,500만원~6,000만원',
      skills: ['Python', 'FastAPI', 'SQL', 'Docker'],
      publishedAt: dateOnlyDaysFromNow(-6),
      deadline: dateOnlyDaysFromNow(21),
      status: 'open',
      sourceUrl: 'https://example.com/demo/jobs/1',
      source: '가상 채용 사이트',
      description:
        '가상의 커머스 서비스 백엔드 API를 개발합니다. 실제 공고가 아닙니다.',
      requirements: 'Python과 FastAPI로 API를 설계·운영한 경험. SQL 튜닝 경험.',
      benefits: '재택 근무, 자기계발비 (가상)',
      companyInfo: '가상의 커머스 스타트업입니다. 실제 회사가 아닙니다.',
      saved: true,
      color: 'blue',
    }),
    createDemoJob({
      id: 'job-2',
      company: '푸른고래랩 (가상)',
      title: '프론트엔드 개발자',
      role: '프론트엔드 개발',
      location: '서울 강남구',
      experience: '경력 3년 이상',
      employment: '정규직',
      salary: '연 5,000만원~7,000만원',
      skills: ['React', 'TypeScript', 'CSS'],
      publishedAt: dateOnlyDaysFromNow(-10),
      deadline: dateOnlyDaysFromNow(12),
      status: 'open',
      sourceUrl: 'https://example.com/demo/jobs/2',
      source: '가상 채용 사이트',
      description: '가상의 협업 도구 웹 앱을 개발합니다. 실제 공고가 아닙니다.',
      requirements: 'React와 TypeScript 기반 서비스 개발 경험.',
      benefits: '유연 근무 (가상)',
      companyInfo: '가상의 생산성 도구 회사입니다. 실제 회사가 아닙니다.',
      saved: false,
      color: 'green',
    }),
    createDemoJob({
      id: 'job-3',
      company: '느린구름데이터 (가상)',
      title: '데이터 엔지니어',
      role: '데이터 엔지니어링',
      location: '원격 근무',
      experience: '경력 2년 이상',
      employment: '정규직',
      salary: '연 5,500만원~7,500만원',
      skills: ['Python', 'SQL', 'Airflow', 'Docker'],
      publishedAt: dateOnlyDaysFromNow(-4),
      deadline: dateOnlyDaysFromNow(25),
      status: 'open',
      sourceUrl: 'https://example.com/demo/jobs/3',
      source: '가상 채용 사이트',
      description: '가상의 데이터 파이프라인을 구축·운영합니다. 실제 공고가 아닙니다.',
      requirements: '배치 파이프라인 구축 경험과 SQL 활용 능력.',
      benefits: '원격 근무, 장비 지원 (가상)',
      companyInfo: '가상의 데이터 플랫폼 회사입니다. 실제 회사가 아닙니다.',
      saved: true,
      color: 'orange',
    }),
    createDemoJob({
      id: 'job-4',
      company: '조용한숲분석 (가상)',
      title: '데이터 분석가',
      role: '데이터 분석',
      location: '서울 마포구',
      experience: '신입 가능',
      employment: '정규직',
      salary: '연 3,800만원~5,000만원',
      skills: ['SQL', 'Python', 'Tableau'],
      publishedAt: dateOnlyDaysFromNow(-14),
      deadline: dateOnlyDaysFromNow(7),
      status: 'open',
      sourceUrl: 'https://example.com/demo/jobs/4',
      source: '가상 채용 사이트',
      description: '가상의 제품 지표를 분석합니다. 실제 공고가 아닙니다.',
      requirements: 'SQL로 데이터를 추출하고 지표를 해석한 경험.',
      benefits: '교육비 지원 (가상)',
      companyInfo: '가상의 분석 컨설팅 회사입니다. 실제 회사가 아닙니다.',
      saved: false,
      color: 'violet',
    }),
    createDemoJob({
      id: 'job-5',
      company: '밤하늘스튜디오 (가상)',
      title: '프로덕트 디자이너',
      role: '프로덕트 디자인',
      location: '서울 서초구',
      experience: '경력 3년 이상',
      employment: '정규직',
      salary: '연 5,000만원~6,800만원',
      skills: ['Figma', '프로토타이핑', '디자인 시스템'],
      publishedAt: dateOnlyDaysFromNow(-20),
      deadline: dateOnlyDaysFromNow(3),
      status: 'open',
      sourceUrl: 'https://example.com/demo/jobs/5',
      source: '가상 채용 사이트',
      description: '가상의 B2B 제품 디자인을 담당합니다. 실제 공고가 아닙니다.',
      requirements: 'Figma 기반 제품 디자인과 디자인 시스템 운영 경험.',
      benefits: '장비 선택권 (가상)',
      companyInfo: '가상의 디자인 스튜디오입니다. 실제 회사가 아닙니다.',
      saved: true,
      color: 'ink',
    }),
    createDemoJob({
      id: 'job-6',
      company: '작은등대리서치 (가상)',
      title: 'UX 리서처',
      role: 'UX 리서치',
      location: '서울 종로구',
      experience: '경력 2년 이상',
      employment: '계약직',
      salary: '연 4,200만원~5,400만원',
      skills: ['사용자 인터뷰', '설문 설계', '데이터 분석'],
      publishedAt: dateOnlyDaysFromNow(-8),
      deadline: dateOnlyDaysFromNow(18),
      status: 'open',
      sourceUrl: 'https://example.com/demo/jobs/6',
      source: '가상 채용 사이트',
      description: '가상의 사용자 리서치를 설계하고 수행합니다. 실제 공고가 아닙니다.',
      requirements: '정성·정량 리서치 설계 및 결과 공유 경험.',
      benefits: '도서 구입비 (가상)',
      companyInfo: '가상의 UX 리서치 회사입니다. 실제 회사가 아닙니다.',
      saved: false,
      color: 'blue',
    }),
    createDemoJob({
      id: 'job-7',
      company: '고요한항해기획 (가상)',
      title: '서비스 기획자',
      role: '서비스 기획',
      location: '서울 영등포구',
      experience: '경력 3년 이상',
      employment: '정규직',
      salary: '연 4,800만원~6,200만원',
      skills: ['요구사항 정의', '데이터 분석', 'SQL'],
      publishedAt: dateOnlyDaysFromNow(-12),
      deadline: dateOnlyDaysFromNow(9),
      status: 'open',
      sourceUrl: 'https://example.com/demo/jobs/7',
      source: '가상 채용 사이트',
      description: '가상의 구독 서비스를 기획합니다. 실제 공고가 아닙니다.',
      requirements: '데이터를 근거로 기능을 정의하고 개선한 경험.',
      benefits: '점심 지원 (가상)',
      companyInfo: '가상의 구독 서비스 회사입니다. 실제 회사가 아닙니다.',
      saved: false,
      color: 'green',
    }),
    createDemoJob({
      id: 'job-8',
      company: '이끼숲사이언스 (가상)',
      title: '데이터 사이언티스트',
      role: '데이터 사이언스',
      location: '원격 근무',
      experience: '경력 4년 이상',
      employment: '정규직',
      salary: '연 6,500만원~8,500만원',
      skills: ['Python', 'SQL', '머신러닝', 'Docker'],
      publishedAt: dateOnlyDaysFromNow(-25),
      deadline: dateOnlyDaysFromNow(30),
      status: 'open',
      sourceUrl: 'https://example.com/demo/jobs/8',
      source: '가상 채용 사이트',
      description: '가상의 예측 모델을 개발합니다. 실제 공고가 아닙니다.',
      requirements: '머신러닝 모델을 서비스에 적용한 경험.',
      benefits: '원격 근무 (가상)',
      companyInfo: '가상의 머신러닝 회사입니다. 실제 회사가 아닙니다.',
      saved: true,
      color: 'violet',
    }),
    createDemoJob({
      id: 'job-9',
      company: '오래된나무플랫폼 (가상)',
      title: '플랫폼 엔지니어',
      role: '플랫폼 엔지니어링',
      location: '경기 판교',
      experience: '경력 5년 이상',
      employment: '정규직',
      salary: '연 7,000만원~9,000만원',
      skills: ['Kubernetes', 'Docker', 'Terraform', 'Python'],
      publishedAt: dateOnlyDaysFromNow(-30),
      deadline: dateOnlyDaysFromNow(-2),
      status: 'closed',
      sourceUrl: 'https://example.com/demo/jobs/9',
      source: '가상 채용 사이트',
      description: '가상의 내부 개발 플랫폼을 운영합니다. 실제 공고가 아닙니다.',
      requirements: '컨테이너 기반 인프라 운영 경험.',
      benefits: '사내 카페 (가상)',
      companyInfo: '가상의 플랫폼 회사입니다. 실제 회사가 아닙니다.',
      saved: false,
      color: 'orange',
    }),
  ];
}

/* -------------------------------------------------------------------------- */
/* Applications                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Five demo applications spread across preparing/applied/interview/offer.
 * Submission document IDs are fixed literals so grounding never depends on
 * "the newest document in a group".
 */
function createDemoApplications(jobs: Job[]): Application[] {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const snapshot = (jobId: string): Job => {
    const job = byId.get(jobId);
    if (!job) throw new Error(`데모 공고를 찾을 수 없습니다: ${jobId}`);
    return structuredClone(job);
  };

  const base = Date.now();
  const at = (days: number) => new Date(base - days * DAY_MS).toISOString();

  return [
    {
      id: 'app-1',
      jobId: 'job-1',
      jobSnapshot: snapshot('job-1'),
      stage: 'preparing',
      createdAt: at(6),
      interviewAt: '',
      notes: '가상 메모: 지원 전에 포트폴리오 2차 버전을 다듬을 예정입니다.',
      submissions: [],
      isDemo: true,
    },
    {
      id: 'app-2',
      jobId: 'job-2',
      jobSnapshot: snapshot('job-2'),
      stage: 'applied',
      createdAt: at(11),
      interviewAt: '',
      notes: '가상 메모: 이력서 1차와 자기소개서 1차를 제출한 상태입니다.',
      submissions: [
        {
          id: 'submission-2-a',
          createdAt: at(10),
          // Intentionally the older versions: v2 exists but was never submitted.
          documentIds: ['doc-resume-v1', 'doc-cover-v1'],
        },
      ],
      isDemo: true,
    },
    {
      id: 'app-3',
      jobId: 'job-3',
      jobSnapshot: snapshot('job-3'),
      stage: 'interview',
      createdAt: at(16),
      interviewAt: isoDaysFromNow(3, 14),
      notes: '가상 메모: 1차 면접에서 파이프라인 장애 대응을 질문받았습니다.',
      submissions: [
        {
          id: 'submission-3-a',
          createdAt: at(15),
          documentIds: ['doc-cover-v1'],
        },
        {
          // Last confirmed submission: grounding must use exactly these IDs.
          id: 'submission-3-b',
          createdAt: at(9),
          documentIds: ['doc-resume-v2', 'doc-cover-v2'],
        },
      ],
      isDemo: true,
    },
    {
      id: 'app-4',
      jobId: 'job-4',
      jobSnapshot: snapshot('job-4'),
      stage: 'interview',
      createdAt: at(20),
      interviewAt: isoDaysFromNow(1, 10),
      notes: '가상 메모: 지표 해석 사례를 준비 중입니다.',
      submissions: [
        {
          id: 'submission-4-a',
          createdAt: at(19),
          documentIds: ['doc-career-v1'],
        },
      ],
      isDemo: true,
    },
    {
      id: 'app-5',
      jobId: 'job-5',
      jobSnapshot: snapshot('job-5'),
      stage: 'offer',
      createdAt: at(27),
      interviewAt: at(4),
      notes: '가상 메모: 오퍼를 받은 상태이며 조건을 검토 중입니다.',
      submissions: [
        {
          id: 'submission-5-a',
          createdAt: at(26),
          // portfolio v2 is newer but was never part of this submission.
          documentIds: ['doc-resume-v1', 'doc-portfolio-v1'],
        },
      ],
      isDemo: true,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Practice                                                                   */
/* -------------------------------------------------------------------------- */

function createDemoPractice(): PracticeEntry[] {
  const base = Date.now();
  const at = (days: number) => new Date(base - days * DAY_MS).toISOString();

  return [
    {
      id: 'practice-1',
      applicationId: 'app-3',
      questionId: 'q-document-doc-resume-v2',
      question:
        "'샘플 이력서 (2차)' 이력서에 적은 내용을 바탕으로, 가장 자신 있는 경험을 구체적으로 설명해 주세요.",
      answer:
        '가상의 답변입니다. 주문 API 응답 시간을 줄인 과정을 상황, 행동, 결과 순서로 정리해 보았습니다.',
      confidence: 'again',
      createdAt: at(5),
    },
    {
      id: 'practice-2',
      applicationId: 'app-5',
      questionId: 'q-job-job-5-motivation',
      question:
        '밤하늘스튜디오 (가상)의 프로덕트 디자이너 포지션에 지원한 이유와, 입사 후 가장 먼저 기여하고 싶은 부분을 설명해 주세요.',
      answer:
        '가상의 답변입니다. 디자인 시스템을 정리한 경험과 연결해 기여하고 싶은 부분을 말해 보았습니다.',
      confidence: 'ready',
      createdAt: at(3),
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* State factories                                                            */
/* -------------------------------------------------------------------------- */

const EMPTY_PROFILE = {
  name: '샘플 워크스페이스',
  role: '백엔드 개발',
  skills: ['Python', 'FastAPI', 'SQL', 'Docker'],
  locations: ['서울', '원격 근무'],
  excludeKeywords: ['파견', '상주'],
  weeklyGoal: 3,
};

/** A fully populated, explicitly fictional demo workspace. */
export function createDemoState(): WorkspaceState {
  const jobs = createDemoJobs();
  return {
    schemaVersion: 1,
    jobs,
    documents: createDemoDocuments(),
    applications: createDemoApplications(jobs),
    practice: createDemoPractice(),
    profile: {
      ...EMPTY_PROFILE,
      skills: [...EMPTY_PROFILE.skills],
      locations: [...EMPTY_PROFILE.locations],
      excludeKeywords: [...EMPTY_PROFILE.excludeKeywords],
    },
    companyNotes: {
      'job-1': '가상 메모: 기술 면접은 2시간, 코딩 테스트가 포함된다고 가정합니다.',
      'job-3': '가상 메모: 원격 근무이지만 분기마다 오프라인 모임이 있다고 가정합니다.',
    },
    demo: true,
  };
}

/** A clean workspace with no demo content. */
export function createEmptyState(): WorkspaceState {
  return {
    schemaVersion: 1,
    jobs: [],
    documents: [],
    applications: [],
    practice: [],
    profile: {
      name: '',
      role: '',
      skills: [],
      locations: [],
      excludeKeywords: [],
      weeklyGoal: 3,
    },
    companyNotes: {},
    demo: false,
  };
}

/** A blank workspace that keeps the demo profile defaults but no records. */
export function createFreshProfileState(): WorkspaceState {
  const state = createEmptyState();
  state.profile = {
    ...EMPTY_PROFILE,
    skills: [...EMPTY_PROFILE.skills],
    locations: [...EMPTY_PROFILE.locations],
    excludeKeywords: [...EMPTY_PROFILE.excludeKeywords],
  };
  return state;
}

/* -------------------------------------------------------------------------- */
/* Templates                                                                  */
/* -------------------------------------------------------------------------- */

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: 'template-resume',
    title: '기본 이력서',
    kind: '이력서',
    summary: '경력과 기술을 한 장으로 정리하는 출발점입니다.',
    color: 'blue',
    content: [
      '# 이력서',
      '',
      '## 기본 정보',
      '- 이름: (이름을 입력하세요)',
      '- 연락처: (이메일 / 전화번호)',
      '- 희망 직무: (예: 백엔드 개발)',
      '',
      '## 기술 스택',
      '- 언어: ',
      '- 프레임워크: ',
      '- 데이터베이스: ',
      '- 인프라/도구: ',
      '',
      '## 경력',
      '### (회사명) / (직무) / (재직 기간)',
      '- 담당한 일: ',
      '- 결과: ',
      '',
      '## 학력',
      '- (학교 / 전공 / 기간)',
      '',
      '## 기타',
      '- 자격증, 교육, 활동: ',
    ].join('\n'),
  },
  {
    id: 'template-cover',
    title: '기본 자기소개서',
    kind: '자기소개서',
    summary: '지원 동기와 경험을 연결하는 4문항 구조입니다.',
    color: 'green',
    content: [
      '# 자기소개서',
      '',
      '## 1. 지원 동기',
      '이 회사와 직무를 선택한 이유를 적어 주세요.',
      '',
      '## 2. 성장 과정과 강점',
      '지금의 강점을 만든 경험을 적어 주세요.',
      '',
      '## 3. 직무 관련 경험',
      '문제 - 행동 - 결과 순서로 구체적으로 적어 주세요.',
      '',
      '## 4. 입사 후 계획',
      '입사 후 6개월, 1년 동안 기여하고 싶은 부분을 적어 주세요.',
    ].join('\n'),
  },
  {
    id: 'template-career',
    title: '기본 경력기술서',
    kind: '경력기술서',
    summary: '프로젝트 단위로 역할과 성과를 정리합니다.',
    color: 'orange',
    content: [
      '# 경력기술서',
      '',
      '## 프로젝트 1: (프로젝트 이름)',
      '- 기간: ',
      '- 팀 구성: ',
      '- 사용 기술: ',
      '- 문제: ',
      '- 내가 한 일: ',
      '- 결과: ',
      '',
      '## 프로젝트 2: (프로젝트 이름)',
      '- 기간: ',
      '- 팀 구성: ',
      '- 사용 기술: ',
      '- 문제: ',
      '- 내가 한 일: ',
      '- 결과: ',
    ].join('\n'),
  },
  {
    id: 'template-portfolio',
    title: '기본 포트폴리오',
    kind: '포트폴리오',
    summary: '대표 작업을 링크와 함께 소개합니다.',
    color: 'violet',
    content: [
      '# 포트폴리오',
      '',
      '## 대표 작업 1: (이름)',
      '- 한 줄 소개: ',
      '- 링크: ',
      '- 맡은 역할: ',
      '- 사용 기술: ',
      '- 배운 점: ',
      '',
      '## 대표 작업 2: (이름)',
      '- 한 줄 소개: ',
      '- 링크: ',
      '- 맡은 역할: ',
      '- 사용 기술: ',
      '- 배운 점: ',
    ].join('\n'),
  },
];
