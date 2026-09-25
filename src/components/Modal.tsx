import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// A reference count keeps body scroll locked while any nested dialog is open.
let modalLocks = 0;
let previousOverflow = '';

export function Modal({ title, description, children, onClose, size = 'normal' }: { title: string; description?: string; children: ReactNode; onClose: () => void; size?: 'normal' | 'wide' | 'drawer' }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const active = document.activeElement as HTMLElement | null;
    if (modalLocks === 0) previousOverflow = document.body.style.overflow;
    modalLocks += 1;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => {
      dialog?.close();
      modalLocks = Math.max(0, modalLocks - 1);
      if (modalLocks === 0) document.body.style.overflow = previousOverflow;
      if (active?.isConnected) active.focus?.();
    };
  }, []);
  return createPortal(<dialog ref={ref} className={`modal modal--${size}`} aria-labelledby={titleId} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => {
    if (e.target !== e.currentTarget) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
  }}><div className="modal-header"><div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div><button type="button" aria-label="닫기" className="icon-button" onClick={onClose}><X size={21}/></button></div><div className="modal-body">{children}</div></dialog>, document.body);
}
export function ConfirmDialog({ title, description, confirmLabel = '확인', onConfirm, onClose, danger = false }: { title: string; description: string; confirmLabel?: string; onConfirm: () => void; onClose: () => void; danger?: boolean }) {
  return <Modal title={title} onClose={onClose}><p className="confirm-description">{description}</p><div className="form-actions"><button className="button secondary" onClick={onClose}>취소</button><button className={`button ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>{confirmLabel}</button></div></Modal>;
}
