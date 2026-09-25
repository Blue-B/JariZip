import { useEffect, useRef, useState } from 'react';

/** Records only after an explicit user click; tracks stop on navigation/unmount. */
export function useVoiceNote(questionId: string, notify: (message: string) => void) {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [audioData, setAudioData] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const limit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanup = () => {
    if (limit.current) clearTimeout(limit.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
  };
  useEffect(() => {
    generation.current++;
    cleanup();
    setRecording(false); setStarting(false); setAudioData('');
    return () => { generation.current++; cleanup(); };
  }, [questionId]);
  const stop = () => { cleanup(); setRecording(false); };
  const start = async () => {
    if (recording || starting) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { notify('이 브라우저에서는 녹음할 수 없어요. HTTPS 또는 localhost에서 지원되는 브라우저로 열어주세요.'); return; }
    const current = ++generation.current;
    setStarting(true); setAudioData('');
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (current !== generation.current) { input.getTracks().forEach(t => t.stop()); return; }
      stream.current = input;
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(input, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined);
      recorder.current = rec;
      const chunks: BlobPart[] = [];
      rec.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      rec.onstop = () => {
        input.getTracks().forEach(t => t.stop());
        if (current !== generation.current) return;
        setRecording(false);
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        if (blob.size > 3 * 1024 * 1024) { notify('녹음 용량이 커서 저장하지 못했어요. 답변을 더 짧게 녹음해주세요.'); return; }
        const reader = new FileReader();
        reader.onload = () => { if (current === generation.current) setAudioData(String(reader.result)); };
        reader.onerror = () => notify('녹음을 읽지 못했어요. 다시 녹음해주세요.');
        reader.readAsDataURL(blob);
      };
      rec.onerror = () => { stop(); notify('녹음 중 문제가 생겼어요. 마이크 권한과 장치를 확인해주세요.'); };
      rec.start(1000); setRecording(true); setStarting(false);
      limit.current = setTimeout(() => { if (current === generation.current) { stop(); notify('2분이 되어 녹음을 마쳤어요. 저장 버튼을 눌러 답변에 보관해주세요.'); } }, 120000);
    } catch (error) {
      cleanup();
      if (current === generation.current) { setStarting(false); setRecording(false); notify(error instanceof DOMException && error.name === 'NotAllowedError' ? '마이크 권한이 허용되지 않았어요. 글로 답변하거나 브라우저에서 권한을 변경해주세요.' : '마이크를 열지 못했어요. 글로도 답변을 연습할 수 있어요.'); }
    }
  };
  return { recording, starting, audioData, start, stop, clear: () => setAudioData('') };
}
