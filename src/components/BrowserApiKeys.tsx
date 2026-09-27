import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, CircleAlert, Eye, EyeOff, KeyRound, Save, ShieldCheck, Trash2 } from 'lucide-react';
import {
  clearCredential,
  probeSource,
  saveCredential,
  type CredentialProvider,
  type CredentialStatus,
} from '../lib/remoteJobs';
import { PROVIDER_GUIDES } from '../lib/apiGuides';
import { Button, ConfirmDialog, Tag } from './ui';
import { useWorkspace } from '../lib/store';
import '../styles/browser-keys.css';

const PROVIDERS: CredentialProvider[] = ['work24', 'saramin'];

interface BrowserApiKeysProps {
  /** Status booleans from the server. `null` while the first read is in flight. */
  status: CredentialStatus | null;
  /** Apply the fresh booleans returned by a save/clear and refetch the source list. */
  onChanged: (providers: Record<CredentialProvider, boolean>) => void;
}

/**
 * Browser / local-server key management.
 *
 * The server owns persistence and never sends a secret back. This panel only
 * ever receives booleans, keeps the typed key in local component state, drops it
 * as soon as the save resolves, and then performs a real source probe so the
 * user learns whether the key actually works. Desktop keeps its ApiSetupWizard.
 */
export default function BrowserApiKeys({ status, onChanged }: BrowserApiKeysProps) {
  const { notify } = useWorkspace();
  const [editing, setEditing] = useState<CredentialProvider | null>(null);
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [probe, setProbe] = useState<{ provider: CredentialProvider; state: 'loading' | 'ready' | 'error'; message: string } | null>(null);
  const [clearTarget, setClearTarget] = useState<CredentialProvider | null>(null);
  const [clearing, setClearing] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  function begin(provider: CredentialProvider) {
    setEditing(provider);
    setKey('');
    setShowKey(false);
    setError('');
  }

  async function save(provider: CredentialProvider) {
    const value = key.trim();
    if (!value) { setError('발급받은 키를 입력해주세요.'); return; }
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setSaving(true);
    setError('');
    setProbe(null);
    let saved = false;
    try {
      const providers = await saveCredential(provider, value);
      saved = true;
      // The server owns the secret now; drop it from React state immediately.
      setKey('');
      setEditing(null);
      notify(`${PROVIDER_GUIDES[provider].name} 키를 저장했어요.`);
      onChanged(providers);
      setProbe({ provider, state: 'loading', message: '출처에서 공고를 직접 조회하고 있어요.' });
      try {
        const result = await probeSource(provider, active.signal);
        if (active.signal.aborted) return;
        const failure = result.sourceResults.find(item => item.id === provider && item.status === 'error');
        if (failure) throw new Error(failure.message || `${PROVIDER_GUIDES[provider].name}에서 공고를 가져오지 못했어요.`);
        const time = new Date(result.checkedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        setProbe({ provider, state: 'ready', message: `${time} 조회 응답 확인 · 접수 중 공고 ${result.jobs.length}건` });
      } catch (problem) {
        if (active.signal.aborted) return;
        setProbe({ provider, state: 'error', message: problem instanceof Error ? problem.message : '출처에 연결하지 못했어요.' });
      }
    } catch (problem) {
      if (active.signal.aborted) return;
      setError(problem instanceof Error ? problem.message : '키를 저장하지 못했어요. 다시 확인해주세요.');
    } finally {
      if (saved) setKey('');
      setSaving(false);
    }
  }

  async function disconnect(provider: CredentialProvider) {
    setClearing(true);
    try {
      const providers = await clearCredential(provider);
      onChanged(providers);
      if (probe?.provider === provider) setProbe(null);
      notify(`${PROVIDER_GUIDES[provider].name} 키를 지웠어요.`);
      setClearTarget(null);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : '키를 지우지 못했어요.');
      setClearTarget(null);
    } finally {
      setClearing(false);
    }
  }

  return <div className="browser-keys" data-testid="browser-api-keys">
    <p className="browser-keys-lead">이 브라우저 모드에서는 서버가 발급받은 키를 <code>.env.local</code>에 저장하고, 저장 즉시 공고 조회에 반영해요. 키 값은 화면이나 로그로 다시 돌려주지 않아요. 서버를 다시 시작할 필요가 없어요.</p>
    <ul className="browser-keys-list">
      {PROVIDERS.map(provider => {
        const guide = PROVIDER_GUIDES[provider];
        const connected = Boolean(status?.providers[provider]);
        const isEditing = editing === provider;
        const result = probe?.provider === provider ? probe : null;
        return <li className="browser-key-row" key={provider}>
          <div className="browser-key-head">
            <div>
              <h3>{guide.name}</h3>
              <span>{guide.org} · {guide.envKey}</span>
            </div>
            <Tag tone={connected ? 'green' : 'neutral'}>{connected ? '설정됨' : '미설정'}</Tag>
          </div>
          {result && <p className={`connection-result result-${result.state}`} role={result.state === 'error' ? 'alert' : 'status'}>{result.message}</p>}
          {isEditing
            ? <div className="browser-key-form">
                <ol className="browser-key-steps">{guide.steps.map(step => <li key={step}>{step}</li>)}</ol>
                <a className="button secondary browser-key-guide" href={guide.page} target="_blank" rel="noopener noreferrer" aria-label={`${guide.name} API 안내 열기`}>
                  {guide.pageLabel}<ArrowUpRight size={15} aria-hidden/>
                </a>
                <label className="browser-key-field">
                  <span>{guide.name} {provider === 'work24' ? '인증키' : 'access-key'}</span>
                  <span className="field-hint">붙여넣은 키는 저장한 뒤 이 화면에서 바로 지워지고, 브라우저 저장소에는 남지 않아요.</span>
                  <span className="browser-key-input">
                    <KeyRound size={17} aria-hidden/>
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={key}
                      onChange={event => setKey(event.target.value)}
                      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void save(provider); } }}
                      placeholder="발급받은 키를 붙여넣기"
                      aria-label={`${guide.name} API 키`}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      maxLength={512}
                      name={`api-key-${provider}`}
                    />
                    <button type="button" className="browser-key-reveal" aria-label={showKey ? '키 가리기' : '키 보기'} aria-pressed={showKey} onClick={() => setShowKey(value => !value)}>
                      {showKey ? <EyeOff size={17} aria-hidden/> : <Eye size={17} aria-hidden/>}
                    </button>
                  </span>
                </label>
                {error && <p className="api-setup-error" role="alert"><CircleAlert size={16} aria-hidden/>{error}</p>}
                <div className="browser-key-actions">
                  <Button variant="ghost" onClick={() => { setEditing(null); setError(''); setKey(''); }} disabled={saving}>취소</Button>
                  <Button variant="primary" onClick={() => void save(provider)} disabled={saving || !key.trim()}>
                    {saving ? '저장하고 확인 중' : '저장하고 조회 확인'}<ShieldCheck size={16} aria-hidden/>
                  </Button>
                </div>
              </div>
            : <div className="browser-key-actions">
                <Button variant="secondary" onClick={() => begin(provider)}>{connected ? <><KeyRound size={15}/>키 바꾸기</> : <><Save size={15}/>키 저장</>}</Button>
                {connected && <Button variant="danger" onClick={() => setClearTarget(provider)} disabled={clearing}><Trash2 size={15}/>키 지우기</Button>}
              </div>}
        </li>;
      })}
    </ul>
    <p className="browser-keys-foot"><Check size={13} aria-hidden/>키는 이 서버의 <code>.env.local</code>에만 저장돼요. 이미 보관한 공고와 서류는 그대로 남아요. 서버 파일을 직접 관리하려면 <code>.env.example</code> 안내를 참고하세요.</p>
    {clearTarget && <ConfirmDialog
      title={`${PROVIDER_GUIDES[clearTarget].name} 키를 지울까요?`}
      description="서버의 .env.local에서 이 키를 지워요. 자동 공고 조회가 멈추지만, 이미 보관한 공고와 서류는 그대로 남아요."
      confirmLabel="키 지우기"
      danger
      onClose={() => setClearTarget(null)}
      onConfirm={() => void disconnect(clearTarget)}
    />}
  </div>;
}
