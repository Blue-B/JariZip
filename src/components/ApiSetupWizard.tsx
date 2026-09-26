import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Plug,
  ShieldCheck,
} from 'lucide-react';
import { Button, ConfirmDialog, Modal, Tag } from './ui';
import { fetchSources, probeSource } from '../lib/remoteJobs';
import { useWorkspace } from '../lib/store';
import {
  getDesktopBridge,
  hasSeenApiSetupWizard,
  markApiSetupWizardSeen,
  shouldAutoOpenApiWizard,
  type ApiKeyStatus,
  type ApiProvider,
  type JarizipDesktopBridge,
} from '../lib/desktopBridge';
import '../styles/api-setup.css';

interface ProviderGuide {
  id: ApiProvider;
  name: string;
  org: string;
  envKey: string;
  recommended: boolean;
  page: string;
  pageLabel: string;
  steps: string[];
}

/** Official key-issuance pages only. The wizard opens these in the system
 *  browser; it never contacts a job site itself and never automates a signup. */
const PROVIDERS: Record<ApiProvider, ProviderGuide> = {
  work24: {
    id: 'work24',
    name: '고용24',
    org: '한국고용정보원',
    envKey: 'WORK24_AUTH_KEY',
    recommended: true,
    page: 'https://www.work24.go.kr/cm/e/a/0110/selectOpenApiIntro.do',
    pageLabel: '고용24 Open API 안내 열기',
    steps: [
      '고용24에 기업회원으로 로그인해요.',
      'Open API 서비스 이용을 신청해요.',
      '담당자 심사를 거쳐 인증키를 발급받아요.',
      '발급받은 인증키를 아래에 붙여넣어요.',
    ],
  },
  saramin: {
    id: 'saramin',
    name: '사람인',
    org: '사람인',
    envKey: 'SARAMIN_ACCESS_KEY',
    recommended: false,
    page: 'https://oapi.saramin.co.kr/guide/info',
    pageLabel: '사람인 API 안내 열기',
    steps: [
      '사람인 채용정보 API 이용을 신청해요.',
      '승인을 받은 뒤 앱별 access-key를 발급받아요.',
      '발급받은 access-key를 아래에 붙여넣어요.',
    ],
  },
};

type Stage = 'choose' | 'connect' | 'verifying' | 'done' | 'overview';

/* -------------------------------------------------------------------------- */
/* Shared state                                                               */
/* -------------------------------------------------------------------------- */

interface ApiSetupContextValue {
  /** True only in the desktop shell with a complete preload contract. */
  available: boolean;
  status: ApiKeyStatus | null;
  /** Bumped whenever the key status may have changed; consumers refetch on it. */
  revision: number;
  openWizard: () => void;
  refreshStatus: () => Promise<void>;
}

const ApiSetupContext = createContext<ApiSetupContextValue | null>(null);

const FALLBACK: ApiSetupContextValue = {
  available: false,
  status: null,
  revision: 0,
  openWizard: () => undefined,
  refreshStatus: async () => undefined,
};

/**
 * Safe outside the provider too: a plain browser render just reads as
 * "desktop bridge unavailable" instead of throwing.
 */
export function useApiSetup(): ApiSetupContextValue {
  return useContext(ApiSetupContext) ?? FALLBACK;
}

export function ApiSetupProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [bridge] = useState<JarizipDesktopBridge | null>(() => getDesktopBridge());
  const [status, setStatus] = useState<ApiKeyStatus | null>(null);
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  // A ref makes the first-run decision exactly-once even under StrictMode.
  const seenRef = useRef(hasSeenApiSetupWizard());

  const refreshStatus = useCallback(async () => {
    if (!bridge) return;
    try {
      const next = await bridge.getApiKeyStatus();
      setStatus(next);
      setRevision(value => value + 1);
    } catch {
      // A failed status read must not block the workspace.
    }
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    void bridge.getApiKeyStatus().then(value => {
      if (cancelled) return;
      setStatus(value);
      setRevision(current => current + 1);
      // The ref is set synchronously here, so a duplicate effect pass can never
      // open a second wizard even if both status reads resolve.
      if (shouldAutoOpenApiWizard(value, seenRef.current)) {
        seenRef.current = true;
        // Remember the first run before showing so a crash cannot loop it.
        markApiSetupWizardSeen();
        setOpen(true);
      }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [bridge]);

  const close = useCallback(() => {
    seenRef.current = true;
    markApiSetupWizardSeen();
    setOpen(false);
  }, []);

  const value = useMemo<ApiSetupContextValue>(() => ({
    available: Boolean(bridge),
    status,
    revision,
    openWizard: () => {
      // Reopened from Settings: re-read so a previously connected key shows.
      void refreshStatus();
      setOpen(true);
    },
    refreshStatus,
  }), [bridge, status, revision, refreshStatus]);

  return <ApiSetupContext.Provider value={value}>
    {children}
    {bridge && open && <ApiSetupWizard
      bridge={bridge}
      status={status}
      onRefreshStatus={refreshStatus}
      onClose={close}
      onAddManual={() => { close(); navigate('/app/jobs?new=1'); }}
      onBrowse={() => { close(); navigate('/app/discover'); }}
    />}
  </ApiSetupContext.Provider>;
}

/* -------------------------------------------------------------------------- */
/* Wizard                                                                     */
/* -------------------------------------------------------------------------- */

interface ApiSetupWizardProps {
  bridge: JarizipDesktopBridge;
  status: ApiKeyStatus | null;
  onRefreshStatus: () => Promise<void>;
  onClose: () => void;
  onAddManual: () => void;
  onBrowse: () => void;
}

function ApiSetupWizard({ bridge, status, onRefreshStatus, onClose, onAddManual, onBrowse }: ApiSetupWizardProps) {
  const { notify } = useWorkspace();
  const [stage, setStage] = useState<Stage>(() => (status?.work24 || status?.saramin) ? 'overview' : 'choose');
  const [provider, setProvider] = useState<ApiProvider>(() => status?.work24 ? 'work24' : status?.saramin ? 'saramin' : 'work24');
  // The key only lives here while the user is typing or retrying a failed save.
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sourceEnabled, setSourceEnabled] = useState<boolean | null>(null);
  const [jobCount, setJobCount] = useState(0);
  const [clearTarget, setClearTarget] = useState<ApiProvider | null>(null);
  const [clearing, setClearing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const aliveRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    aliveRef.current = false;
    abortRef.current?.abort();
  }, []);

  const guide = PROVIDERS[provider];

  function begin(id: ApiProvider) {
    setProvider(id);
    setKey('');
    setShowKey(false);
    setKeySaved(false);
    setError('');
    setSourceEnabled(null);
    setStage('connect');
    // Focus lands on the key field after the panel paints.
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function openGuidePage() {
    try {
      await bridge.openExternal(guide.page);
    } catch {
      setError('안내 페이지를 열지 못했어요. 주소를 직접 열어주세요: ' + guide.page);
    }
  }

  async function connect(alreadySaved = false) {
    const value = key.trim();
    if (!alreadySaved && !value) {
      setError('발급받은 키를 입력해주세요.');
      inputRef.current?.focus();
      return;
    }
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setError('');
    setSourceEnabled(null);
    setSaving(true);
    setStage('verifying');
    let handedOff = alreadySaved || keySaved;
    try {
      if (!alreadySaved && !keySaved) {
        const saved = await bridge.setApiKey(provider, value);
        // The desktop shell owns the key now; drop it from React state at once.
        handedOff = true;
        setKey('');
        if (!saved.ok) throw new Error(saved.message || '키를 저장하지 못했어요. 다시 확인해주세요.');
        setKeySaved(true);
        // Surface the saved key in Settings even if the live check then fails.
        await onRefreshStatus();
      }
      try {
        const sources = await fetchSources(controller.signal);
        if (aliveRef.current) setSourceEnabled(Boolean(sources.find(item => item.id === provider)?.enabled));
      } catch {
        // The live probe below reports the real connection problem.
      }
      const result = await probeSource(provider, controller.signal);
      if (!aliveRef.current || controller.signal.aborted) return;
      // A per-source error still resolves; surface it honestly instead of
      // reporting a successful connection with an empty list.
      const failure = result.sourceResults.find(item => item.id === provider && item.status === 'error');
      if (failure) throw new Error(failure.message || `${guide.name}에서 공고를 가져오지 못했어요.`);
      setJobCount(result.jobs.length);
      await onRefreshStatus();
      if (!aliveRef.current) return;
      setStage('done');
      notify(`${guide.name} 연결을 확인했어요. 이제 실제 공고를 불러올 수 있어요.`);
    } catch (problem) {
      if (!aliveRef.current || controller.signal.aborted) return;
      setError(problem instanceof Error ? problem.message : '연결을 확인하지 못했어요. 잠시 후 다시 시도해주세요.');
      setStage('connect');
    } finally {
      if (handedOff) setKey('');
      if (aliveRef.current) setSaving(false);
    }
  }

  async function disconnect(id: ApiProvider) {
    setClearing(true);
    try {
      const result = await bridge.clearApiKey(id);
      if (!result.ok) throw new Error(result.message || '연결을 해제하지 못했어요.');
      await onRefreshStatus();
      notify(`${PROVIDERS[id].name} 연결을 해제했어요. 저장한 키를 기기에서 지웠어요.`);
      setClearTarget(null);
      setStage('overview');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : '연결을 해제하지 못했어요.');
      setClearTarget(null);
    } finally {
      setClearing(false);
    }
  }

  const title = stage === 'overview' ? '공고 연결 설정' : stage === 'done' ? '연결을 확인했어요' : stage === 'verifying' ? '연결을 확인하고 있어요' : '실제 공고를 불러오려면';

  return <>
    <Modal
      title={title}
      description={stage === 'done' ? `${guide.name}에서 실제 공고 응답을 받았어요.` : 'JariZip은 처음 한 번만 공고 출처를 연결하면 돼요.'}
      onClose={saving ? () => undefined : onClose}
    >
      <div className="api-setup" data-testid="api-setup-wizard">
        <div className="api-setup-local">
          <LockKeyhole size={18} aria-hidden/>
          <div>
            <strong>입력한 키와 내 자료는 이 기기에만 저장돼요.</strong>
            <p>서류·메모·녹음은 채용 사이트로 보내지 않아요. 연결에 필요한 검색 조건만 출처로 전달돼요.</p>
          </div>
        </div>

        {stage === 'choose' && <>
          <p className="api-setup-lead">채용 공고를 자동으로 불러오려면 공식 API 키가 필요해요. 없다면 건너뛰고 공고를 직접 추가할 수도 있어요.</p>
          <ul className="api-setup-choices">
            {(Object.keys(PROVIDERS) as ApiProvider[]).map(id => {
              const item = PROVIDERS[id];
              return <li key={id} className={`api-setup-choice ${item.recommended ? 'is-recommended' : ''}`}>
                <div className="api-setup-choice-head">
                  <span className="api-setup-choice-icon" aria-hidden><Plug size={19}/></span>
                  <div>
                    <h3>{item.name}{item.recommended && <Tag tone="green">추천</Tag>}</h3>
                    <p>{item.org} 공식 API · {item.envKey}</p>
                  </div>
                </div>
                <Button variant={item.recommended ? 'primary' : 'secondary'} onClick={() => begin(id)}>
                  {item.name} 연결하기<ArrowRight size={16} aria-hidden/>
                </Button>
              </li>;
            })}
          </ul>
          <div className="api-setup-foot">
            <Button variant="ghost" onClick={onClose}>나중에 하기</Button>
            <Button variant="secondary" onClick={onAddManual}>공고 직접 추가하기</Button>
          </div>
        </>}

        {stage === 'connect' && <>
          <button type="button" className="api-setup-back" onClick={() => { setStage('choose'); setError(''); setKey(''); setKeySaved(false); }}>← 출처 다시 고르기</button>
          <ol className="api-setup-steps">
            {guide.steps.map(step => <li key={step}>{step}</li>)}
          </ol>
          <Button variant="secondary" onClick={() => void openGuidePage()}>
            {guide.pageLabel}<ArrowUpRight size={15} aria-hidden/>
          </Button>
          {keySaved
            ? <p className="api-setup-saved-note" role="status">키는 이미 이 기기에 저장됐어요. 다시 붙여넣을 필요 없이 아래에서 연결을 다시 확인할 수 있어요.</p>
            : <label className="api-setup-field">
                <span>{guide.name} {guide.id === 'work24' ? '인증키' : 'access-key'}</span>
                <span className="field-hint">붙여넣은 키는 저장한 뒤 이 화면에서 바로 지워지고, 브라우저 저장소나 백업 파일에는 남지 않아요.</span>
                <span className="api-setup-input">
                  <KeyRound size={17} aria-hidden/>
                  <input
                    ref={inputRef}
                    type={showKey ? 'text' : 'password'}
                    value={key}
                    onChange={event => setKey(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void connect(); } }}
                    placeholder="발급받은 키를 붙여넣기"
                    aria-label={`${guide.name} API 키`}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    maxLength={200}
                    name="api-key"
                  />
                  <button type="button" className="api-setup-reveal" aria-label={showKey ? '키 가리기' : '키 보기'} aria-pressed={showKey} onClick={() => setShowKey(value => !value)}>
                    {showKey ? <EyeOff size={17} aria-hidden/> : <Eye size={17} aria-hidden/>}
                  </button>
                </span>
              </label>}
          {error && <p className="api-setup-error" role="alert"><CircleAlert size={16} aria-hidden/>{error}</p>}
          <div className="api-setup-foot">
            <Button variant="ghost" onClick={onClose} disabled={saving}>나중에 하기</Button>
            <Button variant="primary" onClick={() => void connect(keySaved)} disabled={saving || (!keySaved && !key.trim())}>
              {keySaved ? '연결 다시 확인' : '저장하고 연결 확인'}<ShieldCheck size={16} aria-hidden/>
            </Button>
          </div>
          <p className="api-setup-privacy">키 저장은 이 기기의 JariZip 앱에만 적용돼요. 실제 공고 조회가 되는지 아래에서 바로 확인해요.</p>
        </>}

        {stage === 'verifying' && <div className="api-setup-verifying" role="status" aria-live="polite">
          <LoaderCircle className="api-setup-spinner" size={26} aria-hidden/>
          <p>키를 저장하고 {guide.name}에서 실제 공고를 한 번 조회하고 있어요.</p>
          <p className="field-hint">잠시만 기다려주세요. 서류나 개인정보는 전송하지 않아요.</p>
        </div>}

        {stage === 'done' && <>
          <div className="api-setup-success" role="status">
            <span className="api-setup-success-icon" aria-hidden><Check size={26}/></span>
            <div>
              <strong>{guide.name} 연결을 확인했어요.</strong>
              <p>{sourceEnabled === false ? '키는 저장됐어요. 앱을 다시 시작하면 활성화될 수 있어요.' : `방금 실제로 받아온 접수 중 공고 ${jobCount}건을 확인했어요.`}</p>
            </div>
          </div>
          <div className="api-setup-foot">
            <Button variant="ghost" onClick={onClose}>닫기</Button>
            <Button variant="primary" onClick={onBrowse}>공고 불러오러 가기<ArrowRight size={16} aria-hidden/></Button>
          </div>
        </>}

        {stage === 'overview' && <>
          <p className="api-setup-lead">연결된 출처를 확인하고, 필요할 때 키를 바꾸거나 해제할 수 있어요.</p>
          <ul className="api-setup-status">
            {(Object.keys(PROVIDERS) as ApiProvider[]).map(id => {
              const item = PROVIDERS[id];
              const connected = Boolean(status?.[id]);
              return <li key={id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.org} · {item.envKey}</span>
                </div>
                <Tag tone={connected ? 'green' : 'neutral'}>{connected ? '연결됨' : '미연결'}</Tag>
                <div className="api-setup-status-actions">
                  <Button variant="secondary" onClick={() => begin(id)}>{connected ? '키 바꾸기' : '연결하기'}</Button>
                  {connected && <Button variant="danger" onClick={() => setClearTarget(id)} disabled={clearing}>연결 해제</Button>}
                </div>
              </li>;
            })}
          </ul>
          <div className="api-setup-foot">
            <Button variant="ghost" onClick={onClose}>닫기</Button>
            <Button variant="secondary" onClick={onAddManual}>공고 직접 추가하기</Button>
          </div>
        </>}
      </div>
    </Modal>
    {clearTarget && <ConfirmDialog
      title={`${PROVIDERS[clearTarget].name} 연결을 해제할까요?`}
      description="이 기기에 저장된 키를 지워요. 자동 공고 조회가 멈추지만, 이미 보관한 공고와 서류는 그대로 남아요."
      confirmLabel="연결 해제"
      danger
      onClose={() => setClearTarget(null)}
      onConfirm={() => void disconnect(clearTarget)}
    />}
  </>;
}
