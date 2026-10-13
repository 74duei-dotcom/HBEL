'use client';
// 설정: 문장 듣기 음성 선택 (Gemini 음성 / 기기 내장 음성) + 소리 확인
import { useEffect, useState } from 'react';
import { getGeminiKeys } from '@/lib/ai';
import { getTtsEngine, setTtsEngine, testGeminiVoice } from '@/lib/speech';
import type { TtsEngine } from '@/lib/speech';
import { errorMessage } from '@/lib/util';

export function VoiceSettings() {
  const [engine, setEngine] = useState<TtsEngine>('device');
  const [hasKey, setHasKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    setEngine(getTtsEngine());
    setHasKey(getGeminiKeys().length > 0);
  }, []);

  const pick = (e: TtsEngine) => {
    setEngine(e);
    setTtsEngine(e);
  };

  const test = async () => {
    setBusy(true);
    setMsg('');
    setOk('');
    try {
      await testGeminiVoice();
      setOk('소리가 났나요? 났다면 잘 연결된 거예요.');
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={engine === 'gemini'} onClick={() => pick('gemini')}>
          Gemini 음성
        </button>
        <button role="tab" aria-selected={engine === 'device'} onClick={() => pick('device')}>
          기기 내장 음성
        </button>
      </div>
      <span className="small">
        Gemini 음성은 더 자연스러운 원어민 소리예요. 한 번 만든 소리는 이 기기에 저장해서 같은 문장은 다시 요청하지 않아요. 실패하거나 한도에 걸리면 기기 내장 음성으로 대신 읽어 줘요.
      </span>
      {!hasKey && <div className="banner warn">Gemini 음성을 쓰려면 위의 AI 연결에서 Gemini 키를 넣어 주세요.</div>}
      {msg && <div className="banner err">{msg}</div>}
      {ok && <div className="banner info">{ok}</div>}
      <button className="btn" disabled={busy || !hasKey} onClick={() => void test()}>
        {busy ? '만드는 중…' : 'Gemini 음성 소리 확인'}
      </button>
    </div>
  );
}
