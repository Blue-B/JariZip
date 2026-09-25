export type JobStatus = 'open' | 'closed' | 'unknown';
export type Stage = 'preparing' | 'applied' | 'interview' | 'offer' | 'closed';
export type DocumentKind = '이력서' | '자기소개서' | '경력기술서' | '포트폴리오';
export interface Job {
  id: string; company: string; title: string; role: string; location: string;
  experience: string; employment: string; salary: string; skills: string[];
  publishedAt: string; deadline: string; status: JobStatus;
  verification: 'demo' | 'manual' | 'unverified' | 'source'; verifiedAt: string;
  sourceUrl: string; source: string; description: string; requirements: string;
  benefits: string; companyInfo: string; saved: boolean; isDemo: boolean;
  color: 'blue' | 'green' | 'orange' | 'violet' | 'ink';
}
export interface DocumentRecord {
  id: string; groupId: string; title: string; kind: DocumentKind; version: number;
  text: string; createdAt: string; isDemo: boolean;
  fileName?: string; fileData?: string; mime?: string; extractionNote?: string;
}
export interface Submission { id: string; createdAt: string; documentIds: string[] }
export interface Application {
  id: string; jobId: string; jobSnapshot: Job; stage: Stage; createdAt: string;
  interviewAt: string; notes: string; submissions: Submission[]; isDemo: boolean;
}
export interface PracticeEntry {
  id: string; applicationId: string; questionId: string; question: string;
  answer: string; confidence: 'again' | 'ready'; createdAt: string;
  audioData?: string;
}
export interface Profile {
  name: string; role: string; skills: string[]; locations: string[];
  excludeKeywords: string[]; weeklyGoal: number;
}
export interface WorkspaceState {
  schemaVersion: 1; jobs: Job[]; documents: DocumentRecord[];
  applications: Application[]; practice: PracticeEntry[];
  profile: Profile; companyNotes: Record<string, string>; demo: boolean;
}
export interface InterviewQuestion {
  id: string; topic: string; question: string; source: 'document' | 'job' | 'general';
  evidence: string; reference: string; followUp: string; hint: string;
}
export interface DocumentTemplate {
  id: string; title: string; kind: DocumentKind; summary: string;
  content: string; color: 'blue' | 'green' | 'orange' | 'violet';
}
