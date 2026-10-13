'use client';
// AI 연결: 제공자(Claude/Gemini) 고르기 → 키 입력 → 확인하고 저장 (설정·처음 설정 화면 공통)
import { useEffect, useState } from 'react';
import {
  addGeminiKey,
  getAIKey,
  getGeminiKeys,
  getProvider,
  MAX_GEMINI_KEYS,
  maskKey,
  PROVIDER_LABEL,
  removeGeminiKey,
  setClaudeKey,
  setProvider,
  testClaudeKey,
  testGeminiKey,
  type AIProvider,
} from '@/lib/ai';
import { errorMessage } from '@/lib/util';

const HELP: Record<AIProvider, { placeholder: string; text: string }> = {
  claude: {
    placeholder: 'sk-ant-…',
    text: '키는 Claude 콘솔(platform.claude.com)에서 만들 수 있어요. 이 기기에만 저장되고, 코드나 드라이브에는 올라가지 않아요.',
  },
  gemini: {
    placeholder: 'AIza…',
    text: `aistudio.google.com → Get API key 에서 만든 키. 최대 ${MAX_GEMINI_KEYS}개까지 넣을 수 있고, 한 키의 무료 한도가 차면 다음 키로 자동으로 넘어가요. 무료 등급은 보낸 내용이 구글 서비스 개선에 쓰일 수 있으니 환자 정보는 올리지 마세요. 키는 이 기기에만 저장돼요.`,
  },
};

export function AIConnect({ onSaved, saveLabel = '확인하고 저장' }: { onSaved?: (provider: AIProvider) => void; saveLabel?: string }) {
  const [provider, setProv] = useState<AIProvider>('gemini');
  const [claudeKey, setClaudeSaved] = useState('');
  const [geminiKeys, setGeminiKeys] = useState<string[]>([]);
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    setProv(getProvider());
    setClaudeSaved(getAIKey('claude'));
    setGeminiKeys(getGeminiKeys());
  }, []);

  const pick = (p: AIProvider) => {
    setProvider(p);
    setProv(p);
    setKeyInput('');
    setMsg('');
    setOk('');
  };

  const save = async () => {
    const k = keyInput.trim();
    if (provider === 'claude' && !k.startsWith('sk-ant-')) {
      setMsg('Claude API 키는 보통 "sk-ant-"로 시작해요. 다시 확인해 주세요.');
      return;
    }
    setBusy(true);
    setMsg('');
    setOk('');
    try {
      if (provider === 'gemini') {
        if (geminiKeys.includes(k)) throw new Error('이미 넣은 키예요.');
        await testGeminiKey(k);
        addGeminiKey(k);
        setGeminiKeys(getGeminiKeys());
        setOk(`Gemini 키를 저장했어요. (${getGeminiKeys().length}/${MAX_GEMINI_KEYS})`);
      } else {
        const prev = getAIKey('claude');
        setClaudeKey(k);
        try {
          await testClaudeKey();
        } catch (e) {
          setClaudeKey(prev);
          throw e;
        }
        setClaudeSaved(getAIKey('claude'));
        setOk('Claude 키를 저장했어요.');
      }
      setKeyInput('');
      onSaved?.(provider);
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

  const hasKey = provider === 'gemini' ? geminiKeys.length > 0 : !!claudeKey;
  const full = provider === 'gemini' && geminiKeys.length >= MAX_GEMINI_KEYS;

  return (
    <div className="stack">
      <div className="seg" role="radiogroup" aria-label="AI 제공자" style={{ padding: 3 }}>
        {(['gemini', 'claude'] as AIProvider[]).map((p) => (
          <button key={p} role="radio" aria-checked={provider === p} onClick={() => pick(p)} disabled={busy}>
            {PROVIDER_LABEL[p]}
            {(p === 'gemini' ? geminiKeys.length > 0 : !!claudeKey) ? ' ✓' : ''}
          </button>
        ))}
      </div>
      {provider === 'gemini' ? (
        <div className="stack" style={{ gap: 8 }}>
          <div className="between">
            <span style={{ fontSize: 15 }}>Gemini API 키 ({geminiKeys.length}/{MAX_GEMINI_KEYS})</span>
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
      ) : (
        <div className="between">
          <span className="stack" style={{ gap: 2 }}>
            <span style={{ fontSize: 15 }}>Claude API 키</span>
            <span className="small">{claudeKey ? maskKey(claudeKey) : '입력되지 않음'} · 번역·한글 발음·용어 사전</span>
          </span>
          <span className={`chip ${hasKey ? 'ok' : 'warn'}`}>{hasKey ? '저장됨' : '필요'}</span>
        </div>
      )}
      {full ? (
        <span className="small">키를 {MAX_GEMINI_KEYS}개 모두 넣었어요. 바꾸려면 위에서 하나를 삭제한 뒤 새 키를 넣어 주세요.</span>
      ) : (
        <label className="field">
          {provider === 'gemini' ? (hasKey ? '키 추가하기' : '키 입력') : claudeKey ? '새 키로 바꾸기' : '키 입력'}
          <input className="input" type="password" autoComplete="off" placeholder={HELP[provider].placeholder} value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
        </label>
      )}
      <span className="small">{HELP[provider].text}</span>
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
