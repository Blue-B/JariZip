import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, FileText, MessageCircle, Play, Pause, RotateCcw, Mic, Square, Check, ChevronLeft, ChevronRight, Clock3, LockKeyhole, Lightbulb, Quote, History, Save, CircleHelp } from 'lucide-react';
import { useWorkspace } from '../../lib/store';
import { answerChecklist, formatDate, getQuestions, id } from '../../lib/domain';
import { useVoiceNote } from '../../lib/useVoiceNote';
import type { Application } from '../../lib/types';
import { Button, CheckItem, CompanyMark, EmptyState, IconButton, Note, PageHeading, Tag } from '../../components/ui';

function clock(seconds: number) { return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`; }
function PracticeRoom({ application }: { application: Application }) {
  const { state, update, notify } = useWorkspace();
  const questions = useMemo(() => getQuestions(application, state.documents), [application, state.documents]);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState('practice');
  const [answer, setAnswer] = useState('');
  const [confidence, setConfidence] = useState<'again' | 'ready'>('again');
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const current = questions[Math.min(index, questions.length - 1)];
  const sourceDocument = current?.source === 'document' ? state.documents.find(d => d.id === current.reference) : undefined;
  const referenceLabel = sourceDocument ? `${sourceDocument.title} · ${sourceDocument.kind} v${sourceDocument.version}` : `${application.jobSnapshot.company} · 보관한 공고 원문`;
  const entries = state.practice.filter(p => p.applicationId === application.id);
  const voice = useVoiceNote(current?.id ?? '', notify);
  const latestSubmission = application.submissions.at(-1);
  const answeredCount = new Set(entries.filter(p => questions.some(q => q.id === p.questionId)).map(p => p.questionId)).size;
  useEffect(() => {
    const previous = entries.filter(p => p.questionId === current?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    setAnswer(previous?.answer ?? ''); setConfidence(previous?.confidence ?? 'again'); setSeconds(0); setRunning(false); setShowHint(false);
  }, [current?.id]);
  useEffect(() => {
    if (!running) return;
    const start = Date.now() - seconds * 1000;
    const timer = window.setInterval(() => setSeconds(Math.min(3600, Math.floor((Date.now() - start) / 1000))), 250);
    return () => window.clearInterval(timer);
  }, [running]);
  const save = (next = false) => {
    if (voice.recording || voice.starting) { notify('녹음을 먼저 마쳐주세요.'); return; }
    if (!answer.trim() && !voice.audioData) { notify('글로 답하거나 음성을 녹음한 뒤 저장해주세요.'); return; }
    if (!current) return;
    const entry = { id: id(), applicationId: application.id, questionId: current.id, question: current.question, answer: answer.trim(), confidence, createdAt: new Date().toISOString(), ...(voice.audioData ? { audioData: voice.audioData } : {}) };
    update(s => ({ ...s, practice: [entry, ...s.practice] })); setRunning(false); voice.clear();
    notify('답변을 이 기기에 저장했어요. 연습 기록에서 다시 볼 수 있어요.');
    if (next && index < questions.length - 1) setIndex(i => i + 1);
  };
  if (!current) return <EmptyState title="질문을 준비할 자료가 없어요" description="공고 원문이나 제출본을 먼저 추가해주세요."/>;
  return <><div className="interview-session-bar"><div className="session-source"><LockKeyhole size={17}/><div><strong>{latestSubmission ? '확정한 제출본으로 준비 중' : '공고 원문으로 준비 중'}</strong><span>{latestSubmission ? `${latestSubmission.documentIds.length}개 서류 · ${formatDate(latestSubmission.createdAt)} 제출 기록` : '서류를 연결하면 제출한 버전의 근거도 함께 보여요.'}</span></div></div><Tag tone="blue">규칙 기반 질문 · AI 분석 아님</Tag><div className="session-mode"><button onClick={() => setMode('practice')} className={mode === 'practice' ? 'active' : ''}>질문 연습</button><button onClick={() => { voice.stop(); setRunning(false); setMode('history'); }} className={mode === 'history' ? 'active' : ''}><History size={14}/>연습 기록 {entries.length}</button></div></div>
    {mode === 'practice' ? <div className="practice-layout"><aside className="question-sidebar"><div className="question-sidebar-head"><h2>이번에 준비할 질문</h2><span>{answeredCount}/{questions.length}</span></div><div className="question-progress"><span style={{ width: `${answeredCount / Math.max(1, questions.length) * 100}%` }}/></div><nav aria-label="면접 질문 목록">{questions.map((q, i) => { const saved = entries.some(p => p.questionId === q.id); return <button key={q.id} disabled={voice.recording || voice.starting} className={`question-nav-item ${current.id === q.id ? 'active' : ''}`} onClick={() => setIndex(i)}><span className={saved ? 'answered' : ''}>{saved ? <Check size={13}/> : String(i + 1).padStart(2, '0')}</span><div><small>{q.topic}</small><strong>{q.question}</strong></div>{current.id === q.id && <ChevronRight size={14}/>}</button>; })}</nav><div className="question-sidebar-note"><CircleHelp size={16}/><p>예상 질문은 준비를 돕는 자료예요. 실제 면접에서 나온다고 보장하지 않아요.</p></div></aside>
      <div className="practice-main"><section className="question-stage"><div className="question-stage-top"><span className="eyebrow">QUESTION {String(index + 1).padStart(2, '0')} <span className="muted">/ {String(questions.length).padStart(2, '0')}</span></span><Tag tone={current.source === 'document' ? 'blue' : 'neutral'}>{current.source === 'document' ? '제출 서류에서' : current.source === 'job' ? '공고에서' : '공통 질문'}</Tag></div><h2>{current.question}</h2><div className="question-source"><Quote size={19}/><div><strong>{referenceLabel}</strong><p>{current.evidence}</p></div></div><div className="question-hint-toggle"><button className="text-link" onClick={() => setShowHint(v => !v)}><Lightbulb size={16}/>{showHint ? '답변 가이드 접기' : '답변 방향 살펴보기'}<ChevronRight size={14} className={showHint ? 'rotated' : ''}/></button><span>{current.topic}</span></div>{showHint && <div className="answer-hint"><strong>이렇게 정리해보세요</strong><p>{current.hint}</p><span>이어서 연습할 질문</span><p>{current.followUp}</p></div>}</section>
      <section className="answer-section"><div className="answer-section-head"><h3>내 말로 답해보기</h3><div className={`practice-timer ${running ? 'running' : ''}`}><Clock3 size={14}/><span>{clock(seconds)}</span><IconButton label={running ? '타이머 일시정지' : '타이머 시작'} onClick={() => setRunning(v => !v)}>{running ? <Pause size={13}/> : <Play size={13}/>}</IconButton><IconButton label="타이머 초기화" onClick={() => { setRunning(false); setSeconds(0); }}><RotateCcw size={13}/></IconButton></div></div><label className="sr-only" htmlFor="interview-answer">면접 답변</label><textarea id="interview-answer" value={answer} maxLength={20000} onChange={e => setAnswer(e.target.value)} rows={8} placeholder="직접 해본 일을 중심으로, 상황 → 내가 한 일 → 결과 순서로 말해보세요. 말로 연습한 뒤 핵심만 적어도 좋아요."/><div className="answer-input-footer"><div className="voice-controls"><Button className={voice.recording ? 'recording-button' : ''} disabled={voice.starting} onClick={() => { if (voice.recording) voice.stop(); else { void voice.start(); } }}>{voice.recording ? <><Square size={13} fill="currentColor"/>녹음 마치기</> : <><Mic size={15}/>{voice.starting ? '마이크 여는 중' : '음성으로 연습'}</>}</Button><span>{voice.recording ? '녹음 중 · 최대 2분' : '녹음은 이 기기에만 저장돼요'}</span></div><span>{answer.length.toLocaleString()}자</span></div>{voice.audioData && <div className="audio-preview"><audio controls src={voice.audioData}/><Button variant="ghost" onClick={voice.clear}>녹음 지우기</Button><span>답변 저장을 눌러야 보관돼요. 음성 전사는 제공하지 않아요.</span></div>}
      {answer.trim() && <div className="answer-checks"><span>간단한 구성 체크 <small>규칙 기반 · 답변의 정확성을 평가하지 않아요</small></span><div>{answerChecklist(answer).map(c => <CheckItem key={c.label} checked={c.ok}>{c.label}</CheckItem>)}</div></div>}<div className="answer-confidence"><span>직접 돌아보면 어떤가요?</span><div><button className={confidence === 'again' ? 'selected' : ''} aria-pressed={confidence === 'again'} onClick={() => setConfidence('again')}><RotateCcw size={14}/>다시 연습할래요</button><button className={confidence === 'ready' ? 'selected' : ''} aria-pressed={confidence === 'ready'} onClick={() => setConfidence('ready')}><Check size={14}/>설명할 수 있어요</button></div></div><div className="answer-actions"><Button onClick={() => setIndex(i => Math.max(0, i - 1))} disabled={index === 0 || voice.recording || voice.starting}><ChevronLeft size={15}/>이전 질문</Button><div><Button onClick={() => save(false)} disabled={voice.recording || voice.starting || (!answer.trim() && !voice.audioData)}><Save size={15}/>답변 저장</Button><Button variant="primary" onClick={() => save(true)} disabled={voice.recording || voice.starting || (!answer.trim() && !voice.audioData)}>{index === questions.length - 1 ? '이번 답변 마무리' : '저장하고 다음'}<ArrowRight size={16}/></Button></div></div></section></div></div> : <section className="panel practice-history"><div className="section-title"><h2>조금씩 나아지는 내 답변</h2><span>{entries.length}개 기록</span></div>{entries.length ? [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((entry, i) => <details className="practice-history-entry" key={entry.id} open={i === 0}><summary><span className="history-entry-icon"><MessageCircle size={17}/></span><div><strong>{entry.question}</strong><span>{new Date(entry.createdAt).toLocaleString('ko-KR')}</span></div><Tag tone={entry.confidence === 'ready' ? 'green' : 'orange'}>{entry.confidence === 'ready' ? '설명 가능' : '다시 연습'}</Tag></summary><div className="history-entry-body">{entry.answer && <p className="prose-text">{entry.answer}</p>}{entry.audioData && <audio controls src={entry.audioData}/>}</div></details>) : <EmptyState title="첫 답변을 남겨볼까요?" description="질문 연습에서 저장한 글과 음성 답변을 여기서 다시 볼 수 있어요." action={<Button onClick={() => setMode('practice')}>질문 연습 시작<ArrowRight size={15}/></Button>}/>}</section>}
  </>;
}
export default function Interview() {
  const { state } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const selected = state.applications.find(a => a.id === params.get('application')) ?? state.applications.find(a => a.stage === 'interview') ?? state.applications[0];
  return <div className="page-enter interview-page"><PageHeading eyebrow="MAKE IT YOUR WORDS" title="내 이야기로, 흔들림 없이" description="막연한 예상 질문 대신, 내가 제출한 경험에서 준비를 시작해요." action={selected && <label className="interview-application-select"><CompanyMark job={selected.jobSnapshot} small/><select aria-label="면접을 준비할 지원 건" value={selected.id} onChange={e => setParams({ application: e.target.value })}>{state.applications.map(a => <option key={a.id} value={a.id}>{a.jobSnapshot.company} · {a.jobSnapshot.title}{a.isDemo ? ' (예시)' : ''}</option>)}</select></label>}/>{selected ? <PracticeRoom key={selected.id} application={selected}/> : <div className="panel"><EmptyState title="먼저 지원 준비 공간을 만들어주세요" description="공고를 선택하고 ‘지원 준비하기’를 누르면 그 공고와 제출 서류를 바탕으로 연습할 수 있어요." action={<Link to="/app/jobs" className="button primary">공고 탐색<ArrowRight size={16}/></Link>}/></div>}</div>;
}
