import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_KINDS,
  STAGES,
  answerChecklist,
  createApplication,
  formatDate,
  getQuestions,
  id,
  latestDocuments,
  latestSubmission,
  matchJob,
  relativeDate,
  safeUrl,
  validateBackup,
} from './domain';
import { createDemoState, createEmptyState } from './seed';
import type { Application, DocumentRecord, Job, Profile, WorkspaceState } from './types';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-x',
    company: '테스트회사',
    title: '백엔드 개발자',
    role: '백엔드 개발',
    location: '서울',
    experience: '경력 2년',
    employment: '정규직',
    salary: '협의',
    skills: ['Python', 'FastAPI', 'SQL'],
    publishedAt: '2025-01-01',
    deadline: '2025-02-01',
    status: 'open',
    verification: 'unverified',
    verifiedAt: '',
    sourceUrl: 'https://example.com/job',
    source: '테스트',
    description: '설명',
    requirements: '요구사항',
    benefits: '혜택',
    companyInfo: '회사 정보',
    saved: false,
    isDemo: false,
    color: 'blue',
    ...overrides,
  };
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    name: '테스트',
    role: '백엔드 개발',
    skills: ['Python', 'SQL'],
    locations: ['서울'],
    excludeKeywords: ['파견'],
    weeklyGoal: 3,
    ...overrides,
  };
}

function makeDoc(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: 'doc-1',
    groupId: 'group-1',
    title: '이력서',
    kind: '이력서',
    version: 1,
    text: '가상의 이력서 텍스트',
    createdAt: '2025-01-01T00:00:00.000Z',
    isDemo: false,
    ...overrides,
  };
}

function makeApplication(overrides: Partial<Application> = {}): Application {
  const job = makeJob();
  return {
    id: 'app-x',
    jobId: job.id,
    jobSnapshot: structuredClone(job),
    stage: 'applied',
    createdAt: '2025-01-02T00:00:00.000Z',
    interviewAt: '',
    notes: '',
    submissions: [],
    isDemo: false,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* safeUrl                                                                    */
/* -------------------------------------------------------------------------- */

describe('safeUrl', () => {
  it('accepts normal http/https URLs', () => {
    expect(safeUrl('https://example.com/jobs/1')).toBe('https://example.com/jobs/1');
    expect(safeUrl('http://example.com')).toBe('http://example.com/');
  });

  it('rejects dangerous or non-http schemes', () => {
    for (const value of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'ftp://example.com/x',
      'blob:https://example.com/abc',
      'about:blank',
    ]) {
      expect(safeUrl(value), value).toBeNull();
    }
  });

  it('rejects URLs with userinfo credentials', () => {
    expect(safeUrl('https://user:pass@example.com/')).toBeNull();
    expect(safeUrl('https://user@example.com/')).toBeNull();
    expect(safeUrl('http://admin@evil.example.com/x')).toBeNull();
  });

  it('rejects empty, malformed, and whitespace/newline injection', () => {
    expect(safeUrl('')).toBeNull();
    expect(safeUrl('   ')).toBeNull();
    expect(safeUrl('not a url')).toBeNull();
    expect(safeUrl('https://exa mple.com')).toBeNull();
    expect(safeUrl('https://example.com/\njavascript:alert(1)')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

describe('formatDate / relativeDate', () => {
  it('formats ISO dates in Korean', () => {
    expect(formatDate('2025-03-05')).toBe('2025년 3월 5일');
    expect(formatDate('2025-03-05T12:00:00.000Z')).toBe('2025년 3월 5일');
  });

  it('returns a dash for invalid dates', () => {
    expect(formatDate('')).toBe('-');
    expect(formatDate('nope')).toBe('-');
    expect(formatDate('2025-99-99')).toBe('-');
  });

  it('produces relative labels', () => {
    const now = new Date();
    const today = new Date(now);
    today.setHours(12, 0, 0, 0);
    expect(relativeDate(today.toISOString())).toBe('오늘');

    const yesterday = new Date(now.getTime() - 86_400_000);
    expect(relativeDate(yesterday.toISOString())).toBe('어제');

    const inThreeDays = new Date(now.getTime() + 3 * 86_400_000);
    expect(relativeDate(inThreeDays.toISOString())).toBe('3일 후');
    expect(relativeDate('garbage')).toBe('-');
  });
});

/* -------------------------------------------------------------------------- */
/* matchJob                                                                   */
/* -------------------------------------------------------------------------- */

describe('matchJob', () => {
  it('splits job skills into matched and missing', () => {
    const result = matchJob(makeJob(), makeProfile());
    expect(result.matched).toEqual(['Python', 'SQL']);
    expect(result.missing).toEqual(['FastAPI']);
  });

  it('matches case-insensitively', () => {
    const job = makeJob({ skills: ['python', 'FASTAPI'] });
    const result = matchJob(job, makeProfile({ skills: ['PYTHON', ' fastapi '] }));
    expect(result.matched).toEqual(['python', 'FASTAPI']);
    expect(result.missing).toEqual([]);
  });

  it('detects excluded keywords anywhere in the posting', () => {
    const job = makeJob({ description: '파견 근무가 포함될 수 있습니다.' });
    const result = matchJob(job, makeProfile({ excludeKeywords: ['파견', '상주'] }));
    expect(result.excluded).toEqual(['파견']);
  });

  it('handles empty inputs without throwing', () => {
    const result = matchJob(
      makeJob({ skills: [] }),
      makeProfile({ skills: [], excludeKeywords: [] }),
    );
    expect(result).toEqual({ matched: [], missing: [], excluded: [] });
  });
});

/* -------------------------------------------------------------------------- */
/* latestDocuments                                                            */
/* -------------------------------------------------------------------------- */

describe('latestDocuments', () => {
  it('keeps only the newest version per group', () => {
    const documents = [
      makeDoc({ id: 'a1', groupId: 'g', version: 1 }),
      makeDoc({ id: 'a2', groupId: 'g', version: 2, createdAt: '2025-02-01T00:00:00.000Z' }),
      makeDoc({ id: 'b1', groupId: 'h', version: 5, createdAt: '2025-03-01T00:00:00.000Z' }),
    ];
    const latest = latestDocuments(documents);
    expect(latest.map((doc) => doc.id).sort()).toEqual(['a2', 'b1']);
  });

  it('breaks ties by date then id deterministically', () => {
    const documents = [
      makeDoc({ id: 'z', groupId: 'g', version: 2, createdAt: '2025-01-01T00:00:00.000Z' }),
      makeDoc({ id: 'a', groupId: 'g', version: 2, createdAt: '2025-01-02T00:00:00.000Z' }),
    ];
    expect(latestDocuments(documents)[0].id).toBe('a');
  });

  it('returns an empty list for no documents', () => {
    expect(latestDocuments([])).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* createApplication                                                          */
/* -------------------------------------------------------------------------- */

describe('createApplication', () => {
  it('creates an immutable structuredClone snapshot', () => {
    const job = makeJob({ skills: ['Python'] });
    const application = createApplication(job);

    job.skills.push('MUTATED');
    job.company = '바뀐 회사';

    expect(application.jobSnapshot.company).toBe('테스트회사');
    expect(application.jobSnapshot.skills).toEqual(['Python']);
    expect(application.jobSnapshot).not.toBe(job);
    expect(application.stage).toBe('preparing');
    expect(application.submissions).toEqual([]);
  });

  it('preserves demo status and generates unique ids', () => {
    const first = createApplication(makeJob({ isDemo: true }));
    const second = createApplication(makeJob({ isDemo: true }));
    expect(first.isDemo).toBe(true);
    expect(first.id).not.toBe(second.id);
    expect(id()).not.toBe(id());
  });
});

/* -------------------------------------------------------------------------- */
/* getQuestions                                                               */
/* -------------------------------------------------------------------------- */

describe('getQuestions grounding', () => {
  it('uses exactly the last confirmed submission document IDs', () => {
    const documents = [
      makeDoc({ id: 'resume-1', groupId: 'g-resume', version: 1, text: 'RESUME-V1-MARKER' }),
      makeDoc({ id: 'resume-2', groupId: 'g-resume', version: 2, text: 'RESUME-V2-MARKER' }),
      makeDoc({ id: 'cover-1', groupId: 'g-cover', kind: '자기소개서', version: 1, text: 'COVER-MARKER' }),
    ];
    const application = makeApplication({
      submissions: [
        { id: 's1', createdAt: '2025-02-01T00:00:00.000Z', documentIds: ['resume-1'] },
        { id: 's2', createdAt: '2025-03-01T00:00:00.000Z', documentIds: ['resume-2', 'cover-1'] },
      ],
    });

    const questions = getQuestions(application, documents);
    const references = questions.map((question) => question.reference);
    expect(references).toContain('resume-2');
    expect(references).toContain('cover-1');
    expect(references).not.toContain('resume-1');

    const evidence = questions.map((question) => question.evidence).join(' ');
    expect(evidence).toContain('RESUME-V2-MARKER');
    expect(evidence).toContain('COVER-MARKER');
    expect(evidence).not.toContain('RESUME-V1-MARKER');
  });

  it('never substitutes a newest unrelated version', () => {
    const documents = [
      makeDoc({ id: 'resume-1', groupId: 'g', version: 1, text: 'OLD' }),
      // Newest version, but no submission ever referenced it.
      makeDoc({
        id: 'resume-9',
        groupId: 'g',
        version: 9,
        text: 'UNRELATED-NEWEST',
        createdAt: '2099-01-01T00:00:00.000Z',
      }),
    ];
    const application = makeApplication({
      submissions: [
        { id: 's1', createdAt: '2025-01-01T00:00:00.000Z', documentIds: ['resume-1'] },
      ],
    });

    const questions = getQuestions(application, documents);
    const references = questions.map((question) => question.reference);
    expect(references).toContain('resume-1');
    expect(references).not.toContain('resume-9');
    expect(questions.some((q) => q.evidence.includes('UNRELATED-NEWEST'))).toBe(false);
  });

  it('falls back to job-only questions with no submissions', () => {
    const documents = [makeDoc({ id: 'resume-1', text: 'SHOULD-NOT-APPEAR' })];
    const application = makeApplication({ submissions: [] });
    const questions = getQuestions(application, documents);

    expect(questions.length).toBeGreaterThan(0);
    expect(questions.every((question) => question.source !== 'document')).toBe(true);
    expect(questions.some((q) => q.evidence.includes('SHOULD-NOT-APPEAR'))).toBe(false);
    expect(questions.some((question) => question.topic === '지원 동기')).toBe(true);
  });

  it('grounds on the last array entry, matching the UI `.at(-1)` label', () => {
    const documents = [
      makeDoc({ id: 'doc-new', groupId: 'g2', text: 'NEW-TEXT' }),
      makeDoc({ id: 'doc-old', groupId: 'g1', text: 'OLD-TEXT' }),
    ];
    // Imported backups may not be chronologically ordered; array order wins.
    const application = makeApplication({
      submissions: [
        { id: 'sub-newer', createdAt: '2099-01-01T00:00:00.000Z', documentIds: ['doc-new'] },
        { id: 'sub-older', createdAt: '2020-01-01T00:00:00.000Z', documentIds: ['doc-old'] },
      ],
    });

    expect(latestSubmission(application)?.id).toBe('sub-older');
    const references = getQuestions(application, documents).map((q) => q.reference);
    expect(references).toContain('doc-old');
    expect(references).not.toContain('doc-new');
  });

  it('returns null from latestSubmission when there are no submissions', () => {
    expect(latestSubmission(makeApplication({ submissions: [] }))).toBeNull();
  });

  it('ignores submission references to missing documents', () => {
    const application = makeApplication({
      submissions: [
        { id: 's1', createdAt: '2025-01-01T00:00:00.000Z', documentIds: ['ghost-doc'] },
      ],
    });
    const questions = getQuestions(application, []);
    expect(questions.every((question) => question.source !== 'document')).toBe(true);
  });

  it('generates unique question ids', () => {
    const documents = [
      makeDoc({ id: 'd1', groupId: 'g1', text: 'a' }),
      makeDoc({ id: 'd2', groupId: 'g2', text: 'b' }),
    ];
    const application = makeApplication({
      submissions: [
        { id: 's1', createdAt: '2025-01-01T00:00:00.000Z', documentIds: ['d1', 'd2'] },
      ],
    });
    const ids = getQuestions(application, documents).map((question) => question.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('produces questions that fit the practice/backup schema limits', () => {
    const documents = [
      makeDoc({ id: 'd1', groupId: 'g1', text: '가'.repeat(30_000) }),
    ];
    const application = makeApplication({
      jobSnapshot: makeJob({ skills: ['가'.repeat(500)], requirements: '나'.repeat(30_000) }),
      submissions: [
        { id: 's1', createdAt: '2025-01-01T00:00:00.000Z', documentIds: ['d1'] },
      ],
    });

    for (const question of getQuestions(application, documents)) {
      expect(question.question.length).toBeLessThanOrEqual(2000);
      expect(question.evidence.length).toBeLessThanOrEqual(2000);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* answerChecklist                                                            */
/* -------------------------------------------------------------------------- */

describe('answerChecklist', () => {
  it('marks an empty answer as incomplete', () => {
    const result = answerChecklist('');
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((item) => item.ok === false)).toBe(true);
  });

  it('marks a specific, first-person, numeric answer as complete', () => {
    const result = answerChecklist(
      '저는 주문 API의 응답 시간을 320ms에서 90ms로 줄이는 문제를 해결했습니다. 병목 원인을 분석해 캐시를 도입했습니다.',
    );
    expect(result.every((item) => item.ok)).toBe(true);
  });

  it('always returns labelled boolean items', () => {
    for (const item of answerChecklist('짧은 답변')) {
      expect(typeof item.label).toBe('string');
      expect(typeof item.ok).toBe('boolean');
    }
  });
});

/* -------------------------------------------------------------------------- */
/* validateBackup - happy path                                                */
/* -------------------------------------------------------------------------- */

describe('validateBackup valid input', () => {
  it('accepts the demo state', () => {
    const state = createDemoState();
    const result = validateBackup(state);
    expect(result.jobs.length).toBe(state.jobs.length);
    expect(result.demo).toBe(true);
  });

  it('accepts the empty state and a wrapped backup', () => {
    const empty = createEmptyState();
    expect(validateBackup(empty).jobs).toEqual([]);
    expect(validateBackup({ format: 'jarizip-backup', formatVersion: 1, state: empty }).jobs).toEqual([]);
  });

  it('rejects a backup from a newer app version with a readable message', () => {
    expect(() =>
      validateBackup({ format: 'jarizip-backup', formatVersion: 99, state: createEmptyState() }),
    ).toThrow(/더 새로운 버전/);
  });

  it('returns a fresh object rather than trusting the prototype', () => {
    const state = createDemoState();
    const result = validateBackup(state);
    expect(result).not.toBe(state);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  });
});

/* -------------------------------------------------------------------------- */
/* validateBackup - malicious imports                                         */
/* -------------------------------------------------------------------------- */

describe('validateBackup malicious input', () => {
  it('rejects prototype pollution keys', () => {
    const payload = JSON.parse(
      '{"schemaVersion":1,"jobs":[],"documents":[],"applications":[],"practice":[],"profile":{"name":"x","role":"","skills":[],"locations":[],"excludeKeywords":[],"weeklyGoal":3},"companyNotes":{},"demo":false,"__proto__":{"polluted":true}}',
    );
    expect(() => validateBackup(payload)).toThrow(/허용되지 않는 키/);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects constructor/prototype keys nested in arrays', () => {
    const clean = createEmptyState() as unknown as Record<string, unknown>;
    const jobs = JSON.parse('[{"constructor":{"prototype":{"x":1}}}]');
    expect(() => validateBackup({ ...clean, jobs })).toThrow(/허용되지 않는 키/);
  });

  it('rejects unknown extra keys (strict schema)', () => {
    const state = { ...createEmptyState(), injected: 'boom' };
    expect(() => validateBackup(state)).toThrow(/형식이 올바르지 않습니다/);
  });

  it('rejects wrong schema versions and types', () => {
    expect(() => validateBackup({ ...createEmptyState(), schemaVersion: 2 })).toThrow();
    expect(() => validateBackup({ ...createEmptyState(), jobs: 'nope' })).toThrow();
    expect(() => validateBackup(null)).toThrow();
    expect(() => validateBackup('string')).toThrow();
  });

  it('rejects dangerous job URLs inside a job', () => {
    const state = createEmptyState();
    state.jobs = [makeJob({ sourceUrl: 'javascript:alert(1)' })];
    expect(() => validateBackup(state)).toThrow(/형식이 올바르지 않습니다/);
  });

  it('rejects URLs with credentials', () => {
    const state = createEmptyState();
    state.jobs = [makeJob({ sourceUrl: 'https://user:pass@example.com/' })];
    expect(() => validateBackup(state)).toThrow(/형식이 올바르지 않습니다/);
  });

  it('rejects invalid document versions and kinds', () => {
    const state = createEmptyState();
    state.documents = [makeDoc({ version: 0 })];
    expect(() => validateBackup(state)).toThrow();

    const badKind = createEmptyState();
    badKind.documents = [makeDoc({ kind: '위조' as unknown as DocumentRecord['kind'] })];
    expect(() => validateBackup(badKind)).toThrow();
  });

  it('rejects ids with unsafe characters', () => {
    const state = createEmptyState();
    state.documents = [makeDoc({ id: '<script>' })];
    expect(() => validateBackup(state)).toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* validateBackup - impossible references                                     */
/* -------------------------------------------------------------------------- */

describe('validateBackup reference integrity', () => {
  function withApplication(application: Application, documents: DocumentRecord[] = [makeDoc()]): WorkspaceState {
    const state = createEmptyState();
    state.documents = documents;
    state.applications = [application];
    return state;
  }

  it('rejects submissions that reference missing documents', () => {
    const application = makeApplication({
      submissions: [
        { id: 's1', createdAt: '2025-01-01T00:00:00.000Z', documentIds: ['does-not-exist'] },
      ],
    });
    expect(() => validateBackup(withApplication(application))).toThrow(/없는 문서/);
  });

  it('rejects practice entries that reference missing applications', () => {
    const state = createEmptyState();
    state.practice = [
      {
        id: 'p1',
        applicationId: 'ghost-app',
        questionId: 'q1',
        question: '질문',
        answer: '답변',
        confidence: 'ready',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ];
    expect(() => validateBackup(state)).toThrow(/없는 지원/);
  });

  it('rejects duplicate document ids', () => {
    const state = createEmptyState();
    state.documents = [makeDoc({ id: 'dup' }), makeDoc({ id: 'dup', groupId: 'other' })];
    expect(() => validateBackup(state)).toThrow(/중복/);
  });

  it('rejects duplicate group + version pairs', () => {
    const state = createEmptyState();
    state.documents = [
      makeDoc({ id: 'a', groupId: 'g', version: 1 }),
      makeDoc({ id: 'b', groupId: 'g', version: 1 }),
    ];
    expect(() => validateBackup(state)).toThrow(/같은 버전/);
  });

  it('rejects duplicate application and submission ids', () => {
    const state = createEmptyState();
    state.documents = [makeDoc()];
    state.applications = [makeApplication({ id: 'same' }), makeApplication({ id: 'same' })];
    expect(() => validateBackup(state)).toThrow(/중복/);

    const submissionState = createEmptyState();
    submissionState.documents = [makeDoc()];
    submissionState.applications = [
      makeApplication({
        submissions: [{ id: 'sub', createdAt: '2025-01-01T00:00:00.000Z', documentIds: ['doc-1'] }],
      }),
      makeApplication({
        id: 'app-y',
        submissions: [{ id: 'sub', createdAt: '2025-01-02T00:00:00.000Z', documentIds: ['doc-1'] }],
      }),
    ];
    expect(() => validateBackup(submissionState)).toThrow(/중복/);
  });

  it('rejects when jobSnapshot.id does not match jobId', () => {
    const application = makeApplication({ jobId: 'some-other-job' });
    expect(() => validateBackup(withApplication(application))).toThrow(/참조/);
  });

  it('rejects an empty submission (a confirmed submission names documents)', () => {
    const state = createEmptyState();
    state.documents = [makeDoc()];
    state.applications = [
      makeApplication({
        submissions: [{ id: 'sub', createdAt: '2025-01-01T00:00:00.000Z', documentIds: [] }],
      }),
    ];
    expect(() => validateBackup(state)).toThrow(/형식이 올바르지 않습니다/);
  });

  it('rejects a jobSnapshot without a valid job shape', () => {
    const application = makeApplication();
    (application as { jobSnapshot: unknown }).jobSnapshot = { id: 'job-x' };
    expect(() => validateBackup(withApplication(application))).toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* UI integration limits (values the app itself can produce must survive)     */
/* -------------------------------------------------------------------------- */

describe('validateBackup UI field limits', () => {
  it('accepts a 30000-char description (ImportJob maxLength)', () => {
    const state = createEmptyState();
    state.jobs = [makeJob({ description: '가'.repeat(30_000) })];
    expect(() => validateBackup(state)).not.toThrow();
  });

  it('accepts long single skills/locations/keywords (500-char fields)', () => {
    const state = createEmptyState();
    state.jobs = [makeJob({ skills: ['가'.repeat(500)] })];
    state.profile = {
      name: '샘플',
      role: '역할',
      skills: ['가'.repeat(500)],
      locations: ['나'.repeat(300)],
      excludeKeywords: ['다'.repeat(500)],
      weeklyGoal: 50,
    };
    expect(() => validateBackup(state)).not.toThrow();
  });

  it('accepts a long percent-encoded source URL (2720 chars)', () => {
    const state = createEmptyState();
    const url = `https://example.com/${encodeURIComponent('가'.repeat(300))}`;
    state.jobs = [makeJob({ sourceUrl: url })];
    expect(() => validateBackup(state)).not.toThrow();
  });

  it('still rejects an over-limit description honestly', () => {
    const state = createEmptyState();
    state.jobs = [makeJob({ description: '가'.repeat(30_001) })];
    expect(() => validateBackup(state)).toThrow(/형식이 올바르지 않습니다/);
  });

  it('accepts an explicit undefined extractionNote (optional UI field)', () => {
    const state = createEmptyState();
    state.documents = [
      {
        ...makeDoc(),
        extractionNote: undefined,
      },
    ];
    expect(() => validateBackup(state)).not.toThrow();
  });

  it('accepts document fileData/mime produced by readDocumentFile', () => {
    const state = createEmptyState();
    state.documents = [
      {
        ...makeDoc(),
        fileName: 'a.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileData: 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,AAAA',
      },
    ];
    expect(() => validateBackup(state)).not.toThrow();
  });

  it('rejects a document fileData that is not a data URL', () => {
    const state = createEmptyState();
    state.documents = [{ ...makeDoc(), fileData: 'javascript:alert(1)' }];
    expect(() => validateBackup(state)).toThrow(/형식이 올바르지 않습니다/);
  });
});

/* -------------------------------------------------------------------------- */
/* Manual job import + scheduling shapes                                      */
/* -------------------------------------------------------------------------- */

describe('validateBackup manual import shapes', () => {
  it('accepts an empty publishedAt so an unknown date stays unknown', () => {
    const state = createEmptyState();
    state.jobs = [makeJob({ publishedAt: '', deadline: '', verifiedAt: '' })];
    expect(() => validateBackup(state)).not.toThrow();
    // The UI guards on truthiness; empty must not render as an invented date.
    expect(formatDate('')).toBe('-');
    expect(relativeDate('')).toBe('-');
  });

  it('accepts a date-only deadline and a KST-noon publishedAt', () => {
    const state = createEmptyState();
    state.jobs = [
      makeJob({ deadline: '2025-12-31', publishedAt: '2025-05-03T12:00:00+09:00' }),
    ];
    expect(() => validateBackup(state)).not.toThrow();
    // Date-only values must not be shifted by the local timezone.
    expect(formatDate('2025-12-31')).toBe('2025년 12월 31일');
    expect(formatDate('2025-05-03T12:00:00+09:00')).toBe('2025년 5월 3일');
  });

  it('accepts a datetime-local interviewAt round-trip', () => {
    const state = createEmptyState();
    state.applications = [
      makeApplication({ interviewAt: new Date('2025-06-01T10:30:00.000Z').toISOString() }),
    ];
    expect(() => validateBackup(state)).not.toThrow();
  });

  it('rejects an invented-looking but unparseable date', () => {
    const state = createEmptyState();
    state.jobs = [makeJob({ deadline: '2025-13-45' })];
    expect(() => validateBackup(state)).toThrow(/형식이 올바르지 않습니다/);
  });
});

/* -------------------------------------------------------------------------- */
/* Audio answers (MediaRecorder MIME variants)                                */
/* -------------------------------------------------------------------------- */

describe('validateBackup audio answers', () => {
  function withPractice(audioData: string) {
    const state = createEmptyState();
    state.applications = [makeApplication()];
    state.practice = [
      {
        id: 'p1',
        applicationId: 'app-x',
        questionId: 'q1',
        question: '질문',
        answer: '답변',
        confidence: 'ready',
        createdAt: '2025-01-01T00:00:00.000Z',
        audioData,
      },
    ];
    return state;
  }

  it('accepts webm/mp4/ogg data URLs including codec parameters', () => {
    for (const value of [
      'data:audio/webm;codecs=opus;base64,AAAA',
      'data:audio/webm;base64,AAAA',
      'data:audio/mp4;base64,AAAA',
      'data:audio/ogg;codecs=opus;base64,AAAA',
      'data:audio/ogg; codecs="opus";base64,AAAA',
    ]) {
      expect(() => validateBackup(withPractice(value)), value).not.toThrow();
    }
  });

  it('rejects non-audio or non-data URLs for audioData', () => {
    for (const value of [
      'data:text/html;base64,AAAA',
      'https://example.com/audio.webm',
      'javascript:alert(1)',
      'data:audio/webm,notbase64',
    ]) {
      expect(() => validateBackup(withPractice(value)), value).toThrow();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

describe('constants', () => {
  it('exposes the five stages in order', () => {
    expect(STAGES.map((stage) => stage.id)).toEqual([
      'preparing',
      'applied',
      'interview',
      'offer',
      'closed',
    ]);
    expect(STAGES.every((stage) => stage.label.length > 0)).toBe(true);
  });

  it('exposes the four document kinds', () => {
    expect(DOCUMENT_KINDS).toEqual(['이력서', '자기소개서', '경력기술서', '포트폴리오']);
  });
});
