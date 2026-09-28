import { useState } from 'react';
import { ArrowUpRight, CircleAlert, Eye, EyeOff, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { clearCredential, saveCredential, type CredentialProvider } from '../lib/remoteJobs';
import { PROVIDER_GUIDES } from '../lib/apiGuides';
import { Button, ConfirmDialog } from './ui';
import { useWorkspace } from '../lib/store';
import '../styles/browser-keys.css';

interface BrowserKeyControlsProps {
  provider: CredentialProvider;
  /** Whether the server currently holds a key for this provider. */
  configured: boolean;
  /** Apply the fresh booleans returned by a save/clear and refetch the source list. */
  onChanged: (providers: Record<CredentialProvider, boolean>) => void;
  /** Run the live source check after a successful save. */
  onProbe: (provider: CredentialProvider) => void;
}

/**
 * Inline browser/local-server key management for one provider.
 *
 * The server owns persistence and never sends a secret back. This control only
 * receives a boolean, keeps the typed key in local state, drops it as soon as the
 * save resolves, and then asks its parent to run a real probe. Desktop keeps its
 * ApiSetupWizard; this is only rendered when the server exposes a credential store.
 */
export default function BrowserKeyControls({ provider, configured, onChanged, onProbe }: BrowserKeyControlsProps) {
  const { notify } = useWorkspace();
  const guide = PROVIDER_GUIDES[provider];
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  function begin() {
    setEditing(true);
    setKey('');
    setShowKey(false);
    setError('');
  }

  function cancel() {
    setEditing(false);
    setKey('');
    setError('');
  }

  async function save() {
    const value = key.trim();
    if (!value) { setError('발급받은 키를 입력해주세요.'); return; }
    setSaving(true);
    setError('');
    try {
      const providers = await saveCredential(provider, value);
      // The server owns the secret now; drop it from React state immediately.
      setKey('');
      setEditing(false);
      onChanged(providers);
      notify(`${guide.name} 키를 설정했어요.`);
      onProbe(provider);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : '키를 설정하지 못했어요. 다시 확인해주세요.');
    } finally {
      setKey('');
      setSaving(false);
    }
  }

  async function remove() {
    setClearing(true);
    try {
      const providers = await clearCredential(provider);
      onChanged(providers);
      notify(`${guide.name} 키를 삭제했어요.`);
      setClearOpen(false);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : '키를 삭제하지 못했어요.');
      setClearOpen(false);
    } finally {
      setClearing(false);
    }
  }

  return <div className="browser-key-controls" data-testid="browser-key-controls" data-provider={provider}>
    {editing
      ? <div className="browser-key-form">
          <ol className="browser-key-steps">{guide.steps.map(step => <li key={step}>{step}</li>)}</ol>
          <a className="button secondary browser-key-guide" href={guide.page} target="_blank" rel="noopener noreferrer" aria-label={`${guide.name} API 안내 열기`}>
            {guide.pageLabel}<ArrowUpRight size={15} aria-hidden/>
          </a>
          <label className="browser-key-field">
            <span>{guide.name} {guide.keyLabel}</span>
            <span className="field-hint">붙여넣은 키는 설정한 뒤 이 화면에서 바로 지워지고, 브라우저 저장소에는 남지 않아요.</span>
            <span className="browser-key-input">
              <KeyRound size={17} aria-hidden/>
              <input
                type={showKey ? 'text' : 'password'}
                value={key}
                onChange={event => setKey(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void save(); } }}
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
            <Button variant="ghost" onClick={cancel} disabled={saving}>취소</Button>
            <Button variant="primary" onClick={() => void save()} disabled={saving || !key.trim()}>
              {saving ? '설정하고 확인 중' : '설정하고 조회 확인'}<ShieldCheck size={16} aria-hidden/>
            </Button>
          </div>
        </div>
      : <>
          {error && <p className="api-setup-error" role="alert"><CircleAlert size={16} aria-hidden/>{error}</p>}
          <div className="browser-key-actions">
            <Button variant="secondary" onClick={begin}>{configured ? <><KeyRound size={15}/>키 변경</> : <><KeyRound size={15}/>키 설정</>}</Button>
            {configured && <Button variant="danger" onClick={() => setClearOpen(true)} disabled={clearing}><Trash2 size={15}/>키 삭제</Button>}
          </div>
        </>}
    {clearOpen && <ConfirmDialog
      title={`${guide.name} 키를 삭제할까요?`}
      description="서버의 .env.local에서 이 키를 삭제해요. 자동 공고 조회가 멈추지만, 이미 보관한 공고와 서류는 그대로 남아요."
      confirmLabel="키 삭제"
      danger
      onClose={() => setClearOpen(false)}
      onConfirm={() => void remove()}
    />}
  </div>;
}
