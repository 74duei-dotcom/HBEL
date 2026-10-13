'use client';
// 발음 연습(쉐도잉): 내 자료 문장 고르기 → 원어민 소리 듣기 → 따라 읽고 녹음 → 평가
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { activeDocs, loadDocContent, useStore } from '@/lib/store';
import { getGeminiKeys } from '@/lib/ai';
import { canRecord, evaluatePronunciation, startRecording } from '@/lib/pronounce';
import type { PronResult, Recording } from '@/lib/pronounce';
import { canSpeak, speak, stopSpeaking } from '@/lib/speech';
import type { DocContent } from '@/lib/types';
import { errorMessage } from '@/lib/util';
import { TabBar } from '@/components/TabBar';
import { Icon } from '@/components/Icon';

const MAX_SECONDS = 40;

function Practice({ sentence, onBack }: { sentence: string; onBack: () => void }) {
  const [state, setState] = useState<'idle' | 'recording' | 'evaluating'>('idle');
  const [result, setResult] = useState<PronResult | null>(null);
  const [err, setErr] = useState('');
  const [myUrl, setMyUrl] = useState('');
  const [secs, setSecs] = useState(0);
  const rec = useRef<Recording | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasKey = getGeminiKeys().length > 0;

  useEffect(
    () => () => {
      stopSpeaking();
      rec.current?.cancel();
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  useEffect(() => () => {
    if (myUrl) URL.revokeObjectURL(myUrl);
  }, [myUrl]);

  const finish = async () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    if (timer.current) clearInterval(timer.current);
    setState('evaluating');
    try {
      const blob = await r.stop();
      setMyUrl(URL.createObjectURL(blob));
      setResult(await evaluatePronunciation(sentence, blob));
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setState('idle');
    }
  };

  const begin = async () => {
    stopSpeaking();
    setErr('');
    setResult(null);
    try {
      rec.current = await startRecording();
    } catch (e) {
      setErr(errorMessage(e));
      return;
    }
    setSecs(0);
    setState('recording');
    let n = 0;
    timer.current = setInterval(() => {
      n++;
      setSecs(n);
      if (n >= MAX_SECONDS) void finish();
    }, 1000);
  };

  const words = result?.words ?? [];
  const bad = words.filter((w) => !w.ok && w.tip);

  return (
    <main className="page no-tabs">
      <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
        <Icon name="back" size={16} /> 문장 목록
      </button>

      <div className="card stack">
        <span style={{ fontFamily: 'var(--font-read)', fontSize: 19, lineHeight: 1.6 }}>{sentence}</span>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn grow" disabled={!canSpeak()} onClick={() => speak(sentence)}>
            <Icon name="speaker" size={18} /> 원어민 소리 듣기
          </button>
          <button className="btn" disabled={!canSpeak()} onClick={() => speak(sentence, 0.7)}>
            천천히
          </button>
        </div>
      </div>

      {!hasKey && <div className="banner warn">발음 평가는 Gemini 키가 필요해요. 설정의 AI 연결에서 Gemini 키를 넣어 주세요.</div>}
      {!canRecord() && <div className="banner err">이 브라우저에서는 녹음을 쓸 수 없어요.</div>}
      {err && <div className="banner err">{err}</div>}

      {state === 'recording' ? (
        <button className="btn danger" style={{ minHeight: 64, fontSize: 17 }} onClick={() => void finish()}>
          ● 녹음 중 {secs}초 — 누르면 끝내고 평가
        </button>
      ) : (
        <button className="btn primary" style={{ minHeight: 64, fontSize: 17 }} disabled={state === 'evaluating' || !hasKey || !canRecord()} onClick={() => void begin()}>
          <Icon name="mic" size={20} /> {state === 'evaluating' ? '평가하는 중…' : result ? '다시 녹음하기' : '따라 읽고 녹음하기'}
        </button>
      )}
      <span className="small">원어민 소리를 먼저 듣고, 바로 이어서 따라 읽어 보세요. 녹음은 평가할 때만 Gemini로 보내고 저장하지 않아요.</span>

      {state === 'evaluating' && (
        <div className="stack" role="status">
          <span className="skeleton" style={{ width: '70%' }} />
          <span className="skeleton" style={{ width: '50%' }} />
        </div>
      )}

      {result && (
        <div className="stack">
          <div className="card stack" style={{ alignItems: 'center', textAlign: 'center', gap: 4 }}>
            <b style={{ fontSize: 40, color: result.score >= 80 ? 'var(--teal)' : result.score >= 60 ? '#8a5a00' : 'var(--red)' }}>{result.score}점</b>
            <span>{result.summary}</span>
          </div>

          {words.length > 0 && (
            <div className="card stack" style={{ gap: 8 }}>
              <b>단어별 결과</b>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {words.map((w, i) => (
                  <span key={i} className={`chip ${w.ok ? 'ok' : 'err'}`} style={{ fontFamily: 'var(--font-read)', fontSize: 15 }}>
                    {w.word}
                  </span>
                ))}
              </div>
              {bad.map((w, i) => (
                <div key={i} className="small">
                  <b style={{ fontFamily: 'var(--font-read)' }}>{w.word}</b> · {w.tip}
                </div>
              ))}
            </div>
          )}

          {result.heard && (
            <div className="card stack" style={{ gap: 4 }}>
              <b>AI가 들은 문장</b>
              <span style={{ fontFamily: 'var(--font-read)' }}>{result.heard}</span>
            </div>
          )}
          {myUrl && <audio controls src={myUrl} style={{ width: '100%' }} />}
          <span className="small">AI가 소리를 듣고 판단한 결과라 점수는 참고용이에요. 같은 문장을 여러 번 읽어 보며 점수가 오르는지 보세요.</span>
        </div>
      )}
    </main>
  );
}

function PronounceInner() {
  const { data, ready } = useStore();
  const params = useSearchParams();
  const docs = activeDocs(data).filter((d) => d.status === 'ready');
  const [docId, setDocId] = useState(params.get('id') ?? '');
  const [page, setPage] = useState(Number(params.get('p') ?? 0) || 0);
  const [content, setContent] = useState<DocContent | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [custom, setCustom] = useState('');
  const [sentence, setSentence] = useState('');

  useEffect(() => {
    if (!docId && docs.length) setDocId(docs[0].id);
  }, [docId, docs]);

  useEffect(() => {
    if (!docId) return;
    let cancelled = false;
    setContent(null);
    setLoadErr('');
    loadDocContent(docId)
      .then((c) => {
        if (!cancelled) setContent(c);
      })
      .catch((e) => {
        if (!cancelled) setLoadErr(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [docId]);

  if (sentence) return <Practice sentence={sentence} onBack={() => setSentence('')} />;

  const pages = content?.pages.length ?? 0;
  const sentences = (content?.pages[Math.min(page, Math.max(0, pages - 1))]?.sentences ?? []).filter((s) => s.trim().length > 3);
  const shown = Math.min(page, Math.max(0, pages - 1));

  return (
    <>
      <main className="page">
        <h1 className="page-title">발음 연습</h1>
        <div className="muted">내 자료의 문장을 원어민 소리로 듣고, 따라 읽은 것을 AI가 평가해 줘요.</div>

        <div className="card stack">
          <b>직접 문장 입력</b>
          <textarea className="input" rows={2} style={{ padding: 10, fontFamily: 'var(--font-read)' }} placeholder="연습할 영어 문장을 붙여 넣으세요" value={custom} onChange={(e) => setCustom(e.target.value)} />
          <button className="btn primary" disabled={!custom.trim()} onClick={() => setSentence(custom.trim())}>
            이 문장으로 연습
          </button>
        </div>

        {ready && docs.length === 0 ? (
          <div className="muted">내 자료를 올리면 여기서 그 문장으로 연습할 수 있어요.</div>
        ) : (
          <>
            <label className="stack" style={{ gap: 4 }}>
              <b>내 자료에서 고르기</b>
              <select className="input" value={docId} onChange={(e) => { setDocId(e.target.value); setPage(0); }}>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </label>
            {loadErr && <div className="banner err">{loadErr}</div>}
            {content && (
              <>
                <div className="between">
                  <button className="btn sm" disabled={shown <= 0} onClick={() => setPage(shown - 1)}>
                    이전 쪽
                  </button>
                  <b>
                    {shown + 1} / {pages}쪽
                  </b>
                  <button className="btn sm" disabled={shown >= pages - 1} onClick={() => setPage(shown + 1)}>
                    다음 쪽
                  </button>
                </div>
                {sentences.length === 0 ? (
                  <div className="muted">이 쪽에는 연습할 문장이 없어요.</div>
                ) : (
                  <div className="card flush">
                    {sentences.map((s, i) => (
                      <button key={i} className="list-row" style={{ textAlign: 'left' }} onClick={() => setSentence(s)}>
                        <span className="grow" style={{ fontFamily: 'var(--font-read)', fontSize: 15, lineHeight: 1.5 }}>
                          {s}
                        </span>
                        <Icon name="mic" size={18} />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
      <TabBar />
    </>
  );
}

export default function PronouncePage() {
  return (
    <Suspense fallback={<main className="page muted">불러오는 중…</main>}>
      <PronounceInner />
    </Suspense>
  );
}
