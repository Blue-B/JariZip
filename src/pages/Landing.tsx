/**
 * Landing - JariZip / 자리집 public product page.
 *
 * Design read: Korean consumer career product. Bright warm white paper, deep
 * navy Korean type, vivid cobalt primary actions, gentle sky-blue fields, the
 * tactile kraft zip-pouch mascot (JippiArt) anchoring a working product
 * preview, and a few understated handwritten notes. No dot-grid wallpaper and
 * no glowing gradient stack.
 *
 * Honesty rules: every company, posting and document below is fictional and
 * labelled 예시. No user counts, reviews, ratings, prices, store badges or AI
 * claims. Unconnected capabilities sit in the readable #limits section, never
 * in the hero. Styling is scoped to `.lz-` in landing.css.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, ComponentType, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight, ArrowUpRight, Bookmark, BookmarkCheck, Calendar, Check, ChevronDown, FileText,
  FolderOpen, HardDrive, Info, Kanban, Lock, MapPin, Menu, Mic, Pause, Play, Quote, Search,
  ShieldCheck, SlidersHorizontal, Upload, WifiOff, X,
} from 'lucide-react';
import JippiArt from '../components/JippiArt';
import '../styles/landing.css';

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const NAV = [{ id: 'flow', label: '이용 흐름' }, { id: 'preview', label: '미리보기' }, { id: 'limits', label: '한계와 원칙' }, { id: 'faq', label: '자주 묻는 질문' }];

/** Short factual tips: each describes real product behaviour only. */
const TIPS = ['마감일이 지난 공고는 목록에서 마감으로 표시됩니다.', '제출본을 확정하면 이후 문서를 고쳐도 그 버전은 그대로 남습니다.', '면접 질문 옆에서 제출본과 공고의 근거를 확인할 수 있습니다.', '직접 추가한 공고는 처음에 확인되지 않음으로 표시됩니다.'];
const GREETINGS = ['자료는 이 브라우저에 보관해요. 서버로 보내지 않아요.', '서류를 고쳐도 제출한 버전은 그대로 남아요.', '지원할 때의 공고를 스냅샷으로 접어 둬요.'];

interface DemoJob { id: string; company: string; title: string; location: string; experience: string; employment: string; tags: string[]; deadline: string; }
/** Fictional listings. Never presented as real or verified openings. */
const DEMO_JOBS: DemoJob[] = [
  { id: 'ex-1', company: '한결소프트', title: '프론트엔드 엔지니어', location: '서울 성동구', experience: '경력 3년 이상', employment: '정규직', tags: ['React', 'TypeScript'], deadline: '3월 14일' },
  { id: 'ex-2', company: '모래시계랩', title: '프로덕트 디자이너', location: '서울 마포구', experience: '경력 2년 이상', employment: '정규직', tags: ['Figma'], deadline: '3월 21일' },
  { id: 'ex-3', company: '푸른결', title: '데이터 분석가', location: '부산 해운대구', experience: '신입 가능', employment: '정규직', tags: ['SQL', 'Python'], deadline: '상시 채용' },
  { id: 'ex-4', company: '노을데이터', title: 'QA 엔지니어', location: '대전 유성구', experience: '신입 가능', employment: '계약직', tags: ['테스트 자동화'], deadline: '3월 28일' },
];
const FACETS: { key: string; label: string; test: (job: DemoJob) => boolean }[] = [
  { key: 'fulltime', label: '정규직', test: (j) => j.employment === '정규직' },
  { key: 'entry', label: '신입 가능', test: (j) => j.experience.includes('신입') },
  { key: 'seoul', label: '서울', test: (j) => j.location.startsWith('서울') },
  { key: 'metro', label: '지방 근무', test: (j) => !j.location.startsWith('서울') },
];

interface DemoDoc { id: string; title: string; kind: string; version: number; updated: string; body: string; versions: { version: number; note: string }[]; }
const DEMO_DOCS: DemoDoc[] = [
  {
    id: 'doc-1', title: '자기소개서 · 한결소프트', kind: '자기소개서', version: 3, updated: '오늘',
    versions: [{ version: 3, note: '문항 2 답변 다듬음' }, { version: 2, note: '프로젝트 성과 추가' }, { version: 1, note: '처음 작성' }],
    body: `1. 지원 동기\n사용자가 매일 마주하는 화면을 만드는 일을 해 왔습니다. 결제 흐름을 다시 설계해 이탈을 줄였고, 그 과정에서 만든 컴포넌트 규칙이 이후 기능 개발 속도를 줄였습니다.\n\n2. 협업 방식\n규칙을 먼저 합의하고, 예외는 기록으로 남깁니다. 같은 지적이 두 번 나오면 문서나 검사 도구로 옮깁니다.`,
  },
  {
    id: 'doc-2', title: '경력기술서 · 2025', kind: '경력기술서', version: 1, updated: '지난주',
    versions: [{ version: 1, note: '처음 작성' }],
    body: `프로젝트 A · 사내 디자인 시스템\n역할: 컴포넌트 설계와 배포 절차 담당\n한 일: 토큰 구조를 정리하고 버전별 변경 기록을 남기는 절차를 만들었습니다.`,
  },
];
const BOARD_COLUMNS = [{ id: 'preparing', name: '서류 준비' }, { id: 'applied', name: '지원 완료' }, { id: 'interview', name: '면접' }, { id: 'closed', name: '결과' }];
const INITIAL_BOARD = [
  { id: 'b1', title: '프론트엔드 엔지니어', company: '한결소프트', stage: 'preparing' },
  { id: 'b2', title: '프로덕트 디자이너', company: '모래시계랩', stage: 'applied' },
  { id: 'b3', title: '데이터 분석가', company: '푸른결', stage: 'interview' },
  { id: 'b4', title: 'QA 엔지니어', company: '노을데이터', stage: 'closed' },
];
/** Questions are composed from the user's own document sentences, with the source shown. */
const QUESTIONS = [
  { id: 'q1', topic: '협업', q: '디자이너와 의견이 갈렸을 때 어떻게 정리하셨나요?', evidence: '규칙을 먼저 합의하고, 예외는 기록으로 남깁니다.', source: '자기소개서 · 한결소프트 v3, 2번 문항', hint: '결론보다 합의 과정을 말하세요. 누가 결정했고 무엇이 기준이었는지 한 줄씩.' },
  { id: 'q2', topic: '성과', q: '결제 흐름을 다시 설계했다고 하셨는데, 무엇이 달라졌나요?', evidence: '결제 흐름을 다시 설계해 이탈을 줄인 경험이 있고', source: '자기소개서 · 한결소프트 v3, 1번 문항', hint: '측정한 지표와 측정 방법을 함께 말하세요. 숫자가 없으면 관찰한 변화만이라도 구체적으로.' },
];
const LIMITS = [
  { icon: WifiOff, title: '외부 채용 사이트와 연동하지 않습니다', body: '공고를 자동으로 가져오지 않습니다. 붙여넣기나 직접 입력으로 등록하고, 그렇게 넣은 공고는 확인되지 않음으로 표시됩니다.' },
  { icon: SlidersHorizontal, title: '문장을 대신 써 주지 않습니다', body: '면접 질문은 내 문서에서 근거를 찾아 조합할 뿐 새 문장을 만들지 않습니다. 자기소개서 초안은 내가 씁니다.' },
  { icon: HardDrive, title: '동기화 서버가 없습니다', body: '기기를 바꾸면 JSON 백업으로 옮겨야 합니다. 브라우저 데이터를 지우면 기록도 함께 사라집니다.' },
];
const FAQ = [
  { q: '지원 내용이 서버로 전송되나요?', a: '전송하지 않습니다. 입력한 내용은 이 기기의 브라우저 저장소에 남고, 계정과 로그인도 없습니다. 대신 브라우저 데이터를 지우면 함께 사라지므로 백업 파일을 내려받아 두세요.' },
  { q: '예시 공고에 바로 지원할 수 있나요?', a: '아닙니다. 회사 이름까지 모두 가상이며 실제 채용 정보가 아닙니다. 실제 지원은 공고를 직접 등록해 진행하고, 그렇게 등록한 공고는 확인되지 않은 상태로 남습니다.' },
  { q: '다른 기기로 옮길 수 있나요?', a: 'JSON 파일로 내보내고 다시 불러오는 방식입니다. 불러올 때 형식과 크기를 검사하고, 검사를 통과하지 못한 파일은 적용하지 않습니다.' },
];
const FLOW = [
  { n: '01', title: '공고 모으기', body: '조건으로 좁혀 보고 관심 공고로 표시합니다. 직접 추가한 공고는 확인되지 않음으로 남습니다.' },
  { n: '02', title: '서류 다듬기', body: '파일을 올리거나 붙여넣고, 고칠 때마다 새 버전으로 남깁니다.' },
  { n: '03', title: '지원 기록하기', body: '제출한 문서 버전을 확정하고 그때의 공고를 스냅샷으로 접어 둡니다.' },
  { n: '04', title: '면접 준비하기', body: '확정한 제출본에서 근거를 찾아 질문을 만들고 답변을 적어 둡니다.' },
];
const CAP_CELLS = [
  { c: 'lz-span-4', icon: <FolderOpen size={18} strokeWidth={2.1} aria-hidden />, t: '제출 시점 스냅샷', b: '지원할 때 확정한 문서 버전과 공고 원문을 한 묶음으로 보관합니다.' },
  { c: 'lz-span-4', icon: <Mic size={18} strokeWidth={2.1} aria-hidden />, t: '근거가 붙은 면접 질문', b: '질문 옆에 내 문서의 어떤 문장에서 나왔는지 함께 보여 줍니다.' },
  { c: 'lz-cell-ink lz-span-4', icon: <HardDrive size={18} strokeWidth={2.1} aria-hidden />, t: '브라우저 안에만 저장', b: '자료는 기기 안에 남고, JSON 파일로 통째로 내보내 보관할 수 있습니다.' },
];

/* helpers */
function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return <motion.div className={className} initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.6, delay, ease: EASE }}>{children}</motion.div>;
}
const prefersReduced = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' });
const Note = ({ children, status }: { children: ReactNode; status?: boolean }) => <p className="lz-note" role={status ? 'status' : undefined}>{children}</p>;
const Tile = ({ cell }: { cell: (typeof CAP_CELLS)[number] }) => (
  <div className={`lz-cell ${cell.c}`}><span className="lz-cell-icon">{cell.icon}</span><h3 className="lz-h3">{cell.t}</h3><p className="lz-cell-body">{cell.b}</p></div>
);
const Brand = () => (
  <Link className="lz-brand" to="/" aria-label="자리집 홈">
    <img className="lz-brand-mark" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={30} height={30} />
    <span className="lz-brand-text"><strong>자리집</strong><span>JariZip</span></span>
  </Link>
);

/* header */
function Nav() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  const go = (id: string) => { setOpen(false); jumpTo(id); };
  const navLink = (item: (typeof NAV)[number]) => <button key={item.id} type="button" className="lz-nav-link" onClick={() => go(item.id)}>{item.label}</button>;
  return (
    <header className="lz-nav">
      <div className="lz-shell lz-nav-inner">
        <Brand />
        <nav className="lz-nav-links" aria-label="페이지 안 이동">{NAV.map(navLink)}</nav>
        <div className="lz-nav-actions">
          <Link className="lz-btn lz-btn-primary lz-btn-sm" to="/app">작업 공간 열기</Link>
          <button type="button" className="lz-burger" aria-expanded={open} aria-controls="lz-nav-panel" aria-label={open ? '메뉴 닫기' : '메뉴 열기'} onClick={() => setOpen((v) => !v)}>
            {open ? <X size={19} strokeWidth={2.2} aria-hidden /> : <Menu size={19} strokeWidth={2.2} aria-hidden />}
          </button>
        </div>
      </div>
      {open && (
        <div id="lz-nav-panel" className="lz-nav-panel">
          {NAV.map(navLink)}
          <Link className="lz-btn lz-btn-ghost" to="/app/jobs" onClick={() => setOpen(false)}>공고 보기</Link>
        </div>
      )}
    </header>
  );
}

/* hero: copy column + working dashboard preview anchored by the mascot */
function Hero() {
  const systemReduce = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [saved, setSaved] = useState(true);
  const [tip, setTip] = useState(0);
  const [greet, setGreet] = useState<number | null>(null);
  const reduce = Boolean(systemReduce || paused);
  // Cycling tips stop when motion is paused; the greeting bubble self-dismisses.
  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setTip((v) => (v + 1) % TIPS.length), 4200);
    return () => window.clearInterval(id);
  }, [reduce]);
  useEffect(() => {
    if (greet === null) return;
    const id = window.setTimeout(() => setGreet(null), 4200);
    return () => window.clearTimeout(id);
  }, [greet]);

  return (
    <section className="lz-hero" aria-labelledby="lz-hero-title">
      <div className="lz-shell lz-hero-grid">
        <div className="lz-hero-copy">
          <p className="lz-hero-kicker">브라우저 안에서만 동작하는 취업 워크스페이스</p>
          <h1 id="lz-hero-title" className="lz-h1">취업 준비의 모든 것, <em>한곳에.</em></h1>
          <p className="lz-hero-lede">공고 저장, 서류 버전, 지원 기록, 면접 연습까지 한 흐름으로 잇습니다. 적어 둔 자료는 이 기기를 떠나지 않습니다.</p>
          <div className="lz-hero-actions">
            <Link className="lz-btn lz-btn-primary" to="/app">작업 공간 열기<ArrowRight size={17} strokeWidth={2.2} aria-hidden /></Link>
            <Link className="lz-btn lz-btn-ghost" to="/app/jobs">공고 보기</Link>
          </div>
          <ul className="lz-hero-facts">
            <li><Lock size={14} strokeWidth={2.2} aria-hidden />계정과 로그인 없음</li>
            <li><HardDrive size={14} strokeWidth={2.2} aria-hidden />파일은 내 브라우저에</li>
            <li><ShieldCheck size={14} strokeWidth={2.2} aria-hidden />JSON으로 백업</li>
          </ul>
          <p className="lz-tip" aria-hidden="true">{TIPS[tip]}</p>
        </div>
        <div className="lz-hero-visual">
          <div className="lz-dash">
            <div className="lz-dash-bar">
              <span className="lz-dash-dots" aria-hidden="true"><i /><i /><i /></span>
              <span className="lz-dash-title">자리집 · 내 공간</span>
              <span className="lz-dash-badge"><Lock size={12} strokeWidth={2.4} aria-hidden />로컬 전용</span>
            </div>
            <div className="lz-dash-body">
              <div className="lz-dash-stats">
                <span><b className="lz-num">{saved ? 3 : 2}</b>저장한 공고</span><span><b className="lz-num">2</b>진행 중 지원</span><span><b className="lz-num">1</b>면접 준비</span>
              </div>
              <div className="lz-dash-job" data-saved={saved}>
                <span className="lz-dash-company">한결소프트<span className="lz-tag">예시</span></span>
                <span className="lz-dash-jobtitle">프론트엔드 엔지니어</span>
                <span className="lz-dash-meta"><MapPin size={12} strokeWidth={2.2} aria-hidden />서울 성동구<span>경력 3년 이상</span></span>
                <button type="button" className="lz-iconbtn" aria-pressed={saved} aria-label={saved ? '관심 공고에서 빼기' : '관심 공고로 저장'} onClick={() => setSaved((v) => !v)}>
                  {saved ? <BookmarkCheck size={17} strokeWidth={2.1} aria-hidden /> : <Bookmark size={17} strokeWidth={2.1} aria-hidden />}
                </button>
              </div>
              <ol className="lz-dash-track"><li data-on="true">서류 준비</li><li data-on="true">지원 완료</li><li>면접</li><li>결과</li></ol>
              <p className="lz-note-hand">오늘 본 공고부터 접어 두세요</p>
              <p className="lz-dash-foot">화면의 숫자와 공고는 예시입니다.</p>
            </div>
          </div>
          <div className="lz-jippi-stand">
            <button type="button" className="lz-jippi-btn" aria-label="마스코트 지피와 인사하기" onClick={() => setGreet((v) => (v === null ? 0 : (v + 1) % GREETINGS.length))}>
              <span className={reduce ? 'lz-jippi' : 'lz-jippi lz-mascot-breathe'}><JippiArt pose="wave" alt="지퍼 파우치 마스코트 지피가 인사하는 모습" priority /></span>
            </button>
            <AnimatePresence>
              {greet !== null && (
                <motion.span className="lz-mascot-bubble" role="status" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: reduce ? 0 : 0.24, ease: EASE }}>
                  {GREETINGS[greet]}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <div className="lz-mascot-controls">
            {systemReduce ? <span className="lz-motion-note">기기의 움직임 최소화 설정 적용 중</span> : (
              <button type="button" className="lz-motion-toggle" aria-pressed={paused} onClick={() => setPaused((v) => !v)}>
                {paused ? <Play size={13} strokeWidth={2.4} aria-hidden /> : <Pause size={13} strokeWidth={2.4} aria-hidden />}
                {paused ? '캐릭터 움직임 켜기' : '캐릭터 움직임 멈추기'}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* capabilities */
function Capabilities() {
  return (
    <section className="lz-section" aria-labelledby="lz-cap-title">
      <div className="lz-shell">
        <Reveal className="lz-head">
          <h2 id="lz-cap-title" className="lz-h2">준비의 각 단계가 서로의 재료가 됩니다</h2>
          <p className="lz-body">공고에서 시작해 서류, 지원 기록, 면접 준비까지 같은 자료 위에서 이어집니다.</p>
        </Reveal>
        <Reveal className="lz-bento">
          <div className="lz-cell lz-cell-sky lz-span-7">
            <span className="lz-cell-icon"><Search size={18} strokeWidth={2.1} aria-hidden /></span>
            <h3 className="lz-h3">조건으로 좁히는 공고 탐색</h3>
            <p className="lz-cell-body">직무, 지역, 고용 형태, 경력 조건을 함께 걸어 목록을 좁히고 관심 공고로 표시해 둡니다.</p>
            <div className="lz-chips" aria-hidden="true"><span>정규직</span><span>신입 가능</span><span>서울</span><span>React</span></div>
          </div>
          <div className="lz-cell lz-cell-kraft lz-span-5">
            <span className="lz-cell-icon"><FileText size={18} strokeWidth={2.1} aria-hidden /></span>
            <h3 className="lz-h3">고칠수록 쌓이는 서류 버전</h3>
            <p className="lz-cell-body">이력서와 자기소개서는 수정할 때마다 새 버전으로 남고, 어떤 문장을 바꿨는지도 함께 기록됩니다.</p>
          </div>
          {CAP_CELLS.map((cell) => <Tile key={cell.t} cell={cell} />)}
        </Reveal>
      </div>
    </section>
  );
}

/* flow */
function Flow() {
  return (
    <section id="flow" className="lz-section lz-flow" aria-labelledby="lz-flow-title">
      <div className="lz-shell">
        <Reveal className="lz-head">
          <h2 id="lz-flow-title" className="lz-h2">지원 한 건이 지나가는 길</h2>
          <p className="lz-body">네 단계가 서로 다른 화면이 아니라 하나의 기록으로 이어집니다.</p>
        </Reveal>
        <Reveal>
          <ol className="lz-steps">
            {FLOW.map((step) => (
              <li className="lz-step" key={step.n}>
                <span className="lz-step-n lz-num">{step.n}</span><h3 className="lz-h3">{step.title}</h3><p className="lz-cell-body">{step.body}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}

/* preview: jobs */
function JobsPanel() {
  const [query, setQuery] = useState('');
  const [facets, setFacets] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>(['ex-2']);
  const toggle = (list: string[], set: (v: string[]) => void, key: string) => set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const active = FACETS.filter((facet) => facets.includes(facet.key));
    return DEMO_JOBS.filter((job) => {
      const hay = [job.company, job.title, job.location, job.employment, ...job.tags].join(' ').toLowerCase();
      return needle.split(/\s+/).filter(Boolean).every(term => hay.includes(term)) && active.every((f) => f.test(job));
    });
  }, [query, facets]);

  return (
    <div>
      <label className="lz-field">
        <Search size={17} strokeWidth={2.1} aria-hidden />
        <input type="search" value={query} placeholder="직무, 회사, 기술로 검색" aria-label="예시 공고 검색" onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} />
        {query.length > 0 && <button type="button" className="lz-iconbtn" onClick={() => setQuery('')} aria-label="검색어 지우기"><X size={14} strokeWidth={2.4} aria-hidden /></button>}
      </label>
      <div className="lz-chips" role="group" aria-label="조건 필터">
        {FACETS.map((facet) => (
          <button key={facet.key} type="button" className="lz-chip-btn" aria-pressed={facets.includes(facet.key)} onClick={() => toggle(facets, setFacets, facet.key)}>
            {facets.includes(facet.key) && <Check size={13} strokeWidth={2.6} aria-hidden />}{facet.label}
          </button>
        ))}
        {facets.length > 0 && <button type="button" className="lz-chip-btn" onClick={() => setFacets([])}>조건 초기화</button>}
      </div>
      <Note><Info size={14} strokeWidth={2.1} aria-hidden />예시 데이터 {visible.length}건, 저장 {saved.length}건. 모두 가상의 회사와 공고입니다.</Note>
      <div className="lz-results">
        {visible.length === 0 ? (
          <div className="lz-empty">
            <Search size={20} strokeWidth={1.9} aria-hidden /><strong>조건에 맞는 예시 공고가 없습니다</strong>
            <span>검색어를 줄이거나 필터를 초기화해 보세요.</span>
            <button type="button" className="lz-btn lz-btn-ghost lz-btn-sm" onClick={() => { setQuery(''); setFacets([]); }}>조건 초기화</button>
          </div>
        ) : visible.map((job) => {
          const isSaved = saved.includes(job.id);
          return (
            <div className="lz-result" key={job.id} data-saved={isSaved}>
              <span className="lz-result-top">
                <span className="lz-result-company">{job.company}</span><span className="lz-tag">예시</span><span className="lz-tag lz-tag-quiet">{job.employment}</span>
              </span>
              <span className="lz-result-title">{job.title}</span>
              <span className="lz-result-meta">
                <span><MapPin size={12} strokeWidth={2.2} aria-hidden />{job.location}</span><span>{job.experience}</span>
                <span><Calendar size={12} strokeWidth={2.2} aria-hidden />{job.deadline}</span><span>{job.tags.join(', ')}</span>
              </span>
              <span className="lz-result-side">
                <button type="button" className="lz-iconbtn" aria-pressed={isSaved} aria-label={`${job.title} ${isSaved ? '저장 취소' : '저장'}`} onClick={() => toggle(saved, setSaved, job.id)}>
                  {isSaved ? <BookmarkCheck size={17} strokeWidth={2.1} aria-hidden /> : <Bookmark size={17} strokeWidth={2.1} aria-hidden />}
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Each example version has its own actual body, just like the working app. */
const DOC_HISTORY: Record<string, Record<number, string>> = {
  'doc-1': {
    1: '1. 지원 동기\n사용하기 편한 화면을 만드는 프론트엔드 개발자가 되고 싶습니다.\n\n2. 협업 방식\n팀원의 의견을 듣고 맡은 일을 책임감 있게 수행합니다.',
    2: '1. 지원 동기\n결제 흐름을 다시 설계해 이탈을 줄인 경험이 있습니다. 공통 컴포넌트를 정리해 다른 기능에서도 재사용했습니다.\n\n2. 협업 방식\n의견이 다를 때는 사용자가 겪는 문제를 먼저 정리합니다.',
  },
};

/* preview: documents */
function DocsPanel() {
  const [docId, setDocId] = useState(DEMO_DOCS[0].id);
  const [version, setVersion] = useState(DEMO_DOCS[0].version);
  const doc = DEMO_DOCS.find((item) => item.id === docId) ?? DEMO_DOCS[0];
  const current = doc.versions.find((item) => item.version === version) ?? doc.versions[0];
  return (
    <div className="lz-doc-grid">
      <div className="lz-doc-list">
        {DEMO_DOCS.map((item) => (
          <button key={item.id} type="button" className="lz-doc-item" aria-pressed={item.id === docId} onClick={() => { setDocId(item.id); setVersion(item.version); }}>
            <FileText size={16} strokeWidth={2.1} aria-hidden />
            <span><strong>{item.title}</strong><small>{item.kind}, v{item.version}, {item.updated}</small></span>
          </button>
        ))}
        <Link className="lz-doc-item" to="/app/documents">
          <Upload size={16} strokeWidth={2.1} aria-hidden />
          <span><strong>내 서류 보관함 열기</strong><small>파일을 올리고 실제 서류를 관리하세요</small></span>
        </Link>
      </div>
      <div className="lz-doc-reader">
        <div className="lz-doc-head"><FileText size={16} strokeWidth={2.1} aria-hidden /><strong>{doc.title}</strong><span className="lz-tag">예시</span></div>
        <div className="lz-chips" role="group" aria-label="버전 선택">
          {doc.versions.map((item) => <button key={item.version} type="button" className="lz-chip-btn" aria-pressed={item.version === version} onClick={() => setVersion(item.version)}>v{item.version}</button>)}
        </div>
        <p className="lz-doc-body">{DOC_HISTORY[doc.id]?.[version] ?? doc.body}</p>
        <Note><Info size={14} strokeWidth={2.1} aria-hidden />{current.note}, 버전을 바꿔도 이전 내용은 지워지지 않습니다.</Note>
      </div>
    </div>
  );
}

/* preview: board */
function BoardPanel() {
  const [cards, setCards] = useState(INITIAL_BOARD);
  const [moved, setMoved] = useState<string | null>(null);
  const move = (id: string, direction: 1 | -1) => {
    setCards((prev) => prev.map((card) => {
      if (card.id !== id) return card;
      const index = BOARD_COLUMNS.findIndex((column) => column.id === card.stage);
      return { ...card, stage: BOARD_COLUMNS[Math.min(BOARD_COLUMNS.length - 1, Math.max(0, index + direction))].id };
    }));
    setMoved(id);
  };
  return (
    <div>
      <Note><Kanban size={14} strokeWidth={2.1} aria-hidden />단계를 옮겨 보세요. 실제 작업 공간에서는 이 이동이 그대로 저장됩니다.</Note>
      <div className="lz-board">
        {BOARD_COLUMNS.map((column) => {
          const items = cards.filter((card) => card.stage === column.id);
          return (
            <div className="lz-col" key={column.id}>
              <div className="lz-col-head"><span>{column.name}</span><b className="lz-num">{items.length}</b></div>
              {items.length === 0 && <p className="lz-col-empty">비어 있음</p>}
              {items.map((card) => {
                const index = BOARD_COLUMNS.findIndex((item) => item.id === card.stage);
                return (
                  <div className="lz-card" key={card.id}>
                    <span className="lz-card-title">{card.title}</span><span className="lz-card-company">{card.company}</span>
                    <span className="lz-card-moves">
                      <button type="button" className="lz-move" onClick={() => move(card.id, -1)} disabled={index === 0} aria-label={`${card.title} 이전 단계로`}>이전</button>
                      <button type="button" className="lz-move" onClick={() => move(card.id, 1)} disabled={index === BOARD_COLUMNS.length - 1} aria-label={`${card.title} 다음 단계로`}>다음</button>
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <Note status><Check size={14} strokeWidth={2.2} aria-hidden />{moved ? '단계를 옮겼습니다. 지원 시점 스냅샷은 그대로 유지됩니다.' : '아직 옮긴 카드가 없습니다.'}</Note>
    </div>
  );
}

/* preview: interview */
function InterviewPanel() {
  const [open, setOpen] = useState<string | null>(QUESTIONS[0].id);
  return (
    <div>
      {QUESTIONS.map((item) => {
        const isOpen = open === item.id;
        return (
          <div className="lz-q" key={item.id} data-open={isOpen}>
            <button type="button" className="lz-q-btn" aria-expanded={isOpen} aria-controls={`lz-q-${item.id}`} onClick={() => setOpen(isOpen ? null : item.id)}>
              <span className="lz-tag">{item.topic}</span><span className="lz-q-text">{item.q}</span>
              <ChevronDown className="lz-q-chev" size={18} strokeWidth={2.2} aria-hidden />
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div id={`lz-q-${item.id}`} className="lz-q-panel" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.26, ease: EASE }} style={{ overflow: 'hidden' }}>
                  <div className="lz-evidence">
                    <span className="lz-evidence-label"><Quote size={12} strokeWidth={2.4} aria-hidden />근거 문장</span>
                    <span className="lz-evidence-text">{item.evidence}</span><span className="lz-doc-sub">{item.source}</span>
                  </div>
                  <Note><Info size={14} strokeWidth={2.1} aria-hidden />{item.hint}</Note>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
      <Note><Info size={14} strokeWidth={2.1} aria-hidden />실제 작업 공간에서는 확정한 제출본과 공고를 근거로 질문을 구성합니다. 외부 생성 모델은 호출하지 않습니다.</Note>
    </div>
  );
}

/* preview tabs */
const TABS: { id: string; label: string; icon: ReactNode; panel: ComponentType }[] = [
  { id: 'jobs', label: '공고 탐색', icon: <Search size={15} strokeWidth={2.2} aria-hidden />, panel: JobsPanel },
  { id: 'docs', label: '서류 보관함', icon: <FileText size={15} strokeWidth={2.2} aria-hidden />, panel: DocsPanel },
  { id: 'board', label: '지원 보드', icon: <Kanban size={15} strokeWidth={2.2} aria-hidden />, panel: BoardPanel },
  { id: 'interview', label: '면접 연습', icon: <Mic size={15} strokeWidth={2.2} aria-hidden />, panel: InterviewPanel },
];
function Preview() {
  const [tab, setTab] = useState(TABS[0].id);
  const active = TABS.find((item) => item.id === tab) ?? TABS[0];
  const Panel = active.panel;
  const reduce = useReducedMotion();
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((item) => item.id === tab);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault();
    setTab(TABS[next].id);
    document.getElementById(`lz-tab-${TABS[next].id}`)?.focus();
  };
  return (
    <section id="preview" className="lz-section" aria-labelledby="lz-preview-title">
      <div className="lz-shell">
        <Reveal className="lz-head">
          <h2 id="lz-preview-title" className="lz-h2">작업 공간을 직접 만져 보세요</h2>
          <p className="lz-body">아래 화면은 이 페이지 안에서 실제로 동작하는 축소판입니다. 검색하고, 저장하고, 단계를 옮겨 보세요. 값은 예시이며 페이지를 떠나면 초기화됩니다.</p>
        </Reveal>
        <div className="lz-tabs" role="tablist" aria-label="미리보기 종류" onKeyDown={onKeyDown}>
          {TABS.map((item) => {
            const selected = item.id === tab;
            return (
              <button key={item.id} id={`lz-tab-${item.id}`} type="button" role="tab" className="lz-tab" aria-selected={selected} aria-controls={`lz-panel-${item.id}`} tabIndex={selected ? 0 : -1} onClick={() => setTab(item.id)}>
                {item.icon}{item.label}
              </button>
            );
          })}
        </div>
        <div className="lz-preview" role="tabpanel" id={`lz-panel-${tab}`} aria-labelledby={`lz-tab-${tab}`} tabIndex={0}>
          <div className="lz-preview-bar">
            <span className="lz-dash-dots" aria-hidden="true"><i /><i /><i /></span>
            <span className="lz-preview-title">자리집, {active.label}</span>
            <span className="lz-dash-badge"><Lock size={12} strokeWidth={2.4} aria-hidden />로컬 전용</span>
          </div>
          <div className="lz-preview-body">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={tab} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }} transition={{ duration: reduce ? 0.1 : 0.26, ease: EASE }}>
                <Panel />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

/* limits and faq */
function LimitsAndFaq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="limits" className="lz-section" aria-labelledby="lz-limits-title">
      <div className="lz-shell lz-two-col">
        <Reveal>
          <h2 id="lz-limits-title" className="lz-h2">아직 하지 않는 일</h2>
          <p className="lz-body">기대와 실제가 어긋나면 도구를 믿기 어렵습니다. 지금 연결되어 있지 않은 기능을 먼저 밝힙니다.</p>
          <ul className="lz-limits">
            {LIMITS.map((limit) => (
              <li className="lz-limit" key={limit.title}>
                <limit.icon size={17} strokeWidth={2.1} aria-hidden />
                <span><strong>{limit.title}</strong><span>{limit.body}</span></span>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.08}>
          <div id="faq" style={{ scrollMarginTop: 96 }}>
            <h2 className="lz-h2">자주 묻는 질문</h2>
            <div className="lz-faq">
              {FAQ.map((item, index) => {
                const isOpen = open === index;
                return (
                  <div className="lz-faq-item" key={item.q}>
                    <button type="button" className="lz-faq-btn" aria-expanded={isOpen} aria-controls={`lz-faq-${index}`} onClick={() => setOpen(isOpen ? null : index)}>
                      {item.q}<ChevronDown size={17} strokeWidth={2.2} aria-hidden />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.p id={`lz-faq-${index}`} className="lz-faq-answer" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.26, ease: EASE }} style={{ overflow: 'hidden' }}>
                          {item.a}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* CTA and footer */
function CtaAndFooter() {
  const toTop = () => window.scrollTo({ top: 0, behavior: prefersReduced() ? 'auto' : 'smooth' });
  const pageLinks = [['이용 흐름', 'flow'], ['한계와 원칙', 'limits'], ['자주 묻는 질문', 'faq']] as const;
  return (
    <>
      <section className="lz-section" aria-labelledby="lz-cta-title">
        <div className="lz-shell">
          <Reveal className="lz-cta">
            <div>
              <h2 id="lz-cta-title" className="lz-h2">오늘 본 공고부터 접어 두세요</h2>
              <p className="lz-body">설치도 가입도 필요 없습니다. 브라우저에서 바로 시작하고, 필요해지면 파일로 내려받아 보관하세요.</p>
              <div className="lz-cta-actions">
                <Link className="lz-btn lz-btn-primary" to="/app">작업 공간 열기<ArrowUpRight size={17} strokeWidth={2.2} aria-hidden /></Link>
                <Link className="lz-btn lz-btn-ghost" to="/app/jobs">공고 보기</Link>
              </div>
            </div>
            <div className="lz-cta-art"><JippiArt pose="document" alt="지퍼 파우치 마스코트 지피가 서류를 정리하는 모습" /></div>
          </Reveal>
        </div>
      </section>

      <footer className="lz-footer">
        <div className="lz-shell">
          <div className="lz-footer-grid">
            <div className="lz-footer-brand">
              <Brand />
              <p className="lz-body">구직 준비를 한 자리에 모으는 로컬 우선 작업 공간. 자료는 내 브라우저를 떠나지 않습니다.</p>
            </div>
            <div>
              <p className="lz-footer-title">작업 공간</p>
              <ul className="lz-footer-links">
                <li><Link className="lz-footer-link" to="/app">대시보드</Link></li>
                <li><Link className="lz-footer-link" to="/app/jobs">채용 공고</Link></li>
                <li><Link className="lz-footer-link" to="/app/documents">서류 보관함</Link></li>
                <li><Link className="lz-footer-link" to="/app/applications">지원 보드</Link></li>
              </ul>
            </div>
            <div>
              <p className="lz-footer-title">이 페이지</p>
              <ul className="lz-footer-links">
                {pageLinks.map(([label, id]) => <li key={id}><button type="button" className="lz-footer-link" onClick={() => jumpTo(id)}>{label}</button></li>)}
                <li><button type="button" className="lz-footer-link" onClick={toTop}>맨 위로</button></li>
              </ul>
            </div>
          </div>
          <div className="lz-footer-bottom">
            <span>자리집, JariZip</span>
            <span>모든 예시 데이터는 가상이며 실제 채용 정보가 아닙니다</span>
          </div>
        </div>
      </footer>
    </>
  );
}

export default function Landing() {
  return (
    <div className="lz-landing" lang="ko">
      <a className="lz-skip" href="#lz-main" onClick={(event) => { event.preventDefault(); document.getElementById('lz-main')?.focus(); }}>본문으로 건너뛰기</a>
      <Nav />
      <main id="lz-main" tabIndex={-1}>
        <Hero />
        <Capabilities />
        <Flow />
        <Preview />
        <LimitsAndFaq />
        <CtaAndFooter />
      </main>
    </div>
  );
}
