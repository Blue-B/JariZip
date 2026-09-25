import { Link } from 'react-router-dom';
import { ArrowUpRight, ArrowRight, Bookmark, FolderOpen, MessageCircle, Send, Plus, CalendarDays, Check, Compass, ShieldCheck, FileText, Sparkles, History, LockKeyhole } from 'lucide-react';
import { useWorkspace } from '../../lib/store';
import { formatDate, latestDocuments, matchJob, STAGES, stageCounts } from '../../lib/domain';
import { CompanyMark, EmptyState, JobBadge, SectionTitle, Tag, TextArrow, effectiveStatus } from '../../components/ui';
import JippiArt from '../../components/JippiArt';
import WeekPlanner, { type WeekAppointment } from '../../components/WeekPlanner';

/** Builds a real, ordered activity feed from stored timestamps only. */
interface ActivityItem { id: string; at: string; company: string; label: string; to: string }
function buildActivity(state: ReturnType<typeof useWorkspace>['state']): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const application of state.applications) {
    items.push({ id: `start-${application.id}`, at: application.createdAt, company: application.jobSnapshot.company, label: '지원 준비 시작', to: `/app/applications?application=${application.id}` });
    for (const submission of application.submissions) {
      items.push({ id: submission.id, at: submission.createdAt, company: application.jobSnapshot.company, label: `제출본 ${submission.documentIds.length}개 확정`, to: `/app/applications?application=${application.id}` });
    }
  }
  for (const entry of state.practice) {
    const application = state.applications.find(a => a.id === entry.applicationId);
    items.push({ id: entry.id, at: entry.createdAt, company: application?.jobSnapshot.company ?? '면접 연습', label: '면접 답변 저장', to: `/app/interview?application=${entry.applicationId}` });
  }
  return items.filter(i => Number.isFinite(Date.parse(i.at))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
}

export default function Dashboard() {
  const { state } = useWorkspace();
  const live = state.applications.filter(a => !['offer', 'closed'].includes(a.stage));
  const saved = state.jobs.filter(j => j.saved);
  const documents = latestDocuments(state.documents);
  const interviews = state.applications.filter(a => a.stage === 'interview');
  const counts = stageCounts(state.applications);
  const appointments: WeekAppointment[] = state.applications
    .filter(a => a.interviewAt)
    .map(a => ({ id: a.id, at: a.interviewAt, company: a.jobSnapshot.company, title: a.jobSnapshot.title, isDemo: a.isDemo }));
  const recommendations = [...state.jobs].filter(j => effectiveStatus(j) !== 'closed' && !matchJob(j, state.profile).excluded.length).sort((a, b) => matchJob(b, state.profile).matched.length - matchJob(a, state.profile).matched.length).slice(0, 3);
  const recentDocuments = [...documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
  const activity = buildActivity(state);

  const stats = [
    { label: '관심 공고', value: saved.length, unit: '개', sub: '다시 살펴볼 자리', icon: Bookmark, url: '/app/jobs?saved=1' },
    { label: '진행 중인 지원', value: live.length, unit: '건', sub: '한 단계씩 준비 중', icon: Send, url: '/app/applications' },
    { label: '면접 준비', value: interviews.length, unit: '건', sub: '내 이야기로 준비하기', icon: MessageCircle, url: '/app/interview' },
    { label: '내 서류', value: documents.length, unit: '개', sub: '제출본까지 차곡차곡', icon: FolderOpen, url: '/app/documents' },
  ];

  const nextStep = (() => {
    if (!state.applications.length) return { title: '첫 지원 자리를 찾아볼까요?', body: '공고를 저장하고 ‘지원 준비하기’를 누르면 지원 공간이 만들어져요.', cta: '공고 탐색하기', to: '/app/jobs', icon: <Compass size={16} /> };
    if (!documents.length) return { title: '제출할 서류를 준비해볼까요?', body: '이력서나 자기소개서를 보관하면 제출본과 면접 준비에 바로 쓸 수 있어요.', cta: '서류 보관함 열기', to: '/app/documents', icon: <FolderOpen size={16} /> };
    const soon = interviews.filter(a => a.submissions.length > 0 && Date.parse(a.interviewAt) >= Date.now()).sort((a, b) => Date.parse(a.interviewAt) - Date.parse(b.interviewAt))[0];
    if (soon) return { title: '다가오는 면접, 내 이야기로 준비해요', body: `${soon.jobSnapshot.company}에 확정한 제출본을 바탕으로 답변을 연습해보세요.`, cta: '면접 연습 시작', to: `/app/interview?application=${soon.id}`, icon: <MessageCircle size={16} /> };
    const withoutSubmission = live.find(a => !a.submissions.length);
    if (withoutSubmission) return { title: '제출본을 확정할 차례예요', body: `${withoutSubmission.jobSnapshot.company}에 실제로 제출한 버전을 골라주세요. 이후 서류를 고쳐도 제출본은 그대로 남아요.`, cta: '제출본 확정하기', to: `/app/applications?application=${withoutSubmission.id}`, icon: <LockKeyhole size={16} /> };
    return { title: '오늘의 준비를 이어가볼까요?', body: '새 공고를 살펴보거나 보관한 서류를 다듬어보세요.', cta: '공고 탐색하기', to: '/app/jobs', icon: <Compass size={16} /> };
  })();

  const board = STAGES.map(stage => ({ ...stage, count: counts[stage.id] }));

  return <div className="dashboard page-enter">
    <div className="dashboard-greeting"><div><p className="eyebrow">YOUR NEXT CHAPTER</p><h1>나의 다음 자리, 한눈에.</h1></div><span className="today-label"><CalendarDays size={15} />{new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}</span></div>

    <section className="welcome-banner">
      <div className="welcome-copy">
        <span className="welcome-eyebrow"><Sparkles size={14} />오늘의 다음 단계</span>
        <h2>{nextStep.title}</h2>
        <p>{nextStep.body}</p>
        <div className="welcome-actions">
          <Link to={nextStep.to} className="button primary">{nextStep.icon}{nextStep.cta}<ArrowRight size={15} /></Link>
          <Link to="/app/applications" className="button secondary">지원 현황 보기</Link>
        </div>
        <div className="welcome-facts">
          <span><ShieldCheck size={14} />이 기기에 저장</span>
          <span>계정 없이 시작</span>
          <span>오픈소스</span>
        </div>
      </div>
      <div className="welcome-art">
        <span className="welcome-orbit orbit-one" />
        <span className="welcome-orbit orbit-two" />
        <span className="welcome-jippi"><JippiArt pose="wave" alt="지피가 다음 준비를 응원해요" priority /></span>
        <span className="welcome-chip chip-a"><Bookmark size={14} />관심 공고 {saved.length}</span>
        <span className="welcome-chip chip-b"><CalendarDays size={14} />면접 일정 {appointments.length}</span>
      </div>
    </section>

    {state.demo && <div className="demo-banner"><span className="demo-pill">샘플 공간</span><p>가상 예시가 포함된 공간이에요. 직접 추가한 공고와 자료는 예시와 구분해 보관해요.</p><Link to="/app/settings">내 자료로 시작<ArrowRight size={14} /></Link></div>}

    <section className="stats-strip" aria-label="나의 준비 현황">{stats.map(s => <Link key={s.label} to={s.url} className="stat-item"><div className="stat-label"><s.icon size={16} />{s.label}<ArrowUpRight size={13} /></div><div className="stat-value">{s.value}<span>{s.unit}</span></div><span className="stat-sub">{s.sub}</span></Link>)}</section>

    <div className="dashboard-columns">
      <div className="dashboard-primary">
        <WeekPlanner appointments={appointments} />

        <section className="panel"><SectionTitle title="이어가던 준비" meta="단계별로 정리한 지원 현황" action={<Link className="text-link" to="/app/applications"><TextArrow>지원 현황</TextArrow></Link>} />
          {state.applications.length ? <>
            <div className="stage-summary" aria-label="지원 단계 요약">{board.map(stage => <Link key={stage.id} className="stage-summary-item" to="/app/applications"><span className={`stage-dot stage-${stage.id}`} /><strong>{stage.count}</strong><span>{stage.label}</span></Link>)}</div>
            <div className="recent-applications">{state.applications.slice(0, 3).map(a => <Link key={a.id} to={`/app/applications?application=${a.id}`}><CompanyMark job={a.jobSnapshot} small /><div><strong>{a.jobSnapshot.company}</strong><span>{a.jobSnapshot.title}</span></div>{a.interviewAt && <span className="recent-app-date"><CalendarDays size={12} />{formatDate(a.interviewAt)}</span>}<Tag tone={a.stage === 'interview' ? 'blue' : a.stage === 'offer' ? 'green' : 'neutral'}>{STAGES.find(s => s.id === a.stage)?.label}</Tag><ArrowUpRight size={15} className="muted" /></Link>)}</div>
          </> : <EmptyState title="첫 번째 지원을 시작해보세요" description="공고에서 ‘지원 준비’를 누르면 회사별 준비 공간이 생겨요." action={<Link to="/app/jobs" className="button secondary">공고 탐색<Compass size={15} /></Link>} />}
        </section>

        <section className="panel recommendation-panel"><SectionTitle title="내 경험과 맞닿은 공고" meta="프로필에 등록한 기술을 기준으로 정리했어요" action={<Link className="text-link" to="/app/jobs"><TextArrow>모두 보기</TextArrow></Link>} />{recommendations.length ? recommendations.map(job => { const match = matchJob(job, state.profile); return <Link key={job.id} className="recommended-job" to={`/app/jobs?job=${job.id}`}><CompanyMark job={job} /><div className="recommended-job-main"><div className="company-line"><span>{job.company}</span>{job.isDemo && <span className="demo-inline">가상 기업</span>}</div><h3>{job.title}</h3><div className="job-meta">{job.location}<span>·</span>{job.experience}<span>·</span>{job.employment}</div><div className="tag-row">{job.skills.slice(0, 3).map(skill => <Tag key={skill} tone={match.matched.includes(skill) ? 'blue' : 'neutral'}>{skill}</Tag>)}</div></div><div className="recommended-job-side"><JobBadge job={job} /><ArrowUpRight size={20} /></div></Link>; }) : <EmptyState title="조건에 맞는 공고를 모아보세요" description="공고를 추가하거나 설정에서 관심 기술을 바꾸면 여기에 나타나요." action={<Link to="/app/jobs" className="button secondary">공고 탐색<Compass size={15} /></Link>} />}</section>
      </div>

      <aside className="dashboard-secondary">
        <section className="panel recent-documents-panel"><SectionTitle title="최근 서류" action={<Link className="text-link" to="/app/documents"><TextArrow>보관함</TextArrow></Link>} />
          {recentDocuments.length ? <div className="recent-documents">{recentDocuments.map(doc => <Link key={doc.id} to={`/app/documents?doc=${doc.id}`}><span className={`recent-doc-icon kind-${doc.kind}`}><FileText size={16} /></span><div><strong>{doc.title}</strong><span>{doc.kind} · v{doc.version} · {formatDate(doc.createdAt)}</span></div><ArrowUpRight size={15} /></Link>)}</div> : <div className="quiet-empty"><FolderOpen size={23} /><p>아직 보관한 서류가 없어요.</p><Link to="/app/documents" className="text-link">첫 서류 넣기</Link></div>}
          <Link to="/app/documents?new=1" className="quick-document"><span className="quick-document-icon"><Plus size={19} /></span><div><strong>새 서류 한 장</strong><span>이력서·자소서·포트폴리오</span></div><ArrowUpRight size={17} /></Link>
        </section>

        <section className="panel activity-panel"><SectionTitle title="최근 활동" action={<History size={17} className="muted" />} />
          {activity.length ? <ol className="activity-list">{activity.map(item => <li key={item.id}><Link to={item.to}><span className="activity-dot" /><div><strong>{item.company}</strong><span>{item.label}</span></div><time>{formatDate(item.at)}</time></Link></li>)}</ol> : <div className="quiet-empty"><History size={23} /><p>아직 기록한 활동이 없어요.</p></div>}
        </section>

        <section className="quick-actions"><h2>바로 가기</h2><div className="quick-action-grid"><Link to="/app/jobs?new=1"><Compass size={17} /><span>공고 추가</span></Link><Link to="/app/documents?new=1"><FolderOpen size={17} /><span>서류 작성</span></Link><Link to="/app/interview"><MessageCircle size={17} /><span>면접 연습</span></Link><Link to="/app/settings"><LockKeyhole size={17} /><span>백업·설정</span></Link></div></section>
      </aside>
    </div>
  </div>;
}
