import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { fetchSources, searchRemoteJobs, type JobSource, type SourceOption } from '../lib/remoteJobs';
import '../styles/connections.css';

type Probe = { state: 'loading' | 'ready' | 'error'; message: string };

/** Configuration and a real upstream request are deliberately separate checks. */
export default function SourceConnections() {
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [probes, setProbes] = useState<Partial<Record<JobSource, Probe>>>({});
  const controllers = useRef(new Map<JobSource, AbortController>());

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchSources(controller.signal).then(setSources).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '조회 서버를 확인하지 못했어요.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => () => {
    for (const controller of controllers.current.values()) controller.abort();
    controllers.current.clear();
  }, []);

  async function probe(source: JobSource) {
    if (controllers.current.has(source)) return;
    const controller = new AbortController();
    controllers.current.set(source, controller);
    setProbes(previous => ({ ...previous, [source]: { state: 'loading', message: '출처에서 공고를 직접 조회하고 있어요.' } }));
    try {
      const result = await searchRemoteJobs(source, '', 'all', 0, controller.signal, true);
      if (controller.signal.aborted) return;
      const time = new Date(result.checkedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      setProbes(previous => ({ ...previous, [source]: { state: 'ready', message: `${time} 조회 응답 확인 · 접수 중 공고 ${result.jobs.length}건` } }));
    } catch (reason) {
      if (!controller.signal.aborted) setProbes(previous => ({ ...previous, [source]: { state: 'error', message: reason instanceof Error ? reason.message : '출처에 연결하지 못했어요.' } }));
    } finally { controllers.current.delete(source); }
  }

  return <div className="source-connections">
    <p className="connection-intro">서버 설정과 실제 공고 조회 결과를 나누어 보여드려요. 확인할 때 서류나 개인정보는 전송하지 않습니다.</p>
    {loading && <p role="status">조회 서버 설정을 확인하고 있어요.</p>}
    {error && <div className="connection-error" role="alert"><p>{error}</p><button type="button" className="button secondary" onClick={() => setAttempt(value => value + 1)}>서버 다시 확인</button></div>}
    {!loading && !error && <ul className="connection-list">{sources.map(source => {
      const result = probes[source.id];
      return <li className="connection-row" key={source.id}>
        <div className="connection-copy"><h3>{source.name}</h3><p>{source.note}</p>
          {result ? <p className={`connection-result result-${result.state}`} role={result.state === 'error' ? 'alert' : 'status'}>{result.message}</p> : <p className="connection-meta">{source.enabled ? '조회 준비됨 · 출처 응답은 아래 버튼으로 확인' : 'API 키 미설정 · 현재 사용할 수 없음'}</p>}
        </div>
        <button type="button" className="button secondary" disabled={!source.enabled || result?.state === 'loading'} onClick={() => void probe(source.id)} aria-label={`${source.name} 공고 조회 확인`}><RefreshCw size={15} aria-hidden/>{result?.state === 'loading' ? '조회 중' : '공고 조회 확인'}</button>
      </li>;
    })}</ul>}
    <Link to="/app/discover" className="connection-link">채용 탐색으로 이동<ArrowUpRight size={15} aria-hidden/></Link>
  </div>;
}
