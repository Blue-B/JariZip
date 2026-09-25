import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Plus, Bookmark, ArrowUpRight, MapPin, BriefcaseBusiness, Clock3, Check, ChevronDown, Filter, ShieldCheck, CircleHelp, FileText, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import { useWorkspace } from '../../lib/store';
import { createApplication, formatDate, id, matchJob, relativeDate, safeUrl } from '../../lib/domain';
import type { Job, JobStatus } from '../../lib/types';
import { canonicalJobUrl, matchesJobSearch } from '../../lib/jobSearch';
import { useDiscardConfirmation } from '../../components/useDiscardConfirmation';
import { PencilLine, RefreshCw } from 'lucide-react';
import { refreshRemoteJob, sourceIdentity, upsertRemoteJob } from '../../lib/remoteJobs';
import { Button, CompanyMark, EmptyState, ExternalJobLink, IconButton, JobBadge, Modal, Note, PageHeading, Tag, effectiveStatus } from '../../components/ui';

function ImportJob({ close, onAdded, initial }: { close: () => void; onAdded: (job: Job) => void; initial?: Job }) {
  const { state, notify } = useWorkspace();
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const { requestClose, confirmation } = useDiscardConfirmation(dirty, close);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const value = (name: string) => String(f.get(name) ?? '').trim();
    if (!value('company') || !value('title')) { setError('회사 이름과 포지션을 입력해주세요. 공백만 입력할 수는 없어요.'); return; }
    if (value('publishedAt') && value('deadline') && value('publishedAt') > value('deadline')) { setError('마감일이 게시일보다 빠를 수 없어요. 날짜를 확인해주세요.'); return; }
    const rawUrl = value('url');
    const url = rawUrl ? safeUrl(rawUrl) : '';
    if (rawUrl && !url) { setError('http:// 또는 https://로 시작하는 원본 주소를 입력해주세요.'); return; }
    if (url && state.jobs.some(j => j.id !== initial?.id && canonicalJobUrl(j.sourceUrl) === canonicalJobUrl(url))) { setError('이 주소의 공고는 이미 보관하고 있어요. 검색에서 찾아보세요.'); return; }
    if (value('description').length < 20) { setError('나중에 다시 볼 수 있도록 공고 본문을 20자 이상 붙여넣어주세요.'); return; }
    const posted = value('publishedAt');
    const job: Job = { id: initial?.id ?? id(), company: value('company'), title: value('title'), role: value('role'), location: value('location') || '지역 미기재', experience: value('experience') || '경력 미기재', employment: value('employment'), salary: value('salary') || '미기재', skills: [...new Set(value('skills').split(',').map(s => s.trim()).filter(Boolean))].slice(0, 24), publishedAt: posted ? `${posted}T12:00:00+09:00` : '', deadline: value('deadline'), status: 'unknown', verification: 'unverified', verifiedAt: '', sourceUrl: url || '', source: '직접 저장', description: value('description'), requirements: value('requirements'), benefits: initial?.benefits ?? '', companyInfo: initial?.companyInfo ?? '', saved: initial?.saved ?? true, isDemo: false, color: initial?.color ?? 'blue' };
    onAdded(job); notify(initial ? '공고를 수정했어요. 지원 당시 원문은 그대로이고, 현재 접수 상태는 다시 확인해주세요.' : '공고 원문을 보관했어요. 접수 상태는 아직 미확인이에요.'); close();
  };
  return <><Modal title={initial ? '보관한 공고 수정' : '좋은 공고, 여기 모아두기'} description={initial ? '현재 보관 공고만 고쳐요. 지원 당시 공고와 확정 제출본은 바뀌지 않아요.' : '원본 링크와 본문을 보관해요. 사이트에 접속하거나 자동 수집하지는 않아요.'} size="wide" onClose={requestClose}><form onSubmit={submit} onChange={() => setDirty(true)} className="stack-form"><label>원본 공고 주소 <span className="optional">선택</span><input name="url" defaultValue={initial?.sourceUrl ?? ''} type="url" maxLength={2000} placeholder="https://채용사이트/공고주소"/></label><div className="form-grid"><label>회사 이름<input name="company" defaultValue={initial?.company ?? ''} required maxLength={100} placeholder="회사 이름" autoFocus/></label><label>포지션<input name="title" defaultValue={initial?.title ?? ''} required maxLength={160} placeholder="예: 백엔드 개발자"/></label><label>직무 분야<select name="role" defaultValue={initial?.role ?? '개발'}>{initial?.role && !['개발', '데이터', '디자인', '기획', '기타'].includes(initial.role) && <option>{initial.role}</option>}<option>개발</option><option>데이터</option><option>디자인</option><option>기획</option><option>기타</option></select></label><label>근무 지역<input name="location" defaultValue={initial?.location ?? ''} maxLength={100} placeholder="예: 서울 · 원격 가능"/></label><label>요구 경력<input name="experience" defaultValue={initial?.experience ?? ''} maxLength={100} placeholder="공고에 적힌 경력 조건"/></label><label>고용 형태<select name="employment" defaultValue={initial?.employment ?? '미기재'}>{initial?.employment && !['미기재', '정규직', '계약직', '인턴', '프리랜서'].includes(initial.employment) && <option>{initial.employment}</option>}<option>미기재</option><option>정규직</option><option>계약직</option><option>인턴</option><option>프리랜서</option></select></label><label>게시일 <span className="optional">확인된 경우만</span><input name="publishedAt" type="date" defaultValue={initial?.publishedAt.slice(0, 10) ?? ''}/></label><label>마감일 <span className="optional">선택</span><input name="deadline" type="date" defaultValue={initial?.deadline.slice(0, 10) ?? ''}/></label></div><label>요구 기술 <span className="optional">쉼표로 구분</span><input name="skills" defaultValue={initial?.skills.join(', ') ?? ''} maxLength={500} placeholder="Python, FastAPI, SQL"/></label><label>연봉 <span className="optional">공고에 기재된 경우</span><input name="salary" defaultValue={initial?.salary ?? ''} maxLength={100} placeholder="미기재라면 비워두세요"/></label><label>공고 본문<textarea name="description" defaultValue={initial?.description ?? ''} required maxLength={30000} rows={7} placeholder="담당 업무, 지원 자격 등 원문을 붙여넣어주세요."/></label><label>지원 자격·우대사항 <span className="optional">따로 정리하기</span><textarea name="requirements" defaultValue={initial?.requirements ?? ''} maxLength={10000} rows={3} placeholder="이 공고에서 특히 확인해야 할 조건"/></label>{error && <p role="alert" className="form-error">{error}</p>}<Note>저장한 날짜를 게시일로 바꾸지 않아요. 실제 접수 여부는 원문을 확인한 뒤 직접 기록해주세요.</Note>{initial && <Note tone="orange">내용을 고치면 접수 상태는 미확인으로 돌아가요. 원문을 확인한 뒤 다시 기록해주세요.</Note>}<div className="form-actions"><Button onClick={requestClose}>취소</Button><Button type="submit" variant="primary"><Check size={16}/>{initial ? '수정 내용 저장' : '공고 보관하기'}</Button></div></form></Modal>{confirmation}</>;
}

function Verification({ job, close }: { job: Job; close: () => void }) {
  const { update, notify } = useWorkspace();
  const [status, setStatus] = useState<JobStatus>('unknown');
  const [confirmed, setConfirmed] = useState(false);
  const save = () => { if (!confirmed) return; update(s => ({ ...s, jobs: s.jobs.map(j => j.id === job.id ? { ...j, status, verification: status === 'unknown' ? 'unverified' : 'manual', verifiedAt: status === 'unknown' ? '' : new Date().toISOString() } : j) })); notify('직접 확인한 상태를 기록했어요. 자동 검증 결과는 아니에요.'); close(); };
  return <Modal title="접수 상태 직접 기록" description={`${job.company} · ${job.title}`} onClose={close}><Note tone="orange">페이지가 열린다는 것만으로 모집 중이라고 판단하지 않아요. 원본의 마감 안내와 지원 가능 여부를 직접 확인해주세요.</Note><div className="verification-link"><ExternalJobLink job={job} label="원본 공고 열기"/></div><fieldset className="verification-options"><legend>원본에서 확인한 상태</legend>{([{ id: 'open', label: '접수 중', desc: '지원할 수 있는 상태를 확인했어요.' }, { id: 'closed', label: '마감', desc: '마감·채용 종료 안내를 확인했어요.' }, { id: 'unknown', label: '알 수 없음', desc: '로그인, 접근 제한 등으로 확인하지 못했어요.' }] as const).map(o => <label key={o.id} className={status === o.id ? 'selected' : ''}><input type="radio" name="verified" value={o.id} checked={status === o.id} onChange={() => setStatus(o.id)}/><div><strong>{o.label}</strong><span>{o.desc}</span></div></label>)}</fieldset><label className="checkbox-line"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>내가 확인한 결과로 기록한다는 점을 이해했어요.</label><div className="form-actions"><Button onClick={close}>취소</Button><Button variant="primary" disabled={!confirmed} onClick={save}>확인 기록 저장</Button></div></Modal>;
}

export default function Jobs() {
  const { state, update, notify } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const starting = useRef(false);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('전체');
  const [status, setStatus] = useState('all');
  const [location, setLocation] = useState('all');
  const [sort, setSort] = useState('latest');
  const [ownOnly, setOwnOnly] = useState(false);
  const [employment, setEmployment] = useState('all');
  const [hideExcluded, setHideExcluded] = useState(false);
  const [savedOnly, setSavedOnly] = useState(params.get('saved') === '1');
  const [selectedId, setSelectedId] = useState(params.get('job') ?? state.jobs[0]?.id ?? '');
  const [tab, setTab] = useState('overview');
  const [importOpen, setImportOpen] = useState(false);
  const [verifyJob, setVerifyJob] = useState<Job | null>(null);
  const [editJob, setEditJob] = useState<Job | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const recheck = async (job: Job) => {
    setRefreshing(true);
    try {
      const fresh = await refreshRemoteJob(job);
      update(current => {
        const incoming = { ...fresh, id: job.id };
        const next = upsertRemoteJob(current, incoming).state;
        return { ...next, jobs: next.jobs.map(item => item.id === job.id ? { ...item, saved: job.saved } : item) };
      });
      notify('출처의 최신 본문과 접수 상태로 갱신했어요. 지원 당시 원문은 그대로예요.');
    } catch (error) { notify(error instanceof Error ? error.message : '출처를 조회하지 못했어요.'); }
    finally { setRefreshing(false); }
  };
  useEffect(() => {
    const selected = params.get('job');
    if (selected) setSelectedId(selected);
    if (params.get('new') === '1') {
      setImportOpen(true);
      setParams(current => { current.delete('new'); return current; }, { replace: true });
    }
  }, [params, setParams]);
  const roles = ['전체', ...new Set(state.jobs.map(j => j.role))];
  const locations = [...new Set(state.jobs.map(j => j.location.split(/[ ·]/)[0]))];
  const jobs = useMemo(() => state.jobs.filter(j => {
    return matchesJobSearch(j, query) && (role === '전체' || j.role === role) && (status === 'all' || effectiveStatus(j) === status) && (location === 'all' || j.location.startsWith(location)) && (!savedOnly || j.saved) && (!ownOnly || !j.isDemo) && (employment === 'all' || j.employment === employment) && (!hideExcluded || matchJob(j, state.profile).excluded.length === 0);
  }).sort((a, b) => sort === 'match' ? matchJob(b, state.profile).matched.length - matchJob(a, state.profile).matched.length : sort === 'deadline' ? (a.deadline || '9999').localeCompare(b.deadline || '9999') : (b.publishedAt || '').localeCompare(a.publishedAt || '')), [state.jobs, state.profile, query, role, status, location, savedOnly, sort, ownOnly, employment, hideExcluded]);
  const selected = jobs.find(j => j.id === selectedId) ?? jobs[0];
  const match = selected ? matchJob(selected, state.profile) : null;
  const existing = selected && state.applications.find(a => a.jobId === selected.id);
  const toggleSaved = (job: Job) => { update(s => ({ ...s, jobs: s.jobs.map(j => j.id === job.id ? { ...j, saved: !j.saved } : j) })); notify(job.saved ? '관심 공고에서 해제했어요.' : '관심 공고에 모아뒀어요.'); };
  const start = () => { if (!selected || starting.current) return; starting.current = true; if (existing) { navigate(`/app/applications?application=${existing.id}`); return; } const application = createApplication(selected); update(s => s.applications.some(a => a.jobId === selected.id) ? s : { ...s, applications: [application, ...s.applications] }); notify('지원 준비 공간을 만들었어요. 실제 지원서는 전송하지 않았어요.'); navigate(`/app/applications?application=${application.id}`); };
  const choose = (job: Job) => { setSelectedId(job.id); setTab('overview'); setParams(p => { p.set('job', job.id); return p; }, { replace: true }); };
  return <div className="page-enter jobs-page"><PageHeading eyebrow="FIND YOUR PLACE" title="좋은 자리를 발견하는 곳" description="원문과 확인 상태를 함께 보관하고, 내 경험에 맞춰 살펴보세요." action={<Button variant="primary" onClick={() => setImportOpen(true)}><Plus size={17}/>공고 직접 추가</Button>}/>
    <div className="job-toolbar"><div className="category-tabs" aria-label="직무 분야">{roles.map(r => <button key={r} className={role === r ? 'selected' : ''} aria-pressed={role === r} onClick={() => setRole(r)}>{r}</button>)}</div><button className={`saved-filter ${savedOnly ? 'selected' : ''}`} aria-pressed={savedOnly} onClick={() => setSavedOnly(v => !v)}><Bookmark size={15} fill={savedOnly ? 'currentColor' : 'none'}/>관심 공고<span>{state.jobs.filter(j => j.saved).length}</span></button></div>
    <div className="job-filters"><label className="search-input"><Search size={17}/><input aria-label="공고 검색" placeholder="예: Python 서울 정규직" value={query} onChange={e => setQuery(e.target.value)}/></label><label className="select-shell"><MapPin size={15}/><select aria-label="근무 지역" value={location} onChange={e => setLocation(e.target.value)}><option value="all">전체 지역</option>{locations.map(l => <option key={l}>{l}</option>)}</select></label><label className="select-shell"><Filter size={15}/><select aria-label="접수 상태" value={status} onChange={e => setStatus(e.target.value)}><option value="all">모든 상태</option><option value="open">접수 중</option><option value="unknown">미확인</option><option value="closed">마감</option></select></label><label className="select-shell"><BriefcaseBusiness size={15}/><select aria-label="고용 형태" value={employment} onChange={e => setEmployment(e.target.value)}><option value="all">모든 고용 형태</option>{[...new Set(state.jobs.map(j => j.employment))].map(type => <option key={type}>{type}</option>)}</select></label><label className="checkbox-line compact"><input type="checkbox" checked={ownOnly} onChange={e => setOwnOnly(e.target.checked)}/>내가 추가한 공고만</label><label className="checkbox-line compact" title="설정에 등록한 제외 키워드가 포함된 공고를 숨겨요"><input type="checkbox" checked={hideExcluded} onChange={e => setHideExcluded(e.target.checked)}/>제외 키워드 숨기기</label></div>
    <div className="results-heading"><span><strong>{jobs.length}</strong>개의 공고<span className="muted"> · 내 보관함</span></span><label><select aria-label="공고 정렬" value={sort} onChange={e => setSort(e.target.value)}><option value="latest">게시일 최신순</option><option value="match">등록 기술 일치순</option><option value="deadline">마감일 가까운 순</option></select><ChevronDown size={13}/></label></div>
    <div className="job-explorer"><div className="job-list" aria-label="검색된 공고">{jobs.map(job => <article key={job.id} className={`job-list-card ${selected?.id === job.id ? 'selected' : ''}`}><button className="job-list-main" onClick={() => choose(job)} aria-pressed={selected?.id === job.id}><CompanyMark job={job}/><div><div className="company-line">{job.company}{job.isDemo && <span className="demo-inline">예시</span>}</div><h3>{job.title}</h3><p>{job.location} · {job.experience}</p><div className="tag-row">{job.skills.slice(0, 3).map(s => <Tag key={s}>{s}</Tag>)}</div></div></button><div className="job-list-foot"><JobBadge job={job}/><span>{job.publishedAt ? relativeDate(job.publishedAt) : '게시일 미확인'}</span><IconButton label={`${job.company} 관심 공고 ${job.saved ? '해제' : '저장'}`} onClick={() => toggleSaved(job)} className={job.saved ? 'bookmarked' : ''}><Bookmark size={16} fill={job.saved ? 'currentColor' : 'none'}/></IconButton></div></article>)}{!jobs.length && <EmptyState title="조건에 맞는 공고가 없어요" description="필터를 바꾸거나 새로운 공고를 추가해보세요." action={<Button onClick={() => { setQuery(''); setRole('전체'); setStatus('all'); setLocation('all'); setSavedOnly(false); setOwnOnly(false); setEmployment('all'); setHideExcluded(false); }}>필터 초기화</Button>}/>}</div>
      {selected && <section className="job-detail"><div className="job-detail-header"><div className="job-detail-kicker"><CompanyMark job={selected} small/><span>{selected.company}</span>{selected.isDemo && <Tag>가상 기업</Tag>}<IconButton label="선택 공고 관심 저장" onClick={() => toggleSaved(selected)} className={selected.saved ? 'bookmarked' : ''}><Bookmark size={19} fill={selected.saved ? 'currentColor' : 'none'}/></IconButton></div><h2>{selected.title}</h2><div className="job-detail-meta"><span><MapPin size={14}/>{selected.location}</span><span><BriefcaseBusiness size={14}/>{selected.experience}</span><span>{selected.employment}</span></div><div className="job-detail-status"><JobBadge job={selected}/><span>{selected.deadline ? `${formatDate(selected.deadline)}까지` : '마감일 미기재'}</span></div></div>
      <div className="detail-tabs" role="tablist" aria-label="공고 상세">{[{ id: 'overview', label: '공고 내용' }, { id: 'match', label: '내 경험과 비교' }, { id: 'company', label: '기업 메모' }].map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}{t.id === 'match' && <span className="mini-dot"/>}</button>)}</div>
      <div className="job-detail-content" role="tabpanel">{tab === 'overview' && <><div className="verification-note"><ShieldCheck size={18}/><div><strong>{selected.isDemo ? '기능을 보여주기 위한 가상 공고예요' : selected.verification === 'manual' ? '내가 직접 확인한 상태예요' : selected.verification === 'source' ? '출처에서 조회한 상태예요' : '접수 상태를 아직 확인하지 않았어요'}</strong><p>{selected.isDemo ? '실제 모집 여부나 기업 정보를 나타내지 않아요.' : selected.verifiedAt ? `${formatDate(selected.verifiedAt)} 기록 · 이후 상태는 달라질 수 있어요.` : '원본을 열어 접수 가능 여부를 확인해주세요.'}</p></div>{!selected.isDemo && <button className="text-link" onClick={() => setVerifyJob(selected)}>기록하기</button>}</div><h3>이런 일을 해요</h3><div className="prose-text">{selected.description}</div><h3>함께하기 위한 조건</h3><div className="prose-text">{selected.requirements || '별도로 정리된 지원 자격이 없어요. 위 원문을 확인해주세요.'}</div><h3>기술 스택</h3><div className="tag-row">{selected.skills.length ? selected.skills.map(s => <Tag key={s} tone="blue">{s}</Tag>) : <span className="muted">등록된 기술이 없어요.</span>}</div>{selected.benefits && <><h3>근무 환경</h3><div className="prose-text">{selected.benefits}</div></>}<div className="job-information"><span>급여<strong>{selected.salary || '미기재'}</strong></span><span>게시일<strong>{selected.publishedAt ? formatDate(selected.publishedAt) : '미확인'}</strong></span><span>출처<strong>{selected.source}</strong></span></div></>}
      {tab === 'match' && match && <><div className="match-intro"><span className="match-symbol"><CheckCircle2 size={27}/></span><div><h3>점수 대신, 맞닿은 근거.</h3><p>프로필에 직접 등록한 기술과 공고를 비교해요.<br/>합격 가능성을 예측하는 결과는 아니에요.</p></div></div><div className="match-block"><div><CheckCircle2 size={17}/><h3>이미 등록한 경험</h3><Tag tone="green">{match.matched.length}개</Tag></div><p>공고의 기술 중 내 프로필에서도 찾았어요.</p><div className="tag-row">{match.matched.length ? match.matched.map(s => <Tag key={s} tone="green">{s}</Tag>) : <span className="muted">겹치는 기술이 아직 없어요.</span>}</div></div><div className="match-block"><div><CircleHelp size={17}/><h3>추가로 확인할 경험</h3><Tag tone="orange">{match.missing.length}개</Tag></div><p>프로필에 없는 항목이에요. 경험이 없다고 단정하지 않아요.</p><div className="tag-row">{match.missing.map(s => <Tag key={s} tone="orange">{s}</Tag>)}</div></div>{match.excluded.length > 0 && <Note tone="orange">제외하고 싶은 키워드가 있어요: {match.excluded.join(', ')}</Note>}<Link to="/app/settings" className="button secondary">내 기술·선호 조건 수정<ArrowUpRight size={15}/></Link></>}
      {tab === 'company' && <><h3>공고에 담긴 회사 이야기</h3><div className="prose-text">{selected.companyInfo || '별도로 가져온 회사 소개가 없어요. 기업 노트에 직접 조사한 내용을 남겨보세요.'}</div><h3>내가 남긴 메모</h3><div className="prose-text company-note-preview">{state.companyNotes[selected.company] || '아직 메모가 없어요.'}</div><Link className="button secondary" to={`/app/companies?company=${encodeURIComponent(selected.company)}`}>기업 노트 열기<ArrowUpRight size={15}/></Link></>}
      </div><div className="job-detail-actions"><ExternalJobLink job={selected}/>{sourceIdentity(selected) && <Button disabled={refreshing} onClick={() => void recheck(selected)}><RefreshCw size={14}/>{refreshing ? '조회 중' : '출처 다시 조회'}</Button>}{!selected.isDemo && <Button onClick={() => setEditJob(selected)}><PencilLine size={15}/>공고 수정</Button>}<Button variant="primary" onClick={start}>{existing ? '지원 공간 열기' : '지원 준비하기'}<ArrowRight size={16}/></Button></div></section>}
    </div>{importOpen && <ImportJob close={() => setImportOpen(false)} onAdded={job => { update(s => ({ ...s, jobs: [job, ...s.jobs] })); setRole('전체'); setQuery(''); setStatus('all'); setLocation('all'); setOwnOnly(false); setEmployment('all'); setHideExcluded(false); setSelectedId(job.id); }}/>} {verifyJob && <Verification job={verifyJob} close={() => setVerifyJob(null)}/>} {editJob && <ImportJob initial={editJob} close={() => setEditJob(null)} onAdded={job => { update(s => ({ ...s, jobs: s.jobs.map(j => j.id === job.id ? job : j) })); setRole('전체'); setQuery(''); setStatus('all'); setLocation('all'); setEmployment('all'); setHideExcluded(false); setSavedOnly(false); setSelectedId(job.id); }}/>}</div>;
}
