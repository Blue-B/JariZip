import { useEffect, useRef, useState } from 'react';
import JippiArt from './JippiArt';

const tips = [
  '마감일순으로 정렬하면 불러온 공고 중 곧 마감되는 공고부터 볼 수 있어요.',
  '자동 더 보기를 켜면 페이지를 넘기지 않고 계속 볼 수 있어요.',
  '마음에 드는 공고는 원문과 함께 내 보관함에 남겨두세요.',
];

export default function JippiGuide() {
  const [tip, setTip] = useState<number | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => { setTip(null); trigger.current?.focus(); };
  useEffect(() => {
    if (tip === null) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setTip(null); trigger.current?.focus(); }
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setTip(null);
    };
    document.addEventListener('keydown', escape);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', escape);
      document.removeEventListener('pointerdown', outside);
    };
  }, [tip]);
  return <div ref={container} className="discover-companion">
    <button ref={trigger} type="button" className="discover-jippi" aria-label="탐색 도움말" aria-expanded={tip !== null} aria-controls="discover-jippi-tip" onClick={() => setTip(value => value === null ? 0 : (value + 1) % tips.length)}>
      <span className="discover-jippi-art"><JippiArt pose="document" alt=""/></span><span>탐색 도움말</span>
    </button>
    <div id="discover-jippi-tip" className="discover-tip" hidden={tip === null}>
      {tip !== null && <><p role="status">{tips[tip]}</p><button type="button" aria-label="탐색 팁 닫기" onClick={close}>×</button></>}
    </div>
  </div>;
}
