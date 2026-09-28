import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { canProbeSource, fetchCredentialStatus, fetchSources, probeSource, SOURCE_SITES, type CredentialProvider, type CredentialStatus, type JobSource, type SourceOption } from '../lib/remoteJobs';
import { PROVIDER_GUIDES } from '../lib/apiGuides';
import { useApiSetup } from './ApiSetupWizard';
import BrowserKeyControls from './BrowserKeyControls';
import { Tag } from './ui';
import '../styles/connections.css';

type Probe = { state: 'loading' | 'ready' | 'error'; message: string };

/** Providers that need a user-issued official API key in browser/local-server mode. */
const KEY_PROVIDERS: CredentialProvider[] = ['work24', 'saramin', 'jooble'];
const isKeyProvider = (source: JobSource): source is CredentialProvider => KEY_PROVIDERS.includes(source as CredentialProvider);

/** Configuration and a real upstream request are deliberately separate checks.
 *  A live check is offered only for officially approved, key-configured sources, and the
 *  last result is cleared when the source list changes so it never mislabels a new check.
 *  One row per source carries everything: status badge, optional inline key controls,
 *  live probe result and the original-site link. There is no second key panel. */
export default function SourceConnections() {
  const apiSetup = useApiSetup();
  const desktop = apiSetup.available;
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [credentialStatus, setCredentialStatus] = useState<CredentialStatus | null>(null);
  const [probes, setProbes] = useState<Partial<Record<JobSource, Probe>>>({});
  const controllers = useRef(new Map<JobSource, AbortController>());

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchSources(controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setSources(value);
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '조회 서버를 확인하지 못했어요.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt, apiSetup.revision, apiSetup.available]);

  // Browser mode reads whether the server has a credential store once, then on change.
  useEffect(() => {
    if (desktop) return;
    let cancelled = false;
    fetchCredentialStatus().then(value => { if (!cancelled) setCredentialStatus(value); }).catch(() => { if (!cancelled) setCredentialStatus(null); });
    return () => { cancelled = true; };
  }, [desktop, attempt]);

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
      const failure = result.sourceResults.find(item => item.id === source && item.status === 'error');
      if (failure) throw new Error(failure.message || `${SOURCE_SITES[source].name}에서 공고를 가져오지 못했어요.`);
      const time = new Date(result.checkedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      setProbes(previous => ({ ...previous, [source]: { state: 'ready', message: `${time} 조회 응답 확인 · 접수 중 공고 ${result.jobs.length}건` } }));
    } catch (reason) {
      if (!controller.signal.aborted) setProbes(previous => ({ ...previous, [source]: { state: 'error', message: reason instanceof Error ? reason.message : '출처에 연결하지 못했어요.' } }));
    } finally { controllers.current.delete(source); }
  }

  const refreshAfterKeyChange = (providers: Record<CredentialProvider, boolean>) => {
    // The save/clear response already returned fresh booleans; just refetch the
    // source list so each row's enabled state and labels update immediately.
    setCredentialStatus({ available: true, providers });
    // Drop a stale probe result for a provider whose key was removed. A probe
    // started by a fresh save is preserved through the refetch.
    setProbes(previous => {
      const next = { ...previous };
      for (const provider of KEY_PROVIDERS) if (!providers[provider]) delete next[provider];
      return next;
    });
    setAttempt(value => value + 1);
  };

  const keyControlsAvailable = !desktop && credentialStatus?.available;

  const statusMeta = (source: SourceOption) => {
    if (source.enabled) return '공식 API 키 설정됨 · 아래에서 실제 응답을 확인할 수 있어요';
    const hint = desktop
      ? ' 위의 연결 설정에서 키를 등록해주세요.'
      : keyControlsAvailable ? ' 위에서 발급받은 키를 설정해주세요.' : ' 서버의 .env.local에 키를 설정해주세요.';
    if (source.id === 'saramin') return `API 키 미설정 · 현재 자동 조회할 수 없음.${hint}`;
    if (source.id === 'work24') return `인증키 미설정 · 현재 자동 조회할 수 없음.${hint}`;
    if (source.id === 'jooble') return `API 키 미설정 · 현재 자동 조회할 수 없음.${hint}`;
    return '자동조회 미지원 · 원문 사이트에서 직접 확인하고 기록';
  };

  return <div className="source-connections">
    <p className="connection-intro">서버 설정과 실제 공고 조회 결과를 한 출처당 한 줄로 보여드려요. 확인할 때 서류나 개인정보는 전송하지 않습니다. 공식 API 승인이 확인된 출처만 자동으로 조회하며, 화면 조작이나 설정이 제공사 허가를 대신하지는 않아요.</p>
    {loading && <p role="status">조회 서버 설정을 확인하고 있어요.</p>}
    {error && <div className="connection-error" role="alert"><p>{error}</p><button type="button" className="button secondary" onClick={() => setAttempt(value => value + 1)}>서버 다시 확인</button></div>}
    {!loading && !error && <ul className="connection-list">{sources.map(source => {
      const result = probes[source.id];
      const approved = canProbeSource(source.id);
      const site = SOURCE_SITES[source.id];
      const keyProvider = isKeyProvider(source.id);
      const connected = keyProvider && credentialStatus ? credentialStatus.providers[source.id as CredentialProvider] : false;
      return <li className="connection-row" key={source.id}>
        <div className="connection-main">
          <div className="connection-head">
            <h3>{source.name}</h3>
            {approved
              ? <Tag tone={source.enabled ? 'green' : 'neutral'}>{source.enabled ? '설정됨' : '미설정'}</Tag>
              : <Tag tone="orange">자동조회 미지원</Tag>}
          </div>
          {approved && keyProvider && <p className="connection-meta">{PROVIDER_GUIDES[source.id as CredentialProvider].org} 공식 API · {PROVIDER_GUIDES[source.id as CredentialProvider].envKey}</p>}
          {approved && (result ? <p className={`connection-result result-${result.state}`} role={result.state === 'error' ? 'alert' : 'status'}>{result.message}</p> : <p className="connection-meta">{statusMeta(source)}</p>)}
          {!approved && <p className="connection-manual">
            API 키가 필요 없는 출처라는 뜻이 아니에요. 현재 JariZip에서 사용 권한이 확인된 공식 자동조회 API가 없어 키 설정과 자동조회를 제공하지 않습니다. 공고는 원문에서 확인해 <strong>공고 직접 추가</strong>로 기록할 수 있어요.
          </p>}
          {approved && keyProvider && keyControlsAvailable && <BrowserKeyControls
            provider={source.id as CredentialProvider}
            configured={connected}
            onChanged={refreshAfterKeyChange}
            onProbe={probe}
          />}
        </div>
        <div className="connection-actions">
          {approved && <button type="button" className="button secondary" disabled={!source.enabled || result?.state === 'loading'} onClick={() => void probe(source.id)} aria-label={`${source.name} 공고 조회 확인`}><RefreshCw size={15} aria-hidden/>{result?.state === 'loading' ? '조회 중' : '공고 조회 확인'}</button>}
          <a className="button secondary" href={site.url} target="_blank" rel="noopener noreferrer" aria-label={`${source.name} 원문 사이트 열기`}>{source.name} 원문 열기<ArrowUpRight size={15} aria-hidden/></a>
        </div>
      </li>;
    })}</ul>}
    {!loading && !error && !desktop && keyControlsAvailable && <p className="connection-footnote-storage">키는 서버가 필요한 경우 이 서버의 <code>.env.local</code>에 저장해 보관하고, 설정 즉시 공고 조회에 반영돼요. 키 값은 화면이나 로그로 다시 돌려주지 않고 설정 여부만 보여드려요. 이미 보관한 공고와 서류는 그대로 남아요. 서버 파일을 직접 관리하려면 <code>.env.example</code> 안내를 참고하세요.</p>}
    <p className="connection-footnote">{desktop
      ? '데스크톱 앱에서는 위의 연결 설정에서 발급받은 키를 이 기기에만 저장해요. 사람인·고용24·조블 공식 API는 승인된 앱·사용 범위와 제공사가 정한 호출 한도를 따릅니다. 고용24 결과는 원문 링크와 출처 표시를 함께 제공해야 하며, 키만으로 재배포·자동 수집 허가가 되지는 않습니다. 다른 출처의 자동 수집 코드는 실행되지 않습니다.'
      : keyControlsAvailable
        ? '사람인·고용24·조블 공식 API는 서버가 위에서 설정한 개인 발급 키(SARAMIN_ACCESS_KEY·WORK24_AUTH_KEY·JOOBLE_API_KEY)를 .env.local에 보관한 경우에만 사용하며, 승인된 앱·사용 범위와 제공사가 정한 호출 한도를 따릅니다. 고용24 결과는 원문 링크와 출처 표시를 함께 제공해야 하며, 키만으로 재배포·자동 수집 허가가 되지는 않습니다. 원티드·점핏·직행은 승인된 공식 자동 API가 없어 원문 확인·직접 기록만 지원합니다. 다른 출처의 자동 수집 코드는 실행되지 않습니다.'
        : '사람인·고용24·조블 공식 API는 서버에 각각 개인 발급 키(SARAMIN_ACCESS_KEY·WORK24_AUTH_KEY·JOOBLE_API_KEY)를 설정한 경우에만 사용하며, 승인된 앱·사용 범위와 제공사가 정한 호출 한도를 따릅니다. 고용24 결과는 원문 링크와 출처 표시를 함께 제공해야 합니다. 키만으로 재배포·자동 수집 허가가 되지는 않습니다. 원티드·점핏·직행은 승인된 공식 자동 API가 없어 원문 확인·직접 기록만 지원합니다. 다른 출처의 자동 수집 코드는 실행되지 않습니다.'}</p>
    <Link to="/app/discover" className="connection-link">채용 탐색으로 이동<ArrowUpRight size={15} aria-hidden/></Link>
  </div>;
}
