import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ArrowUpRight, ArrowRight, FolderOpen, Check, CircleHelp, LockKeyhole } from 'lucide-react';
import type { Job } from '../lib/types';
import { safeUrl } from '../lib/domain';
export { Modal, ConfirmDialog } from './Modal';

export function Button({ children, variant = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button type="button" className={`button ${variant} ${className}`} {...props}>{children}</button>;
}
export function IconButton({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" aria-label={label} title={label} className={`icon-button ${className}`} {...props}>{children}</button>;
}
export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) { return <span className={`tag tag--${tone}`}>{children}</span>; }
export function CompanyMark({ job, small = false }: { job: Pick<Job, 'company' | 'color'>; small?: boolean }) {
  return <span className={`company-mark mark--${job.color} ${small ? 'small' : ''}`} aria-hidden="true">{job.company.slice(0, 1)}</span>;
}
export function effectiveStatus(job: Job): Job['status'] {
  const deadline = job.deadline && new Date(job.deadline.length === 10 ? `${job.deadline}T23:59:59+09:00` : job.deadline).getTime();
  if (job.status === 'closed' || (deadline && deadline < Date.now())) return 'closed';
  return job.status;
}
export function JobBadge({ job }: { job: Job }) {
  const status = effectiveStatus(job);
  return <Tag tone={status === 'open' ? 'green' : status === 'closed' ? 'neutral' : 'orange'}><span className="status-dot"/>{status === 'open' ? '접수 중' : status === 'closed' ? '마감' : '미확인'}{job.isDemo ? ' · 예시' : job.verification === 'manual' ? ' · 직접 확인' : ''}</Tag>;
}
export function ExternalJobLink({ job, label = '원본 공고', className = '' }: { job: Job; label?: string; className?: string }) {
  const url = safeUrl(job.sourceUrl);
  return url && !job.isDemo ? <a className={`button secondary ${className}`} href={url} target="_blank" rel="noopener noreferrer">{label}<ArrowUpRight size={15}/></a> : <span className={`button disabled ${className}`} title="가상 예시이거나 원본 주소가 등록되지 않았어요.">{job.isDemo ? '가상 예시 공고' : '원본 주소 없음'}</span>;
}
export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>{action && <div className="heading-actions">{action}</div>}</div>;
}
export function EmptyState({ title, description, action, icon }: { title: string; description: string; action?: ReactNode; icon?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon ?? <FolderOpen size={30} strokeWidth={1.4}/>}</div><h3>{title}</h3><p>{description}</p>{action}</div>;
}
export function Note({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'blue' | 'orange' }) {
  return <div className={`note note--${tone}`}><CircleHelp size={16}/><div>{children}</div></div>;
}
export function LocalNote() { return <span className="local-note"><LockKeyhole size={13}/>이 기기의 브라우저에 저장</span>; }
export function SectionTitle({ title, meta, action }: { title: string; meta?: string; action?: ReactNode }) {
  return <div className="section-title"><div><h2>{title}</h2>{meta && <span>{meta}</span>}</div>{action}</div>;
}
export function CheckItem({ checked, children }: { checked: boolean; children: ReactNode }) { return <span className={`check-item ${checked ? 'checked' : ''}`}><span>{checked ? <Check size={11}/> : null}</span>{children}</span>; }
export function TextArrow({ children }: { children: ReactNode }) { return <span className="text-arrow">{children}<ArrowRight size={15}/></span>; }
