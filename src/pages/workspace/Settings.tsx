import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { UserRound, LockKeyhole, Download, Upload, Database, ArrowUpRight, Save, Trash2, Plug, Check } from 'lucide-react';
import { useWorkspace } from '../../lib/store';
import { createEmptyState } from '../../lib/seed';
import { exportBackup, readBackupFile } from '../../lib/files';
import type { WorkspaceState } from '../../lib/types';
import { Button, ConfirmDialog, Note, PageHeading, Tag } from '../../components/ui';
import SourceConnections from '../../components/SourceConnections';

export default function Settings() {
  const { state, update, storageStatus, notify } = useWorkspace();
  const [profile, setProfile] = useState(state.profile);
  const [skills, setSkills] = useState(state.profile.skills.join(', '));
  const [locations, setLocations] = useState(state.profile.locations.join(', '));
  const [excluded, setExcluded] = useState(state.profile.excludeKeywords.join(', '));
  const [reset, setReset] = useState(false);
  const [pending, setPending] = useState<WorkspaceState | null>(null);
  const [importing, setImporting] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setProfile(state.profile);
    setSkills(state.profile.skills.join(', '));
    setLocations(state.profile.locations.join(', '));
    setExcluded(state.profile.excludeKeywords.join(', '));
  }, [state.profile]);

  const list = (value: string, max: number) => [...new Set(value.split(',').map(s => s.trim()).filter(Boolean))].slice(0, max);
  function saveProfile(event: FormEvent) {
    event.preventDefault();
    update(current => ({ ...current, profile: {
      ...profile, name: profile.name.trim() || '나의 워크스페이스', role: profile.role.trim(),
      skills: list(skills, 24), locations: list(locations, 12), excludeKeywords: list(excluded, 20),
      weeklyGoal: Math.max(1, Math.min(50, Number(profile.weeklyGoal) || 5)),
    } }));
    notify('내 프로필과 선호 조건을 반영했어요.');
  }
  function backup() {
    try { exportBackup(state); notify('백업 파일 다운로드를 시작했어요. 내 서류 원본도 포함돼요.'); }
    catch (error) { notify(error instanceof Error ? error.message : '백업을 만들지 못했어요.'); }
  }
  async function readBackup(file: File) {
    setImporting(true);
    try { setPending(await readBackupFile(file)); }
    catch (error) { notify(error instanceof Error ? error.message : '백업을 읽지 못했어요.'); }
    finally { setImporting(false); if (input.current) input.current.value = ''; }
  }

  return <div className="page-enter settings-page">
    <PageHeading eyebrow="" title="내게 맞는 준비 공간" description="관심 조건, 공고 연결과 자료 보관을 관리하세요."/>
    <div className="settings-columns">
      <div className="settings-primary">
        <section className="panel settings-section">
          <div className="settings-section-title"><span className="settings-icon"><UserRound size={20}/></span><div><h2>내 프로필과 관심 조건</h2><p>공고 비교에 쓰는 정보예요. 회사에는 공개되지 않아요.</p></div></div>
          <form className="stack-form" onSubmit={saveProfile}>
            <div className="form-grid">
              <label>공간 이름<input value={profile.name} maxLength={40} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} placeholder="나의 워크스페이스" required/></label>
              <label>희망 직무<input value={profile.role} maxLength={80} onChange={e => setProfile(p => ({ ...p, role: e.target.value }))} placeholder="예: 백엔드 개발"/></label>
            </div>
            <label>내가 경험한 기술<span className="field-hint">쉼표로 구분해요. 이 목록과 공고의 요구 기술을 비교해요.</span><input value={skills} maxLength={500} onChange={e => setSkills(e.target.value)} placeholder="Python, FastAPI, SQL, Docker"/></label>
            <label>관심 지역<input value={locations} maxLength={300} onChange={e => setLocations(e.target.value)} placeholder="서울, 경기, 원격"/></label>
            <label>추천에서 제외할 키워드<span className="field-hint">대시보드 추천에서 제외돼요. 채용 탐색에서는 원문을 그대로 볼 수 있어요.</span><input value={excluded} maxLength={500} onChange={e => setExcluded(e.target.value)} placeholder="예: 인턴, 상주"/></label>
            <label className="goal-field">최근 7일 지원 목표<div><input type="number" min={1} max={50} value={profile.weeklyGoal} onChange={e => setProfile(p => ({ ...p, weeklyGoal: Number(e.target.value) }))}/><span>건</span></div></label>
            <div className="form-actions"><Button type="submit" variant="primary"><Save size={16}/>프로필 저장</Button></div>
          </form>
        </section>

        <section className="panel settings-section">
          <div className="settings-section-title"><span className="settings-icon"><Plug size={20}/></span><div><h2>공고 연결</h2><p>사용할 수 있는 출처와 실제 조회 상태를 확인하세요.</p></div></div>
          <SourceConnections/>
        </section>

        <section className="panel settings-section">
          <div className="settings-section-title"><span className="settings-icon"><Database size={20}/></span><div><h2>내 자료 보관과 백업</h2><p>원본 서류와 제출 기록까지, 하나의 파일로 가져갈 수 있어요.</p></div><Tag tone={storageStatus === 'saved' ? 'green' : 'orange'}>{storageStatus === 'saved' ? '기기에 저장됨' : storageStatus === 'saving' ? '저장 중' : '저장 상태 확인 필요'}</Tag></div>
          <div className="backup-summary"><span><strong>{state.jobs.length}</strong>보관 공고</span><span><strong>{state.documents.length}</strong>서류 버전</span><span><strong>{state.applications.length}</strong>지원 기록</span><span><strong>{state.practice.length}</strong>연습 답변</span></div>
          <Note tone="orange"><strong>브라우저 데이터를 지우면 자료도 삭제돼요.</strong><br/>다른 기기로 자동 동기화되지 않으니 정기적으로 백업을 내려받아주세요.</Note>
          <div className="backup-actions">
            <Button onClick={backup}><Download size={17}/>전체 백업 내려받기</Button>
            <Button onClick={() => input.current?.click()} disabled={importing}><Upload size={17}/>{importing ? '백업 확인 중' : '백업 파일 불러오기'}</Button>
            <input type="file" accept=".json,application/json" ref={input} className="sr-only" aria-label="백업 파일 선택" onChange={e => e.target.files?.[0] && void readBackup(e.target.files[0])}/>
          </div>
          <p className="field-hint">JSON 백업은 원본 서류와 음성을 포함해 전체 40MB까지 내보내고 불러올 수 있어요. 파일 원본이 인코딩되므로 원래 용량보다 커질 수 있어요. 암호화되지 않으니 안전한 곳에 보관해주세요.</p>
        </section>

        <section className="panel settings-section">
          <h2>서류와 면접 연습</h2>
          <p className="connection-intro">서류를 직접 편집하고 실제 제출본의 문장을 근거로 질문을 준비해요. 자동 글쓰기, 답변 평가와 음성 전사는 제공하지 않습니다.</p>
          <Link to="/app/interview" className="connection-link">면접 연습 열기<ArrowUpRight size={15}/></Link>
        </section>

        <section className="panel settings-section reset-section">
          <h2>워크스페이스 다시 시작</h2><p>이 브라우저의 준비 공간만 비워요. 먼저 백업 파일을 내려받아주세요.</p>
          <Button variant="danger" onClick={() => setReset(true)}><Trash2 size={15}/>비우고 내 자료로 시작</Button>
        </section>
      </div>
      <aside className="settings-aside">
        <div className="privacy-poster">
          <div className="privacy-seal"><LockKeyhole size={36} strokeWidth={1.4}/></div>
          <h2>서류와 녹음은<br/>내 기기에.</h2><p>공고 검색에 필요한 조건만 출처로 전송해요. 내 자료는 지금 사용하는 브라우저에 보관합니다.</p>
          <div><Check size={14}/>파일 원본도 로컬에 보관</div><div><Check size={14}/>제출본 버전을 따로 기억</div><div><Check size={14}/>백업으로 다른 기기에 이동</div>
          <small>브라우저 저장소 자체는 암호화 보관함이 아니에요. 공용 기기에서는 개인정보를 넣지 않는 편이 좋아요.</small>
        </div>
        <Link to="/about" className="about-product-link"><span>JariZip이 처음이라면</span><strong>이용 안내 보기<ArrowUpRight size={17}/></strong></Link>
      </aside>
    </div>
    {reset && <ConfirmDialog title="비우고 내 자료로 시작할까요?" description="현재 공고, 서류 원본, 지원 기록, 음성 답변과 프로필이 모두 삭제돼요. 백업 파일이 없으면 되돌릴 수 없어요." confirmLabel="비우고 시작" danger onClose={() => setReset(false)} onConfirm={() => { update(() => createEmptyState()); setReset(false); notify('워크스페이스를 비웠어요.'); }}/>}
    {pending && <ConfirmDialog title="이 백업으로 내 공간을 교체할까요?" description={`파일을 검사했어요. 공고 ${pending.jobs.length}개, 서류 ${pending.documents.length}개 버전, 지원 기록 ${pending.applications.length}건이 들어 있어요. 불러오면 현재 데이터와 합치지 않고 전체 교체해요. 먼저 현재 공간을 백업해주세요.`} confirmLabel="백업으로 교체" onClose={() => setPending(null)} onConfirm={() => { update(() => pending); setPending(null); notify('검사한 백업 데이터를 불러왔어요.'); }}/ >}
  </div>;
}
