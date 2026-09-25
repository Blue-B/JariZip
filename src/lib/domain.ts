import { z } from 'zod';
import type {
  Application,
  DocumentKind,
  DocumentRecord,
  InterviewQuestion,
  Job,
  PracticeEntry,
  Profile,
  Stage,
  Submission,
  WorkspaceState,
} from './types';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const STAGES: { id: Stage; label: string }[] = [
  { id: 'preparing', label: '준비 중' },
  { id: 'applied', label: '지원 완료' },
  { id: 'interview', label: '면접' },
  { id: 'offer', label: '오퍼' },
  { id: 'closed', label: '종료' },
];

export const DOCUMENT_KINDS: DocumentKind[] = [
  '이력서',
  '자기소개서',
  '경력기술서',
  '포트폴리오',
];

const DAY_MS = 86_400_000;

/* -------------------------------------------------------------------------- */
/* Identity & dates                                                           */
/* -------------------------------------------------------------------------- */

/** Collision-resistant identifier that works in browsers and during tests. */
export function id(): string {
  const cryptoRef = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `2024-05-03...` -> `2024년 5월 3일`; invalid input -> `-`. */
export function formatDate(value: string): string {
  if (typeof value !== 'string') return '-';
  const trimmed = value.trim();
  if (!trimmed) return '-';
  // Prefer the literal calendar date so timezone offsets cannot shift the day.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}년 ${month}월 ${day}일`;
    }
    return '-';
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return '-';
  const date = new Date(parsed);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function startOfLocalDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Human relative label such as `오늘`, `어제`, `3일 전`, `2개월 후`. */
export function relativeDate(value: string): string {
  if (typeof value !== 'string') return '-';
  const parsed = Date.parse(value.trim());
  if (!Number.isFinite(parsed)) return '-';

  const diffDays = Math.round(
    (startOfLocalDay(parsed) - startOfLocalDay(Date.now())) / DAY_MS,
  );

  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '내일';
  if (diffDays === -1) return '어제';
  if (diffDays > 1 && diffDays < 30) return `${diffDays}일 후`;
  if (diffDays < -1 && diffDays > -30) return `${Math.abs(diffDays)}일 전`;

  const months = Math.round(Math.abs(diffDays) / 30);
  if (Math.abs(diffDays) < 365) {
    return diffDays > 0 ? `${months}개월 후` : `${months}개월 전`;
  }
  const years = Math.round(Math.abs(diffDays) / 365);
  return diffDays > 0 ? `${years}년 후` : `${years}년 전`;
}

/* -------------------------------------------------------------------------- */
/* URLs                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Returns a normalized absolute http(s) URL, or `null`.
 * Rejects credentials (userinfo), non-http protocols, and malformed values.
 */
export function safeUrl(value: string): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/[\u0000-\u001f\u007f\s]/.test(trimmed)) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') return null;
  if (!parsed.hostname) return null;
  if (parsed.username || parsed.password) return null;

  return parsed.toString();
}

/* -------------------------------------------------------------------------- */
/* Job matching                                                               */
/* -------------------------------------------------------------------------- */

function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface JobMatchResult {
  matched: string[];
  missing: string[];
  excluded: string[];
}

/**
 * Compares a job against profile skills and exclude keywords.
 * `matched`/`missing` follow the job's own skill order; `excluded` lists the
 * profile exclude keywords that appear anywhere in the job posting.
 */
export function matchJob(job: Job, profile: Profile): JobMatchResult {
  const profileSkills = new Set(
    (profile.skills ?? []).map(normalizeKeyword).filter(Boolean),
  );

  const jobSkills = (job.skills ?? []).filter(
    (skill): skill is string => typeof skill === 'string' && skill.trim() !== '',
  );

  const matched: string[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const skill of jobSkills) {
    const key = normalizeKeyword(skill);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (profileSkills.has(key)) matched.push(skill);
    else missing.push(skill);
  }

  const haystack = [
    job.company,
    job.title,
    job.role,
    job.location,
    job.description,
    job.requirements,
    job.benefits,
    job.companyInfo,
    ...jobSkills,
  ]
    .filter((part): part is string => typeof part === 'string')
    .join(' \n ')
    .toLowerCase();

  const excluded: string[] = [];
  const seenExcluded = new Set<string>();
  for (const keyword of profile.excludeKeywords ?? []) {
    if (typeof keyword !== 'string') continue;
    const key = normalizeKeyword(keyword);
    if (!key || seenExcluded.has(key)) continue;
    seenExcluded.add(key);
    if (haystack.includes(key)) excluded.push(keyword);
  }

  return { matched, missing, excluded };
}

/* -------------------------------------------------------------------------- */
/* Documents                                                                  */
/* -------------------------------------------------------------------------- */

function timeOf(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Newest version of every document group. Equivalent versions are broken by
 * `createdAt` and then by id so the result is deterministic.
 */
export function latestDocuments(documents: DocumentRecord[]): DocumentRecord[] {
  const best = new Map<string, DocumentRecord>();
  for (const doc of documents) {
    const key = doc.groupId || doc.id;
    const current = best.get(key);
    if (!current) {
      best.set(key, doc);
      continue;
    }
    if (
      doc.version > current.version ||
      (doc.version === current.version &&
        (timeOf(doc.createdAt) > timeOf(current.createdAt) ||
          (timeOf(doc.createdAt) === timeOf(current.createdAt) && doc.id > current.id)))
    ) {
      best.set(key, doc);
    }
  }
  return [...best.values()].sort((a, b) => {
    const diff = timeOf(b.createdAt) - timeOf(a.createdAt);
    if (diff !== 0) return diff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/* -------------------------------------------------------------------------- */
/* Applications                                                               */
/* -------------------------------------------------------------------------- */

/** Creates an application with an immutable deep snapshot of the job. */
export function createApplication(job: Job): Application {
  const snapshot = structuredClone(job);
  return {
    id: id(),
    jobId: job.id,
    jobSnapshot: snapshot,
    stage: 'preparing',
    createdAt: new Date().toISOString(),
    interviewAt: '',
    notes: '',
    submissions: [],
    isDemo: Boolean(job.isDemo),
  };
}

/* -------------------------------------------------------------------------- */
/* Interview questions                                                        */
/* -------------------------------------------------------------------------- */

function snippet(value: string, max = 160): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/**
 * The application's last confirmed submission. Submissions are stored in the
 * order the user confirmed them, so the final array entry is authoritative.
 * Exported so UI code can label the grounding source with the exact same
 * submission that `getQuestions` uses (avoids `.at(-1)` drift on imported data).
 */
export function latestSubmission(application: Application): Submission | null {
  const list = application.submissions ?? [];
  if (list.length === 0) return null;
  return list[list.length - 1] ?? null;
}

/**
 * Builds interview questions grounded in the document versions referenced by
 * the application's LAST confirmed submission. Older/newer versions in the
 * same group are never substituted. When there is no confirmed submission the
 * result is job-only.
 */
export function getQuestions(
  application: Application,
  documents: DocumentRecord[],
): InterviewQuestion[] {
  const job = application.jobSnapshot;
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  const submission = latestSubmission(application);
  const grounded: DocumentRecord[] = [];

  if (submission) {
    for (const documentId of submission.documentIds ?? []) {
      const doc = byId.get(documentId);
      if (doc) grounded.push(doc);
    }
  }

  const questions: InterviewQuestion[] = [];

  for (const doc of grounded.slice(0, 4)) {
    const evidence = snippet(doc.text);
    questions.push({
      // Stable per document so saved practice answers survive unrelated changes
      // to the number of grounded documents.
      id: `q-document-${doc.id}`,
      topic: doc.kind,
      question: `'${doc.title}' ${doc.kind}에 적은 내용을 바탕으로, 가장 자신 있는 경험을 구체적으로 설명해 주세요.`,
      source: 'document',
      evidence: evidence || '(문서에 추출된 텍스트가 없습니다)',
      reference: doc.id,
      followUp: `그 경험에서 본인이 직접 맡은 역할과 결과를 수치로 말씀해 주세요. (${doc.kind} v${doc.version} 기준)`,
      hint: '문서에 쓴 표현을 그대로 외우기보다 상황-행동-결과 순서로 풀어 말해 보세요.',
    });
  }

  const skills = (job.skills ?? []).filter(Boolean);
  if (skills.length > 0) {
    // Keep the generated question within the practice-schema limit even when a
    // user pastes unusually long skill names.
    const skillList = snippet(skills.slice(0, 5).join(', '), 300);
    questions.push({
      id: `q-job-${job.id}-skills`,
      topic: '직무 역량',
      question: `'${skillList}' 역량을 실제 업무에서 사용해 문제를 해결한 경험을 말씀해 주세요.`,
      source: 'job',
      evidence: snippet(skills.join(', '), 120),
      reference: job.id,
      followUp: '그때 다른 선택지와 비교해 왜 그 방법을 골랐는지도 설명해 주세요.',
      hint: '기술 이름보다 어떤 문제를 어떻게 줄였는지에 집중하세요.',
    });
  }

  questions.push({
    id: `q-job-${job.id}-motivation`,
    topic: '지원 동기',
    question: `${job.company}의 ${job.title} 포지션에 지원한 이유와, 입사 후 가장 먼저 기여하고 싶은 부분을 설명해 주세요.`,
    source: 'job',
    evidence: snippet(job.description || job.companyInfo || job.title, 140),
    reference: job.id,
    followUp: '이 회사가 아니면 안 되는 이유가 있다면 무엇인가요?',
    hint: '회사/직무에 대해 확인한 사실과 본인의 경험을 연결해 보세요.',
  });

  const requirement = snippet(job.requirements, 400)
    .split(/[.\n·•-]/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)[0];

  if (requirement) {
    questions.push({
      id: `q-job-${job.id}-requirement`,
      topic: '요구사항',
      question: `채용 요구사항 중 '${requirement}'에 해당하는 경험을 구체적으로 설명해 주세요.`,
      source: 'job',
      evidence: requirement,
      reference: job.id,
      followUp: '그 경험을 이 직무에 어떻게 적용할 수 있을까요?',
      hint: '요구사항의 키워드와 본인 경험을 한 문장으로 연결해 보세요.',
    });
  }

  if (job.companyInfo) {
    questions.push({
      id: `q-job-${job.id}-company`,
      topic: '회사 이해',
      question: `${job.company}에 대해 알고 있는 점과, 이 회사에서 일하고 싶은 이유를 말씀해 주세요.`,
      source: 'job',
      evidence: snippet(job.companyInfo, 140),
      reference: job.id,
      followUp: '회사가 현재 풀고 있는 문제 중 관심 있는 것은 무엇인가요?',
      hint: '공고에 적힌 정보와 본인의 관심사를 구분해서 말하세요.',
    });
  }

  return questions.slice(0, 12);
}

/* -------------------------------------------------------------------------- */
/* Answer checklist                                                           */
/* -------------------------------------------------------------------------- */

export interface ChecklistItem {
  label: string;
  ok: boolean;
}

/** Local, rule-based answer hints. No AI scoring is performed. */
export function answerChecklist(answer: string): ChecklistItem[] {
  const text = typeof answer === 'string' ? answer : '';
  const trimmed = text.trim();

  return [
    { label: '답변을 입력했어요', ok: trimmed.length > 0 },
    { label: '충분히 길게 작성했어요 (40자 이상)', ok: trimmed.length >= 40 },
    { label: '구체적인 수치나 결과가 있어요', ok: /\d/.test(trimmed) },
    {
      label: '본인이 한 일이 드러나요',
      ok: /(저는|제가|맡아|담당|구현|개선|설계|만들|해결)/.test(trimmed),
    },
    {
      label: '문제와 해결 과정이 있어요',
      ok: /(문제|이슈|어려움|해결|개선|원인|시도)/.test(trimmed),
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Board helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Counts applications per stage (used by the board columns). */
export function stageCounts(applications: Application[]): Record<Stage, number> {
  const counts: Record<Stage, number> = {
    preparing: 0,
    applied: 0,
    interview: 0,
    offer: 0,
    closed: 0,
  };
  for (const application of applications) {
    if (application && typeof application.stage === 'string' && application.stage in counts) {
      counts[application.stage] += 1;
    }
  }
  return counts;
}

/** Highest version number stored for a document group (0 when unknown). */
export function maxVersion(documents: DocumentRecord[], groupId: string): number {
  let highest = 0;
  for (const document of documents) {
    if (document.groupId === groupId && document.version > highest) {
      highest = document.version;
    }
  }
  return highest;
}

/** Practice history for one application, newest first. */
export function practiceFor(
  practice: PracticeEntry[],
  applicationId: string,
): PracticeEntry[] {
  return practice
    .filter((entry) => entry.applicationId === applicationId)
    .sort((a, b) => {
      const diff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      if (Number.isFinite(diff) && diff !== 0) return diff;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export const BACKUP_FORMAT = 'jarizip-backup';
export const BACKUP_FORMAT_VERSION = 1;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_DEPTH = 60;
const MAX_NODES = 400_000;
// These limits are deliberately >= the `maxLength` used by the workspace UI so
// that data a user typed in the app always survives hydration/backup checks.
const MAX_URL_LENGTH = 4096;
const MAX_SKILL_LENGTH = 500;
const MAX_LOCATION_LENGTH = 300;
const MAX_TEXT_BLOCK = 30_000;

/** `data:<mime>;base64,...` produced by `readDocumentFile` / MediaRecorder. */
const DATA_URL_RE = /^data:[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+(?:;[^,<>\n\r]*)?;base64,/;
const MEDIA_DATA_URL_RE =
  /^data:(?:audio|video)\/[A-Za-z0-9.+-]+(?:;[^,<>\n\r]*)?;base64,/;

function isDataUrl(value: string): boolean {
  return DATA_URL_RE.test(value);
}

function isMediaDataUrl(value: string): boolean {
  return MEDIA_DATA_URL_RE.test(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNoPrototypeKeys(
  value: unknown,
  path: string,
  state: { nodes: number },
  depth = 0,
): void {
  state.nodes += 1;
  if (state.nodes > MAX_NODES) {
    throw new Error('가져온 데이터가 너무 커서 안전하게 확인할 수 없습니다.');
  }
  if (depth > MAX_DEPTH) {
    throw new Error('가져온 데이터의 중첩이 너무 깊어 안전하게 확인할 수 없습니다.');
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoPrototypeKeys(item, `${path}[${index}]`, state, depth + 1),
    );
    return;
  }
  if (!isPlainObject(value)) return;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(`허용되지 않는 키가 포함되어 있습니다: ${path}.${key}`);
    }
    assertNoPrototypeKeys(value[key], `${path}.${key}`, state, depth + 1);
  }
}

const urlField = z
  .string()
  .max(MAX_URL_LENGTH)
  .refine((value) => value === '' || safeUrl(value) !== null, {
    message: 'http 또는 https 주소만 사용할 수 있습니다.',
  });

const dateField = z
  .string()
  .max(40)
  .refine((value) => value === '' || Number.isFinite(Date.parse(value)), {
    message: '날짜 형식이 올바르지 않습니다.',
  });

const idField = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9._:@-]+$/, 'ID에 사용할 수 없는 문자가 있습니다.');

const dataUrlField = z
  .string()
  .max(14_000_000)
  .refine((value) => value === '' || isDataUrl(value), {
    message: '파일 원본은 data: URL 형식이어야 합니다.',
  });

const audioDataField = z
  .string()
  .max(14_000_000)
  .refine((value) => value === '' || isMediaDataUrl(value), {
    message: '음성 답변은 audio 또는 video data: URL 형식이어야 합니다.',
  });

const mimeField = z
  .string()
  .max(160)
  .refine(
    (value) =>
      value === '' || (value.includes('/') && !/[\u0000-\u001f\u007f]/.test(value)),
    { message: 'MIME 형식이 올바르지 않습니다.' },
  );

const kindField = z.enum(['이력서', '자기소개서', '경력기술서', '포트폴리오']);
const stageField = z.enum(['preparing', 'applied', 'interview', 'offer', 'closed']);
const jobStatusField = z.enum(['open', 'closed', 'unknown']);
const verificationField = z.enum(['demo', 'manual', 'unverified', 'source']);
const colorField = z.enum(['blue', 'green', 'orange', 'violet', 'ink']);

const jobSchema = z
  .object({
    id: idField,
    company: z.string().max(200),
    title: z.string().max(200),
    role: z.string().max(200),
    location: z.string().max(200),
    experience: z.string().max(200),
    employment: z.string().max(100),
    salary: z.string().max(200),
    skills: z.array(z.string().min(1).max(MAX_SKILL_LENGTH)).max(50),
    publishedAt: dateField,
    deadline: dateField,
    deadlineType: z.enum(['date', 'rolling', 'until-filled', 'unknown']).optional(),
    status: jobStatusField,
    verification: verificationField,
    verifiedAt: dateField,
    sourceUrl: urlField,
    source: z.string().max(200),
    description: z.string().max(MAX_TEXT_BLOCK),
    requirements: z.string().max(MAX_TEXT_BLOCK),
    benefits: z.string().max(MAX_TEXT_BLOCK),
    companyInfo: z.string().max(MAX_TEXT_BLOCK),
    saved: z.boolean(),
    isDemo: z.boolean(),
    color: colorField,
  })
  .strict();

/** Validate normalized public-source data before it enters the local workspace. */
export function parseRemoteJob(value: unknown): Job { return jobSchema.parse(value); }

const documentSchema = z
  .object({
    id: idField,
    groupId: idField,
    title: z.string().max(200),
    kind: kindField,
    version: z.number().int().min(1).max(10_000),
    text: z.string().max(400_000),
    createdAt: dateField,
    isDemo: z.boolean(),
    fileName: z.string().max(512).optional(),
    fileData: dataUrlField.optional(),
    mime: mimeField.optional(),
    extractionNote: z.string().max(1000).optional(),
  })
  .strict();

const submissionSchema = z
  .object({
    id: idField,
    createdAt: dateField,
    // A confirmed submission always references at least one document; the UI
    // disables freezing with an empty selection.
    documentIds: z.array(idField).min(1).max(100),
  })
  .strict();

const applicationSchema = z
  .object({
    id: idField,
    jobId: idField,
    jobSnapshot: jobSchema,
    stage: stageField,
    createdAt: dateField,
    interviewAt: dateField,
    notes: z.string().max(50_000),
    submissions: z.array(submissionSchema).max(100),
    isDemo: z.boolean(),
  })
  .strict();

const practiceSchema = z
  .object({
    id: idField,
    applicationId: idField,
    questionId: z.string().max(200),
    question: z.string().max(2000),
    answer: z.string().max(50_000),
    confidence: z.enum(['again', 'ready']),
    createdAt: dateField,
    audioData: audioDataField.optional(),
  })
  .strict();

const profileSchema = z
  .object({
    name: z.string().max(120),
    role: z.string().max(120),
    skills: z.array(z.string().min(1).max(MAX_SKILL_LENGTH)).max(50),
    locations: z.array(z.string().min(1).max(MAX_LOCATION_LENGTH)).max(50),
    excludeKeywords: z.array(z.string().min(1).max(MAX_SKILL_LENGTH)).max(50),
    weeklyGoal: z.number().int().min(0).max(100),
  })
  .strict();

const companyNotesSchema = z
  .record(z.string().max(200), z.string().max(20_000))
  .refine((value) => Object.keys(value).length <= 500, {
    message: '회사 메모가 너무 많습니다.',
  });

const workspaceSchema = z
  .object({
    schemaVersion: z.literal(1),
    jobs: z.array(jobSchema).max(500),
    documents: z.array(documentSchema).max(500),
    applications: z.array(applicationSchema).max(500),
    practice: z.array(practiceSchema).max(2000),
    profile: profileSchema,
    companyNotes: companyNotesSchema,
    demo: z.boolean(),
  })
  .strict();

function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
    .join(' / ');
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`${label}에 중복된 ID가 있습니다: ${value}`);
    }
    seen.add(value);
  }
}

function assertReferences(state: WorkspaceState): void {
  const documentIds = new Set<string>();
  for (const doc of state.documents) {
    if (documentIds.has(doc.id)) {
      throw new Error(`문서 ID가 중복되었습니다: ${doc.id}`);
    }
    documentIds.add(doc.id);
  }

  const groupVersions = new Set<string>();
  for (const doc of state.documents) {
    const key = `${doc.groupId}::${doc.version}`;
    if (groupVersions.has(key)) {
      throw new Error(`같은 문서 묶음에 같은 버전이 두 번 있습니다: ${doc.groupId} v${doc.version}`);
    }
    groupVersions.add(key);
  }

  assertUnique(state.jobs.map((job) => job.id), '공고');
  assertUnique(state.applications.map((app) => app.id), '지원 기록');
  assertUnique(state.practice.map((entry) => entry.id), '연습 기록');

  const submissionIds: string[] = [];
  const applicationIds = new Set(state.applications.map((app) => app.id));

  for (const app of state.applications) {
    if (app.jobSnapshot.id !== app.jobId) {
      throw new Error(`지원 기록의 공고 참조가 올바르지 않습니다: ${app.id}`);
    }
    for (const submission of app.submissions) {
      submissionIds.push(submission.id);
      for (const documentId of submission.documentIds) {
        if (!documentIds.has(documentId)) {
          throw new Error(`지원 기록이 없는 문서를 가리킵니다: ${documentId}`);
        }
      }
    }
  }
  assertUnique(submissionIds, '제출 기록');

  for (const entry of state.practice) {
    if (entry.applicationId && !applicationIds.has(entry.applicationId)) {
      throw new Error(`연습 기록이 없는 지원을 가리킵니다: ${entry.applicationId}`);
    }
  }
}

function unwrapBackup(data: unknown): unknown {
  if (
    isPlainObject(data) &&
    data.format === BACKUP_FORMAT &&
    Object.prototype.hasOwnProperty.call(data, 'state')
  ) {
    const version = data.formatVersion;
    if (typeof version === 'number' && version > BACKUP_FORMAT_VERSION) {
      throw new Error(
        `더 새로운 버전의 백업 파일입니다. (v${version}) 이 앱에서는 열 수 없습니다.`,
      );
    }
    return data.state;
  }
  return data;
}

/**
 * Strictly validates untrusted data (backup import or IndexedDB hydration) and
 * returns a WorkspaceState. Throws a readable Korean Error when the payload is
 * malformed, oversized, references missing records, or contains prototype keys.
 */
export function validateBackup(data: unknown): WorkspaceState {
  assertNoPrototypeKeys(data, 'root', { nodes: 0 });
  const candidate = unwrapBackup(data);
  const result = workspaceSchema.safeParse(candidate);
  if (!result.success) {
    throw new Error(`데이터 형식이 올바르지 않습니다. (${formatIssues(result.error)})`);
  }
  const state = result.data as unknown as WorkspaceState;
  assertReferences(state);
  return state;
}
