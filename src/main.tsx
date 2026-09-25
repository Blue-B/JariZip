import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route, Link } from 'react-router-dom';
import '@fontsource-variable/noto-sans-kr';
import '@fontsource-variable/manrope';
import './styles/global.css';

const Landing = lazy(() => import('./pages/Landing'));
const Workspace = lazy(() => import('./pages/Workspace'));

class ErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="recovery-screen"><div className="brand-symbol">J</div><h1>화면을 다시 열어주세요.</h1><p>저장한 자료를 지우지 않고 다시 시작할 수 있어요.</p><button className="button primary" onClick={() => window.location.reload()}>새로고침</button><p className="muted">문제가 반복되면 저장소의 Issues에 사용 중인 브라우저와 재현 방법을 남겨주세요.</p><a href="https://github.com/Blue-B/JariZip/issues" target="_blank" rel="noreferrer">문제 제보하기</a></main>;
    return this.props.children;
  }
}
function NotFound() { return <main className="recovery-screen"><p className="eyebrow">404 / LOST & FOUND</p><h1>이 자리는 비어 있어요.</h1><Link className="button primary" to="/app">내 공간으로 돌아가기</Link></main>; }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary><HashRouter><Suspense fallback={<div className="recovery-screen" role="status"><div className="loading-mark"/><p>내 다음 자리를 여는 중</p></div>}><Routes><Route path="/" element={<Landing />} /><Route path="/app/*" element={<Workspace />} /><Route path="*" element={<NotFound />} /></Routes></Suspense></HashRouter></ErrorBoundary></React.StrictMode>,
);
