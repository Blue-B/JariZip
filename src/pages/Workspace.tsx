import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Compass, PanelsTopLeft, FolderOpen, MessageCircle, Building2, Layers3, Settings2, Search, Menu, ArrowUpRight, ChevronRight, LockKeyhole, Check, Bell, X, FileText, Command, AlertTriangle } from 'lucide-react';
import { WorkspaceProvider, useWorkspace } from '../lib/store';
import { formatDate, latestDocuments } from '../lib/domain';
import { CompanyMark, EmptyState, IconButton, Modal, Tag } from '../components/ui';
import JippiArt from '../components/JippiArt';
import Dashboard from './workspace/Dashboard';
import Jobs from './workspace/Jobs';
import Applications from './workspace/Applications';
import Documents from './workspace/Documents';
import Interview from './workspace/Interview';
import Companies from './workspace/Companies';
import Templates from './workspace/Templates';
import Settings from './workspace/Settings';
import '../styles/workspace.css';
import '../styles/readability.css';
import '../styles/product-workspace.css';

const navigation = [
  { path: '/app', label: '내 공간', icon: LayoutDashboard, exact: true },
  { path: '/app/jobs', label: '공고 탐색', icon: Compass },
  { path: '/app/applications', label: '지원 현황', icon: PanelsTopLeft },
  { path: '/app/documents', label: '서류 보관함', icon: FolderOpen },
  { path: '/app/interview', label: '면접 연습', icon: MessageCircle },
  { path: '/app/companies', label: '기업 노트', icon: Building2 },
  { path: '/app/templates', label: '템플릿', icon: Layers3 },
  { path: '/app/settings', label: '설정', icon: Settings2 },
];

/** Primary four destinations for the mobile bottom bar; everything else lives in the menu. */
const mobileNavigation = [navigation[0], navigation[1], navigation[3], navigation[4]];

function QuickSearch({ close }: { close: () => void }) {
  const { state } = useWorkspace();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const q = query.trim().toLowerCase();
  const results = [
    ...state.jobs.map(j => ({ id: j.id, text: `${j.company} · ${j.title}`, type: '공고', url: `/app/jobs?job=${j.id}` })),
    ...latestDocuments(state.documents).map(d => ({ id: d.id, text: d.title, type: d.kind, url: `/app/documents?doc=${d.id}` })),
    ...state.applications.map(a => ({ id: a.id, text: `${a.jobSnapshot.company} 지원 기록`, type: '지원', url: `/app/applications?application=${a.id}` })),
  ].filter(r => !q || r.text.toLowerCase().includes(q)).slice(0, 9);
  return <Modal title="내 자료 빠르게 찾기" description="보관한 공고, 서류, 지원 기록을 한 번에 검색해요." onClose={close}><label className="search-input command-input"><Search size={18}/><input autoFocus placeholder="회사, 직무 또는 서류 이름" aria-label="내 자료 검색" value={query} onChange={e => setQuery(e.target.value)}/><kbd>ESC</kbd></label><div className="command-results">{results.map(r => <button key={`${r.type}-${r.id}`} onClick={() => { close(); navigate(r.url); }}><FileText size={17}/><span>{r.text}</span><Tag>{r.type}</Tag><ChevronRight size={15}/></button>)}{!results.length && <EmptyState title="일치하는 자료가 없어요" description="다른 이름으로 찾아보세요."/>}</div></Modal>;
}

function Shell() {
  const { state, storageStatus, toast } = useWorkspace();
  const [menuOpen, setMenuOpen] = useState(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const sync = () => { setNarrow(media.matches); if (!media.matches) setMenuOpen(false); };
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  const [searchOpen, setSearchOpen] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const location = useLocation();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const active = navigation.find(n => n.exact ? location.pathname === n.path : location.pathname.startsWith(n.path)) ?? navigation[0];
  const pending = state.applications.filter(a => a.interviewAt && a.stage === 'interview').sort((a, b) => a.interviewAt.localeCompare(b.interviewAt));
  useEffect(() => { setMenuOpen(false); document.title = `${active.label} · JariZip`; window.scrollTo(0, 0); }, [location.pathname, active.label]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(v => !v); }
      if (e.key === 'Escape' && menuOpen) { setMenuOpen(false); menuButtonRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  // Move focus into the drawer when it opens, and never leave it stranded off-screen.
  useEffect(() => {
    if (menuOpen) sidebarRef.current?.querySelector<HTMLElement>('.nav-item')?.focus();
  }, [menuOpen]);
  const closeMenu = () => { setMenuOpen(false); menuButtonRef.current?.focus(); };
  return <div className="workspace"><a href="#main-content" className="skip-link" onClick={e => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}>본문으로 건너뛰기</a>{menuOpen && <button className="sidebar-overlay" aria-label="메뉴 닫기" onClick={closeMenu}/>}
    <aside ref={sidebarRef} inert={narrow && !menuOpen} className={`sidebar ${menuOpen ? 'is-open' : ''}`}><div className="sidebar-brand"><Link to="/" className="wordmark" aria-label="자리집 JariZip 홈"><span className="wordmark-mark"><JippiArt pose="wave" className="wordmark-jippi" alt="" priority/></span><span className="wordmark-ko">자리집</span><span className="wordmark-latin">JariZip</span><span className="brand-period">.</span></Link><IconButton className="mobile-only" label="메뉴 닫기" onClick={closeMenu}><X size={19}/></IconButton></div><div className="workspace-switch"><div className="workspace-avatar">나</div><div><strong>{state.profile.name || '나의 워크스페이스'}</strong><span>개인 워크스페이스</span></div><LockKeyhole size={13}/></div><p className="nav-caption">MY WORKSPACE</p><nav aria-label="주 메뉴">{navigation.map((item, i) => <NavLink key={item.path} to={item.path} end={item.exact} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''} ${i === 6 ? 'nav-divider' : ''}`}><item.icon size={19} strokeWidth={1.7}/><span>{item.label}</span>{item.path === '/app/applications' && state.applications.length > 0 && <span className="nav-count">{state.applications.length}</span>}</NavLink>)}</nav><div className="sidebar-footer"><div className="jippi-tip"><span className="jippi-tip-art"><JippiArt pose="document" className="jippi-tip-img" alt="지피"/></span><div><strong>지피의 한마디</strong><p>공고를 저장하면<br/>다음 할 일을 알려드려요.</p><Link to="/app/jobs">공고 둘러보기<ArrowUpRight size={12}/></Link></div></div><div className="privacy-card"><LockKeyhole size={18}/><strong>내 준비는, 내 공간에.</strong><p>공고부터 제출본까지<br/>이 브라우저 안에 보관해요.</p><Link to="/app/settings">저장·백업 설정<ArrowUpRight size={13}/></Link></div><a className="sidebar-github" href="https://github.com/Blue-B/JariZip" target="_blank" rel="noreferrer"><span>만드는 과정도 열려 있어요</span><ArrowUpRight size={14}/></a></div></aside>
    <div className="workspace-body" inert={narrow && menuOpen}><header className="topbar"><div className="topbar-location"><button ref={menuButtonRef} type="button" className="icon-button mobile-only" aria-label="메뉴 열기" title="메뉴 열기" onClick={() => setMenuOpen(true)}><Menu size={21}/></button><span className="breadcrumb-root">나의 다음 자리</span><ChevronRight size={13}/><span>{active.label}</span></div><div className="topbar-actions"><button className="topbar-search" aria-label="내 자료 검색" title="내 자료 검색" onClick={() => setSearchOpen(true)}><Search size={16}/><span>내 자료 검색</span><kbd><Command size={10}/>K</kbd></button><span className={`save-status save-status--${storageStatus}`} title="이 기기의 IndexedDB 저장 상태">{storageStatus === 'saved' ? <Check size={13}/> : <span className="status-dot"/>}{storageStatus === 'saved' ? '저장됨' : storageStatus === 'saving' ? '저장 중' : storageStatus === 'temporary' ? '임시 저장' : '저장 오류'}</span><IconButton label="면접 일정 보기" onClick={() => setNoticesOpen(true)}><Bell size={18}/>{pending.length > 0 && <span className="notification-dot"/>}</IconButton><Link className="header-avatar" aria-label="프로필 설정" to="/app/settings">나</Link></div></header>
    {(storageStatus === 'error' || storageStatus === 'temporary') && <div className="storage-warning" role="alert">이 브라우저에 정상적으로 저장되지 않을 수 있어요. 자료를 잃지 않도록 <Link to="/app/settings">백업 파일을 내려받으세요.</Link></div>}
    <main id="main-content" className="app-main" tabIndex={-1}><Routes><Route index element={<Dashboard/>}/><Route path="jobs" element={<Jobs/>}/><Route path="applications" element={<Applications/>}/><Route path="documents" element={<Documents/>}/><Route path="interview" element={<Interview/>}/><Route path="companies" element={<Companies/>}/><Route path="templates" element={<Templates/>}/><Route path="settings" element={<Settings/>}/><Route path="*" element={<EmptyState title="찾을 수 없는 화면이에요" description="왼쪽 메뉴에서 원하는 공간을 열어주세요." action={<Link to="/app" className="button primary">내 공간</Link>}/>}/></Routes></main><footer className="workspace-footnote"><span>JariZip · 나의 다음 자리가 모이는 곳</span><span>LOCAL-FIRST / OPEN SOURCE</span></footer></div>
    <nav className="mobile-bottom-nav" inert={menuOpen} aria-label="빠른 이동">{mobileNavigation.map(item => <NavLink key={item.path} to={item.path} end={item.exact} className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}><item.icon size={20} strokeWidth={1.8}/><span>{item.label}</span></NavLink>)}<button type="button" className="bottom-nav-item" onClick={() => setMenuOpen(true)} aria-label="전체 메뉴 열기"><Menu size={20} strokeWidth={1.8}/><span>더보기</span></button></nav>
    {toast && <div className="toast" role={storageStatus === 'error' ? 'alert' : 'status'}>{storageStatus === 'error' || storageStatus === 'temporary' ? <AlertTriangle size={17}/> : <Check size={17}/>} {toast}</div>}{searchOpen && <QuickSearch close={() => setSearchOpen(false)}/>}{noticesOpen && <Modal title="기록한 면접 일정" description="직접 입력한 일정이에요. 캘린더 서비스와 자동 연동되지는 않아요." onClose={() => setNoticesOpen(false)}>{pending.length ? pending.map(a => <Link className="notification-item" key={a.id} to={`/app/applications?application=${a.id}`} onClick={() => setNoticesOpen(false)}><CompanyMark job={a.jobSnapshot} small/><div><strong>{a.jobSnapshot.company}</strong><span>{formatDate(a.interviewAt)} · {a.jobSnapshot.title}</span></div><ArrowUpRight size={17}/></Link>) : <EmptyState title="아직 등록한 면접이 없어요" description="지원 현황에서 면접 일정을 추가할 수 있어요."/>}</Modal>}
  </div>;
}
export default function Workspace() { return <WorkspaceProvider><Shell/></WorkspaceProvider>; }
