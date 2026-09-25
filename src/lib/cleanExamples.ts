import type { WorkspaceState } from './types';

/** Used only after explicit confirmation. Keep personally created versions and live references. */
export function cleanExamples(state: WorkspaceState): WorkspaceState {
  const applications = state.applications.filter(a => !a.isDemo);
  const applicationIds = new Set(applications.map(a => a.id));
  const jobIds = new Set(applications.map(a => a.jobId));
  const submittedIds = new Set(applications.flatMap(a => a.submissions.flatMap(s => s.documentIds)));
  const personalGroups = new Set(state.documents.filter(d => !d.isDemo || submittedIds.has(d.id)).map(d => d.groupId));
  return {
    ...state, demo: false, applications,
    jobs: state.jobs.filter(j => !j.isDemo || jobIds.has(j.id)),
    documents: state.documents.filter(d => !d.isDemo || submittedIds.has(d.id) || personalGroups.has(d.groupId)),
    practice: state.practice.filter(p => applicationIds.has(p.applicationId)),
  };
}
