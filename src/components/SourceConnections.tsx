import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { canProbeSource, fetchSources, probeSource, SOURCE_SITES, type JobSource, type SourceOption } from '../lib/remoteJobs';
import '../styles/connections.css';

type Probe = { state: 'loading' | 'ready' | 'error'; message: string };

/** Configuration and a real upstream request are deliberately separate checks.
 *  A live check is offered only for officially approved, key-configured sources, and the
 *  last result is cleared when the source list changes so it never mislabels a new check. */
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
    fetchSources(controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setSources(value);
      setProbes({});
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '조회 서버를 확인하지 못했어요.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => () => {
    for (const controller of controllers.current.values()) controller.abort();
    controllers.current.clear();
  }, []);

  async function probe(source: JobSource) {
    if (controllers.current.has(source) || !canProbeSource(source)) return;
    const controller = new AbortController();
    controllers.current.set(source, controller);
    setProbes(previous => ({ ...previous, [source]: { state: 'loading', message: '출처에서 공고를 직접 조회하고 있어요.' } }));
    try {
      const result = await probeSource(source, controller.signal);
      if (controller.signal.aborted) return;
      const time = new Date(result.checkedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      setProbes(previous => ({ ...previous, [source]: { state: 'ready', message: `${time} 조회 응답 확인 · 접수 중 공고 ${result.jobs.length}건` } }));
    } catch (reason) {
      if (!controller.signal.aborted) setProbes(previous => ({ ...previous, [source]: { state: 'error', message: reason instanceof Error ? reason.message : '출처에 연결하지 못했어요.' } }));
    } finally { controllers.current.delete(source); }
  }

  const statusMeta = (source: SourceOption) => {
    if (source.enabled) return '공식 API 설정됨 · 아래에서 실제 응답을 확인할 수 있어요';
    if (source.id === 'saramin') return 'API 키 미설정 · 현재 자동 조회할 수 없음';
    return '자동 조회 미사용 · 원문 사이트에서 직접 확인하고 보관';
  };

  return <div className="source-connections">
    <p className="connection-intro">서버 설정과 실제 공고 조회 결과를 나누어 보여드려요. 확인할 때 서류나 개인정보는 전송하지 않습니다. 공식 API 승인이 확인된 출처만 자동으로 조회하며, 화면 조작이나 설정이 제공사 허가를 대신하지는 않아요.</p>
    {loading && <p role="status">조회 서버 설정을 확인하고 있어요.</p>}
    {error && <div className="connection-error" role="alert"><p>{error}</p><button type="button" className="button secondary" onClick={() => setAttempt(value => value + 1)}>서버 다시 확인</button></div>}
    {!loading && !error && <ul className="connection-list">{sources.map(source => {
      const result = probes[source.id];
      const approved = canProbeSource(source.id);
      const site = SOURCE_SITES[source.id];
      return <li className="connection-row" key={source.id}>
        <div className="connection-copy"><h3>{source.name}</h3><p>{source.note}</p>
          {result ? <p className={`connection-result result-${result.state}`} role={result.state === 'error' ? 'alert' : 'status'}>{result.message}</p> : <p className="connection-meta">{statusMeta(source)}</p>}
          {!approved && <p className="connection-manual">제공사 사전 승인이 없어 자동 수집 대상에서 제외돼요. 공고는 원문에서 직접 확인해 <strong>공고 직접 추가</strong>로 보관하고, 접수 상태는 직접 확인한 날짜와 함께 기록해주세요.</p>}
        </div>
        <div className="connection-actions">
          <button type="button" className="button secondary" disabled={!source.enabled || !approved || result?.state === 'loading'} onClick={() => void probe(source.id)} title={approved ? undefined : '제공사 사전 승인 없이 자동 조회하지 않아요.'} aria-label={`${source.name} 공고 조회 확인`}><RefreshCw size={15} aria-hidden/>{result?.state === 'loading' ? '조회 중' : approved ? '공고 조회 확인' : '조회 대상 아님'}</button>
          <a className="button secondary" href={site.url} target="_blank" rel="noopener noreferrer" aria-label={`${source.name} 원문 사이트 열기`}>{source.name} 원문 열기<ArrowUpRight size={15} aria-hidden/></a>
        </div>
      </li>;
    })}</ul>}
    <p className="connection-footnote">사람인 공식 API는 서버에 개인 발급 키를 설정한 경우에만 사용하며, 승인된 앱·사용 범위와 제공사가 정한 1일 최대 500회 호출 한도를 따릅니다. 키만으로 재배포·자동 수집 허가가 되지는 않습니다. 다른 출처의 자동 수집 코드는 실행되지 않습니다.</p>
    <Link to="/app/discover" className="connection-link">채용 탐색으로 이동<ArrowUpRight size={15} aria-hidden/></Link>
  </div>;
}
