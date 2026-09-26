import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Search, RefreshCw, Bookmark, MapPin, AlertCircle, ChevronLeft, ChevronRight, Building2 } from 'lucide-react';
import { useWorkspace } from '../../lib/store';
import { createApplication, formatDate } from '../../lib/domain';
import { canonicalJobUrl } from '../../lib/jobSearch';
import { fetchSources, refreshRemoteJob, upsertRemoteJob, canRefreshJob, isApprovedSource, SOURCE_SITES, type SearchSource, type SourceOption } from '../../lib/remoteJobs';
import { jobLocations, jobCategories, jobExperiences } from '../../lib/jobFilters';
import { useJobFeed } from '../../lib/useJobFeed';
import { jobDeadline } from '../../lib/jobDeadline';
import { sortJobs, type JobSort } from '../../lib/jobSort';
import type { Job } from '../../lib/types';
import { Button, CompanyMark, EmptyState, ExternalJobLink, JobBadge, Modal, Tag } from '../../components/ui';
import JippiGuide from '../../components/JippiGuide';
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
  const [sourcesReady, setSourcesReady] = useState(false);
  const [sourcesError, setSourcesError] = useState('');
  const [sourceAttempt, setSourceAttempt] = useState(0);
  const [applied, setApplied] = useState(initialSearch);
  const enabledSourceIds = useMemo(() => sources.filter(item => item.enabled && isApprovedSource(item.id)).map(item => item.id), [sources]);
  const selectedUnavailable = applied.source !== 'all' && !enabledSourceIds.includes(applied.source);
  const paused = sourcesReady && (applied.source === 'all' ? enabledSourceIds.length === 0 : selectedUnavailable);
  const feedFilters = useMemo(() => ({ ...applied, paused: !sourcesReady || paused }), [applied, paused, sourcesReady]);
  const { result, readyForFilters, loading, loadingMore, error, moreError, hasMore, canAutoLoad, loadThrough } = useJobFeed(feedFilters);
  const [pageSize, setPageSize] = useState(30);
  const [order, setOrder] = useState<JobSort>('source');
  const [pageIndex, setPageIndex] = useState(0);
  const [visibleLimit, setVisibleLimit] = useState(30);
  const [autoLoad, setAutoLoad] = useState(false);
  const [moving, setMoving] = useState(false);
  const navigationBusy = useRef(false);
  const viewVersion = useRef(0);
  const initialFill = useRef('');
  const sentinel = useRef<HTMLDivElement | null>(null);
  const listHeading = useRef<HTMLDivElement | null>(null);
  const [clock, setClock] = useState(Date.now);
  const [detail, setDetail] = useState<Job | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [saving, setSaving] = useState(false);
  const detailRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setSourcesReady(false); setSourcesError('');
    void fetchSources(controller.signal).then(value => { setSources(value); setSourcesReady(true); }).catch(problem => { if (!controller.signal.aborted) { setSourcesError(problem instanceof Error ? problem.message : '공고 조회 서버 설정을 확인하지 못했어요.'); setSourcesReady(true); } });
    const timer = window.setInterval(() => setClock(Date.now()), 60000);
    return () => { controller.abort(); detailRequest.current?.abort(); window.clearInterval(timer); };
  }, [sourceAttempt]);

  // Source page sizes differ; fill a display page without throwing away the spare rows.
  useEffect(() => {
    if (loading || !result || !readyForFilters) return;
    const key = JSON.stringify([applied, pageSize]);
    if (initialFill.current === key) return;
    initialFill.current = key;
    if (result.jobs.length < pageSize && canAutoLoad) void loadThrough(pageSize);
  }, [applied, pageSize, result, readyForFilters, loading, canAutoLoad, loadThrough]);

  const advance = useCallback(async () => {
    if (loading || loadingMore || navigationBusy.current) return;
    const version = viewVersion.current;
    const start = autoLoad ? visibleLimit : (pageIndex + 1) * pageSize;
    const target = start + pageSize;
    navigationBusy.current = true; setMoving(true);
    try {
      const available = await loadThrough(target);
      if (version !== viewVersion.current || available <= start) return;
      if (autoLoad) setVisibleLimit(target);
      else {
        setPageIndex(value => value + 1);
        listHeading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
    } finally {
      if (version === viewVersion.current) { navigationBusy.current = false; setMoving(false); }
    }
  }, [loading, loadingMore, autoLoad, visibleLimit, pageIndex, pageSize, loadThrough]);

  const bufferedMore = (result?.jobs.length ?? 0) > (autoLoad ? visibleLimit : (pageIndex + 1) * pageSize);
  const canAdvance = bufferedMore || hasMore;
  useEffect(() => {
    if (!autoLoad || loading || loadingMore || moving || detail || !sentinel.current || (!bufferedMore && !canAutoLoad) || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void advance(); }
    }, { rootMargin: '200px' });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [autoLoad, bufferedMore, canAutoLoad, advance, detail, loading, loadingMore, moving]);

  function resetView(size = pageSize) {
    viewVersion.current++; navigationBusy.current = false; setMoving(false);
    setPageIndex(0); setVisibleLimit(size); initialFill.current = '';
  }
  function submit(event: FormEvent) {
    event.preventDefault(); resetView();
    setApplied({ query: query.trim(), source, location, category, experience, revision: 0 });
  }
  function resetSearch() {
    resetView(); setQuery(''); setSource('all'); setLocation('all'); setCategory('all'); setExperience('all'); setApplied({ ...initialSearch });
  }
  function changeMode(enabled: boolean) {
    viewVersion.current++; navigationBusy.current = false; setMoving(false);
    if (enabled) setVisibleLimit((pageIndex + 1) * pageSize);
    else setPageIndex(Math.max(0, Math.ceil(Math.min(visibleLimit, result?.jobs.length ?? pageSize) / pageSize) - 1));
    setAutoLoad(enabled);
  }
  async function openDetail(job: Job) {
    detailRequest.current?.abort(); const controller = new AbortController(); detailRequest.current = controller;
    setDetail(job); setDetailError(''); setDetailLoading(false);
    // Only officially approved sources are re-queried; others open as-is for manual review.
    if (!canRefreshJob(job)) return;
    setDetailLoading(true);
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
      const fresh = canRefreshJob(detail) ? await refreshRemoteJob(detail) : detail;
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
  const jobs = useMemo(() => sortJobs(result?.jobs ?? [], order, clock), [result?.jobs, order, clock]);
  const visibleJobs = autoLoad ? jobs.slice(0, visibleLimit) : jobs.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  const failures = result?.sourceResults.filter(item => item.status === 'error') ?? [];
  const filters = [applied.query ? `“${applied.query}”` : '', applied.location !== 'all' ? jobLocations.find(item => item.id === applied.location)?.name : '', applied.category !== 'all' ? jobCategories.find(item => item.id === applied.category)?.name : '', applied.experience !== 'all' ? jobExperiences.find(item => item.id === applied.experience)?.name : ''].filter(Boolean);
  const officialSites = (Object.keys(SOURCE_SITES) as (keyof typeof SOURCE_SITES)[]).map(id => SOURCE_SITES[id]);
  const disabledReason = (item: SourceOption) => item.id === 'saramin' || item.id === 'work24' ? 'API 키 미설정' : '제공사 사전 승인 없음';
  return <div className="discover-page page-enter">
    <header className="discover-heading">
      <div><h1>채용 공고</h1></div>
      <div className="discover-heading-aside"><JippiGuide/><Link className="button secondary" to="/app/jobs"><Bookmark size={16}/>보관한 공고</Link></div>
    </header>
    <form className="discover-search" onSubmit={submit}>
      <div className="discover-search-row"><label className="discover-query"><Search size={21}/><span className="sr-only">실제 공고 검색어</span><input value={query} maxLength={120} onChange={event => setQuery(event.target.value)} placeholder="직무, 기술, 회사 이름 검색"/></label><Button type="submit" variant="primary" disabled={loading}>공고 찾기<ArrowRight size={17}/></Button></div>
      <div className="discover-filter-grid">
        <label><span>공고 출처</span><select value={source} onChange={event => setSource(event.target.value as SearchSource)}><option value="all">모든 연결 출처</option>{sources.map(item => <option key={item.id} value={item.id} disabled={!item.enabled}>{item.name}{item.enabled ? '' : ` · ${disabledReason(item)}`}</option>)}</select></label>
        <label><span>공고 근무 지역</span><select value={location} onChange={event => setLocation(event.target.value)}>{jobLocations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>직무 분야</span><select value={category} onChange={event => setCategory(event.target.value)}>{jobCategories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>지원 경력</span><select value={experience} onChange={event => setExperience(event.target.value)}>{jobExperiences.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
    </form>
    <div ref={listHeading} className="discover-results-heading">
      <div><h2>{filters.length ? '검색 결과' : '채용 목록'}</h2>{filters.length > 0 && <p className="discover-active-filters">{filters.join(' · ')}</p>}</div>
      <div className="discover-result-actions"><Button variant="ghost" disabled={loading} onClick={resetSearch}>조건 초기화</Button><Button variant="ghost" disabled={loading} onClick={() => { resetView(); setApplied(value => ({ ...value, revision: value.revision + 1 })); }}><RefreshCw size={15}/>다시 조회</Button></div>
    </div>
    {!sourcesReady && <div className="discover-loading" role="status"><RefreshCw size={21}/>공고 출처 설정을 확인하고 있어요.</div>}
    {sourcesReady && sourcesError && <div className="discover-error" role="alert"><AlertCircle size={20}/><div><h2>공고 조회 서버를 확인하지 못했어요</h2><p>{sourcesError}</p><p>서버 실행 상태와 인터넷 연결을 확인해주세요. 보관한 자료는 그대로 사용할 수 있어요.</p><div className="discover-optional-actions"><Button onClick={() => setSourceAttempt(value => value + 1)}>서버 다시 확인</Button><Link className="button secondary" to="/app/jobs">내 보관함 열기<ArrowRight size={14}/></Link></div></div></div>}
    {sourcesReady && !sourcesError && paused && <section className="discover-optional" aria-live="polite">
      <h2>지금 자동으로 불러오는 공식 출처가 없어요</h2>
      <p>{applied.source !== 'all' ? '선택한 출처는 제공사의 사전 승인이 확인되지 않아 자동으로 조회하지 않아요. ' : ''}공식 API가 승인된 출처만 자동으로 불러오며, 그 밖의 사이트는 원문에서 직접 확인해 보관할 수 있어요. 화면의 클릭이나 설정으로 제공사 허가를 대신하지 않아요.</p>
      <ul className="discover-optional-list">{officialSites.map(site => <li key={site.url}><a href={site.url} target="_blank" rel="noopener noreferrer">{site.name} 원문 사이트 열기<ArrowUpRight size={14} aria-hidden/></a></li>)}</ul>
      <div className="discover-optional-actions"><Link className="button secondary" to="/app/jobs"><Bookmark size={15}/>보관한 공고·직접 추가</Link><Link className="button secondary" to="/app/settings">공고 연결 설정<ArrowUpRight size={14}/></Link></div>
      <p className="discover-optional-note">원문에서 확인한 공고는 <strong>공고 직접 추가</strong>로 보관하면 접수 상태가 <strong>미확인</strong>으로 남고, 내가 확인한 날짜만 기록돼요.</p>
    </section>}
    {!paused && !sourcesError && sourcesReady && <div className="discover-feed-controls">
      <label className="discover-auto-toggle"><input type="checkbox" checked={autoLoad} onChange={event => changeMode(event.target.checked)}/>스크롤할 때 자동으로 더 보기</label>
      <label className="discover-order"><span className="sr-only">공고 정렬</span><select value={order} onChange={event => { setOrder(event.target.value as JobSort); resetView(); }}><option value="source">출처 기본순</option><option value="deadline">마감일 가까운 순</option><option value="newest">게시일 최신순</option></select></label>
      <label className="discover-page-size"><span className="sr-only">한 번에 볼 공고 수</span><select value={pageSize} onChange={event => { const size = Number(event.target.value); setPageSize(size); resetView(size); }}><option value={30}>30개씩 보기</option><option value={50}>50개씩 보기</option></select></label>
    </div>}
    {!paused && order !== 'source' && <p className="discover-sort-note">불러온 공고 안에서 정렬해요. 날짜 미공개는 뒤에 표시하며, 더 불러오면 순서가 바뀔 수 있어요.</p>}
    {!paused && failures.length > 0 && <details className="discover-source-warning"><summary><AlertCircle size={16}/>일부 출처의 연결을 확인하지 못했어요</summary>{failures.map(item => <p key={item.id}>{item.name}: {item.message || '잠시 후 다시 조회해주세요.'}</p>)}<p>다른 출처에서 불러온 공고는 계속 볼 수 있어요.</p></details>}
    {!paused && error && <div className="discover-error" role="alert"><AlertCircle size={20}/><div><h2>공고를 가져오지 못했어요</h2><p>{error}</p><p>가상 공고로 대신 채우지 않아요. 보관한 자료는 그대로 사용할 수 있어요.</p><Link to="/app/jobs">내 보관함 열기<ArrowRight size={14}/></Link></div></div>}
    {!paused && loading && <div className="discover-loading" role="status"><RefreshCw size={21}/>채용 소식을 불러오고 있어요.</div>}
    {!paused && result && <>
      {visibleJobs.length > 0 && <div className="discover-table-head" aria-hidden="true"><span>회사</span><span>포지션 · 근무 조건</span><span>접수 마감</span></div>}
      <div className="discover-list">{visibleJobs.map(job => {
        const deadline = jobDeadline(job, clock);
        const companySummary = job.companyInfo.split('\n').filter(Boolean).slice(0, 2).join(' · ');
        return <button type="button" className="discover-job" key={job.id} onClick={() => void openDetail(job)}>
          <span className="discover-company-block"><CompanyMark job={job}/><span className="discover-company"><strong>{job.company}</strong><span className={`discover-company-info${companySummary ? '' : ' is-missing'}`}>{companySummary || '기업 상세정보 미제공'}</span><span className="discover-source-label">{job.source}</span></span></span>
          <span className="discover-job-main"><strong>{job.title}</strong><span className="discover-meta"><span><MapPin size={14}/>{job.location}</span><span>{job.experience}</span>{job.employment !== '미기재' && <span>{job.employment}</span>}</span><span className="discover-job-tags">{job.role !== '미분류' && <span>{job.role}</span>}{job.skills.slice(0, 3).map(skill => <span key={skill}>{skill}</span>)}</span>{isSaved(job) && <span className="discover-saved"><Bookmark size={13}/>보관함에 있음</span>}</span>
          <span className="discover-job-side"><span className={`discover-deadline${deadline.urgent ? ' is-urgent' : ''}${deadline.expired ? ' is-expired' : ''}`} title={deadline.detail}><strong>{deadline.countdown}</strong>{deadline.dateLabel && <span>{deadline.dateLabel}</span>}</span><span className="discover-open-detail">상세 보기<ArrowUpRight size={15}/></span></span>
        </button>;
      })}</div>
      {!visibleJobs.length && <EmptyState title={hasMore ? '조건에 맞는 공고를 더 확인할 수 있어요' : '조건에 맞는 접수 중 공고가 없어요'} description="검색어를 줄이거나 지역·직무·경력 조건을 넓혀보세요." action={<Button onClick={resetSearch}>전체 공고 보기</Button>}/>}
      {moreError && <p className="discover-more-error" role="alert">{moreError} 앞서 불러온 공고는 그대로 남아 있어요.</p>}
      <div ref={sentinel} className="discover-load-more">
        {autoLoad ? <>
          <p role="status" aria-live="polite">{loadingMore || moving ? '다음 공고를 불러오고 있어요.' : !canAdvance ? '마지막 공고까지 확인했어요.' : '아래로 스크롤하면 다음 공고가 이어져요.'}</p>
          <Button disabled={!canAdvance || loadingMore || moving} onClick={() => void advance()}><RefreshCw size={15}/>{loadingMore || moving ? '공고 불러오는 중' : '공고 더 보기'}</Button>
          {hasMore && !bufferedMore && !canAutoLoad && !loadingMore && <p className="field-hint">자동 조회를 잠시 멈췄어요. 더 보기로 다시 확인할 수 있어요.</p>}
        </> : <nav className="discover-pagination" aria-label="공고 페이지">
          <Button disabled={pageIndex === 0 || loadingMore || moving} onClick={() => { setPageIndex(value => value - 1); listHeading.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); }}><ChevronLeft size={16}/>이전 페이지</Button>
          <span aria-current="page">{pageIndex + 1} 페이지</span>
          <Button disabled={!canAdvance || loadingMore || moving} onClick={() => void advance()}>{loadingMore || moving ? '불러오는 중' : visibleJobs.length ? '다음 페이지' : '계속 찾기'}<ChevronRight size={16}/></Button>
        </nav>}
      </div>
      <div className="discover-source-time"><span>공고 확인 {timeLabel(result.checkedAt)}</span><span>접수 전에는 원문에서 마감 시각을 확인해주세요.</span></div>
    </>}
    <details className="discover-connection"><summary>공고 출처와 검색 안내</summary>
      <p>검색어와 필터만 해당 채용 서비스로 전송해요. 이력서·메모·녹음은 보내지 않아요. 검색 결과가 끝난 출처는 멈추고, 실패한 구간은 다음 요청에서 다시 확인합니다.</p>
      {result?.warnings.map(warning => <p key={warning}>{warning}</p>)}
      <p>기업 정보와 마감일은 출처에서 제공한 내용만 표시해요. 직원 수·연봉·기업 규모를 추측하지 않으며, 서로 다른 사이트의 같은 채용은 별도로 보일 수 있어요.</p>
      <Link to="/app/settings">출처별 연결 상태 확인<ArrowUpRight size={14}/></Link>
    </details>
    {detail && <Modal title={detail.title} description={`${detail.company} · ${detail.source}`} size="drawer" onClose={closeDetail}>
      <div className="discover-detail-status"><JobBadge job={detail}/><ExternalJobLink job={detail}/></div>
      {detailLoading ? <p className="discover-loading" role="status">출처에서 공고 본문을 가져오는 중이에요.</p> : <>
        {detailError && <div role="alert" className="discover-error"><p>{detailError}</p>{canRefreshJob(detail) && <Button onClick={() => void openDetail(detail)} disabled={saving}>본문 다시 조회</Button>}</div>}
        {!canRefreshJob(detail) && <div className="discover-manual-note"><AlertCircle size={17}/><p>이 출처는 사전 승인 없이 자동으로 조회하지 않아요. 저장된 원문과 내가 확인한 상태를 그대로 보관하며, 최신 내용은 원문 사이트에서 직접 확인해주세요.</p></div>}
        <section className="discover-company-detail"><Building2 size={21}/><div><h3>{detail.company}</h3><p>{detail.companyInfo || '출처에서 기업 상세정보를 제공하지 않았어요. 원문에서 회사 소개를 확인해주세요.'}</p><small>{detail.source} 제공 · {detail.verifiedAt ? timeLabel(detail.verifiedAt) : '조회 시각 미확인'}</small></div></section>
        <dl className="discover-facts"><div><dt>근무지</dt><dd>{detail.location}</dd></div><div><dt>경력</dt><dd>{detail.experience}</dd></div><div><dt>분야</dt><dd>{detail.role}</dd></div><div><dt>고용 형태</dt><dd>{detail.employment}</dd></div><div><dt>게시일</dt><dd>{detail.publishedAt ? formatDate(detail.publishedAt) : '출처 미제공'}</dd></div><div><dt>마감일</dt><dd>{jobDeadline(detail, clock).detail}</dd></div></dl>
        <h3 className="subsection-heading">공고 본문</h3><div className="prose-text">{detail.description || '출처에서 본문을 제공하지 않았어요. 원본 링크를 확인해주세요.'}</div>
        {detail.requirements && <><h3 className="subsection-heading">지원 자격·우대사항</h3><div className="prose-text">{detail.requirements}</div></>}
        {detail.skills.length > 0 && <><h3 className="subsection-heading">출처에 등록된 기술</h3><div className="tag-row">{detail.skills.map(skill => <Tag key={skill}>{skill}</Tag>)}</div></>}
        {detail.benefits && <><h3 className="subsection-heading">근무 환경</h3><div className="prose-text">{detail.benefits}</div></>}
      </>}
      <div className="discover-detail-actions"><Button disabled={saving || detailLoading || Boolean(detailError)} onClick={() => void save(false)}><Bookmark size={15}/>{saving ? '확인·저장 중' : isSaved(detail) ? '보관 공고 갱신' : '내 보관함에 저장'}</Button><Button variant="primary" disabled={saving || detailLoading || Boolean(detailError) || detail.status !== 'open'} onClick={() => void save(true)}>지원 준비하기<ArrowRight size={15}/></Button></div>
      <p className="field-hint">지원 공간과 원문을 보관하며 기업에 지원서를 전송하지는 않아요.</p>
    </Modal>}
  </div>;
}
