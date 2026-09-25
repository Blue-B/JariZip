/**
 * Landing — JariZip / 자리집 public landing page.
 *
 * Structure (AIDA, one brand world, one accent = cobalt):
 *   nav -> hero (asymmetric) -> honest facts strip -> feature bento
 *   -> workflow story (pinned narrative, interactive) -> product preview tabs
 *   -> limits + FAQ -> final CTA -> footer
 *
 * Content rules honoured here:
 *   - No fake metrics, no testimonials, no ratings, no AI match percentages.
 *   - Every demo job is explicitly labelled 예시 (example) and described as
 *     unverified; nothing claims live verification.
 *   - No third-party asset fetches: artwork is the local <Mascot /> SVG plus CSS.
 *   - All interactive controls really work; no dead buttons.
 *
 * Styling lives in src/styles/landing.css, scoped to `.lz-` selectors.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Calendar,
  Check,
  ChevronDown,
  CircleCheck,
  Compass,
  CornerDownLeft,
  Database,
  Download,
  FileText,
  FolderOpen,
  HardDrive,
  Info,
  Kanban,
  Keyboard,
  Layers,
  ListChecks,
  Lock,
  MapPin,
  Menu,
  Mic,
  Quote,
  ScrollText,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TriangleAlert,
  Upload,
  WifiOff,
  X,
} from 'lucide-react';
import Mascot from '../components/Mascot';
import '../styles/landing.css';

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/* ------------------------------------------------------------------内容是示例 */

interface DemoJob {
  id: string;
  company: string;
  title: string;
  location: string;
  experience: string;
  employment: string;
  salary: string;
  tags: string[];
  deadline: string;
}

/** Fictional listings. Never presented as real or verified openings. */
const DEMO_JOBS: DemoJob[] = [
  {
    id: 'ex-1',
    company: '한결소프트',
    title: '프론트엔드 엔지니어',
    location: '서울 성동구',
    experience: '경력 3년 이상',
    employment: '정규직',
    salary: '연봉 협의',
    tags: ['React', 'TypeScript', '디자인 시스템'],
    deadline: '3월 14일',
  },
  {
    id: 'ex-2',
    company: '모래시계랩',
    title: '프로덕트 디자이너',
    location: '서울 마포구',
    experience: '경력 2년 이상',
    employment: '정규직',
    salary: '연봉 협의',
    tags: ['Figma', '프로토타이핑'],
    deadline: '3월 21일',
  },
  {
    id: 'ex-3',
    company: '푸른결',
    title: '데이터 분석가',
    location: '부산 해운대구',
    experience: '신입 가능',
    employment: '정규직',
    salary: '연봉 협의',
    tags: ['SQL', 'Python', '대시보드'],
    deadline: '상시 채용',
  },
  {
    id: 'ex-4',
    company: '노을데이터',
    title: '백엔드 엔지니어',
    location: '서울 강남구',
    experience: '경력 5년 이상',
    employment: '정규직',
    salary: '연봉 협의',
    tags: ['Go', 'PostgreSQL', '배치'],
    deadline: '3월 7일',
  },
  {
    id: 'ex-5',
    company: '오름스튜디오',
    title: '콘텐츠 마케터',
    location: '제주 제주시',
    experience: '경력 1년 이상',
    employment: '계약직',
    salary: '연봉 협의',
    tags: ['콘텐츠 기획', 'SEO'],
    deadline: '4월 2일',
  },
  {
    id: 'ex-6',
    company: '다온테크',
    title: 'QA 엔지니어',
    location: '대전 유성구',
    experience: '신입 가능',
    employment: '정규직',
    salary: '연봉 협의',
    tags: ['테스트 자동화', 'Playwright'],
    deadline: '3월 28일',
  },
];

const FACETS: { key: string; label: string; test: (job: DemoJob) => boolean }[] = [
  { key: 'fulltime', label: '정규직', test: (j) => j.employment === '정규직' },
  { key: 'contract', label: '계약직', test: (j) => j.employment === '계약직' },
  { key: 'entry', label: '신입 가능', test: (j) => j.experience.includes('신입') },
  { key: 'seoul', label: '서울', test: (j) => j.location.startsWith('서울') },
  { key: 'metro', label: '지방 근무', test: (j) => !j.location.startsWith('서울') },
];

interface DemoDoc {
  id: string;
  title: string;
  kind: string;
  version: number;
  updated: string;
  body: string;
  versions: { version: number; note: string }[];
}

const DEMO_DOCS: DemoDoc[] = [
  {
    id: 'doc-1',
    title: '자기소개서 · 한결소프트',
    kind: '자기소개서',
    version: 3,
    updated: '오늘',
    versions: [
      { version: 3, note: '문항 2 답변 다듬음' },
      { version: 2, note: '프로젝트 성과 추가' },
      { version: 1, note: '처음 작성' },
    ],
    body: `1. 지원 동기
사용자가 매일 마주하는 화면을 만드는 일을 해 왔습니다. 결제 흐름을 다시 설계해 이탈을 줄인 경험이 있고, 그 과정에서 디자이너와 함께 만든 컴포넌트 규칙이 이후 기능 개발 속도를 크게 줄였습니다.

2. 협업 방식
규칙을 먼저 합의하고, 예외는 기록으로 남깁니다. 리뷰에서 같은 지적이 두 번 나오면 문서나 린트로 옮깁니다.

3. 입사 후 계획
디자인 시스템을 유지보수 가능한 형태로 정리하고, 접근성 기준을 테스트에 포함시키는 일부터 시작하고 싶습니다.`,
  },
  {
    id: 'doc-2',
    title: '이력서 · 기본',
    kind: '이력서',
    version: 2,
    updated: '3일 전',
    versions: [
      { version: 2, note: '최근 프로젝트 순서 정리' },
      { version: 1, note: '처음 작성' },
    ],
    body: `경력 요약
프론트엔드 개발 5년. 디자인 시스템 구축과 접근성 개선을 주로 맡았습니다.

주요 업무
- 사내 컴포넌트 라이브러리 운영: 배포 자동화와 변경 이력 관리
- 성능 개선: 목록 화면의 초기 렌더링 비용 축소
- 접근성 점검: 키보드 이동 경로와 포커스 순서 정리

기술
React, TypeScript, CSS, 테스트 자동화`,
  },
  {
    id: 'doc-3',
    title: '경력기술서 · 2025',
    kind: '경력기술서',
    version: 1,
    updated: '지난주',
    versions: [{ version: 1, note: '처음 작성' }],
    body: `프로젝트 A · 사내 디자인 시스템
역할: 컴포넌트 설계와 배포 파이프라인 담당
한 일: 토큰 구조를 정리하고, 버전별 변경 기록을 남기는 절차를 만들었습니다.
배운 점: 규칙은 문서보다 도구로 강제할 때 오래 유지됩니다.

프로젝트 B · 목록 화면 개선
역할: 화면 구조 개선
한 일: 필터 상태를 주소에 반영해 새로고침과 공유가 가능하게 했습니다.`,
  },
];

const BOARD_COLUMNS: { id: string; name: string }[] = [
  { id: 'preparing', name: '서류 준비' },
  { id: 'applied', name: '지원 완료' },
  { id: 'interview', name: '면접' },
  { id: 'closed', name: '결과' },
];

interface BoardCard {
  id: string;
  title: string;
  company: string;
  stage: string;
  snapshot: string;
}

const INITIAL_BOARD: BoardCard[] = [
  { id: 'b1', title: '프론트엔드 엔지니어', company: '한결소프트', stage: 'preparing', snapshot: '스냅샷 없음' },
  { id: 'b2', title: '프로덕트 디자이너', company: '모래시계랩', stage: 'applied', snapshot: '지원 시점 기록됨' },
  { id: 'b3', title: '데이터 분석가', company: '푸른결', stage: 'interview', snapshot: '지원 시점 기록됨' },
  { id: 'b4', title: '백엔드 엔지니어', company: '노을데이터', stage: 'closed', snapshot: '지원 시점 기록됨' },
];

interface DemoQuestion {
  id: string;
  topic: string;
  question: string;
  evidence: string;
  source: string;
  hint: string;
}

const DEMO_QUESTIONS: DemoQuestion[] = [
  {
    id: 'q1',
    topic: '협업',
    question: '디자이너와 의견이 갈렸을 때 어떻게 정리하셨나요?',
    evidence: '“규칙을 먼저 합의하고, 예외는 기록으로 남깁니다.”',
    source: '자기소개서 · 한결소프트 v3, 2번 문항',
    hint: '결론이 아니라 합의 과정을 말하면 좋습니다. 누가 결정했는지, 무엇이 기준이었는지 한 줄씩.',
  },
  {
    id: 'q2',
    topic: '성과',
    question: '결제 흐름을 다시 설계했다고 하셨는데, 무엇이 달라졌나요?',
    evidence: '“결제 흐름을 다시 설계해 이탈을 줄인 경험이 있고…”',
    source: '자기소개서 · 한결소프트 v3, 1번 문항',
    hint: '측정한 지표와 측정 방법을 함께 말하세요. 숫자가 없으면 관찰한 변화만이라도 구체적으로.',
  },
  {
    id: 'q3',
    topic: '기술',
    question: '컴포넌트 라이브러리에서 버전 관리는 어떻게 하셨나요?',
    evidence: '“토큰 구조를 정리하고, 버전별 변경 기록을 남기는 절차를 만들었습니다.”',
    source: '경력기술서 · 2025 v1, 프로젝트 A',
    hint: '깨지는 변경을 어떻게 알렸는지까지 포함하면 좋습니다.',
  },
];

const NAV_ITEMS: { id: string; label: string }[] = [
  { id: 'features', label: '제품' },
  { id: 'flow', label: '이용 흐름' },
  { id: 'preview', label: '미리보기' },
  { id: 'limits', label: '한계와 원칙' },
  { id: 'faq', label: '자주 묻는 질문' },
];

const FAQ_ITEMS: { q: string; a: ReactNode }[] = [
  {
    q: '지원 내용이 서버로 전송되나요?',
    a: (
      <>
        전송하지 않습니다. 이 페이지의 기능은 모두 브라우저 안에서만 동작하고, 입력한 내용은 이 기기의
        브라우저 저장소에 남습니다. 그래서 <strong>계정도, 로그인도 없습니다.</strong> 대신 브라우저
        데이터를 지우면 함께 사라지므로, 주기적으로 백업 파일을 내려받는 것을 권합니다.
      </>
    ),
  },
  {
    q: '예시 공고에 바로 지원할 수 있나요?',
    a: (
      <>
        아닙니다. 예시 공고는 <strong>화면과 흐름을 확인하기 위한 가상의 목록</strong>이며 실제 채용
        공고가 아닙니다. 회사 이름도 모두 가상입니다. 실제로 지원하려면 공고를 직접 추가하거나 붙여넣어
        등록해야 하고, 직접 추가한 공고는 확인되지 않은 상태로 표시됩니다.
      </>
    ),
  },
  {
    q: '이력서 파일은 어떻게 처리되나요?',
    a: (
      <>
        파일은 브라우저 안에서 열어 텍스트를 추출하고, 그 결과를 저장합니다. 변환이 잘 되지 않는 형식은
        텍스트를 직접 붙여넣을 수 있고, 추출이 어려웠다는 사실을 기록으로 남깁니다. 문서는 수정할 때마다
        새 버전으로 쌓여 이전 내용이 덮어써지지 않습니다.
      </>
    ),
  },
  {
    q: '다른 기기로 옮길 수 있나요?',
    a: (
      <>
        JSON 파일로 내보내고 다시 불러오는 방식으로 옮깁니다. 불러올 때 형식을 검사하고, 검사에 통과하지
        못한 파일은 적용하지 않습니다. 자동 동기화는 없습니다.
      </>
    ),
  },
  {
    q: '자기소개서를 대신 써 주나요?',
    a: (
      <>
        쓰지 않습니다. 면접 연습의 질문은 <strong>내가 올린 문서의 문장에서 근거를 찾아</strong>{' '}
        조합합니다. 외부 AI 호출이 없기 때문에 문장을 생성하지 않고, 어떤 문장을 근거로 삼았는지 함께
        보여 줍니다. 초안은 언제나 내가 씁니다.
      </>
    ),
  },
];

/* ------------------------------------------------------------------- helpers */

function Reveal({
  children,
  delay = 0,
  className,
  as = 'div',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'li' | 'section';
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }
  const MotionTag = as === 'li' ? motion.li : as === 'section' ? motion.section : motion.div;
  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.62, delay, ease: EASE }}
    >
      {children}
    </MotionTag>
  );
}

/** Scroll-spy over section ids, used by the desktop side rail. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? '');
  const key = ids.join('|');
  useEffect(() => {
    const list = key.split('|').filter(Boolean);
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 },
    );
    list.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [key]);
  return active;
}

function prefersReduced() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/* ------------------------------------------------------------------- header */

function Nav({ onNavigate }: { onNavigate: (id: string) => void }) {
  const [stuck, setStuck] = useState(false);
  const [open, setOpen] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    onNavigate(id);
  };

  return (
    <>
      <div ref={sentinel} aria-hidden="true" style={{ position: 'absolute', top: 0, height: 1, width: 1 }} />
      <header className="lz-nav" data-stuck={stuck}>
        <div className="lz-shell lz-nav-inner">
          <Link className="lz-brand" to="/" aria-label="자리집 홈">
            <Mascot compact />
            <span className="lz-brand-name">
              <span className="lz-brand-ko">자리집</span>
              <span className="lz-brand-en">JariZip</span>
            </span>
          </Link>

          <nav className="lz-nav-links" aria-label="페이지 안 이동">
            {NAV_ITEMS.map((item) => (
              <button key={item.id} type="button" className="lz-nav-link" onClick={() => go(item.id)}>
                {item.label}
              </button>
            ))}
          </nav>

          <div className="lz-nav-actions">
            <Link className="lz-nav-app" to="/app/jobs">
              공고 보기
            </Link>
            <Link className="lz-btn lz-btn-primary lz-btn-sm" to="/app">
              작업 공간 열기
            </Link>
            <button
              type="button"
              className="lz-burger"
              aria-expanded={open}
              aria-controls="lz-nav-panel"
              aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <X size={19} strokeWidth={2} aria-hidden="true" /> : <Menu size={19} strokeWidth={2} aria-hidden="true" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              id="lz-nav-panel"
              className="lz-nav-panel"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: EASE }}
            >
              {NAV_ITEMS.map((item) => (
                <button key={item.id} type="button" className="lz-nav-link" onClick={() => go(item.id)}>
                  {item.label}
                </button>
              ))}
              <div className="lz-nav-panel-cta">
                <Link className="lz-btn lz-btn-ghost" to="/app/jobs" onClick={() => setOpen(false)}>
                  채용 공고 살펴보기
                </Link>
                <Link className="lz-btn lz-btn-primary" to="/app" onClick={() => setOpen(false)}>
                  작업 공간 열기
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}

/* --------------------------------------------------------------------- hero */

function Hero() {
  const reduce = useReducedMotion();
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const drift = useSpring(useTransform(scrollYProgress, [0, 1], [0, -46]), { stiffness: 90, damping: 22 });
  const driftSlow = useSpring(useTransform(scrollYProgress, [0, 1], [0, -20]), { stiffness: 90, damping: 24 });

  return (
    <section className="lz-hero" ref={heroRef} aria-labelledby="lz-hero-title">
      <div className="lz-shell lz-hero-grid">
        <div className="lz-hero-copy">
          <motion.span
            className="lz-hero-badge"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <span className="lz-hero-badge-dot" aria-hidden="true">
              <ShieldCheck size={13} strokeWidth={2.2} />
            </span>
            브라우저 안에서만 동작하는 커리어 작업 공간
          </motion.span>

          <motion.h1
            id="lz-hero-title"
            className="lz-h1"
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.66, delay: 0.05, ease: EASE }}
          >
            지원 준비의 모든 조각을
            <br />
            <span className="lz-mark">한 자리에</span> 접어 넣습니다
          </motion.h1>

          <motion.p
            className="lz-lede lz-hero-lede"
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.62, delay: 0.12, ease: EASE }}
          >
            공고 탐색, 서류 버전, 지원 기록, 면접 연습까지 한 곳에서. 적어 둔 내용은 브라우저 밖으로
            나가지 않습니다.
          </motion.p>

          <motion.div
            className="lz-hero-actions"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18, ease: EASE }}
          >
            <Link className="lz-btn lz-btn-primary" to="/app">
              작업 공간 열기
              <ArrowRight size={17} strokeWidth={2.2} aria-hidden="true" />
            </Link>
            <Link className="lz-btn lz-btn-ghost" to="/app/jobs">
              채용 공고 살펴보기
            </Link>
          </motion.div>
        </div>

        <div className="lz-hero-stage">
          <motion.div
            className="lz-hero-blob"
            aria-hidden="true"
            style={reduce ? undefined : { y: driftSlow }}
            initial={reduce ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: EASE }}
          />
          <motion.div
            className="lz-hero-mascot"
            style={reduce ? undefined : { y: drift }}
            initial={reduce ? false : { opacity: 0, y: 26, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.75, delay: 0.1, ease: EASE }}
          >
            <Mascot />
          </motion.div>

          <motion.span
            className="lz-float-card lz-float-card-a"
            style={reduce ? undefined : { y: driftSlow }}
            initial={reduce ? false : { opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.42, ease: EASE }}
          >
            <Layers size={15} strokeWidth={2.2} aria-hidden="true" />
            자기소개서 v3 저장됨
          </motion.span>
          <motion.span
            className="lz-float-card lz-float-card-b"
            style={reduce ? undefined : { y: drift }}
            initial={reduce ? false : { opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.52, ease: EASE }}
          >
            <WifiOff size={15} strokeWidth={2.2} aria-hidden="true" />
            오프라인에서도 열림
          </motion.span>
          <motion.span
            className="lz-float-card lz-float-card-c"
            style={reduce ? undefined : { y: driftSlow }}
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.62, ease: EASE }}
          >
            <Lock size={15} strokeWidth={2.2} aria-hidden="true" />
            계정 없음 · 전송 없음
          </motion.span>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- facts strip */

const FACTS = [
  { icon: HardDrive, title: '이 브라우저에만 저장', body: '입력한 내용은 기기 안에 남고 서버로 가지 않습니다.' },
  { icon: Lock, title: '계정과 비밀번호 없음', body: '가입 절차가 없습니다. 열면 바로 작업 공간입니다.' },
  { icon: Database, title: 'JSON으로 내보내기', body: '백업 파일 하나로 다른 기기로 옮길 수 있습니다.' },
  { icon: FileText, title: '버전이 덮어쓰지 않음', body: '문서를 고칠 때마다 이전 버전이 함께 남습니다.' },
];

function Facts() {
  return (
    <section className="lz-facts" aria-label="제품의 기본 원칙">
      <div className="lz-shell">
        <ul className="lz-facts-grid" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {FACTS.map((fact, index) => {
            const Icon = fact.icon;
            return (
              <Reveal as="li" key={fact.title} delay={index * 0.05} className="lz-fact">
                <span className="lz-fact-icon" aria-hidden="true">
                  <Icon size={17} strokeWidth={2.1} />
                </span>
                <span>
                  <span className="lz-fact-title">{fact.title}</span>
                  <br />
                  <span className="lz-fact-body">{fact.body}</span>
                </span>
              </Reveal>
            );
          })}
        </ul>
        <p className="lz-hero-note" style={{ marginTop: 26 }}>
          <Info size={14} strokeWidth={2.1} aria-hidden="true" />
          예시 공고는 화면 확인용 가상 데이터이며, 실제 채용 정보로 확인된 것이 아닙니다.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ feature bento */

function Features() {
  return (
    <section id="features" className="lz-section" aria-labelledby="lz-features-title">
      <div className="lz-shell">
        <Reveal className="lz-feat-head">
          <span className="lz-eyebrow">제품</span>
          <h2 id="lz-features-title" className="lz-h2">
            흩어져 있던 준비를 한 벌의 도구로
          </h2>
          <p className="lz-body">
            채용 공고를 찾고, 서류를 다듬고, 지원 기록과 면접 준비를 이어 붙입니다. 각 도구는 따로
            쓰지 않고 서로의 재료가 됩니다.
          </p>
        </Reveal>

        <div className="lz-bento">
          <Reveal className="lz-cell lz-cell-span-4" delay={0.02}>
            <span className="lz-cell-icon" aria-hidden="true">
              <SlidersHorizontal size={19} strokeWidth={2.1} />
            </span>
            <h3 className="lz-h3">조건으로 좁히고, 다시 찾기</h3>
            <p className="lz-cell-body">
              고용 형태, 지역, 경력 조건과 검색어를 함께 걸어 목록을 좁힙니다. 마음에 드는 공고는
              표시해 두면 지원 기록으로 그대로 이어집니다.
            </p>
            <div className="lz-wf-list" style={{ marginTop: 20 }} aria-hidden="true">
              <div className="lz-wf-row">
                <Search size={15} strokeWidth={2.1} />
                <strong>프론트엔드</strong>
                <span className="lz-wf-meta">예시 공고 2건</span>
              </div>
              <div className="lz-wf-row">
                <BookmarkCheck size={15} strokeWidth={2.1} />
                저장한 공고는 지원 보드로 이어짐
              </div>
            </div>
            <div className="lz-filter-row" aria-hidden="true">
              <span className="lz-chip">정규직</span>
              <span className="lz-chip">신입 가능</span>
              <span className="lz-chip">서울</span>
              <span className="lz-chip lz-chip-quiet">React</span>
            </div>
          </Reveal>

          <Reveal className="lz-cell lz-cell-kraft lz-cell-span-2" delay={0.06}>
            <span className="lz-cell-icon" aria-hidden="true">
              <ScrollText size={19} strokeWidth={2.1} />
            </span>
            <h3 className="lz-h3">쌓이는 버전</h3>
            <p className="lz-cell-body">고친 만큼 위로 쌓입니다. 예전 문장을 다시 꺼낼 수 있습니다.</p>
            <div className="lz-vstack" aria-hidden="true">
              <span className="lz-vrow lz-vrow-live">
                v3 <span>문항 2 다듬음</span>
                <span className="lz-vrow-tag">최신</span>
              </span>
              <span className="lz-vrow">
                v2 <span>성과 추가</span>
              </span>
              <span className="lz-vrow">
                v1 <span>처음 작성</span>
              </span>
            </div>
          </Reveal>

          <Reveal className="lz-cell lz-cell-span-2" delay={0.04}>
            <span className="lz-cell-icon" aria-hidden="true">
              <FolderOpen size={19} strokeWidth={2.1} />
            </span>
            <h3 className="lz-h3">제출 시점 그대로</h3>
            <p className="lz-cell-body">
              지원할 때의 공고와 문서를 한 묶음으로 접어 둡니다. 나중에 공고가 바뀌어도 기록은 그대로
              남습니다.
            </p>
          </Reveal>

          <Reveal className="lz-cell lz-cell-span-2" delay={0.08}>
            <span className="lz-cell-icon" aria-hidden="true">
              <Mic size={19} strokeWidth={2.1} />
            </span>
            <h3 className="lz-h3">근거가 붙은 질문</h3>
            <p className="lz-cell-body">
              예상 질문 옆에 내 문서의 어떤 문장에서 나왔는지 함께 보여 줍니다. 근거가 없으면 질문도
              만들지 않습니다.
            </p>
          </Reveal>

          <Reveal className="lz-cell lz-cell-span-2" delay={0.06}>
            <span className="lz-cell-icon" aria-hidden="true">
              <Compass size={19} strokeWidth={2.1} />
            </span>
            <h3 className="lz-h3">회사별 메모</h3>
            <p className="lz-cell-body">
              면접에서 들은 이야기, 다시 물어볼 것을 회사 단위로 모아 둡니다.
            </p>
          </Reveal>

          <Reveal className="lz-cell lz-cell-ink lz-cell-span-3" delay={0.04}>
            <span className="lz-cell-icon" aria-hidden="true">
              <ShieldCheck size={19} strokeWidth={2.1} />
            </span>
            <h3 className="lz-h3">밖으로 나가지 않는 자료</h3>
            <p className="lz-cell-body">
              저장은 이 기기의 브라우저에서만 이뤄집니다. 언제든 JSON 파일로 통째로 내려받아 보관할 수
              있고, 내려받은 파일은 다시 불러올 수 있습니다.
            </p>
            <div className="lz-filter-row" aria-hidden="true" style={{ marginTop: 18 }}>
              <span
                className="lz-chip"
                style={{ background: 'rgba(245,245,240,.14)', color: '#c2ea4b' }}
              >
                <Download size={13} strokeWidth={2.4} /> 내보내기
              </span>
              <span
                className="lz-chip"
                style={{ background: 'rgba(245,245,240,.14)', color: '#c2ea4b' }}
              >
                <Upload size={13} strokeWidth={2.4} /> 불러오기
              </span>
            </div>
          </Reveal>

          <Reveal className="lz-cell lz-cell-kraft lz-cell-mascot lz-cell-span-3" delay={0.08}>
            <div className="lz-cell-mascot-figure">
              <Mascot />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------- workflow story flow */

interface FlowStep {
  stage: string;
  title: string;
  text: string;
  visual: ReactNode;
}

const FLOW: FlowStep[] = [
  {
    stage: '모으기',
    title: '공고를 한 곳에 모읍니다',
    text: '조건으로 좁혀 보고, 저장해 두고, 외부에서 본 공고는 직접 붙여넣어 등록합니다. 직접 넣은 공고는 확인되지 않은 상태로 남습니다.',
    visual: (
      <div className="lz-wf-list">
        <div className="lz-wf-row">
          <Search size={15} strokeWidth={2.1} aria-hidden="true" />
          <strong>프론트엔드</strong>
          <span className="lz-chip lz-chip-quiet">정규직</span>
          <span className="lz-wf-meta">6개 중 2개</span>
        </div>
        <div className="lz-wf-row">
          <BookmarkCheck size={15} strokeWidth={2.1} aria-hidden="true" />
          프론트엔드 엔지니어 · 한결소프트
          <span className="lz-chip lz-chip-example">예시</span>
        </div>
        <div className="lz-wf-row">
          <TriangleAlert size={15} strokeWidth={2.1} aria-hidden="true" />
          직접 추가한 공고
          <span className="lz-wf-meta">확인되지 않음</span>
        </div>
      </div>
    ),
  },
  {
    stage: '다듬기',
    title: '문서를 버전으로 다듬습니다',
    text: '이력서와 자기소개서를 올리거나 붙여넣고, 고칠 때마다 새 버전으로 남깁니다. 어떤 문장을 왜 바꿨는지도 함께 기록됩니다.',
    visual: (
      <div className="lz-wf-list">
        <div className="lz-wf-row">
          <FileText size={15} strokeWidth={2.1} aria-hidden="true" />
          <strong>자기소개서 · 한결소프트</strong>
          <span className="lz-wf-meta">v3</span>
        </div>
        <div className="lz-wf-row">
          <Layers size={15} strokeWidth={2.1} aria-hidden="true" />
          v2 · 프로젝트 성과 추가
          <span className="lz-wf-meta">3일 전</span>
        </div>
        <div className="lz-wf-row">
          <Quote size={15} strokeWidth={2.1} aria-hidden="true" />
          문항 2 답변 다듬음
          <span className="lz-chip">버전 메모</span>
        </div>
      </div>
    ),
  },
  {
    stage: '기록하기',
    title: '지원을 보드에 올립니다',
    text: '지원하는 순간의 공고와 문서를 스냅샷으로 접어 둡니다. 이후 단계는 보드에서 옮기기만 하면 됩니다.',
    visual: (
      <div className="lz-wf-list">
        <div className="lz-wf-row">
          <FolderOpen size={15} strokeWidth={2.1} aria-hidden="true" />
          지원 시점 스냅샷 · 공고 원문 + 문서 2건
          <span className="lz-chip">고정</span>
        </div>
        <div className="lz-wf-row">
          <Kanban size={15} strokeWidth={2.1} aria-hidden="true" />
          서류 준비 → 지원 완료
          <span className="lz-wf-meta">한 번의 이동</span>
        </div>
      </div>
    ),
  },
  {
    stage: '준비하기',
    title: '면접을 근거로 준비합니다',
    text: '내 문서에서 근거를 찾아 질문을 만들고, 답변을 적어 두고, 다시 볼 질문을 표시합니다. 회사별 메모도 같은 자리에 쌓입니다.',
    visual: (
      <div className="lz-wf-list">
        <div className="lz-wf-row">
          <Mic size={15} strokeWidth={2.1} aria-hidden="true" />
          디자이너와 의견이 갈렸을 때…
          <span className="lz-chip lz-chip-quiet">협업</span>
        </div>
        <div className="lz-wf-row">
          <Quote size={15} strokeWidth={2.1} aria-hidden="true" />
          근거 · 자기소개서 v3, 2번 문항
        </div>
        <div className="lz-wf-row">
          <ListChecks size={15} strokeWidth={2.1} aria-hidden="true" />
          다시 볼 질문으로 표시
          <span className="lz-wf-meta">2개</span>
        </div>
      </div>
    ),
  },
];

function FlowStory() {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(0);

  const { scrollYProgress } = useScroll({
    target: stepsRef,
    offset: ['start 62%', 'end 68%'],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 80, damping: 24, restDelta: 0.001 });

  useEffect(() => {
    const root = stepsRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-flow-step]'));
    if (nodes.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const value = Number((entry.target as HTMLElement).dataset.flowStep);
            if (!Number.isNaN(value)) setActive(value);
          }
        });
      },
      { rootMargin: '-42% 0px -42% 0px', threshold: 0 },
    );
    nodes.forEach((node) => io.observe(node));
    return () => io.disconnect();
  }, []);

  const focusStep = useCallback((index: number) => {
    setActive(index);
    const node = stepsRef.current?.querySelector<HTMLElement>(`[data-flow-step="${index}"]`);
    node?.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'center' });
  }, []);

  return (
    <section id="flow" className="lz-section lz-flow" aria-labelledby="lz-flow-title">
      <div className="lz-shell">
        <Reveal className="lz-feat-head">
          <h2 id="lz-flow-title" className="lz-h2">
            지원 한 건이 지나가는 길
          </h2>
          <p className="lz-body">
            네 단계가 서로 다른 화면이 아니라 하나의 기록으로 이어집니다. 오른쪽 단계를 누르면 그
            위치로 이동합니다.
          </p>
        </Reveal>

        <div className="lz-flow-grid" ref={sectionRef}>
          <div className="lz-flow-sticky">
            <div className="lz-flow-panel" aria-live="polite">
              <div className="lz-flow-panel-top">
                <span className="lz-flow-index lz-num" aria-hidden="true">
                  {String(active + 1).padStart(2, '0')}
                </span>
                <span className="lz-flow-stage">{FLOW[active].stage}</span>
              </div>
              <h3 className="lz-flow-title">{FLOW[active].title}</h3>
              <p className="lz-flow-text">{FLOW[active].text}</p>
              <div className="lz-flow-visual">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={active}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
                    transition={{ duration: reduce ? 0.12 : 0.32, ease: EASE }}
                  >
                    {FLOW[active].visual}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div>
            <ol className="lz-flow-steps" ref={stepsRef}>
              {FLOW.map((step, index) => (
                <li key={step.title} data-flow-step={index}>
                  <button
                    type="button"
                    className="lz-flow-step"
                    data-active={index === active}
                    aria-current={index === active ? 'step' : undefined}
                    onClick={() => focusStep(index)}
                  >
                    <span className="lz-flow-step-n">STEP {index + 1}</span>
                    <span>
                      <span className="lz-flow-step-t">{step.title}</span>
                      <span className="lz-flow-step-d" style={{ display: 'block' }}>
                        {step.text}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>

            <div className="lz-flow-track" aria-hidden="true">
              <motion.span
                className="lz-flow-track-fill"
                style={{ scaleX: reduce ? (active + 1) / FLOW.length : progress }}
              />
            </div>
            <p className="lz-body" style={{ marginTop: 16, fontSize: '.82rem' }}>
              <Keyboard size={13} strokeWidth={2.2} aria-hidden="true" /> 직접 추가한 공고와 예시 공고는
              목록에서 구분해서 표시됩니다.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- preview: jobs */

function JobsPreview() {
  const [query, setQuery] = useState('');
  const [facets, setFacets] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>(['ex-2']);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const active = FACETS.filter((facet) => facets.includes(facet.key));
    return DEMO_JOBS.filter((job) => {
      const haystack = [job.company, job.title, job.location, job.employment, ...job.tags]
        .join(' ')
        .toLowerCase();
      const matchesQuery = needle.length === 0 || haystack.includes(needle);
      const matchesFacet = active.length === 0 || active.some((facet) => facet.test(job));
      return matchesQuery && matchesFacet;
    });
  }, [query, facets]);

  const toggleFacet = (key: string) =>
    setFacets((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));

  const toggleSaved = (id: string) =>
    setSaved((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));

  return (
    <div>
      <label className="lz-field">
        <Search size={17} strokeWidth={2.1} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="직무, 회사, 기술로 검색"
          aria-label="예시 공고 검색"
        />
        {query.length > 0 && (
          <button
            type="button"
            className="lz-iconbtn"
            style={{ width: 28, height: 28 }}
            onClick={() => setQuery('')}
            aria-label="검색어 지우기"
          >
            <X size={14} strokeWidth={2.4} aria-hidden="true" />
          </button>
        )}
      </label>

      <div className="lz-filter-row" role="group" aria-label="조건 필터">
        {FACETS.map((facet) => (
          <button
            key={facet.key}
            type="button"
            className="lz-filter"
            aria-pressed={facets.includes(facet.key)}
            onClick={() => toggleFacet(facet.key)}
          >
            {facets.includes(facet.key) && <Check size={13} strokeWidth={2.6} aria-hidden="true" />}
            {facet.label}
          </button>
        ))}
        {facets.length > 0 && (
          <button type="button" className="lz-filter" onClick={() => setFacets([])}>
            조건 초기화
          </button>
        )}
      </div>

      <p className="lz-preview-note">
        <TriangleAlert size={14} strokeWidth={2.1} aria-hidden="true" />
        예시 데이터 {visible.length}건 · 저장 {saved.length}건. 모두 가상의 회사와 공고이며 실제 채용
        정보가 아닙니다.
      </p>

      <div className="lz-results">
        {visible.length === 0 ? (
          <div className="lz-empty">
            <Search size={20} strokeWidth={1.9} aria-hidden="true" />
            <strong>조건에 맞는 예시 공고가 없습니다</strong>
            <span>검색어를 줄이거나 필터를 초기화해 보세요.</span>
            <button type="button" className="lz-btn lz-btn-ghost lz-btn-sm" onClick={() => { setQuery(''); setFacets([]); }}>
              조건 초기화
            </button>
          </div>
        ) : (
          visible.map((job) => {
            const isSaved = saved.includes(job.id);
            return (
              <div key={job.id} className="lz-result" data-saved={isSaved}>
                <span className="lz-result-top">
                  <span className="lz-result-company">{job.company}</span>
                  <span className="lz-chip lz-chip-example">예시</span>
                  <span className="lz-chip lz-chip-quiet">{job.employment}</span>
                </span>
                <span className="lz-result-title">{job.title}</span>
                <span className="lz-result-meta">
                  <span>
                    <MapPin size={12} strokeWidth={2.2} aria-hidden="true" /> {job.location}
                  </span>
                  <span>{job.experience}</span>
                  <span>
                    <Calendar size={12} strokeWidth={2.2} aria-hidden="true" /> {job.deadline}
                  </span>
                  <span>{job.tags.join(' · ')}</span>
                </span>
                <span className="lz-result-side">
                  <button
                    type="button"
                    className="lz-iconbtn"
                    aria-pressed={isSaved}
                    aria-label={`${job.title} ${isSaved ? '저장 취소' : '저장'}`}
                    onClick={() => toggleSaved(job.id)}
                  >
                    {isSaved ? (
                      <BookmarkCheck size={17} strokeWidth={2.1} aria-hidden="true" />
                    ) : (
                      <Bookmark size={17} strokeWidth={2.1} aria-hidden="true" />
                    )}
                  </button>
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------ preview: documents */

function DocsPreview() {
  const [docId, setDocId] = useState(DEMO_DOCS[0].id);
  const [version, setVersion] = useState(DEMO_DOCS[0].version);
  const doc = DEMO_DOCS.find((item) => item.id === docId) ?? DEMO_DOCS[0];

  const selectDoc = (next: DemoDoc) => {
    setDocId(next.id);
    setVersion(next.version);
  };

  return (
    <div className="lz-doc-grid">
      <div className="lz-doc-list">
        {DEMO_DOCS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="lz-doc-item"
            aria-pressed={item.id === docId}
            onClick={() => selectDoc(item)}
          >
            <FileText size={17} strokeWidth={2.1} aria-hidden="true" />
            <span>
              <span className="lz-doc-title">{item.title}</span>
              <br />
              <span className="lz-doc-sub">
                {item.kind} · v{item.version} · {item.updated}
              </span>
            </span>
          </button>
        ))}
        <button type="button" className="lz-doc-item" style={{ borderStyle: 'dashed' }} disabled aria-disabled="true">
          <Upload size={17} strokeWidth={2.1} aria-hidden="true" />
          <span>
            <span className="lz-doc-title">문서 올리기</span>
            <br />
            <span className="lz-doc-sub">작업 공간에서 실제로 사용할 수 있습니다</span>
          </span>
        </button>
      </div>

      <div className="lz-doc-reader">
        <div className="lz-doc-reader-head">
          <FileText size={17} strokeWidth={2.1} aria-hidden="true" />
          <span className="lz-doc-title">{doc.title}</span>
          <span className="lz-chip lz-chip-example" style={{ marginInlineStart: 'auto' }}>
            예시
          </span>
        </div>
        <div className="lz-filter-row" role="group" aria-label="버전 선택">
          {doc.versions.map((item) => (
            <button
              key={item.version}
              type="button"
              className="lz-filter"
              aria-pressed={item.version === version}
              onClick={() => setVersion(item.version)}
            >
              v{item.version}
            </button>
          ))}
        </div>
        <p className="lz-doc-text">{doc.body}</p>
        <p className="lz-preview-note">
          <Info size={14} strokeWidth={2.1} aria-hidden="true" />
          {doc.versions.find((item) => item.version === version)?.note} · 버전을 바꿔도 이전 내용은
          지워지지 않습니다.
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- preview: board */

function BoardPreview() {
  const [cards, setCards] = useState<BoardCard[]>(INITIAL_BOARD);
  const [moved, setMoved] = useState<string | null>(null);

  const move = (id: string, direction: 1 | -1) => {
    setCards((prev) =>
      prev.map((card) => {
        if (card.id !== id) return card;
        const index = BOARD_COLUMNS.findIndex((column) => column.id === card.stage);
        const next = Math.min(BOARD_COLUMNS.length - 1, Math.max(0, index + direction));
        return { ...card, stage: BOARD_COLUMNS[next].id };
      }),
    );
    setMoved(id);
  };

  return (
    <div>
      <p className="lz-preview-note" style={{ marginTop: 0, marginBottom: 4 }}>
        <Kanban size={14} strokeWidth={2.1} aria-hidden="true" />
        단계를 옮겨 보세요. 실제 작업 공간에서는 이 이동이 그대로 저장됩니다.
      </p>
      <div className="lz-board">
        {BOARD_COLUMNS.map((column) => {
          const items = cards.filter((card) => card.stage === column.id);
          return (
            <div className="lz-col" key={column.id}>
              <div className="lz-col-head">
                <span className="lz-col-name">{column.name}</span>
                <span className="lz-col-count lz-num" aria-label={`${items.length}건`}>
                  {items.length}
                </span>
              </div>
              {items.length === 0 && (
                <p className="lz-doc-sub" style={{ padding: '6px 2px' }}>
                  비어 있음
                </p>
              )}
              {items.map((card) => {
                const index = BOARD_COLUMNS.findIndex((item) => item.id === card.stage);
                return (
                  <div className="lz-card" key={card.id}>
                    <span className="lz-card-title">{card.title}</span>
                    <span className="lz-card-company">
                      {card.company} · {card.snapshot}
                    </span>
                    <span className="lz-card-moves">
                      <button
                        type="button"
                        className="lz-move"
                        onClick={() => move(card.id, -1)}
                        disabled={index === 0}
                        aria-label={`${card.title} 이전 단계로`}
                      >
                        <ArrowLeft size={12} strokeWidth={2.6} aria-hidden="true" /> 이전
                      </button>
                      <button
                        type="button"
                        className="lz-move"
                        onClick={() => move(card.id, 1)}
                        disabled={index === BOARD_COLUMNS.length - 1}
                        aria-label={`${card.title} 다음 단계로`}
                      >
                        다음 <ArrowRight size={12} strokeWidth={2.6} aria-hidden="true" />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="lz-preview-note" role="status">
        <CircleCheck size={14} strokeWidth={2.1} aria-hidden="true" />
        {moved ? '단계를 옮겼습니다. 지원 시점 스냅샷은 그대로 유지됩니다.' : '아직 옮긴 카드가 없습니다.'}
      </p>
    </div>
  );
}

/* ------------------------------------------------------ preview: interview */

function InterviewPreview() {
  const [open, setOpen] = useState<string | null>(DEMO_QUESTIONS[0].id);

  return (
    <div className="lz-q-list">
      {DEMO_QUESTIONS.map((item) => {
        const isOpen = open === item.id;
        return (
          <div className="lz-q" key={item.id} data-open={isOpen}>
            <button
              type="button"
              className="lz-q-btn"
              aria-expanded={isOpen}
              aria-controls={`lz-q-panel-${item.id}`}
              onClick={() => setOpen(isOpen ? null : item.id)}
            >
              <span className="lz-q-topic">{item.topic}</span>
              <span className="lz-q-text">{item.question}</span>
              <ChevronDown className="lz-q-chev" size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={`lz-q-panel-${item.id}`}
                  className="lz-q-panel"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: EASE }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="lz-evidence">
                    <span className="lz-evidence-label">
                      <Quote size={12} strokeWidth={2.4} aria-hidden="true" /> 근거 문장
                    </span>
                    <span className="lz-evidence-text">{item.evidence}</span>
                    <span className="lz-doc-sub">{item.source}</span>
                  </div>
                  <p className="lz-hint">
                    <Sparkles size={14} strokeWidth={2.1} aria-hidden="true" />
                    {item.hint}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
      <p className="lz-preview-note">
        <Info size={14} strokeWidth={2.1} aria-hidden="true" />
        질문은 내가 저장한 문서의 문장에서만 만들어집니다. 외부 생성 모델을 호출하지 않습니다.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- preview tabs */

const TABS = [
  { id: 'jobs', label: '채용 탐색', icon: Search, panel: JobsPreview },
  { id: 'docs', label: '서류 보관함', icon: FileText, panel: DocsPreview },
  { id: 'board', label: '지원 보드', icon: Kanban, panel: BoardPreview },
  { id: 'interview', label: '면접 연습', icon: Mic, panel: InterviewPreview },
];

function Preview() {
  const [tab, setTab] = useState(TABS[0].id);
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((item) => item.id === tab);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault();
    const target = TABS[next];
    setTab(target.id);
    listRef.current?.querySelector<HTMLButtonElement>(`#lz-tab-${target.id}`)?.focus();
  };

  const ActivePanel = TABS.find((item) => item.id === tab)?.panel ?? JobsPreview;

  return (
    <section id="preview" className="lz-section" aria-labelledby="lz-preview-title">
      <div className="lz-shell">
        <Reveal className="lz-feat-head">
          <h2 id="lz-preview-title" className="lz-h2">
            작업 공간을 미리 만져 보세요
          </h2>
          <p className="lz-body">
            아래 화면은 이 페이지 안에서 실제로 동작하는 축소판입니다. 검색하고, 저장하고, 단계를
            옮겨 보세요. 값은 예시이며 이 페이지를 떠나면 초기화됩니다.
          </p>
        </Reveal>

        <Reveal>
          <div className="lz-tabs" role="tablist" aria-label="미리보기 종류" ref={listRef} onKeyDown={onKeyDown}>
            {TABS.map((item) => {
              const Icon = item.icon;
              const selected = item.id === tab;
              return (
                <button
                  key={item.id}
                  id={`lz-tab-${item.id}`}
                  type="button"
                  role="tab"
                  className="lz-tab"
                  aria-selected={selected}
                  aria-controls={`lz-panel-${item.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setTab(item.id)}
                >
                  <Icon size={15} strokeWidth={2.2} aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div
            className="lz-preview"
            role="tabpanel"
            id={`lz-panel-${tab}`}
            aria-labelledby={`lz-tab-${tab}`}
            tabIndex={0}
          >
            <div className="lz-preview-bar">
              <span className="lz-preview-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="lz-preview-title">
                자리집 · {TABS.find((item) => item.id === tab)?.label}
              </span>
              <span className="lz-preview-badge">
                <Lock size={12} strokeWidth={2.6} aria-hidden="true" /> 로컬 전용
              </span>
            </div>
            <div className="lz-preview-body">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.26, ease: EASE }}
                >
                  <ActivePanel />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------- limits + FAQ block */

const LIMITS = [
  {
    icon: WifiOff,
    title: '외부 채용 사이트와 연동하지 않습니다',
    body: '공고를 자동으로 가져오지 않습니다. 붙여넣기나 직접 입력으로 등록하고, 그렇게 넣은 공고는 “확인되지 않음”으로 표시됩니다.',
  },
  {
    icon: Sparkles,
    title: '문장을 대신 써 주지 않습니다',
    body: '면접 질문은 내 문서에서 근거를 찾아 조합할 뿐, 새로운 문장을 생성하지 않습니다. 자소서 초안은 내가 씁니다.',
  },
  {
    icon: HardDrive,
    title: '동기화 서버가 없습니다',
    body: '기기를 바꾸면 JSON 백업으로 옮겨야 합니다. 브라우저 데이터를 지우면 기록도 함께 사라집니다.',
  },
  {
    icon: ShieldCheck,
    title: '확인되지 않은 정보를 확인됐다고 하지 않습니다',
    body: '예시 공고에는 검증 표시를 붙이지 않습니다. 마감일과 조건은 실제로 지원하기 전에 원문에서 다시 확인해야 합니다.',
  },
];

function LimitsAndFaq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="limits" className="lz-section" aria-labelledby="lz-limits-title">
      <div className="lz-shell">
        <div className="lz-two-col">
          <Reveal>
            <h2 id="lz-limits-title" className="lz-h2">
              하지 않는 일을 먼저 적어 둡니다
            </h2>
            <p className="lz-body" style={{ marginTop: 16 }}>
              기대와 실제가 어긋나면 도구를 믿을 수 없게 됩니다. 그래서 이 제품이 못 하는 일을 먼저
              밝힙니다.
            </p>
            <ul className="lz-limits" style={{ marginTop: 26 }}>
              {LIMITS.map((limit) => {
                const Icon = limit.icon;
                return (
                  <li className="lz-limit" key={limit.title}>
                    <Icon size={17} strokeWidth={2.1} aria-hidden="true" />
                    <span>
                      <span className="lz-limit-t">{limit.title}</span>
                      <span className="lz-limit-d" style={{ display: 'block' }}>
                        {limit.body}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Reveal>

          <Reveal delay={0.08}>
            <div id="faq" style={{ scrollMarginTop: 96 }}>
              <h2 className="lz-h2" style={{ marginBottom: 22 }}>
                자주 묻는 질문
              </h2>
              <div className="lz-faq">
                {FAQ_ITEMS.map((item, index) => {
                  const isOpen = open === index;
                  return (
                    <div className="lz-faq-item" key={item.q}>
                      <button
                        type="button"
                        className="lz-faq-btn"
                        aria-expanded={isOpen}
                        aria-controls={`lz-faq-${index}`}
                        onClick={() => setOpen(isOpen ? null : index)}
                      >
                        {item.q}
                        <span className="lz-faq-sign" aria-hidden="true" />
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            id={`lz-faq-${index}`}
                            className="lz-faq-answer"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.28, ease: EASE }}
                            style={{ overflow: 'hidden' }}
                          >
                            {item.a}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ CTA + footer */

function FinalCta({ onTop }: { onTop: () => void }) {
  return (
    <section id="start" className="lz-section" aria-labelledby="lz-cta-title">
      <div className="lz-shell">
        <Reveal className="lz-cta">
          <div className="lz-cta-grid">
            <div>
              <h2 id="lz-cta-title">
                오늘 본 공고부터
                <br />
                접어 넣어 두세요
              </h2>
              <p>
                설치도, 가입도 필요 없습니다. 브라우저에서 바로 시작하고, 필요해지면 파일로
                내려받아 보관하세요.
              </p>
              <div className="lz-cta-actions">
                <Link className="lz-btn lz-btn-primary" to="/app">
                  작업 공간 열기
                  <ArrowUpRight size={17} strokeWidth={2.2} aria-hidden="true" />
                </Link>
                <Link className="lz-btn lz-btn-ghost" to="/app/jobs">
                  채용 공고 살펴보기
                </Link>
              </div>
            </div>
            <div className="lz-cta-figure">
              <Mascot />
            </div>
          </div>
        </Reveal>
      </div>

      <footer className="lz-footer">
        <div className="lz-shell">
          <div className="lz-footer-grid">
            <div className="lz-footer-brand">
              <Link className="lz-brand" to="/" aria-label="자리집 홈">
                <Mascot compact />
                <span className="lz-brand-name">
                  <span className="lz-brand-ko">자리집</span>
                  <span className="lz-brand-en">JariZip</span>
                </span>
              </Link>
              <p className="lz-body" style={{ fontSize: '.84rem' }}>
                구직 준비를 한 자리에 모으는 로컬 우선 작업 공간. 자료는 내 브라우저를 떠나지
                않습니다.
              </p>
            </div>

            <div>
              <p className="lz-footer-col-title">작업 공간</p>
              <ul className="lz-footer-links">
                <li>
                  <Link className="lz-footer-link" to="/app">
                    대시보드
                  </Link>
                </li>
                <li>
                  <Link className="lz-footer-link" to="/app/jobs">
                    채용 공고
                  </Link>
                </li>
                <li>
                  <Link className="lz-footer-link" to="/app">
                    서류 보관함
                  </Link>
                </li>
                <li>
                  <Link className="lz-footer-link" to="/app">
                    지원 보드
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="lz-footer-col-title">이 페이지</p>
              <ul className="lz-footer-links">
                <li>
                  <a className="lz-footer-link" href="#flow">
                    이용 흐름
                  </a>
                </li>
                <li>
                  <a className="lz-footer-link" href="#limits">
                    한계와 원칙
                  </a>
                </li>
                <li>
                  <a className="lz-footer-link" href="#faq">
                    자주 묻는 질문
                  </a>
                </li>
                <li>
                  <button type="button" className="lz-footer-link" onClick={onTop}>
                    맨 위로
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div className="lz-footer-bottom">
            <span>자리집 · JariZip</span>
            <span>
              <CornerDownLeft size={12} strokeWidth={2.2} aria-hidden="true" /> 모든 예시 데이터는 가상이며
              실제 채용 정보가 아닙니다
            </span>
            <button type="button" className="lz-footer-link lz-spacer" onClick={onTop}>
              맨 위로
            </button>
          </div>
        </div>
      </footer>
    </section>
  );
}

/* -------------------------------------------------------------- side rail */

function SideRail({ active }: { active: string }) {
  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: prefersReduced() ? 'auto' : 'smooth',
      block: 'start',
    });
  };
  return (
    <nav className="lz-rail" aria-label="섹션 이동">
      <span className="lz-rail-label">자리집</span>
      <span className="lz-rail-line" aria-hidden="true" />
      <div className="lz-rail-dots">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="lz-rail-dot"
            aria-current={active === item.id}
            aria-label={`${item.label} 섹션으로 이동`}
            onClick={() => go(item.id)}
          >
            <span className="lz-rail-tip" aria-hidden="true">
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}

/* --------------------------------------------------------------------- page */

export default function Landing() {
  const active = useActiveSection(NAV_ITEMS.map((item) => item.id));

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' });
  }, []);

  const toTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: prefersReduced() ? 'auto' : 'smooth' });
  }, []);

  return (
    <div className="lz-landing" lang="ko">
      <a className="lz-skip" href="#lz-main">
        본문으로 건너뛰기
      </a>
      <Nav onNavigate={scrollTo} />
      <SideRail active={active} />
      <main id="lz-main">
        <Hero />
        <Facts />
        <Features />
        <FlowStory />
        <Preview />
        <LimitsAndFaq />
        <FinalCta onTop={toTop} />
      </main>
    </div>
  );
}
