import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Upload, Plus, Search, FileText, Download, ArrowUpRight, MoreHorizontal, History, LockKeyhole, Pencil, Trash2, Printer, FolderOpen, X, Check } from 'lucide-react';
import { useWorkspace } from '../../lib/store';
import { DOCUMENT_KINDS, formatDate, latestDocuments } from '../../lib/domain';
import { downloadDocument, readDocumentFile } from '../../lib/files';
import type { DocumentKind, DocumentRecord } from '../../lib/types';
import { Button, ConfirmDialog, EmptyState, IconButton, Modal, Note, PageHeading, Tag } from '../../components/ui';
import DocumentEditor, { DocumentPaper, useDocumentPrint } from '../../components/DocumentEditor';

function DocumentViewer({ initial, close, edit }: { initial: DocumentRecord; close: () => void; edit: (doc: DocumentRecord) => void }) {
  const { state } = useWorkspace();
  const [selected, setSelected] = useState(initial.id);
  const versions = state.documents.filter(d => d.groupId === initial.groupId).sort((a, b) => b.version - a.version);
  const doc = versions.find(d => d.id === selected) ?? initial;
  const used = state.applications.filter(a => a.submissions.some(s => s.documentIds.includes(doc.id)));
  const { print, portal } = useDocumentPrint();
  return <><Modal title={doc.title} description={`${doc.kind} · v${doc.version} · ${formatDate(doc.createdAt)}`} size="wide" onClose={close}><div className="document-viewer-toolbar"><label className="version-select"><History size={15}/><select aria-label="문서 버전 선택" value={doc.id} onChange={e => setSelected(e.target.value)}>{versions.map(v => <option key={v.id} value={v.id}>v{v.version} · {formatDate(v.createdAt)}</option>)}</select></label><div><Button onClick={() => downloadDocument(doc)}><Download size={15}/>{doc.fileData ? '원본 받기' : '텍스트 받기'}</Button><Button onClick={() => print(doc)}><Printer size={15}/>인쇄·PDF</Button><Button variant="primary" onClick={() => { close(); edit(doc); }}><Pencil size={15}/>새 버전 편집</Button></div></div>{used.length > 0 && <Note tone="blue"><LockKeyhole size={13}/>이 버전은 {used.map(a => a.jobSnapshot.company).join(', ')}에 제출본으로 보관되어 있어요.</Note>}{doc.extractionNote && <Note tone="orange">{doc.extractionNote}</Note>}<div className="viewer-paper-wrap"><DocumentPaper doc={doc}/></div><p className="viewer-disclaimer">읽어온 텍스트를 정리한 미리 보기예요. 원본 파일의 이미지·표·레이아웃은 ‘원본 받기’로 확인해주세요.</p></Modal>{portal}</>;
}
export default function Documents() {
  const { state, update, notify } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState('전체');
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [editor, setEditor] = useState<DocumentRecord | 'new' | null>(null);
  const [viewId, setViewId] = useState(params.get('doc') ?? '');
  const [deleteGroup, setDeleteGroup] = useState<DocumentRecord | null>(null);
  const [uploadKind, setUploadKind] = useState<DocumentKind>('이력서');
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const doc = params.get('doc');
    if (doc) setViewId(doc);
    if (params.get('new') === '1') {
      setViewId('');
      setEditor('new');
      setParams(current => { current.delete('new'); return current; }, { replace: true });
    }
  }, [params, setParams]);
  const latest = latestDocuments(state.documents);
  const docs = useMemo(() => latest.filter(d => (kind === '전체' || d.kind === kind) && `${d.title} ${d.text}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [latest, kind, query]);
  const viewing = state.documents.find(d => d.id === viewId);
  const usedCount = new Set(state.applications.flatMap(a => a.submissions.flatMap(s => s.documentIds))).size;
  const upload = async (fileList: FileList | File[]) => {
    if (uploading) return;
    const files = Array.from(fileList);
    if (files.length > 5) { notify('한 번에 최대 5개 파일을 넣을 수 있어요.'); return; }
    setUploading(true);
    let success = 0;
    const errors: string[] = [];
    for (const file of files) {
      try {
        const doc = await readDocumentFile(file, uploadKind);
        update(s => {
          const related = s.documents.filter(d => d.title === doc.title && d.kind === doc.kind);
          const previous = related.sort((a, b) => b.version - a.version)[0];
          const record = previous ? { ...doc, groupId: previous.groupId, version: Math.max(...s.documents.filter(d => d.groupId === previous.groupId).map(d => d.version)) + 1 } : doc;
          return { ...s, documents: [record, ...s.documents] };
        }); success++;
      } catch (error) { errors.push(`${file.name}: ${error instanceof Error ? error.message : '읽지 못했어요.'}`); }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    notify(errors.length ? `${success ? `${success}개 저장. ` : ''}${errors.join(' / ')}` : `${success}개 파일을 내 기기에 보관했어요.`);
  };
  const requestDelete = (doc: DocumentRecord) => {
    const ids = new Set(state.documents.filter(d => d.groupId === doc.groupId).map(d => d.id));
    if (state.applications.some(a => a.submissions.some(s => s.documentIds.some(id => ids.has(id))))) { notify('제출 기록에 연결된 서류는 삭제할 수 없어요. 제출본을 보존하기 위한 제한이에요.'); return; }
    setDeleteGroup(doc);
  };
  return <div className="page-enter documents-page"><PageHeading eyebrow="COLLECT YOUR STORY" title="내 이야기가 쌓이는 서랍" description="이력서, 자소서, 포트폴리오. 파일은 모으고, 버전은 잃지 않도록." action={<><Link to="/app/templates" className="button secondary">템플릿 둘러보기<ArrowUpRight size={15}/></Link><Button variant="primary" onClick={() => setEditor('new')}><Plus size={16}/>새 서류 작성</Button></>}/>
    <div className={`upload-zone ${dragging ? 'dragging' : ''} ${uploading ? 'uploading' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files); }}><div className="upload-art" aria-hidden="true"><span className="upload-paper paper-back"/><span className="upload-paper paper-front"><FileText size={29}/></span><span className="upload-plus"><Plus size={13}/></span></div><div className="upload-copy"><h2>{uploading ? '파일을 읽고 있어요…' : dragging ? '여기에 놓아주세요' : '흩어져 있던 내 서류, 여기로.'}</h2><p>파일을 끌어 놓거나 선택해주세요. 같은 제목은 새 버전으로 쌓여요.</p><span>PDF · DOCX · TXT · MD / 파일당 최대 6MB / 한 번에 5개</span></div><div className="upload-controls"><label><span className="sr-only">업로드할 문서 종류</span><select value={uploadKind} onChange={e => setUploadKind(e.target.value as DocumentKind)}>{DOCUMENT_KINDS.map(k => <option key={k}>{k}</option>)}</select></label><Button onClick={() => fileRef.current?.click()} disabled={uploading}><Upload size={16}/>{uploading ? '읽는 중' : '파일 선택'}</Button><input type="file" multiple ref={fileRef} accept=".pdf,.docx,.txt,.md" className="sr-only" aria-label="서류 파일 선택" onChange={e => e.target.files && void upload(e.target.files)}/></div></div>
    <div className="library-toolbar"><div className="category-tabs" aria-label="서류 종류">{['전체', ...DOCUMENT_KINDS].map(k => <button key={k} aria-pressed={kind === k} className={kind === k ? 'selected' : ''} onClick={() => setKind(k)}>{k}{k === '전체' && <span>{latest.length}</span>}</button>)}</div><label className="search-input"><Search size={16}/><input aria-label="서류 검색" placeholder="제목·본문 검색" value={query} onChange={e => setQuery(e.target.value)}/></label></div><div className="library-counts"><span>{docs.length}개의 서류</span><span><History size={13}/>{state.documents.length}개 버전 보관</span><span><LockKeyhole size={13}/>{usedCount}개 버전이 제출본에 연결됨</span></div>
    <div className="document-grid">{docs.map(doc => { const versions = state.documents.filter(d => d.groupId === doc.groupId).length; const submitted = state.applications.some(a => a.submissions.some(s => s.documentIds.includes(doc.id))); return <article key={doc.id} className={`document-card doc-${DOCUMENT_KINDS.indexOf(doc.kind)}`}><button className="document-card-preview" onClick={() => { setViewId(doc.id); setParams({ doc: doc.id }); }} aria-label={`${doc.title} 미리 보기`}><div className="mini-paper"><span className="mini-paper-mark">J.</span><strong>{doc.title}</strong><span className="mini-paper-text">{doc.text.replace(/[#*]/g, '').slice(0, 110) || '원본 파일을 보관하고 있어요.'}</span><span className="mini-paper-lines"><i/><i/><i/></span></div><span className="doc-type-badge">{doc.kind}</span>{doc.isDemo && <span className="doc-demo-badge">예시</span>}</button><div className="document-card-body"><div className="document-title"><button onClick={() => setViewId(doc.id)}>{doc.title}</button><Tag>v{doc.version}</Tag></div><p>{formatDate(doc.createdAt)} · {versions}개 버전</p><div className="document-card-footer"><span className={submitted ? 'submitted-label' : 'draft-label'}>{submitted ? <><LockKeyhole size={12}/>제출본에 연결됨</> : <><Pencil size={12}/>내가 다듬는 중</>}</span><IconButton label={`${doc.title} 내려받기`} onClick={() => downloadDocument(doc)}><Download size={15}/></IconButton><IconButton label={`${doc.title} 삭제`} onClick={() => requestDelete(doc)}><Trash2 size={14}/></IconButton></div></div></article>; })}<button className="new-document-card" onClick={() => setEditor('new')}><span><Plus size={25}/></span><strong>새로운 이야기 한 장</strong><p>직접 쓰거나 템플릿으로 시작해요</p></button></div>
    {!docs.length && (query || kind !== '전체') && <EmptyState title="찾는 서류가 없어요" description="다른 검색어나 문서 종류를 선택해주세요."/>}<div className="library-bottom-note"><LockKeyhole size={17}/><p><strong>내 서류는 서버로 전송되지 않아요.</strong> 브라우저 데이터를 지우면 사라질 수 있으니, 설정에서 정기적으로 백업해주세요.</p><Link className="text-link" to="/app/settings">백업하기<ArrowUpRight size={15}/></Link></div>
    {editor && <DocumentEditor initial={editor === 'new' ? undefined : editor} close={() => setEditor(null)} onSaved={() => { setKind('전체'); setQuery(''); }}/>} {viewing && <DocumentViewer key={viewing.id} initial={viewing} close={() => { setViewId(''); setParams({}); }} edit={setEditor}/>} {deleteGroup && <ConfirmDialog title="이 서류를 보관함에서 삭제할까요?" description={`‘${deleteGroup.title}’의 모든 버전과 원본 파일이 이 브라우저에서 삭제돼요. 되돌리려면 미리 내려받은 백업 파일이 필요해요.`} confirmLabel="모든 버전 삭제" danger onClose={() => setDeleteGroup(null)} onConfirm={() => { update(s => ({ ...s, documents: s.documents.filter(d => d.groupId !== deleteGroup.groupId) })); setDeleteGroup(null); notify('해당 서류의 모든 버전을 삭제했어요.'); }}/>}</div>;
}
