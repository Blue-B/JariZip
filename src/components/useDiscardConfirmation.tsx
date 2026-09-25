import { useCallback, useEffect, useState } from 'react';
import { Button, Modal } from './ui';

/** Keep typed work when a dialog is dismissed; never silently discard a draft. */
export function useDiscardConfirmation(dirty: boolean, close: () => void) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const requestClose = useCallback(() => {
    if (dirty) setConfirming(true);
    else close();
  }, [dirty, close]);

  const confirmation = confirming ? (
    <Modal title="변경 내용을 버릴까요?" description="아직 저장하지 않은 내용이 있어요. 계속 작성하거나, 변경을 버리고 닫을 수 있어요." onClose={() => setConfirming(false)}>
      <div className="form-actions">
        <Button onClick={() => setConfirming(false)}>계속 작성</Button>
        <Button variant="danger" onClick={() => { setConfirming(false); close(); }}>저장하지 않고 닫기</Button>
      </div>
    </Modal>
  ) : null;

  return { requestClose, confirmation };
}
