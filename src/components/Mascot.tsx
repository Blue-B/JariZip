/**
 * Mascot — "지피" (Jippi), the living zip-pouch folder.
 *
 * Original hand-authored vector character (no third-party assets, no fetches).
 * It is a tactile kraft folder / zip pouch, deliberately NOT a robot:
 * folder-tab ears, a cobalt zipper across the crown, a laminated label window
 * that carries the eyes, slim paper-strip arms and folded-corner feet.
 *
 * Behaviour
 * - Eyes track the pointer via motion values (never React state).
 * - Click / Enter / Space unzips the pouch, pops a paper tongue and answers.
 * - `compact` renders the simplified mark used in the navigation and footer.
 * - Everything collapses to static under prefers-reduced-motion.
 *
 * Self-contained: layout, colour and animation live in the component so it can
 * be dropped on any page without depending on landing.css.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';

export interface MascotProps {
  /** Placement / sizing hook owned by the caller. Overrides the default width. */
  className?: string;
  /** Simplified mark for nav, footer and small surfaces. */
  compact?: boolean;
  /** Disable the click reaction (eye tracking stays on) for decorative use. */
  interactive?: boolean;
}

/** Zipper teeth, laid along the pouch crown. */
const TEETH = Array.from({ length: 13 }, (_, i) => 43 + i * 12.4);

/** Max eye travel, in SVG user units. */
const EYE_MAX = 6.5;

/**
 * Honest, product-accurate lines only. No claims about verification, matching
 * or popularity — these describe what the local workspace actually does.
 */
const REACTIONS = [
  '자료는 이 브라우저에 보관해요. 서버로 보내지 않아요.',
  '서류를 고쳐도, 이전에 제출한 버전은 그대로 남아요.',
  '지원할 땐 그때의 공고를 그대로 접어서 보관해요.',
  '제출본과 공고를 근거로 면접 질문을 준비해요.',
  '백업은 JSON 파일 하나로 내보낼 수 있어요.',
];

const CSS = `
.lz-mascot{ position:relative; display:block; max-width:100%; line-height:0; }
.lz-mascot-hit{
  display:block; width:100%; padding:0; margin:0; border:0; background:none;
  cursor:pointer; -webkit-tap-highlight-color:transparent; border-radius:26px;
}
.lz-mascot-hit:focus-visible{ outline:2px solid var(--brand,#3158ef); outline-offset:4px; }
.lz-mascot-static{ cursor:default; }
.lz-mascot-svg{ display:block; width:100%; height:auto; overflow:visible; }
.lz-mascot-bubble{
  position:absolute; left:50%; bottom:calc(100% - 6px); transform:translateX(-50%);
  z-index:5; width:max-content; max-width:min(268px, 84vw);
  padding:9px 13px; border-radius:14px 14px 14px 4px;
  background:var(--paper,#f5f5f0); color:var(--ink,#17202a);
  border:1px solid var(--line,#e3e5e2); box-shadow:0 18px 34px -22px rgba(23,32,42,.55);
  font-family:var(--lz-font, 'Noto Sans KR Variable', 'Noto Sans KR', system-ui, sans-serif);
  font-size:13px; line-height:1.5; font-weight:500; letter-spacing:-.01em;
  word-break:keep-all; text-align:left; white-space:normal;
}
.lz-mascot-eyes{ transform-box:fill-box; transform-origin:center; animation:lz-mascot-blink 5.4s infinite; }
.lz-mascot-breathe{ animation:lz-mascot-breathe 4.8s ease-in-out infinite; transform-box:fill-box; transform-origin:center bottom; }
@keyframes lz-mascot-blink{ 0%,95.5%,100%{ transform:scaleY(1) } 97.6%{ transform:scaleY(.08) } }
@keyframes lz-mascot-breathe{ 0%,100%{ transform:translateY(0) } 50%{ transform:translateY(-2.5px) } }
@media (prefers-reduced-motion: reduce){
  .lz-mascot-eyes,.lz-mascot-breathe{ animation:none !important; }
}
`;

export default function Mascot({ className, compact = false, interactive = true }: MascotProps) {
  const instanceId = useId();
  const bodyId = `${instanceId}-body`;
  const clipId = `${instanceId}-clip`;
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLSpanElement>(null);
  const reactTimer = useRef<number | null>(null);
  const lineTimer = useRef<number | null>(null);

  const [reacting, setReacting] = useState(false);
  const [line, setLine] = useState<number | null>(null);

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const eyeX = useSpring(rawX, { stiffness: 150, damping: 18, mass: 0.5 });
  const eyeY = useSpring(rawY, { stiffness: 150, damping: 18, mass: 0.5 });

  const tracks = interactive && !compact && !reduce;

  useEffect(() => {
    if (!tracks) return;
    const onMove = (event: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.85);
      const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.85);
      rawX.set(Math.max(-1, Math.min(1, dx)) * EYE_MAX);
      rawY.set(Math.max(-1, Math.min(1, dy)) * EYE_MAX);
    };
    const rest = () => {
      rawX.set(0);
      rawY.set(0);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', rest);
    window.addEventListener('blur', rest);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', rest);
      window.removeEventListener('blur', rest);
    };
  }, [tracks, rawX, rawY]);

  useEffect(
    () => () => {
      if (reactTimer.current) window.clearTimeout(reactTimer.current);
      if (lineTimer.current) window.clearTimeout(lineTimer.current);
    },
    [],
  );

  const react = useCallback(() => {
    if (!interactive || compact) return;
    setReacting(true);
    setLine((prev) => (prev === null ? 0 : (prev + 1) % REACTIONS.length));
    if (reactTimer.current) window.clearTimeout(reactTimer.current);
    if (lineTimer.current) window.clearTimeout(lineTimer.current);
    reactTimer.current = window.setTimeout(() => setReacting(false), reduce ? 1400 : 950);
    lineTimer.current = window.setTimeout(() => setLine(null), 4200);
  }, [interactive, compact, reduce]);

  const zipOffset = reduce ? (reacting ? 26 : 0) : undefined;

  const svg = (
    <svg
      className="lz-mascot-svg"
      viewBox="0 0 240 240"
      role={interactive ? undefined : 'img'}
      aria-label={interactive ? undefined : '자리집 마스코트 지피'}
      aria-hidden={interactive ? true : undefined}
      focusable="false"
    >
      <defs>
        <linearGradient id={bodyId} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="#ecdfc2" />
          <stop offset="55%" stopColor="#e2d2af" />
          <stop offset="100%" stopColor="#d6c39a" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect x="36" y="70" width="168" height="126" rx="24" />
        </clipPath>
      </defs>

      {/* 1. ground contact */}
      {!compact && <ellipse cx="120" cy="213" rx="72" ry="9" fill="var(--ink,#17202a)" opacity="0.1" />}

      {/* 2. folder-tab ears (behind the pouch) */}
      <g fill="var(--ink,#17202a)" opacity="0.14">
        <rect x="44" y="44" width="62" height="38" rx="9" />
        <rect x="142" y="48" width="52" height="34" rx="9" />
      </g>
      <rect x="46" y="46" width="58" height="36" rx="8" fill="#ded0b0" stroke="var(--ink,#17202a)" strokeOpacity="0.2" strokeWidth="2" />
      <rect x="144" y="50" width="48" height="32" rx="8" fill="#ded0b0" stroke="var(--ink,#17202a)" strokeOpacity="0.2" strokeWidth="2" />
      <path d="M56 58h26" stroke="var(--ink,#17202a)" strokeOpacity="0.22" strokeWidth="2.5" strokeLinecap="round" />

      {/* 3. breathing wrapper */}
      <g className={reduce ? undefined : 'lz-mascot-breathe'}>
        {/* 4. reaction squash */}
        <motion.g
          style={{ transformBox: 'fill-box', transformOrigin: 'center bottom' }}
          animate={reduce ? undefined : { y: reacting ? 5 : 0, scaleY: reacting ? 0.968 : 1 }}
          transition={{ type: 'spring', stiffness: 340, damping: 17 }}
        >
          {/* paper-strip arms + folded feet */}
          {!compact && (
            <g fill="none" strokeLinecap="round">
              <path d="M37 133q-21 5-24 25" stroke="var(--ink,#17202a)" strokeOpacity="0.18" strokeWidth="16" />
              <path d="M37 133q-21 5-24 25" stroke="#ded0b0" strokeWidth="12" />
              <path d="M203 133q21 5 24 25" stroke="var(--ink,#17202a)" strokeOpacity="0.18" strokeWidth="16" />
              <path d="M203 133q21 5 24 25" stroke="#ded0b0" strokeWidth="12" />
            </g>
          )}

          {/* pouch body */}
          <rect
            x="36"
            y="70"
            width="168"
            height="126"
            rx="24"
            fill={`url(#${bodyId})`}
            stroke="var(--ink,#17202a)"
            strokeOpacity="0.26"
            strokeWidth="2.5"
          />

          {/* paper grain inside the pouch */}
          <g clipPath={`url(#${clipId})`} opacity="0.7">
            <path d="M36 112h168M36 156h168" stroke="var(--ink,#17202a)" strokeOpacity="0.07" strokeWidth="1" />
          </g>

          {/* unzipped gap + paper tongue */}
          <motion.rect
            x="48"
            y="71"
            width="144"
            height="15"
            rx="7"
            fill="var(--ink,#17202a)"
            style={{ transformBox: 'fill-box', transformOrigin: 'center top' }}
            animate={reacting ? { opacity: 1, scaleY: 1 } : { opacity: 0, scaleY: 0.25 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          />
          <motion.g
            style={{ transformBox: 'fill-box', transformOrigin: 'center bottom' }}
            animate={reacting ? { scaleY: 1, opacity: 1 } : { scaleY: 0.05, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: reacting ? 0.06 : 0 }}
          >
            <rect x="105" y="42" width="30" height="44" rx="11" fill="#fffdf7" stroke="var(--ink,#17202a)" strokeWidth="2.5" />
            <path d="M114 62h12M114 70h8" stroke="var(--ink,#17202a)" strokeOpacity="0.35" strokeWidth="2.5" strokeLinecap="round" />
          </motion.g>

          {/* zipper crown */}
          <rect x="36" y="70" width="168" height="13" rx="6.5" fill="var(--brand,#3158ef)" />
          <g fill="#fffdf7" opacity="0.55">
            {TEETH.map((x) => (
              <rect key={x} x={x} y="73" width="5" height="7" rx="2" />
            ))}
          </g>
          <motion.g animate={{ x: zipOffset ?? (reacting ? 26 : 0) }} transition={{ type: 'spring', stiffness: 260, damping: 19 }}>
            <rect x="176" y="67" width="19" height="19" rx="5" fill="#fffdf7" stroke="var(--ink,#17202a)" strokeWidth="2.5" />
            <path d="M185 86v10" stroke="var(--ink,#17202a)" strokeWidth="2.5" strokeLinecap="round" />
            <rect x="179" y="95" width="13" height="20" rx="6" fill="#c8f04a" stroke="var(--ink,#17202a)" strokeWidth="2.5" />
          </motion.g>

          {/* laminated label window */}
          <rect x="60" y="98" width="120" height="64" rx="19" fill="#fffdf7" stroke="var(--ink,#17202a)" strokeOpacity="0.12" strokeWidth="2" />

          {/* eyes: tracking group > blink group */}
          <motion.g style={{ x: eyeX, y: eyeY }}>
            <g className={reduce ? undefined : 'lz-mascot-eyes'}>
              <ellipse cx="98" cy="127" rx="7.6" ry="8.6" fill="var(--ink,#17202a)" />
              <ellipse cx="142" cy="127" rx="7.6" ry="8.6" fill="var(--ink,#17202a)" />
              {!reduce && (
                <>
                  <circle cx="100.6" cy="124" r="2.3" fill="#fffdf7" />
                  <circle cx="144.6" cy="124" r="2.3" fill="#fffdf7" />
                </>
              )}
            </g>
          </motion.g>

          {/* blush + smile */}
          <ellipse cx="74" cy="146" rx="9" ry="5.4" fill="#3158ef" opacity="0.16" />
          <ellipse cx="166" cy="146" rx="9" ry="5.4" fill="#3158ef" opacity="0.16" />
          <motion.path
            d="M112 145q8 8 16 0"
            fill="none"
            stroke="var(--ink,#17202a)"
            strokeWidth="3"
            strokeLinecap="round"
            animate={reduce ? undefined : { d: reacting ? 'M110 143q10 13 20 0' : 'M112 145q8 8 16 0' }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          />

          {/* lime highlighter sticker */}
          {!compact && (
            <g transform="rotate(-9 72 178)">
              <rect x="52" y="169" width="40" height="20" rx="8" fill="#c8f04a" stroke="var(--ink,#17202a)" strokeOpacity="0.18" strokeWidth="1.5" />
              <circle cx="62" cy="179" r="2.6" fill="var(--ink,#17202a)" opacity="0.55" />
              <path d="M70 179h14" stroke="var(--ink,#17202a)" strokeOpacity="0.45" strokeWidth="2.5" strokeLinecap="round" />
            </g>
          )}

          {/* folded-corner feet */}
          {!compact && (
            <g fill="#ded0b0" stroke="var(--ink,#17202a)" strokeOpacity="0.18" strokeWidth="1.5">
              <path d="M76 196h30l-8 10H76z" />
              <path d="M134 196h30v10h-22z" />
            </g>
          )}
        </motion.g>
      </g>
    </svg>
  );

  const sizing = className
    ? undefined
    : { width: compact ? 34 : 260, maxWidth: '100%' as const };

  return (
    <span ref={rootRef} className={`lz-mascot${className ? ` ${className}` : ''}`} style={sizing} lang="ko">
      <style>{CSS}</style>
      <AnimatePresence>
        {line !== null && (
          <motion.span
            className="lz-mascot-bubble"
            role="status"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.95 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 5, scale: 0.98 }}
            transition={{ duration: reduce ? 0.12 : 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            {REACTIONS[line]}
          </motion.span>
        )}
      </AnimatePresence>

      {interactive && !compact ? (
        <button
          type="button"
          className="lz-mascot-hit"
          onClick={react}
          aria-label="마스코트 지피와 인사하기"
        >
          {svg}
        </button>
      ) : (
        <span className="lz-mascot-hit lz-mascot-static" aria-label={compact ? '자리집' : undefined}>
          {svg}
        </span>
      )}
    </span>
  );
}
