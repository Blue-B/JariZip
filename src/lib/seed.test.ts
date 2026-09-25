import { describe, expect, it } from 'vitest';
import { getQuestions, maxVersion, practiceFor, stageCounts, validateBackup } from './domain';
import { DOCUMENT_TEMPLATES, createDemoState, createEmptyState } from './seed';

/* -------------------------------------------------------------------------- */
/* Demo / empty state                                                         */
/* -------------------------------------------------------------------------- */

describe('createDemoState', () => {
  it('is valid against the strict backup schema', () => {
    expect(() => validateBackup(createDemoState())).not.toThrow();
  });

  it('contains 9 fictional jobs across several roles', () => {
    const state = createDemoState();
    expect(state.jobs).toHaveLength(9);
    expect(state.jobs.every((job) => job.isDemo)).toBe(true);
    expect(state.jobs.every((job) => job.verification === 'demo')).toBe(true);
    expect(state.jobs.every((job) => job.sourceUrl.startsWith('https://example.com/'))).toBe(true);

    const roles = state.jobs.map((job) => job.role).join(' ');
    expect(roles).toMatch(/백엔드/);
    expect(roles).toMatch(/데이터/);
    expect(roles).toMatch(/디자인/);
    expect(roles).toMatch(/기획/);
  });

  it('contains 4 document groups with multiple versions', () => {
    const state = createDemoState();
    const groups = new Set(state.documents.map((doc) => doc.groupId));
    expect(groups.size).toBe(4);
    expect(state.documents.every((doc) => doc.isDemo)).toBe(true);
    expect(state.documents.some((doc) => doc.version > 1)).toBe(true);
  });

  it('distributes 5 applications across the pipeline', () => {
    const state = createDemoState();
    expect(state.applications).toHaveLength(5);
    const stages = state.applications.map((application) => application.stage);
    expect(new Set(stages)).toEqual(new Set(['preparing', 'applied', 'interview', 'offer']));
    expect(stages.filter((stage) => stage === 'interview')).toHaveLength(2);
  });

  it('uses immutable, existing submission document IDs', () => {
    const state = createDemoState();
    const documentIds = new Set(state.documents.map((doc) => doc.id));
    for (const application of state.applications) {
      for (const submission of application.submissions) {
        expect(submission.documentIds.length).toBeGreaterThan(0);
        for (const documentId of submission.documentIds) {
          expect(documentIds.has(documentId), documentId).toBe(true);
        }
      }
    }
  });

  it('grounds the applied demo app on the older v1 versions, not v2', () => {
    const state = createDemoState();
    const applied = state.applications.find((application) => application.id === 'app-2');
    expect(applied?.submissions[0].documentIds).toEqual(['doc-resume-v1', 'doc-cover-v1']);
  });

  it('grounds interview questions on the exact last submission IDs', () => {
    const state = createDemoState();
    const interview = state.applications.find((application) => application.id === 'app-3');
    expect(interview).toBeTruthy();

    const questions = getQuestions(interview!, state.documents);
    const references = new Set(questions.map((question) => question.reference));

    // Last submission used resume/cover v2, never v1.
    expect(references.has('doc-resume-v2')).toBe(true);
    expect(references.has('doc-cover-v2')).toBe(true);
    expect(references.has('doc-resume-v1')).toBe(false);
    expect(references.has('doc-cover-v1')).toBe(false);
  });

  it('keeps demo practice questionIds aligned with generated question ids', () => {
    const state = createDemoState();
    for (const entry of state.practice) {
      const application = state.applications.find((app) => app.id === entry.applicationId);
      expect(application, entry.applicationId).toBeTruthy();
      const questionIds = getQuestions(application!, state.documents).map((q) => q.id);
      // A stale questionId silently breaks the "answered" counter in the UI.
      expect(questionIds).toContain(entry.questionId);
    }
  });

  it('contains 2 practice entries and fictional company notes', () => {
    const state = createDemoState();
    expect(state.practice).toHaveLength(2);
    expect(Object.keys(state.companyNotes).length).toBeGreaterThan(0);
  });

  it('uses the required sample profile and no real names', () => {
    const state = createDemoState();
    expect(state.profile.name).toBe('샘플 워크스페이스');
    expect(state.profile.role).toBe('백엔드 개발');
    expect(state.profile.skills).toEqual(['Python', 'FastAPI', 'SQL', 'Docker']);
    expect(state.demo).toBe(true);

    const serialized = JSON.stringify(state);
    expect(serialized).toMatch(/가상/);
    expect(serialized).not.toMatch(/\b(김|박|최)[가-힣]{1,3}\b/);
    expect(serialized).not.toMatch(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
  });

  it('never marks demo jobs as verified with a timestamp', () => {
    const state = createDemoState();
    for (const job of state.jobs) {
      expect(job.verification).not.toBe('manual');
      expect(job.verifiedAt).toBe('');
    }
  });
});

describe('createEmptyState', () => {
  it('is valid and contains no records', () => {
    const state = createEmptyState();
    expect(() => validateBackup(state)).not.toThrow();
    expect(state.jobs).toEqual([]);
    expect(state.documents).toEqual([]);
    expect(state.applications).toEqual([]);
    expect(state.practice).toEqual([]);
    expect(state.demo).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Templates                                                                  */
/* -------------------------------------------------------------------------- */

describe('DOCUMENT_TEMPLATES', () => {
  it('provides 4 Korean editable templates for the four kinds', () => {
    expect(DOCUMENT_TEMPLATES).toHaveLength(4);
    expect(DOCUMENT_TEMPLATES.map((template) => template.kind).sort()).toEqual(
      ['이력서', '자기소개서', '경력기술서', '포트폴리오'].sort(),
    );
  });

  it('has unique ids, titles, summaries and non-empty content', () => {
    const ids = DOCUMENT_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const template of DOCUMENT_TEMPLATES) {
      expect(template.title.length).toBeGreaterThan(0);
      expect(template.summary.length).toBeGreaterThan(0);
      expect(template.content.length).toBeGreaterThan(50);
      expect(template.content).toMatch(/[가-힣]/);
    }
  });

  it('cannot pollute a workspace via validation', () => {
    const state = createEmptyState();
    state.documents = [
      {
        id: 'tpl-doc',
        groupId: 'tpl-group',
        title: DOCUMENT_TEMPLATES[0].title,
        kind: DOCUMENT_TEMPLATES[0].kind,
        version: 1,
        text: DOCUMENT_TEMPLATES[0].content,
        createdAt: new Date().toISOString(),
        isDemo: false,
      },
    ];
    expect(() => validateBackup(state)).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Store pure helpers                                                         */
/* -------------------------------------------------------------------------- */

describe('store helpers', () => {
  const state = createDemoState();

  it('counts stages across all five columns', () => {
    const counts = stageCounts(state.applications);
    expect(counts.preparing).toBe(1);
    expect(counts.applied).toBe(1);
    expect(counts.interview).toBe(2);
    expect(counts.offer).toBe(1);
    expect(counts.closed).toBe(0);
  });

  it('returns the highest version for a group', () => {
    expect(maxVersion(state.documents, 'group-resume')).toBe(2);
    expect(maxVersion(state.documents, 'group-missing')).toBe(0);
  });

  it('filters practice history by application', () => {
    expect(practiceFor(state.practice, 'app-3')).toHaveLength(1);
    expect(practiceFor(state.practice, 'app-1')).toHaveLength(0);
  });
});
