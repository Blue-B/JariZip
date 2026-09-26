import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, LockKeyhole } from 'lucide-react';
import JippiArt from '../components/JippiArt';
import '../styles/landing.css';

const spaces = [
  { to: '/app/discover', title: '공고 찾기', body: '원문 사이트를 열어 확인한 공고 링크와 메모를 보관해요. 검색은 설정된 공식 출처가 있을 때 제공해요.' },
  { to: '/app/documents', title: '서류 보관하기', body: '이력서와 자기소개서를 보관하고, 수정한 내용은 새 버전으로 남겨요.' },
  { to: '/app/applications', title: '지원 기록 남기기', body: '지원 단계와 실제로 제출한 서류를 함께 기록해요. 지원서는 기업에 직접 제출해야 해요.' },
  { to: '/app/interview', title: '면접 준비하기', body: '제출한 문장에서 만든 질문을 살펴보고, 답변과 연습 녹음을 남겨요.' },
];

/** Optional help, never a gate in front of the actual workspace. */
export default function Landing() {
  useEffect(() => { document.title = '이용 안내 · JariZip'; window.scrollTo(0, 0); }, []);
  return <div className="lz-guide" lang="ko">
    <a className="lz-skip" href="#lz-main" onClick={event => {
      event.preventDefault(); document.getElementById('lz-main')?.focus();
    }}>본문으로 건너뛰기</a>
    <header className="lz-guide-nav">
      <Link to="/app/discover" className="lz-guide-brand" aria-label="자리집 홈"><span><JippiArt pose="wave" alt="" priority/></span>자리집</Link>
      <Link to="/app/discover" className="lz-back"><ArrowLeft size={16} aria-hidden="true"/>공고로 돌아가기</Link>
    </header>
    <main id="lz-main" className="lz-guide-main" tabIndex={-1}>
      <header className="lz-guide-heading"><h1>이용 안내</h1><p>공고와 서류, 지원 기록을 한곳에서 관리하세요.</p></header>
      <nav className="lz-guide-spaces" aria-label="작업 공간 안내">
        {spaces.map((space, index) => <Link key={space.to} to={space.to}>
          <span className="lz-guide-number" aria-hidden="true">{index + 1}</span>
          <div><h2>{space.title}</h2><p>{space.body}</p></div>
          <ArrowRight size={18} aria-hidden="true"/>
        </Link>)}
      </nav>
      <section className="lz-storage" aria-labelledby="lz-storage-title">
        <h2 id="lz-storage-title"><LockKeyhole size={17} aria-hidden="true"/>자료는 이 브라우저에 저장돼요</h2>
        <p>이력서, 메모, 지원 기록과 녹음은 서버로 보내지 않아요. 로그인이나 자동 동기화가 없으므로, 브라우저 자료를 지우거나 다른 기기로 옮기기 전에는 백업해주세요.</p>
        <Link to="/app/settings">저장·백업 설정<ArrowRight size={15} aria-hidden="true"/></Link>
      </section>
      <details className="lz-source-note"><summary>공고 출처와 기능 범위</summary>
        <p>원티드·점핏·직행의 비공식 자동 조회는 제공하지 않아요. 원문 링크는 직접 열 수 있고, 기존 보관 자료는 유지해요. 사람인·고용24 공식 API는 본인에게 발급된 키와 승인 범위 안에서만 사용해주세요. 공식 검색에 필요한 검색어·필터와 공고 번호만 서버와 해당 출처에 전송해요. 접수 상태와 정확한 마감 시각은 원문에서 확인해주세요.</p>
        <p>현재 면접 질문은 제출한 문장에서 규칙으로 구성해요. 자기소개서 자동 작성, AI 평가, 합격 확률 예측이나 기업으로의 자동 지원은 제공하지 않아요.</p>
      </details>
    </main>
    <footer className="lz-guide-footer"><span>JariZip · 자리집</span><Link to="/app/discover">채용 공고 보기<ArrowRight size={15} aria-hidden="true"/></Link></footer>
  </div>;
}
