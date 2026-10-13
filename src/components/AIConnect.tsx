'use client';
// AI 연결(Gemini): 키 입력 → 확인하고 저장 (설정·처음 설정 화면 공통)
import { useEffect, useState } from 'react';
import { addGeminiKey, getGeminiKeys, MAX_GEMINI_KEYS, maskKey, removeGeminiKey, testGeminiKey, type AIProvider } from '@/lib/ai';
import { errorMessage } from '@/lib/util';

const HELP = `aistudio.google.com → Get API key 에서 만든 키. 최대 ${MAX_GEMINI_KEYS}개까지 넣을 수 있고, 한 키의 무료 한도가 차면 다음 키로 자동으로 넘어가요. 무료 등급은 보낸 내용이 구글 서비스 개선에 쓰일 수 있으니 환자 정보는 올리지 마세요. 키는 이 기기에만 저장돼요.`;

export function AIConnect({ onSaved, saveLabel = '확인하고 저장' }: { onSaved?: (provider: AIProvider) => void; saveLabel?: string }) {
  const [geminiKeys, setGeminiKeys] = useState<string[]>([]);
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    setGeminiKeys(getGeminiKeys());
    try {
      // 예전에 저장한 Claude 키·선택값은 더 쓰지 않으므로 이 기기에서 지움
      localStorage.removeItem('el.claudeKey');
      localStorage.removeItem('el.aiProvider');
    } catch {
      /* 무시 */
    }
  }, []);

  const save = async () => {
    const k = keyInput.trim();
    setBusy(true);
    setMsg('');
    setOk('');
    try {
      if (geminiKeys.includes(k)) throw new Error('이미 넣은 키예요.');
      await testGeminiKey(k);
      addGeminiKey(k);
      setGeminiKeys(getGeminiKeys());
      setOk(`Gemini 키를 저장했어요. (${getGeminiKeys().length}/${MAX_GEMINI_KEYS})`);
      setKeyInput('');
      onSaved?.('gemini');
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = (i: number) => {
    if (!window.confirm(`Gemini 키 ${i + 1}번을 지울까요?`)) return;
    removeGeminiKey(i);
    setGeminiKeys(getGeminiKeys());
    setMsg('');
    setOk('');
  };

  const hasKey = geminiKeys.length > 0;
  const full = geminiKeys.length >= MAX_GEMINI_KEYS;

  return (
    <div className="stack">
      <div className="stack" style={{ gap: 8 }}>
        <div className="between">
          <span style={{ fontSize: 15 }}>
            Gemini API 키 ({geminiKeys.length}/{MAX_GEMINI_KEYS})
          </span>
          <span className={`chip ${hasKey ? 'ok' : 'warn'}`}>{hasKey ? '저장됨' : '필요'}</span>
        </div>
        {geminiKeys.map((k, i) => (
          <div key={k} className="between" style={{ gap: 8 }}>
            <span className="small" style={{ fontSize: 14 }}>
              {i + 1}번 · {maskKey(k)}
            </span>
            <button className="btn danger" disabled={busy} onClick={() => remove(i)} style={{ minHeight: 36, padding: '0 12px' }}>
              삭제
            </button>
          </div>
        ))}
      </div>
      {full ? (
        <span className="small">키를 {MAX_GEMINI_KEYS}개 모두 넣었어요. 바꾸려면 위에서 하나를 삭제한 뒤 새 키를 넣어 주세요.</span>
      ) : (
        <label className="field">
          {hasKey ? '키 추가하기' : '키 입력'}
          <input className="input" type="password" autoComplete="off" placeholder="AIza…" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
        </label>
      )}
      <span className="small">{HELP}</span>
      {msg && <div className="banner err">{msg}</div>}
      {ok && <div className="banner info">{ok}</div>}
      {!full && (
        <button className="btn primary" disabled={busy || !keyInput.trim()} onClick={save}>
          {busy ? '확인 중…' : saveLabel}
        </button>
      )}
    </div>
  );
}
