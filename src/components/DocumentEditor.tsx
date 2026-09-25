import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Eye, Save, Printer } from 'lucide-react';
import { useWorkspace } from '../lib/store';
import { DOCUMENT_KINDS, id } from '../lib/domain';
import type { DocumentKind, DocumentRecord, DocumentTemplate } from '../lib/types';
import { Button, Modal, Note, Tag } from './ui';

export function DocumentPaper({ doc }: { doc: Pick<DocumentRecord, 'title' | 'kind' | 'text'> }) {
  return <article className="document-paper"><div className="paper-brand"><span>J.</span><span>MY NEXT CHAPTER</span></div><div className="paper-heading"><p>{doc.kind}</p><h2>{doc.title || '문서 제목'}</h2></div><div className="paper-content">{doc.text ? doc.text.split('\n').map((line, i) => {
    if (line.startsWith('### ')) return <h4 key={i}>{line.slice(4)}</h4>;
    if (line.startsWith('## ')) return <h3 key={i}>{line.slice(3)}</h3>;
    if (line.startsWith('# ')) return <h3 key={i}>{line.slice(2)}</h3>;
    if (/^[-*] /.test(line)) return <p className="paper-bullet" key={i}>{line.slice(2)}</p>;
    return line.trim() ? <p key={i}>{line}</p> : <div key={i} className="paper-space"/>;
  }) : <p className="muted">내용을 쓰면 여기에서 미리 볼 수 있어요.</p>}</div></article>;
}
export function useDocumentPrint() {
  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  useEffect(() => {
    if (!doc) return;
    const clear = () => setDoc(null);
    window.addEventListener('afterprint', clear);
    const frame = requestAnimationFrame(() => { window.print(); });
    return () => { cancelAnimationFrame(frame); window.removeEventListener('afterprint', clear); };
  }, [doc]);
  return { print: (record: DocumentRecord) => setDoc(record), portal: doc ? createPortal(<div className="print-root"><DocumentPaper doc={doc}/></div>, document.body) : null };
}
export default function DocumentEditor({ initial, template, close, onSaved }: { initial?: DocumentRecord; template?: DocumentTemplate; close: () => void; onSaved?: (doc: DocumentRecord) => void }) {
  const { state, update, notify } = useWorkspace();
  const [title, setTitle] = useState(initial?.title ?? template?.title ?? '');
  const [kind, setKind] = useState<DocumentKind>(initial?.kind ?? template?.kind ?? '이력서');
  const [text, setText] = useState(initial?.text ?? template?.content ?? '');
  const [mobilePreview, setMobilePreview] = useState(false);
  const [error, setError] = useState('');
  const changed = !initial || title !== initial.title || text !== initial.text || kind !== initial.kind;
  const save = () => {
    if (!title.trim() || !text.trim()) { setError('제목과 본문을 모두 입력해주세요.'); return; }
    if (text.length > 100000) { setError('한 문서는 10만 자까지 저장할 수 있어요. 문서를 나눠주세요.'); return; }
    if (!changed) { close(); return; }
    const group = initial?.groupId ?? id();
    const version = Math.max(0, ...state.documents.filter(d => d.groupId === group).map(d => d.version)) + 1;
    const doc: DocumentRecord = { id: id(), groupId: group, title: title.trim(), kind, version, text, createdAt: new Date().toISOString(), isDemo: false, extractionNote: initial?.fileData ? '원본에서 읽은 내용을 직접 수정한 텍스트 버전이에요. 이전 버전의 원본 파일은 그대로 보관돼요.' : undefined };
    update(s => ({ ...s, documents: [doc, ...s.documents] })); notify(initial ? `새 버전 v${version}을 저장했어요. 기존 제출본은 바뀌지 않아요.` : '내 서류 보관함에 저장했어요.'); onSaved?.(doc); close();
  };
  return <Modal title={initial ? '내 이야기를 더 다듬기' : template ? '템플릿으로 내 이야기 시작' : '새 서류 작성'} description={initial ? `v${initial.version}에서 새 버전을 만들어요. 이전 파일과 제출 기록은 그대로 남아요.` : '제목과 내용을 직접 작성하고, 내 기기에 보관하세요.'} size="wide" onClose={close}><div className="editor-meta"><label>제목<input value={title} onChange={e => setTitle(e.target.value)} maxLength={100} placeholder="예: 백엔드 개발 이력서" autoFocus/></label><label>문서 종류<select value={kind} onChange={e => setKind(e.target.value as DocumentKind)}>{DOCUMENT_KINDS.map(k => <option key={k}>{k}</option>)}</select></label></div><div className="editor-toolbar"><span><FileText size={14}/>직접 작성 · 자동 생성 아님</span><span>{Array.from(text).length.toLocaleString()}자 <small>공백 포함</small></span><button className="text-link mobile-only" onClick={() => setMobilePreview(v => !v)}><Eye size={15}/>{mobilePreview ? '편집하기' : '미리 보기'}</button></div><div className={`document-editor-grid ${mobilePreview ? 'show-preview' : ''}`}><div className="editor-writing"><label className="sr-only" htmlFor="document-text">문서 본문</label><textarea id="document-text" className="document-textarea" value={text} maxLength={100000} onChange={e => setText(e.target.value)} placeholder={'## 소개\n어떤 일을 하는 사람인지 소개해보세요.\n\n## 경험\n상황, 내가 맡은 일, 변화한 결과를 정리해보세요.'}/></div><div className="editor-preview"><span className="preview-caption">텍스트 미리 보기 · 원본 파일 레이아웃과 다를 수 있어요</span><DocumentPaper doc={{ title, kind, text }}/></div></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="editor-help">제목은 <code>##</code>, 목록은 <code>-</code>로 구분할 수 있어요. 경험이나 수치는 직접 확인한 내용만 넣어주세요.</div><div className="form-actions"><Button onClick={close}>취소</Button><Button variant="primary" disabled={!changed || !title.trim() || !text.trim()} onClick={save}><Save size={16}/>{initial ? '새 버전으로 저장' : '내 서류에 저장'}</Button></div></Modal>;
}
