import { Link } from 'react-router-dom';
import { ArrowUpRight, ArrowRight, Bookmark, FolderOpen, MessageCircle, Send, Plus, CalendarDays, Compass, FileText, History, LockKeyhole, Building2, Settings2 } from 'lucide-react';
import { useWorkspace } from '../../lib/store';
import { formatDate, latestDocuments, matchJob, STAGES, stageCounts } from '../../lib/domain';
import { CompanyMark, EmptyState, JobBadge, SectionTitle, Tag, TextArrow, effectiveStatus } from '../../components/ui';
import JippiArt from '../../components/JippiArt';
import WeekPlanner, { type WeekAppointment } from '../../components/WeekPlanner';

type WorkspaceState = ReturnType<typeof useWorkspace>['state'];

/** Builds a real, ordered activity feed from stored timestamps only. */
interface ActivityItem { id: string; at: string; company: string; label: string; to: string }
function buildActivity(applications: WorkspaceState['applications'], practice: WorkspaceState['practice']): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const application of applications) {
    items.push({ id: `start-${application.id}`, at: application.createdAt, company: application.jobSnapshot.company, label: '지원 준비 시작', to: `/app/applications?application=${application.id}` });
    for (const submission of application.submissions) {
      items.push({ id: submission.id, at: submission.createdAt, company: application.jobSnapshot.company, label: `제출본 ${submission.documentIds.length}개 확정`, to: `/app/applications?application=${application.id}` });
    }
  }
  for (const entry of practice) {
    const application = applications.find(a => a.id === entry.applicationId);
    items.push({ id: entry.id, at: entry.createdAt, company: application?.jobSnapshot.company ?? '면접 연습', label: '면접 답변 저장', to: `/app/interview?application=${entry.applicationId}` });
  }
  return items.filter(i => Number.isFinite(Date.parse(i.at))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
}

export default function Dashboard() {
  const { state } = useWorkspace();
  // Only material the user actually saved is counted. Bundled examples never
  // appear in a statistic, a recommendation or a schedule.
  const realJobs = state.jobs.filter(j => !j.isDemo);
  const realApplications = state.applications.filter(a => !a.isDemo);
  const realDocumentGroups = latestDocuments(state.documents).filter(d => !d.isDemo);

  const saved = realJobs.filter(j => j.saved);
  const live = realApplications.filter(a => !['offer', 'closed'].includes(a.stage));
  const interviews = realApplications.filter(a => a.stage === 'interview');
  const counts = stageCounts(realApplications);
  const appointments: WeekAppointment[] = realApplications
    .filter(a => a.interviewAt)
    .map(a => ({ id: a.id, at: a.interviewAt, company: a.jobSnapshot.company, title: a.jobSnapshot.title }));
  const recommendations = [...realJobs]
    .filter(j => effectiveStatus(j) !== 'closed' && !matchJob(j, state.profile).excluded.length)
    .sort((a, b) => matchJob(b, state.profile).matched.length - matchJob(a, state.profile).matched.length)
    .slice(0, 3);
  const recentDocuments = [...realDocumentGroups].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
  const realPractice = state.practice.filter(p => realApplications.some(a => a.id === p.applicationId));
  const activity = buildActivity(realApplications, realPractice);
  const hasRealData = realJobs.length > 0 || realApplications.length > 0 || realDocumentGroups.length > 0;

  const stats = [
    { label: '관심 공고', value: saved.length, unit: '개', sub: '다시 살펴볼 공고', icon: Bookmark, url: '/app/jobs?saved=1' },
    { label: '진행 중인 지원', value: live.length, unit: '건', sub: '한 단계씩 준비 중', icon: Send, url: '/app/applications' },
    { label: '면접 준비', value: interviews.length, unit: '건', sub: '내 이야기로 준비하기', icon: MessageCircle, url: '/app/interview' },
    { label: '내 서류', value: realDocumentGroups.length, unit: '개', sub: '제출본까지 차곡차곡', icon: FolderOpen, url: '/app/documents' },
  ];

  const nextStep = (() => {
    if (!realApplications.length) return { title: '실제 공고를 찾아볼까요?', body: '여러 사이트의 실제 공고를 검색해 관심 공고로 저장하면 이 화면이 채워져요.', cta: '채용 탐색 열기', to: '/app/discover', icon: <Compass size={16} /> };
    if (!realDocumentGroups.length) return { title: '제출할 서류를 준비해볼까요?', body: '이력서나 자기소개서를 보관하면 제출본과 면접 준비에 바로 쓸 수 있어요.', cta: '서류 보관함 열기', to: '/app/documents', icon: <FolderOpen size={16} /> };
    const soon = interviews.filter(a => a.submissions.length > 0 && Date.parse(a.interviewAt) >= Date.now()).sort((a, b) => Date.parse(a.interviewAt) - Date.parse(b.interviewAt))[0];
    if (soon) return { title: '다가오는 면접, 내 이야기로 준비해요', body: `${soon.jobSnapshot.company}에 확정한 제출본을 바탕으로 답변을 연습해보세요.`, cta: '면접 연습 시작', to: `/app/interview?application=${soon.id}`, icon: <MessageCircle size={16} /> };
    const withoutSubmission = live.find(a => !a.submissions.length);
    if (withoutSubmission) return { title: '제출본을 확정할 차례예요', body: `${withoutSubmission.jobSnapshot.company}에 실제로 제출한 버전을 골라주세요. 이후 서류를 고쳐도 제출본은 그대로 남아요.`, cta: '제출본 확정하기', to: `/app/applications?application=${withoutSubmission.id}`, icon: <LockKeyhole size={16} /> };
    return { title: '오늘의 준비를 이어가볼까요?', body: '새 공고를 살펴보거나 보관한 서류를 다듬어보세요.', cta: '채용 탐색 열기', to: '/app/discover', icon: <Compass size={16} /> };
  })();

  const board = STAGES.map(stage => ({ ...stage, count: counts[stage.id] }));

  return <div className="dashboard page-enter">
    <div className="dashboard-greeting"><div><h1>나의 다음 자리, 한눈에.</h1></div><span className="today-label"><CalendarDays size={15} aria-hidden />{new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}</span></div>

    {state.demo && <div className="demo-banner"><span className="demo-pill">예시 포함</span><p>가상 예시가 들어 있습니다. 아래 현황에는 예시를 세지 않아요.</p><Link to="/app/settings">예시 정리하기<ArrowRight size={14} aria-hidden /></Link></div>}

    {!hasRealData ? (
      <section className="panel dash-empty" aria-labelledby="dash-empty-title">
        <div className="dash-empty-body">
          <h2 id="dash-empty-title">{state.demo ? '예시를 걷어내고 내 자료로 채워보세요' : '아직 보관한 자료가 없어요'}</h2>
          <p>현황은 실제로 저장한 공고·서류·지원 기록만 셉니다. 예시 공고는 숫자와 추천에 넣지 않았어요.</p>
          <div className="dash-empty-actions">
            <Link to="/app/discover" className="button primary"><Compass size={16} aria-hidden />채용 탐색 열기</Link>
            <Link to="/app/documents" className="button secondary">서류 올리기</Link>
          </div>
          <ol className="dash-empty-steps">
            <li><span>1</span>채용 탐색에서 검색어로 실제 공고를 찾습니다</li>
            <li><span>2</span>관심 공고로 저장하고 원문 주소를 함께 보관합니다</li>
            <li><span>3</span>서류와 면접 준비가 그 기록 위에서 이어집니다</li>
          </ol>
        </div>
        <div className="dash-empty-art"><JippiArt pose="wave" alt="지피가 첫 공고를 찾아보자고 제안하는 모습" priority /></div>
      </section>
    ) : (
      <>
        <section className="welcome-banner">
          <div className="welcome-copy">
            <span className="welcome-eyebrow">오늘의 다음 단계</span>
            <h2>{nextStep.title}</h2>
            <p>{nextStep.body}</p>
            <div className="welcome-actions">
              <Link to={nextStep.to} className="button primary">{nextStep.icon}{nextStep.cta}<ArrowRight size={15} aria-hidden /></Link>
              <Link to="/app/discover" className="button secondary">채용 탐색</Link>
            </div>
          </div>
          <div className="welcome-art">
            <span className="welcome-jippi"><JippiArt pose="wave" alt="지피가 다음 준비를 응원해요" priority /></span>
          </div>
        </section>

        <section className="stats-strip" aria-label="나의 준비 현황">{stats.map(s => <Link key={s.label} to={s.url} className="stat-item"><div className="stat-label"><s.icon size={16} aria-hidden />{s.label}<ArrowUpRight size={13} aria-hidden /></div><div className="stat-value">{s.value}<span>{s.unit}</span></div><span className="stat-sub">{s.sub}</span></Link>)}</section>

        <div className="dashboard-columns">
          <div className="dashboard-primary">
            <WeekPlanner appointments={appointments} />

            <section className="panel"><SectionTitle title="이어가던 준비" meta="단계별로 정리한 지원 현황" action={<Link className="text-link" to="/app/applications"><TextArrow>지원 현황</TextArrow></Link>} />
              {realApplications.length ? <>
                <div className="stage-summary" aria-label="지원 단계 요약">{board.map(stage => <Link key={stage.id} className="stage-summary-item" to="/app/applications"><span className={`stage-dot stage-${stage.id}`} /><strong>{stage.count}</strong><span>{stage.label}</span></Link>)}</div>
                <div className="recent-applications">{realApplications.slice(0, 3).map(a => <Link key={a.id} to={`/app/applications?application=${a.id}`}><CompanyMark job={a.jobSnapshot} small /><div><strong>{a.jobSnapshot.company}</strong><span>{a.jobSnapshot.title}</span></div>{a.interviewAt && <span className="recent-app-date"><CalendarDays size={12} aria-hidden />{formatDate(a.interviewAt)}</span>}<Tag tone={a.stage === 'interview' ? 'blue' : a.stage === 'offer' ? 'green' : 'neutral'}>{STAGES.find(s => s.id === a.stage)?.label}</Tag><ArrowUpRight size={15} className="muted" aria-hidden /></Link>)}</div>
              </> : <EmptyState title="첫 번째 지원을 시작해보세요" description="채용 탐색에서 공고를 저장하고 ‘지원 준비하기’를 누르면 회사별 준비 공간이 생겨요." action={<Link to="/app/discover" className="button secondary">채용 탐색<Compass size={15} aria-hidden /></Link>} />}
            </section>

            <section className="panel recommendation-panel"><SectionTitle title="내 경험과 맞닿은 공고" meta="프로필 기술과 겹치는, 내가 보관한 공고" action={<Link className="text-link" to="/app/jobs"><TextArrow>보관한 공고</TextArrow></Link>} />{recommendations.length ? recommendations.map(job => { const match = matchJob(job, state.profile); return <Link key={job.id} className="recommended-job" to={`/app/jobs?job=${job.id}`}><CompanyMark job={job} /><div className="recommended-job-main"><div className="company-line"><span>{job.company}</span></div><h3>{job.title}</h3><div className="job-meta">{job.location}<span>·</span>{job.experience}<span>·</span>{job.employment}</div><div className="tag-row">{job.skills.slice(0, 3).map(skill => <Tag key={skill} tone={match.matched.includes(skill) ? 'blue' : 'neutral'}>{skill}</Tag>)}</div></div><div className="recommended-job-side"><JobBadge job={job} /><ArrowUpRight size={20} aria-hidden /></div></Link>; }) : <EmptyState title="보관한 실제 공고가 아직 없어요" description="채용 탐색에서 공고를 검색해 관심 공고로 저장하면 여기에 나타나요." action={<Link to="/app/discover" className="button secondary">채용 탐색<Compass size={15} aria-hidden /></Link>} />}</section>
          </div>

          <aside className="dashboard-secondary">
            <section className="panel recent-documents-panel"><SectionTitle title="최근 서류" action={<Link className="text-link" to="/app/documents"><TextArrow>보관함</TextArrow></Link>} />
              {recentDocuments.length ? <div className="recent-documents">{recentDocuments.map(doc => <Link key={doc.id} to={`/app/documents?doc=${doc.id}`}><span className={`recent-doc-icon kind-${doc.kind}`}><FileText size={16} aria-hidden /></span><div><strong>{doc.title}</strong><span>{doc.kind} · v{doc.version} · {formatDate(doc.createdAt)}</span></div><ArrowUpRight size={15} aria-hidden /></Link>)}</div> : <div className="quiet-empty"><FolderOpen size={23} aria-hidden /><p>아직 보관한 서류가 없어요.</p><Link to="/app/documents" className="text-link">첫 서류 넣기</Link></div>}
              <Link to="/app/documents?new=1" className="quick-document"><span className="quick-document-icon"><Plus size={19} aria-hidden /></span><div><strong>새 서류 한 장</strong><span>이력서·자소서·포트폴리오</span></div><ArrowUpRight size={17} aria-hidden /></Link>
            </section>

            <section className="panel activity-panel"><SectionTitle title="최근 활동" action={<History size={17} className="muted" aria-hidden />} />
              {activity.length ? <ol className="activity-list">{activity.map(item => <li key={item.id}><Link to={item.to}><span className="activity-dot" /><div><strong>{item.company}</strong><span>{item.label}</span></div><time>{formatDate(item.at)}</time></Link></li>)}</ol> : <div className="quiet-empty"><History size={23} aria-hidden /><p>아직 기록한 활동이 없어요.</p></div>}
            </section>

            <section className="quick-actions"><h2>바로 가기</h2><div className="quick-action-grid"><Link to="/app/discover"><Compass size={17} aria-hidden /><span>채용 탐색</span></Link><Link to="/app/jobs?new=1"><Plus size={17} aria-hidden /><span>공고 추가</span></Link><Link to="/app/documents?new=1"><FolderOpen size={17} aria-hidden /><span>서류 작성</span></Link><Link to="/app/interview"><MessageCircle size={17} aria-hidden /><span>면접 연습</span></Link><Link to="/app/companies"><Building2 size={17} aria-hidden /><span>기업 노트</span></Link><Link to="/app/settings"><Settings2 size={17} aria-hidden /><span>백업·설정</span></Link></div></section>
          </aside>
        </div>
      </>
    )}
  </div>;
}
