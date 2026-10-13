'use client';
// AI 대화: 상황 고르기 → 영어로 대화(내 말 바로 교정) → 끝내기 누르면 정리
import { useEffect, useRef, useState } from 'react';
import { activeVocab, useStore } from '@/lib/store';
import { canListen, chatTurn, listen, reviewChat, SCENARIOS } from '@/lib/chat';
import type { ChatReview, ChatTurn, Scenario } from '@/lib/chat';
import { canSpeak, speak, stopSpeaking } from '@/lib/speech';
import { errorMessage } from '@/lib/util';
import { TabBar } from '@/components/TabBar';
import { Icon } from '@/components/Icon';

type Phase = 'pick' | 'talk' | 'review';

const SPEAK_KEY = 'el.chatSpeak';

export default function ChatPage() {
  const { data } = useStore();
  const [phase, setPhase] = useState<Phase>('pick');
  const [sc, setSc] = useState<Scenario | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [useGoal, setUseGoal] = useState(true);
  const [targets, setTargets] = useState<string[]>([]);
  const [voiceOn, setVoiceOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [review, setReview] = useState<ChatReview | null>(null);
  const stopListen = useRef<(() => void) | null>(null);
  // 말하기 세션 번호: 보내기·끝내기 뒤에 늦게 도착한 인식 결과가 입력창을 다시 채우지 않게 함
  const listenId = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setVoiceOn(window.localStorage.getItem(SPEAK_KEY) === '1');
    } catch {
      /* 무시 */
    }
    return () => {
      stopSpeaking();
      stopListen.current?.();
    };
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [turns, busy]);

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    if (!next) stopSpeaking();
    try {
      window.localStorage.setItem(SPEAK_KEY, next ? '1' : '0');
    } catch {
      /* 무시 */
    }
  };

  const start = (s: Scenario) => {
    // 공부 중인 단어 중 최근 것 3개를 오늘의 목표 단어로
    const words = activeVocab(data)
      .filter((v) => v.status === 'learning')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 3)
      .map((v) => v.lemma || v.word);
    const goal = useGoal ? words : [];
    setTargets(goal);
    setSc(s);
    setTurns([{ role: 'ai', text: s.opening }]);
    setDraft('');
    setErr('');
    setReview(null);
    setPhase('talk');
    if (voiceOn) speak(s.opening);
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || busy || !sc) return;
    listenId.current++;
    stopListen.current?.();
    stopSpeaking();
    const next: ChatTurn[] = [...turns, { role: 'me', text }];
    setTurns(next);
    setDraft('');
    setErr('');
    setBusy(true);
    try {
      const r = await chatTurn(sc, next, targets);
      setTurns((cur) => {
        const copy = [...cur];
        // 방금 보낸 내 말에 교정을 붙이고, AI 답을 추가
        const idx = copy.length - 1;
        if (copy[idx]?.role === 'me') copy[idx] = { ...copy[idx], tip: r.tip, better: r.better };
        return [...copy, { role: 'ai', text: r.reply }];
      });
      if (voiceOn) speak(r.reply);
    } catch (e) {
      setErr(errorMessage(e));
      // 실패하면 내 말을 입력창으로 되돌려 다시 보낼 수 있게
      setTurns(turns);
      setDraft(text);
    } finally {
      setBusy(false);
    }
  };

  const mic = () => {
    if (listening) {
      stopListen.current?.();
      return;
    }
    stopSpeaking();
    setErr('');
    setListening(true);
    const sid = ++listenId.current;
    stopListen.current = listen(
      (t) => {
        if (sid === listenId.current) setDraft(t);
      },
      (e) => {
        setListening(false);
        if (e) setErr(e);
      },
    );
  };

  const finish = async () => {
    if (!sc) return;
    stopSpeaking();
    listenId.current++;
    stopListen.current?.();
    if (!turns.some((t) => t.role === 'me')) {
      setPhase('pick');
      return;
    }
    setPhase('review');
    setReview(null);
    setErr('');
    setBusy(true);
    try {
      setReview(await reviewChat(sc, turns));
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'pick') {
    return (
      <>
        <main className="page">
          <h1 className="page-title">AI 대화</h1>
          <div className="muted">상황을 고르면 AI가 상대 역할을 해요. 영어로 말하면 바로 교정해 주고, 끝나면 정리해 줘요.</div>
          <div className="stack">
            {SCENARIOS.map((s) => (
              <button key={s.id} className="card stack" style={{ textAlign: 'left', gap: 4, cursor: 'pointer' }} onClick={() => start(s)}>
                <b style={{ fontSize: 16 }}>{s.title}</b>
                <span className="muted">{s.desc}</span>
              </button>
            ))}
          </div>
          <label className="row" style={{ gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={useGoal} onChange={(e) => setUseGoal(e.target.checked)} />
            <span>내가 공부 중인 단어를 대화에 써보기</span>
          </label>
          {err && <div className="banner err">{err}</div>}
        </main>
        <TabBar />
      </>
    );
  }

  if (phase === 'review') {
    return (
      <main className="page no-tabs">
        <h1 className="page-title">대화 정리</h1>
        {busy && (
          <div className="stack" role="status">
            <span className="muted">대화를 정리하는 중…</span>
            <span className="skeleton" style={{ width: '80%' }} />
            <span className="skeleton" style={{ width: '60%' }} />
          </div>
        )}
        {err && (
          <div className="banner err">
            <span className="grow">{err}</span>
            <button className="btn sm danger" onClick={() => void finish()}>
              다시 시도
            </button>
          </div>
        )}
        {review && (
          <>
            {review.summary && <div className="card">{review.summary}</div>}
            {review.goodPoints.length > 0 && (
              <div className="card stack" style={{ gap: 6 }}>
                <b>잘한 점</b>
                {review.goodPoints.map((g, i) => (
                  <span key={i}>✓ {g}</span>
                ))}
              </div>
            )}
            {review.fixes.length > 0 && (
              <div className="stack">
                <b>이렇게 고쳐 보세요</b>
                {review.fixes.map((f, i) => (
                  <div className="card stack" key={i} style={{ gap: 4 }}>
                    <span style={{ textDecoration: 'line-through', color: 'var(--ink-2)' }}>{f.original}</span>
                    <span style={{ fontFamily: 'var(--font-read)', fontSize: 16, fontWeight: 600 }}>{f.better}</span>
                    <span className="muted">{f.why}</span>
                    {canSpeak() && (
                      <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => speak(f.better)}>
                        <Icon name="speaker" size={16} /> 듣기
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {review.phrases.length > 0 && (
              <div className="card stack" style={{ gap: 6 }}>
                <b>외워 둘 표현</b>
                {review.phrases.map((p, i) => (
                  <span key={i}>• {p}</span>
                ))}
              </div>
            )}
          </>
        )}
        <button className="btn primary" onClick={() => setPhase('pick')} disabled={busy}>
          다른 대화 시작하기
        </button>
      </main>
    );
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <button className="icon-btn" aria-label="대화 끝내기" onClick={() => void finish()}>
            <Icon name="back" />
          </button>
          <div className="topbar-title">
            <strong>{sc?.title}</strong>
            <span>{targets.length ? `목표 단어: ${targets.join(', ')}` : '영어로 대화해 보세요'}</span>
          </div>
          {canSpeak() ? (
            <button className="icon-btn" aria-label="AI 음성 켜기/끄기" aria-pressed={voiceOn} style={voiceOn ? { background: 'var(--teal-soft-2)' } : undefined} onClick={toggleVoice}>
              <Icon name="speaker" />
            </button>
          ) : (
            <span style={{ width: 44 }} />
          )}
        </div>
      </header>
      <main className="page no-tabs" style={{ paddingBottom: 150 }}>
        <div className="stack" style={{ gap: 12 }}>
          {turns.map((t, i) => (
            <div key={i} className="stack" style={{ gap: 4, alignItems: t.role === 'me' ? 'flex-end' : 'flex-start' }}>
              <div
                style={{
                  maxWidth: '88%',
                  padding: '10px 14px',
                  borderRadius: 16,
                  fontFamily: 'var(--font-read)',
                  fontSize: 16,
                  lineHeight: 1.5,
                  background: t.role === 'me' ? 'var(--teal)' : 'var(--surface)',
                  color: t.role === 'me' ? '#fff' : 'var(--ink)',
                  border: t.role === 'me' ? 'none' : '1px solid var(--line-2)',
                }}
              >
                {t.text}
              </div>
              {t.role === 'ai' && canSpeak() && (
                <button className="small" style={{ background: 'none', border: 'none', color: 'var(--teal)', minHeight: 32 }} onClick={() => speak(t.text)}>
                  🔊 다시 듣기
                </button>
              )}
              {t.role === 'me' && (t.tip || t.better) && (
                <div className="banner warn" style={{ maxWidth: '88%', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                  {t.tip && <span>{t.tip}</span>}
                  {t.better && <b style={{ fontFamily: 'var(--font-read)' }}>→ {t.better}</b>}
                </div>
              )}
            </div>
          ))}
          {busy && <span className="muted">상대가 답하는 중…</span>}
          {err && <div className="banner err">{err}</div>}
          <div ref={bottom} />
        </div>
      </main>
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: 'var(--surface)', borderTop: '1px solid var(--line-2)', padding: '10px 16px calc(10px + env(safe-area-inset-bottom))' }}>
        <div className="stack" style={{ gap: 8, maxWidth: 720, margin: '0 auto' }}>
          <textarea
            className="input"
            rows={2}
            style={{ padding: 10, resize: 'none', fontFamily: 'var(--font-read)' }}
            placeholder={listening ? '듣고 있어요… 영어로 말해 보세요' : '영어로 입력하거나 마이크로 말해 보세요'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="row" style={{ gap: 8 }}>
            {canListen() && (
              <button className="btn" aria-pressed={listening} style={listening ? { background: 'var(--red-soft)', borderColor: 'var(--red-line)' } : undefined} onClick={mic}>
                <Icon name="mic" size={18} /> {listening ? '멈추기' : '말하기'}
              </button>
            )}
            <button className="btn primary grow" disabled={busy || !draft.trim()} onClick={() => void send()}>
              보내기
            </button>
            <button className="btn" onClick={() => void finish()}>
              끝내기
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
