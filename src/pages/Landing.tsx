/**
 * Landing - JariZip / 자리집 public product page.
 *
 * Design read: Korean job-seeker workspace that now searches real Wanted
 * postings. Editorial layout on warm white paper: hairline rules, deep navy
 * Korean type, ONE cobalt accent, small radii, no pastel card field, no English
 * overlines, no badge/sticker repetition. The Jippi brand artwork stays
 * as the single character anchor.
 *
 * Honesty rules: no fictional company, document, count or search result appears
 * on this page. Every destination is a real route. External search is described
 * as Wanted public postings, query-only, with documents and recordings local;
 * Saramin is mentioned only as key-gated. No claim that every site is verified
 * and no claim of LLM scoring or generation. Styling is scoped to `.lz-`.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight, ArrowUpRight, ChevronDown, Compass, FileText, HardDrive, Kanban, KeyRound,
  Lock, Menu, Mic, Pause, Play, ShieldCheck, SlidersHorizontal, X,
} from 'lucide-react';
import JippiArt from '../components/JippiArt';
import '../styles/landing.css';

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const NAV = [{ id: 'flow', label: '이용 흐름' }, { id: 'boundary', label: '개인정보' }, { id: 'limits', label: '한계와 원칙' }, { id: 'faq', label: '자주 묻는 질문' }];

/** Real product behaviour only. The greeting is also the reduced-motion fallback. */
const GREETINGS = [
  '자료는 이 브라우저에 보관해요. 서버로 보내지 않아요.',
  '서류를 고쳐도 제출한 버전은 그대로 남아요.',
  '검색어만 밖으로 나가고, 이력서는 여기 남아요.',
];

/** The four real screens. Each destination is reachable and does the stated work. */
const SPACES = [
  { to: '/app/discover', label: '채용 탐색', body: '원티드 공개 공고를 검색하고 관심 공고로 보관합니다.' },
  { to: '/app/documents', label: '서류 보관함', body: '이력서와 자기소개서를 버전별로 두고 새 버전으로 고칩니다.' },
  { to: '/app/applications', label: '지원 현황', body: '지원 단계와 실제로 제출한 서류 버전을 함께 기록합니다.' },
  { to: '/app/interview', label: '면접 연습', body: '확정한 제출본과 지원 당시 공고를 근거로 답을 정리합니다.' },
];

const FLOW = [
  { n: '01', title: '공고 찾기', body: '검색어와 필터를 원티드 공개 공고에 보내 실제 공고를 찾습니다. 사람인은 키를 넣은 경우에만 함께 조회합니다.', to: '/app/discover', cta: '채용 탐색 열기' },
  { n: '02', title: '서류 준비', body: '이력서와 자기소개서를 올리거나 직접 쓰고, 고칠 때마다 새 버전으로 남깁니다.', to: '/app/documents', cta: '서류 보관함 열기' },
  { n: '03', title: '지원 기록', body: '실제로 제출한 버전을 골라 확정하고, 그때의 공고 원문을 스냅샷으로 접어 둡니다.', to: '/app/applications', cta: '지원 현황 열기' },
  { n: '04', title: '면접 준비', body: '확정한 제출본에서 근거 문장을 찾아 질문과 답변을 정리합니다.', to: '/app/interview', cta: '면접 연습 열기' },
];

const OUTBOUND = ['검색어와 필터 값', '원티드 공개 공고 조회 요청', '직접 발급한 사람인 키 (넣은 경우에만)'];
const LOCAL = ['이력서·자기소개서 원문과 업로드한 파일', '면접 답변과 녹음', '지원 기록, 기업 메모, 설정', 'JSON 백업 파일'];

const LIMITS = [
  { icon: KeyRound, title: '사람인은 키가 있을 때만 연결합니다', body: '사람인 공고는 직접 발급받은 키를 넣은 경우에만 함께 조회합니다. 키가 없으면 원티드 공개 공고만 검색합니다.' },
  { icon: ShieldCheck, title: '모든 공고를 검증하지는 않습니다', body: '공개 목록의 마감일과 접수 상태는 원문과 다를 수 있습니다. 출처가 제공한 접수 상태와 조회 시각을 기록합니다. 직접 확인한 기록과 구분하며 실제 지원 전에는 원문을 다시 확인하세요.' },
  { icon: SlidersHorizontal, title: '문장을 대신 써 주거나 평가하지 않습니다', body: '면접 질문은 내 문서에서 근거를 찾아 규칙으로 조합합니다. 자기소개서 자동 생성이나 합격 가능성 점수는 없습니다.' },
  { icon: HardDrive, title: '동기화 서버가 없습니다', body: '기기를 바꾸려면 JSON 백업으로 옮겨야 합니다. 브라우저 데이터를 지우면 기록도 함께 사라집니다.' },
];

const FAQ = [
  { q: '공고는 어디에서 가져오나요?', a: '원티드 공개 공고 목록·검색·상세 응답을 읽어 옵니다. 검색에 필요한 검색어와 필터만 외부로 전송하고, 이력서와 녹음은 전송하지 않습니다. 사람인은 키를 넣은 경우에만 함께 조회합니다.' },
  { q: '가져온 공고를 그대로 믿어도 되나요?', a: '아닙니다. 공개 목록의 마감일과 접수 상태는 원문과 다를 수 있습니다. 출처의 상태와 조회 시각을 원문 주소와 함께 보관합니다. 접수 상태는 바뀔 수 있어 실제 지원 전에는 원문을 확인해야 합니다.' },
  { q: '이력서와 면접 답변은 어디에 저장되나요?', a: '원문 파일, 면접 답변과 녹음은 이 브라우저의 저장소에만 남습니다. 계정과 로그인이 없어서 다른 기기에서는 보이지 않습니다.' },
  { q: '다른 기기로 옮길 수 있나요?', a: 'JSON 파일로 내보내고 다시 불러오는 방식입니다. 불러올 때 형식과 크기를 검사하고, 검사를 통과하지 못한 파일은 적용하지 않습니다.' },
];

/* helpers */
function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return <motion.div className={className} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.55, ease: EASE }}>{children}</motion.div>;
}
const prefersReduced = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' });
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
          <Link className="lz-btn lz-btn-primary lz-btn-sm" to="/app">내 공간 열기</Link>
          <button type="button" className="lz-burger" aria-expanded={open} aria-controls="lz-nav-panel" aria-label={open ? '메뉴 닫기' : '메뉴 열기'} onClick={() => setOpen((v) => !v)}>
            {open ? <X size={19} strokeWidth={2.2} aria-hidden /> : <Menu size={19} strokeWidth={2.2} aria-hidden />}
          </button>
        </div>
      </div>
      {open && (
        <div id="lz-nav-panel" className="lz-nav-panel">
          {NAV.map(navLink)}
          <Link className="lz-btn lz-btn-ghost" to="/app/discover" onClick={() => setOpen(false)}>채용 탐색 열기</Link>
        </div>
      )}
    </header>
  );
}

/* hero: editorial copy beside the real screen index, anchored by the mascot */
function Hero() {
  const systemReduce = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [greet, setGreet] = useState<number | null>(null);
  const reduce = Boolean(systemReduce || paused);
  useEffect(() => {
    if (greet === null) return;
    const id = window.setTimeout(() => setGreet(null), 4200);
    return () => window.clearTimeout(id);
  }, [greet]);

  return (
    <section className="lz-hero" aria-labelledby="lz-hero-title">
      <div className="lz-shell lz-hero-grid">
        <div className="lz-hero-copy">
          <p className="lz-hero-kicker">원티드 공개 공고를 검색하는 로컬 우선 취업 워크스페이스</p>
          <h1 id="lz-hero-title" className="lz-h1">실제 공고에서 시작해, <em>한 흐름으로.</em></h1>
          <p className="lz-hero-lede">공고 찾기, 서류 버전, 지원 기록, 면접 연습을 한 자리에 잇습니다. 검색어만 밖으로 나가고, 이력서와 녹음은 이 브라우저에 남습니다.</p>
          <div className="lz-hero-actions">
            <Link className="lz-btn lz-btn-primary" to="/app/discover">채용 탐색 열기<ArrowRight size={17} strokeWidth={2.2} aria-hidden /></Link>
            <Link className="lz-btn lz-btn-ghost" to="/app">내 공간 열기</Link>
          </div>
          <ul className="lz-hero-facts">
            <li><Lock size={14} strokeWidth={2.2} aria-hidden />계정과 로그인 없음</li>
            <li><HardDrive size={14} strokeWidth={2.2} aria-hidden />파일은 내 브라우저에</li>
            <li><ShieldCheck size={14} strokeWidth={2.2} aria-hidden />검색어만 외부 전송</li>
          </ul>
        </div>
        <div className="lz-hero-visual">
          <nav className="lz-spaces" aria-label="제품 화면 바로 가기">
            <p className="lz-spaces-title">지금 열 수 있는 화면</p>
            <ul>
              {SPACES.map((space) => (
                <li key={space.to}>
                  <Link to={space.to}>
                    <span className="lz-spaces-text"><strong>{space.label}</strong><span>{space.body}</span></span>
                    <ArrowUpRight size={16} strokeWidth={2.2} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
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

/* real flow, each step linking to the screen that does the work */
function Flow() {
  return (
    <section id="flow" className="lz-section lz-flow" aria-labelledby="lz-flow-title">
      <div className="lz-shell">
        <Reveal className="lz-head">
          <h2 id="lz-flow-title" className="lz-h2">지원 한 건이 지나가는 길</h2>
          <p className="lz-body">네 단계가 서로 다른 화면이 아니라 하나의 기록으로 이어집니다. 각 단계는 지금 열어 볼 수 있습니다.</p>
        </Reveal>
        <ol className="lz-steps">
          {FLOW.map((step) => (
            <li className="lz-step" key={step.n}>
              <span className="lz-step-n">{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <Link className="lz-step-link" to={step.to}>{step.cta}<ArrowRight size={15} strokeWidth={2.2} aria-hidden /></Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* data boundary: what leaves the browser and what never does */
function Boundary() {
  return (
    <section id="boundary" className="lz-section" aria-labelledby="lz-boundary-title">
      <div className="lz-shell">
        <Reveal className="lz-head">
          <h2 id="lz-boundary-title" className="lz-h2">무엇이 밖으로 나가고, 무엇이 남는지</h2>
          <p className="lz-body">검색은 외부 공고를 읽어야 하니 밖으로 나갑니다. 내 서류와 말은 나가지 않습니다.</p>
        </Reveal>
        <div className="lz-boundary-grid">
          <div className="lz-boundary lz-boundary--out">
            <h3><ArrowUpRight size={18} strokeWidth={2.2} aria-hidden />외부로 보내는 것</h3>
            <ul className="lz-boundary-list">{OUTBOUND.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div className="lz-boundary lz-boundary--local">
            <h3><HardDrive size={18} strokeWidth={2.2} aria-hidden />이 브라우저에 남는 것</h3>
            <ul className="lz-boundary-list">{LOCAL.map((item) => <li key={item}>{item}</li>)}</ul>
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
        <div>
          <Reveal className="lz-head">
            <h2 id="lz-limits-title" className="lz-h2">아직 하지 않는 일</h2>
            <p className="lz-body">기대와 실제가 어긋나면 도구를 믿기 어렵습니다. 연결 범위와 한계를 먼저 밝힙니다.</p>
          </Reveal>
          <ul className="lz-limits">
            {LIMITS.map((limit) => (
              <li className="lz-limit" key={limit.title}>
                <limit.icon size={17} strokeWidth={2.1} aria-hidden />
                <div><strong>{limit.title}</strong><p>{limit.body}</p></div>
              </li>
            ))}
          </ul>
        </div>
        <div id="faq" style={{ scrollMarginTop: 96 }}>
          <Reveal className="lz-head"><h2 className="lz-h2">자주 묻는 질문</h2></Reveal>
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
              <h2 id="lz-cta-title" className="lz-h2">실제 공고부터 찾아보세요</h2>
              <p className="lz-body">가입 없이 시작하세요. 공고를 보관하고, 제출한 서류와 면접 준비를 한곳에서 이어가세요.</p>
              <div className="lz-cta-actions">
                <Link className="lz-btn lz-btn-primary" to="/app/discover">채용 탐색 열기<ArrowUpRight size={17} strokeWidth={2.2} aria-hidden /></Link>
                <Link className="lz-btn lz-btn-ghost" to="/app/documents">서류 보관함 열기</Link>
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
              <p className="lz-body">실제 공고에서 시작해 면접까지 잇는 로컬 우선 작업 공간. 이력서와 녹음은 내 브라우저를 떠나지 않습니다.</p>
            </div>
            <div>
              <p className="lz-footer-title">작업 공간</p>
              <ul className="lz-footer-links">
                <li><Link className="lz-footer-link" to="/app/discover">채용 탐색</Link></li>
                <li><Link className="lz-footer-link" to="/app/documents">서류 보관함</Link></li>
                <li><Link className="lz-footer-link" to="/app/applications">지원 현황</Link></li>
                <li><Link className="lz-footer-link" to="/app/interview">면접 연습</Link></li>
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
            <span>공고는 출처와 조회 시각을 함께 보관합니다. 실제 지원 전에는 원문을 확인하세요.</span>
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
        <Flow />
        <Boundary />
        <LimitsAndFaq />
        <CtaAndFooter />
      </main>
    </div>
  );
}
