import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from 'motion/react';
import { ArrowDown, ArrowRight, ArrowUpRight, ChevronDown, HardDrive, Lock, Menu, Pause, Play, X } from 'lucide-react';
import JippiArt from '../components/JippiArt';
import '../styles/landing.css';

const NAV = [{ id: 'flow', label: '이용 흐름' }, { id: 'boundary', label: '개인정보' }, { id: 'faq', label: '자주 묻는 질문' }];
const GREETINGS = ['자료는 이 브라우저에 보관해요. 서버로 보내지 않아요.', '서류를 고쳐도 제출한 버전은 그대로 남아요.', '마음에 드는 공고를 찾았다면, 원문과 함께 보관해두세요.'];
const SPACES = [
  { to: '/app/discover', label: '채용 탐색' }, { to: '/app/documents', label: '서류 보관함' },
  { to: '/app/applications', label: '지원 현황' }, { to: '/app/interview', label: '면접 연습' },
];
const FLOW = [
  { title: '발견하고', name: '공고 찾기', body: '원티드·점핏·직행의 실제 공고를 한곳에서. 지역과 직무로 좁히고, 마감일을 살펴보세요.', to: '/app/discover', cta: '채용 탐색 열기', word: 'FIND', pose: 'wave' as const },
  { title: '모아두고', name: '서류 준비', body: '이력서와 자기소개서를 한곳에. 고칠 때마다 새 버전으로 남겨 이전 문서를 잃지 않아요.', to: '/app/documents', cta: '서류 보관함 열기', word: 'KEEP', pose: 'document' as const },
  { title: '기억하고', name: '지원 기록', body: '어디에, 어떤 서류를 냈는지. 제출한 버전과 그때의 공고 원문을 함께 기억해요.', to: '/app/applications', cta: '지원 현황 열기', word: 'TRACK', pose: 'document' as const },
  { title: '준비하고', name: '면접 연습', body: '제출한 내 문장에서 시작하는 질문. 답변을 적고 녹음하며 내 이야기를 다듬어요.', to: '/app/interview', cta: '면접 연습 열기', word: 'READY', pose: 'wave' as const },
];
const FAQ = [
  { q: '공고는 어디에서 가져오나요?', a: '원티드·점핏·직행의 공개 목록과 상세 응답을 읽습니다. 사람인은 서버에 API 키를 설정하면 추가돼요. 출처별 검색 범위와 지원하는 필터는 다릅니다. 접수 여부와 정확한 마감 시각은 지원 전에 원문에서 확인해주세요.' },
  { q: '이력서와 면접 답변은 어디에 저장되나요?', a: '파일, 지원 기록, 메모와 녹음은 지금 사용하는 브라우저에만 저장돼요. 공고 검색에 필요한 검색어와 필터만 외부로 보냅니다. 브라우저 자료를 지우기 전에는 설정에서 백업해주세요.' },
  { q: '다른 기기로 옮길 수 있나요?', a: '설정에서 JSON 백업을 내보내고 다른 기기에서 가져오면 됩니다. 로그인이나 자동 동기화는 없어요. 백업 파일에는 원본 문서와 녹음도 포함되므로 안전하게 보관해주세요.' },
  { q: '자기소개서나 면접 답변을 대신 만들어주나요?', a: '아니요. 현재는 제출한 문장을 근거로 규칙 기반 질문을 구성하고, 직접 적은 답변과 녹음을 보관하는 도구예요. AI 평가나 합격 확률, 기업으로의 자동 지원은 제공하지 않습니다.' },
];
const prefersReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' });

function Brand() {
  return <Link className="lz-brand" to="/" aria-label="자리집 홈"><img src={`${import.meta.env.BASE_URL}favicon.svg`} width={32} height={32} alt=""/><strong>자리집<span>JariZip</span></strong><span className="lz-brand-dot" aria-hidden="true"/></Link>;
}
function Nav() {
  const [open, setOpen] = useState(false);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, []);
  const links = NAV.map(item => <button type="button" key={item.id} onClick={() => { setOpen(false); jumpTo(item.id); }}>{item.label}</button>);
  return <header className="lz-nav"><div className="lz-shell lz-nav-inner"><Brand/><nav className="lz-nav-links" aria-label="페이지 안 이동">{links}</nav><div className="lz-nav-actions"><Link className="lz-btn lz-nav-cta" to="/app">내 공간 열기<ArrowUpRight size={16}/></Link><button type="button" className="lz-burger" aria-label={open ? '메뉴 닫기' : '메뉴 열기'} aria-controls="lz-nav-panel" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? <X/> : <Menu/>}</button></div></div>{open && <nav id="lz-nav-panel" className="lz-nav-panel" aria-label="모바일 페이지 안 이동">{links}</nav>}</header>;
}
function Hero() {
  const systemReduce = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [greet, setGreet] = useState<number | null>(null);
  const scene = useRef<HTMLDivElement>(null);
  const reduce = Boolean(systemReduce || paused);
  useEffect(() => { if (greet === null) return; const timer = window.setTimeout(() => setGreet(null), 6000); return () => window.clearTimeout(timer); }, [greet]);
  useEffect(() => { if (reduce) { scene.current?.style.setProperty('--aim-x', '0deg'); scene.current?.style.setProperty('--aim-y', '0deg'); } }, [reduce]);
  const follow = (event: PointerEvent<HTMLDivElement>) => {
    if (reduce || event.pointerType === 'touch') return;
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--aim-x', `${((event.clientX - box.left) / box.width - .5) * 12}deg`);
    event.currentTarget.style.setProperty('--aim-y', `${((event.clientY - box.top) / box.height - .5) * -10}deg`);
  };
  return <section className={`lz-hero${reduce ? ' lz-is-still' : ''}`} aria-labelledby="lz-hero-title">
    <div className="lz-hero-topline"><span>YOUR NEXT CHAPTER</span><span>공고부터 면접까지, 한곳에.</span></div>
    <div className="lz-hero-grid">
      <div className="lz-hero-copy"><p className="lz-hero-kicker"><span aria-hidden="true"/>새로운 시작을 모으는 곳</p><h1 id="lz-hero-title">내 다음 자리,<br/><span>여기서 시작.</span></h1><p className="lz-hero-lede">찾고, 모으고, 준비하는 일.<br/>복잡했던 취업 준비를 하나의 흐름으로.</p><div className="lz-hero-actions"><Link className="lz-btn lz-btn-primary" to="/app/discover">채용 탐색 열기<ArrowUpRight size={21}/></Link><Link className="lz-hero-secondary" to="/app">내 공간 열기<ArrowRight size={18}/></Link></div><p className="lz-hero-note"><Lock size={14}/>가입 없이 시작 · <span>파일은 내 브라우저에</span></p></div>
      <div ref={scene} className="lz-hero-visual" onPointerMove={follow} onPointerLeave={() => { scene.current?.style.setProperty('--aim-x', '0deg'); scene.current?.style.setProperty('--aim-y', '0deg'); }}>
        <span className="lz-stage-word" aria-hidden="true">Next.</span><div className="lz-orbit lz-orbit-one" aria-hidden="true"/><div className="lz-orbit lz-orbit-two" aria-hidden="true"/><div className="lz-orbit lz-orbit-three" aria-hidden="true"/>
        <span className="lz-stage-tag lz-stage-tag-one" aria-hidden="true">나의 다음 자리 ↗</span><span className="lz-stage-tag lz-stage-tag-two" aria-hidden="true">차곡차곡, 지피와 함께.</span>
        <div className="lz-jippi-stand"><button type="button" className="lz-jippi-btn" aria-label="마스코트 지피와 인사하기" onClick={() => setGreet(value => value === null ? 0 : (value + 1) % GREETINGS.length)}><span className={reduce ? 'lz-jippi' : 'lz-jippi lz-mascot-breathe'}><JippiArt pose="wave" alt="지퍼 파우치 마스코트 지피가 인사하는 모습" priority/></span></button>{greet !== null && <span className="lz-mascot-bubble" role="status">{GREETINGS[greet]}</span>}</div>
        <div className="lz-mascot-controls"><span className="lz-tap-hint">지피를 눌러보세요</span>{systemReduce && <span className="lz-motion-note">기기의 움직임 최소화 설정 적용 중</span>}{!systemReduce && <button type="button" className="lz-motion-toggle" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={13}/> : <Pause size={13}/>}<span>{paused ? '캐릭터 움직임 켜기' : '캐릭터 움직임 멈추기'}</span></button>}</div>
      </div>
    </div>
    <div className="lz-hero-bottom"><span>FIND. KEEP. MOVE FORWARD.</span><button type="button" onClick={() => jumpTo('flow')}>어떻게 쓰나요?<ArrowDown size={18}/></button></div>
  </section>;
}
function Spaces() {
  return <nav className="lz-spaces" aria-label="제품 화면 바로 가기">{SPACES.map((space, index) => <Link to={space.to} key={space.to}><span>0{index + 1}</span><strong>{space.label}</strong><ArrowUpRight size={18}/></Link>)}</nav>;
}
function Flow() {
  const [active, setActive] = useState(0);
  const current = FLOW[active];
  return <section id="flow" className="lz-section lz-flow" aria-labelledby="lz-flow-title"><div className="lz-shell lz-flow-grid"><div className="lz-flow-intro"><p className="lz-overline">하나로 이어지는 준비</p><h2 id="lz-flow-title">흩어진 준비를<br/>하나의 <em>이야기로.</em></h2><div className="lz-flow-art" data-step={active}><span className="lz-flow-word" aria-hidden="true">{current.word}</span><span className="lz-flow-character"><JippiArt pose={current.pose} alt=""/></span><span className="lz-flow-caption">0{active + 1} / {current.name}</span></div></div><ol className="lz-steps">{FLOW.map((step, index) => <li key={step.name} className={`lz-step${index === active ? ' is-active' : ''}`} onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)}><div className="lz-step-heading"><span className="lz-step-n">0{index + 1}</span><button type="button" aria-pressed={active === index} onClick={() => setActive(index)}>{step.title}<ArrowUpRight size={24}/></button></div><p>{step.body}</p><Link to={step.to}>{step.cta}<ArrowRight size={15}/></Link></li>)}</ol></div></section>;
}
function Boundary() {
  return <section id="boundary" className="lz-boundary-section"><div className="lz-shell lz-boundary-grid"><div><span className="lz-overline"><HardDrive size={16}/>내 자료는, 내 공간에.</span><h2>검색은 밖으로.<br/>내 이야기는 <em>여기에.</em></h2><p>이력서, 메모, 녹음과 지원 기록은<br/>지금 사용하는 브라우저에만 보관해요.</p><Link to="/app/settings">저장과 백업 살펴보기<ArrowUpRight size={18}/></Link></div><div className="lz-boundary-diagram"><div className="lz-data-row"><span>검색어 · 지역 · 직무</span><ArrowRight size={21}/><strong>채용 사이트</strong></div><div className="lz-private-box"><Lock size={24}/><strong>내 이력서. 내 목소리. 내 기록.</strong><span>외부 전송 없이, 이 브라우저에.</span><div className="lz-private-files" aria-hidden="true"><span>서류</span><span>메모</span><span>녹음</span></div></div><p>자동 동기화는 없어요. 설정에서 백업을 보관해주세요.</p></div></div></section>;
}
function Faq() {
  return <section id="limits" className="lz-section lz-faq-section"><div className="lz-shell lz-faq-grid"><div><p className="lz-overline">알고 시작하기</p><h2>가볍게 시작해도,<br/>기준은 <em>분명하게.</em></h2><p>제공되지 않은 정보는 만들지 않아요.<br/>공고는 실제 지원 전 원문을 확인해주세요.</p></div><div id="faq"><h2 className="lz-faq-title">자주 묻는 질문</h2>{FAQ.map((item, index) => <details className="lz-faq-item" key={item.q} open={index === 0 ? true : undefined}><summary>{item.q}<ChevronDown size={18}/></summary><p>{item.a}</p></details>)}</div></div></section>;
}
function Footer() {
  const pageLinks = [['이용 흐름', 'flow'], ['한계와 원칙', 'limits'], ['자주 묻는 질문', 'faq']] as const;
  return <footer className="lz-footer"><div className="lz-shell"><div className="lz-footer-cta"><h2>다음은,<br/><em>당신의 차례.</em></h2><Link to="/app/discover" className="lz-footer-go" aria-label="채용 탐색 시작하기"><ArrowUpRight size={56}/><span>시작하기</span></Link></div><div className="lz-footer-grid"><Brand/><div className="lz-footer-links">{SPACES.map(space => <Link key={space.to} to={space.to}>{space.label}</Link>)}</div><div className="lz-footer-links">{pageLinks.map(([label, id]) => <button type="button" key={id} onClick={() => jumpTo(id)}>{label}</button>)}<button type="button" onClick={() => window.scrollTo({ top: 0, behavior: prefersReduced() ? 'auto' : 'smooth' })}>맨 위로 ↑</button></div></div><div className="lz-footer-bottom"><span>JARIZIP · 나의 다음 자리가 모이는 곳</span><a href="https://github.com/Blue-B/JariZip" target="_blank" rel="noreferrer">GitHub<ArrowUpRight size={14}/></a></div></div></footer>;
}
export default function Landing() {
  return <div className="lz-landing" lang="ko"><a className="lz-skip" href="#lz-main" onClick={event => { event.preventDefault(); document.getElementById('lz-main')?.focus(); }}>본문으로 건너뛰기</a><Nav/><main id="lz-main" tabIndex={-1}><Hero/><Spaces/><Flow/><Boundary/><Faq/></main><Footer/></div>;
}
