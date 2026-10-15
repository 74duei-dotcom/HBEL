'use client';
// 설정: 문장 듣기 음성 선택 (오픈소스 음성 / Gemini 음성) + 소리 확인
import { useEffect, useState } from 'react';
import { getGeminiKeys } from '@/lib/ai';
import { getTtsEngine, isMobileDevice, setTtsEngine, testGeminiVoice, testLocalVoice } from '@/lib/speech';
import type { TtsEngine } from '@/lib/speech';
import { errorMessage } from '@/lib/util';

export function VoiceSettings() {
  const [engine, setEngine] = useState<TtsEngine>('local');
  const [mobile, setMobile] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    setEngine(getTtsEngine());
    setHasKey(getGeminiKeys().length > 0);
    setMobile(isMobileDevice());
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
      if (engine === 'local') await testLocalVoice();
      else await testGeminiVoice();
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
        {!mobile && (
          <button role="tab" aria-selected={engine === 'local'} onClick={() => pick('local')}>
            오픈소스 음성
          </button>
        )}
        <button role="tab" aria-selected={engine === 'gemini'} onClick={() => pick('gemini')}>
          Gemini 음성
        </button>
      </div>
      {mobile && <span className="small">이 기기(핸드폰·태블릿)는 메모리가 부족해 오픈소스 음성을 쓸 수 없어요. Gemini 음성을 사용합니다.</span>}
      <span className="small">
        오픈소스 음성(Kokoro)은 이 기기 안에서 직접 만들어서 키·사용 한도가 없고, 한 번 내려받으면(약 90MB) 인터넷 없이도 돼요. 처음 한 번은 내려받느라 시간이 걸리고, 그동안은 기기 음성으로 읽어요. 핸드폰에서는 계산이 느리고 메모리를 많이 써서, 직접 고르지 않으면 Gemini 음성(또는 기기 음성)을 써요.
      </span>
      <span className="small">
        Gemini 음성은 더 자연스러운 원어민 소리예요. 한 번 만든 소리는 이 기기에 저장해서 같은 문장은 다시 요청하지 않아요. 한도에 걸리면 오픈소스 음성으로 대신 읽어 줘요.
      </span>
      {engine !== 'local' && !hasKey && <div className="banner warn">Gemini 음성을 쓰려면 위의 AI 연결에서 Gemini 키를 넣어 주세요.</div>}
      {msg && <div className="banner err">{msg}</div>}
      {ok && <div className="banner info">{ok}</div>}
      <button className="btn" disabled={busy || (engine !== 'local' && !hasKey)} onClick={() => void test()}>
        {busy ? (engine === 'local' ? '내려받고 만드는 중… (처음엔 1~2분)' : '만드는 중…') : engine === 'local' ? '오픈소스 음성 소리 확인' : 'Gemini 음성 소리 확인'}
      </button>
    </div>
  );
}
