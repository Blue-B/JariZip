import { useEffect, useState } from 'react';
import JippiArt from './JippiArt';

const tips = [
  '마감일순으로 정렬해서 곧 닫히는 공고부터 살펴보세요.',
  '자동 더 보기를 켜면 페이지를 넘기지 않고 계속 볼 수 있어요.',
  '마음에 드는 공고는 원문과 함께 내 보관함에 남겨두세요.',
];

export default function JippiGuide() {
  const [tip, setTip] = useState<number | null>(null);
  useEffect(() => {
    if (tip === null) return;
    const timer = window.setTimeout(() => setTip(null), 7000);
    return () => window.clearTimeout(timer);
  }, [tip]);
  return <div className="discover-companion">
    <button type="button" className="discover-jippi" aria-label="지피의 탐색 팁" aria-expanded={tip !== null} aria-controls="discover-jippi-tip" onClick={() => setTip(value => value === null ? 0 : (value + 1) % tips.length)}>
      <JippiArt pose="document" alt="서류를 든 지피"/><span className="discover-jippi-star" aria-hidden="true">✳</span>
    </button>
    {tip !== null && <div id="discover-jippi-tip" className="discover-tip"><p role="status">{tips[tip]}</p><button type="button" aria-label="탐색 팁 닫기" onClick={() => setTip(null)}>×</button></div>}
  </div>;
}
