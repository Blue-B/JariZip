import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Search, RefreshCw, Bookmark, MapPin, Clock3, AlertCircle } from 'lucide-react';
import { useWorkspace } from '../../lib/store';
import { createApplication, formatDate } from '../../lib/domain';
import { canonicalJobUrl } from '../../lib/jobSearch';
import { fetchSources, refreshRemoteJob, upsertRemoteJob, sourceIdentity, type SearchSource, type SourceOption } from '../../lib/remoteJobs';
import { jobLocations, jobCategories, jobExperiences } from '../../lib/jobFilters';
import { useJobFeed } from '../../lib/useJobFeed';
import { jobDeadline } from '../../lib/jobDeadline';
import type { Job } from '../../lib/types';
import { Button, CompanyMark, EmptyState, ExternalJobLink, JobBadge, Modal, Tag } from '../../components/ui';
import '../../styles/discover.css';

const timeLabel = (value: string) => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const initialSearch = { query: '', source: 'all' as SearchSource, location: 'all', category: 'all', experience: 'all', revision: 0 };

export default function DiscoverJobs() {
  const { state, update, notify } = useWorkspace();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<SearchSource>('all');
  const [location, setLocation] = useState('all');
  const [category, setCategory] = useState('all');
  const [experience, setExperience] = useState('all');
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [applied, setApplied] = useState(initialSearch);
  const { result, loading, loadingMore, error, moreError, batch, added, hasMore, canAutoLoad, loadMore } = useJobFeed(applied);
  const [autoLoad, setAutoLoad] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const [clock, setClock] = useState(Date.now);
  const [detail, setDetail] = useState<Job | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [saving, setSaving] = useState(false);
  const detailRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchSources(controller.signal).then(setSources).catch(() => { /* Search displays connection errors. */ });
    const timer = window.setInterval(() => setClock(Date.now()), 60000);
    return () => { controller.abort(); detailRequest.current?.abort(); window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!autoLoad || !canAutoLoad || detail || !sentinel.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void loadMore(); }
    }, { rootMargin: '300px' });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [autoLoad, canAutoLoad, loadMore, detail]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setApplied({ query: query.trim(), source, location, category, experience, revision: 0 });
  }
  function resetSearch() {
    setQuery(''); setSource('all'); setLocation('all'); setCategory('all'); setExperience('all'); setApplied({ ...initialSearch });
  }
  async function openDetail(job: Job) {
    detailRequest.current?.abort(); const controller = new AbortController(); detailRequest.current = controller;
    setDetail(job); setDetailError(''); setDetailLoading(true);
    try { const value = await refreshRemoteJob(job, controller.signal); if (!controller.signal.aborted) setDetail(value); }
    catch (problem) {
      if (!controller.signal.aborted) { setDetailError(problem instanceof Error ? problem.message : '본문을 읽지 못했어요.'); setDetail({ ...job, status: 'unknown', verification: 'unverified' }); }
    } finally { if (!controller.signal.aborted) setDetailLoading(false); }
  }
  function closeDetail() { if (saving) return; detailRequest.current?.abort(); setDetail(null); setDetailError(''); }
  async function save(prepare: boolean) {
    if (!detail || saving || detailLoading || detailError) return;
    setSaving(true); setDetailError('');
    try {
      const fresh = await refreshRemoteJob(detail);
      setDetail(fresh);
      if (prepare && fresh.status !== 'open') throw new Error('지금 출처에서 접수 중인 상태를 확인하지 못했어요. 원본을 먼저 확인해주세요.');
      let applicationId = '', savedId = ''; let failure: Error | null = null;
      update(current => {
        try {
          const saved = upsertRemoteJob(current, fresh); savedId = saved.job.id;
          if (!prepare) return saved.state;
          const previous = current.applications.find(a => a.jobId === saved.job.id);
          if (previous) { applicationId = previous.id; return saved.state; }
          if (current.applications.length >= 500) throw new Error('지원 기록 한도 500건에 도달했어요.');
          const application = createApplication(saved.job); applicationId = application.id;
          return { ...saved.state, applications: [application, ...saved.state.applications] };
        } catch (problem) { failure = problem instanceof Error ? problem : new Error('공고를 저장하지 못했어요.'); return current; }
      });
      if (failure) throw failure;
      if (!savedId) throw new Error('현재 저장 공간에 반영하지 못했어요.');
      notify(prepare ? '공고 원문을 보관하고 지원 준비를 시작했어요. 기업에 지원서는 보내지 않았어요.' : '실제 공고와 조회 상태를 내 보관함에 저장했어요.');
      setDetail(null);
      if (prepare) navigate(`/app/applications?application=${applicationId}`);
    } catch (problem) { setDetailError(problem instanceof Error ? problem.message : '저장하지 못했어요.'); }
    finally { setSaving(false); }
  }

  const isSaved = (job: Job) => state.jobs.some(item => canonicalJobUrl(item.sourceUrl) === canonicalJobUrl(job.sourceUrl));
  const sourceName = applied.source === 'all' ? '통합 검색' : sources.find(item => item.id === applied.source)?.name ?? applied.source;
  const counts: Record<string, number> = {};
  for (const job of result?.jobs ?? []) { const id = sourceIdentity(job)?.source; if (id) counts[id] = (counts[id] ?? 0) + 1; }
  const filters = [applied.query ? `“${applied.query}”` : '', applied.location !== 'all' ? jobLocations.find(item => item.id === applied.location)?.name : '', applied.category !== 'all' ? jobCategories.find(item => item.id === applied.category)?.name : '', applied.experience !== 'all' ? jobExperiences.find(item => item.id === applied.experience)?.name : ''].filter(Boolean);
  return <div className="discover-page page-enter">
    <header className="discover-heading"><div><h1>채용 공고</h1><p>여러 채용 사이트의 공고를 전국 지역·직무별로 찾아보세요.</p></div><Link className="button secondary" to="/app/jobs"><Bookmark size={15}/>보관한 공고 {state.jobs.filter(job => !job.isDemo).length}</Link></header>
    <form className="discover-search" onSubmit={submit}>
      <div className="discover-search-row"><label className="discover-query"><Search size={19}/><span className="sr-only">실제 공고 검색어</span><input value={query} maxLength={120} onChange={event => setQuery(event.target.value)} placeholder="직무, 기술 또는 회사 이름"/></label><Button type="submit" variant="primary" disabled={loading}>공고 찾기<ArrowRight size={16}/></Button></div>
      <div className="discover-filter-grid">
        <label><span>공고 출처</span><select value={source} onChange={event => setSource(event.target.value as SearchSource)}><option value="all">모든 연결 출처</option>{sources.map(item => <option key={item.id} value={item.id} disabled={!item.enabled}>{item.name}{item.enabled ? '' : ' · API 키 필요'}</option>)}</select></label>
        <label><span>공고 근무 지역</span><select value={location} onChange={event => setLocation(event.target.value)}>{jobLocations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>직무 분야</span><select value={category} onChange={event => setCategory(event.target.value)}>{jobCategories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>지원 경력</span><select value={experience} onChange={event => setExperience(event.target.value)}>{jobExperiences.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
    </form>
    <p className="discover-privacy">검색어·지역·직무·경력 조건만 채용 서비스로 전송해요. 이력서·메모·녹음은 전송하지 않아요.</p>
    <div className="discover-results-heading"><div><strong>{loading ? '출처에서 불러오는 중' : result ? `${sourceName} · 누적 ${result.jobs.length.toLocaleString()}건` : '조회하지 못했어요'}</strong>{filters.length > 0 && <p className="discover-active-filters">{filters.join(' · ')}</p>}</div><div className="discover-result-actions"><Button variant="ghost" disabled={loading} onClick={resetSearch}>조건 초기화</Button><Button variant="ghost" disabled={loading} onClick={() => setApplied(value => ({ ...value, revision: value.revision + 1 }))}><RefreshCw size={14}/>다시 조회</Button></div></div>
    {error && <div className="discover-error" role="alert"><AlertCircle size={20}/><div><h2>공고를 가져오지 못했어요</h2><p>{error}</p><p>가상 공고로 대신 채우지 않아요. 보관한 자료는 그대로 사용할 수 있어요.</p><Link to="/app/jobs">내 보관함 열기<ArrowRight size={14}/></Link></div></div>}
    {loading && <div className="discover-loading" role="status"><RefreshCw size={21}/>실제 공고와 접수 상태를 확인하고 있어요.</div>}
    {result && <>
      {result.sourceResults.length > 0 && <div className="discover-source-results" aria-label="출처별 조회 결과">{result.sourceResults.map(item => <div className={`discover-source-result${item.status === 'error' ? ' is-error' : ''}`} key={item.id}>
        <span>{item.name}</span><strong>누적 {(counts[item.id] ?? 0).toLocaleString()}건</strong>
        <span className="discover-source-progress">{item.status === 'error' ? '조회 실패 · 기존 결과 유지' : item.exhausted ? '제공된 결과 끝' : `이번 조회 ${item.count}건 · 더 있음`}</span>
        {item.message && <span className="discover-source-message">{item.message}</span>}
      </div>)}</div>}
      <div className="discover-feed-controls"><label><input type="checkbox" checked={autoLoad} onChange={event => setAutoLoad(event.target.checked)}/>스크롤할 때 자동으로 더 보기</label><p>건수는 이 검색에서 불러온 누적 수예요. 각 사이트의 전체 공고 수는 아니에요.</p></div>
      <div className="discover-source-time"><Clock3 size={14}/><span>출처 조회 {timeLabel(result.checkedAt)}{result.cached ? ' · 1분 이내 캐시' : ''}</span><span>같은 원문 주소는 한 번만 표시 · {batch}회 불러옴</span></div>
      <div className="discover-list">{result.jobs.map(job => {
        const deadline = jobDeadline(job, clock);
        return <button type="button" className="discover-job" key={job.id} onClick={() => void openDetail(job)}>
          <CompanyMark job={job}/><span className="discover-job-main"><span className="discover-company"><span className="discover-source-label">{job.source}</span>{job.company}</span><strong>{job.title}</strong><span className="discover-meta"><span><MapPin size={13}/>{job.location}</span><span>{job.experience}</span>{job.role !== '미분류' && <span>{job.role}</span>}{job.employment !== '미기재' && <span>{job.employment}</span>}</span></span>
          <span className="discover-job-side"><JobBadge job={deadline.expired ? { ...job, status: 'closed' } : job}/><span className={`discover-deadline${deadline.urgent ? ' is-urgent' : ''}`} title={deadline.detail}><Clock3 size={13}/>{deadline.label}</span><span>{job.publishedAt ? `게시 ${formatDate(job.publishedAt)}` : '게시일 미공개'}</span>{isSaved(job) && <span className="discover-saved"><Bookmark size={12}/>보관함에 있음</span>}</span><ArrowUpRight size={18}/>
        </button>;
      })}</div>
      {!result.jobs.length && <EmptyState title={hasMore ? '이 조회 구간에는 조건에 맞는 공고가 없어요' : '조건에 맞는 접수 중 공고가 없어요'} description={hasMore ? '아직 확인할 공고가 있어요. 아래 공고 더 보기로 이어서 찾거나 조건을 넓혀보세요.' : '검색어를 줄이거나 지역·직무·경력 조건을 넓혀보세요. 마감·미확인 결과는 표시하지 않아요.'} action={<Button onClick={resetSearch}>전체 공고 보기</Button>}/>}
      <div ref={sentinel} className="discover-load-more">
        {moreError && <p className="discover-more-error" role="alert">{moreError} 기존 목록은 그대로예요. 아래 버튼으로 다시 시도해주세요.</p>}
        <p role="status" aria-live="polite">{loadingMore ? '기존 목록 아래에 다음 공고를 불러오고 있어요.' : !hasMore ? '출처에서 제공한 마지막 결과까지 확인했어요.' : batch > 1 ? `이번에 ${added}건 추가 · 누적 ${result.jobs.length.toLocaleString()}건` : '공고를 더 불러와도 앞에서 본 목록은 그대로 남아요.'}</p>
        <Button disabled={!hasMore || loadingMore} onClick={() => void loadMore()}><RefreshCw size={15}/>{loadingMore ? '공고 불러오는 중' : '공고 더 보기'}</Button>
        {autoLoad && hasMore && !loadingMore && !canAutoLoad && <p className="field-hint">추가 결과가 없거나 출처 오류가 있어 자동 조회를 잠시 멈췄어요. 버튼으로 이어서 확인할 수 있어요.</p>}
      </div>
      <div className="discover-footnotes">{result.warnings.map(warning => <p key={warning}>{warning}</p>)}<p>출처별 검색 범위와 정렬 방식이 다르며, 같은 채용이 다른 사이트에도 등록되어 있을 수 있어요. 실제 지원 직전에는 원본을 확인해주세요.</p></div>
    </>}
    <details className="discover-connection"><summary>연결 방식과 조회 제한</summary><p>출처마다 다음 조회 위치를 따로 기억하고, 결과가 끝난 출처는 멈춰요. 조회에 실패한 구간은 건너뛰지 않고 다음 요청에서 다시 시도합니다. 한 번의 조회에서는 출처당 최대 세 구간을 확인해요. 출처에 없는 공고를 만들거나 같은 목록을 반복해 채우지 않습니다.</p><p>공개 응답은 형식 변경이나 조회 제한의 영향을 받을 수 있어요. 차단이나 인증 요구는 우회하지 않습니다. 사람인은 공식 API 키를 서버의 <code>SARAMIN_ACCESS_KEY</code>에 설정하면 사용할 수 있어요.</p><Link to="/app/settings">출처별 연결 상태 확인<ArrowUpRight size={13}/></Link></details>
    {detail && <Modal title={detail.title} description={`${detail.company} · ${detail.source}`} size="drawer" onClose={closeDetail}>
      <div className="discover-detail-status"><JobBadge job={detail}/><ExternalJobLink job={detail}/></div>
      {detailLoading ? <p className="discover-loading" role="status">출처에서 공고 본문을 가져오는 중이에요.</p> : <>
        {detailError && <div role="alert" className="discover-error"><p>{detailError}</p><Button onClick={() => void openDetail(detail)} disabled={saving}>본문 다시 조회</Button></div>}
        <dl className="discover-facts"><div><dt>근무지</dt><dd>{detail.location}</dd></div><div><dt>경력</dt><dd>{detail.experience}</dd></div><div><dt>분야</dt><dd>{detail.role}</dd></div><div><dt>고용 형태</dt><dd>{detail.employment}</dd></div><div><dt>게시일</dt><dd>{detail.publishedAt ? formatDate(detail.publishedAt) : '출처 미제공'}</dd></div><div><dt>마감일</dt><dd>{jobDeadline(detail, clock).detail}</dd></div></dl>
        <h3 className="subsection-heading">공고 본문</h3><div className="prose-text">{detail.description || '출처에서 본문을 제공하지 않았어요. 원본 링크를 확인해주세요.'}</div>
        {detail.requirements && <><h3 className="subsection-heading">지원 자격·우대사항</h3><div className="prose-text">{detail.requirements}</div></>}
        {detail.skills.length > 0 && <><h3 className="subsection-heading">출처에 등록된 기술</h3><div className="tag-row">{detail.skills.map(skill => <Tag key={skill}>{skill}</Tag>)}</div></>}
        {detail.benefits && <><h3 className="subsection-heading">근무 환경</h3><div className="prose-text">{detail.benefits}</div></>}
        <p className="discover-checked">조회 기록: {detail.verifiedAt ? timeLabel(detail.verifiedAt) : '미확인'}. 저장할 때 출처 상태를 다시 조회해요.</p>
      </>}
      <div className="discover-detail-actions"><Button disabled={saving || detailLoading || Boolean(detailError)} onClick={() => void save(false)}><Bookmark size={15}/>{saving ? '확인·저장 중' : isSaved(detail) ? '보관 공고 갱신' : '내 보관함에 저장'}</Button><Button variant="primary" disabled={saving || detailLoading || Boolean(detailError) || detail.status !== 'open'} onClick={() => void save(true)}>지원 준비하기<ArrowRight size={15}/></Button></div>
      <p className="field-hint">지원 공간과 원문을 보관하며 기업에 지원서를 전송하지는 않아요.</p>
    </Modal>}
  </div>;
}
