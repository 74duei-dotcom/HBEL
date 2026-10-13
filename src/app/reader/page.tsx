'use client';
// A2 PDF 리더: 쪽 넘기기 · 단어 탭 사전 · 단어 아래 한글 발음 · 문장 번역 · 듣기
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { activeVocab, loadAnalysis, loadDocContent, removeDocFiles, saveAnalysis, useStore } from '@/lib/store';
import { analyzeSentences } from '@/lib/claude';
import { driveViewUrl } from '@/lib/drive';
import { speak, stopSpeaking, canSpeak } from '@/lib/speech';
import type { DocAnalysisCache, DocContent, WordInfo } from '@/lib/types';
import { cleanWord, errorMessage, tokenize } from '@/lib/util';
import { AaMenu } from '@/components/AaMenu';
import { Hangul } from '@/components/Hangul';
import { Icon } from '@/components/Icon';
import { SyncBanner } from '@/components/SyncBanner';
import { WordSheet, type WordTarget } from '@/components/WordSheet';

const CHUNK = 6; // 한 번에 AI에게 보낼 문장 수
const SPEEDS = [0.75, 1, 1.25];

function ReaderInner() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get('id') ?? '';
  const { data, ready, upsertDoc, removeDoc } = useStore();
  const doc = data.library[id];
  const prefs = data.prefs;

  const [content, setContent] = useState<DocContent | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [cache, setCache] = useState<DocAnalysisCache | null>(null);
  const cacheRef = useRef<DocAnalysisCache | null>(null);
  const [page, setPage] = useState(0);
  const [cur, setCur] = useState(0);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const [errKeys, setErrKeys] = useState<Record<string, string>>({});
  const inflight = useRef<Set<string>>(new Set());
  const [target, setTarget] = useState<WordTarget | null>(null);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const initDone = useRef(false);

  // 본문과 분석 캐시 불러오기
  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      try {
        const c = await loadDocContent(id);
        if (!alive) return;
        if (!c) {
          setLoadErr('이 자료의 본문을 찾지 못했어요. 구글 드라이브에 연결돼 있는지 확인해 주세요.');
          return;
        }
        setContent(c);
        const a = await loadAnalysis(id);
        if (!alive) return;
        cacheRef.current = a;
        setCache(a);
      } catch (e) {
        if (alive) setLoadErr(errorMessage(e));
      }
    })();
    return () => {
      alive = false;
      stopSpeaking();
    };
  }, [id]);

  // 마지막으로 읽던 쪽에서 시작
  useEffect(() => {
    if (doc && content && !initDone.current) {
      initDone.current = true;
      setPage(Math.min(doc.lastPage, content.pages.length - 1));
    }
  }, [doc, content]);

  const sentences = useMemo(() => content?.pages[page]?.sentences ?? [], [content, page]);

  const glossary = useMemo(() => {
    const g: Record<string, string> = {};
    for (const v of activeVocab(data)) if (v.isMedical && v.meaning) g[v.lemma] = v.meaning;
    return g;
  }, [data]);

  const learningSet = useMemo(() => {
    const s = new Set<string>();
    for (const v of activeVocab(data)) {
      if (v.status === 'learning') {
        s.add(v.id);
        s.add(v.word.toLowerCase());
      }
    }
    return s;
  }, [data]);

  const keyOf = (p: number, i: number) => `${p}-${i}`;

  const commitCache = useCallback((next: DocAnalysisCache) => {
    cacheRef.current = next;
    setCache(next);
    void saveAnalysis(next);
  }, []);

  /** 필요한 문장만 AI에게 분석 요청 (이미 저장된 문장은 건너뜀) */
  const analyze = useCallback(
    async (indices: number[]) => {
      if (!doc || !cacheRef.current) return;
      const todo = indices.filter((i) => {
        const k = keyOf(page, i);
        return !cacheRef.current!.sentences[k] && !inflight.current.has(k) && sentences[i];
      });
      for (let s = 0; s < todo.length; s += CHUNK) {
        const part = todo.slice(s, s + CHUNK);
        const keys = part.map((i) => keyOf(page, i));
        keys.forEach((k) => inflight.current.add(k));
        setBusyKeys((prev) => new Set([...prev, ...keys]));
        setErrKeys((prev) => {
          const n = { ...prev };
          keys.forEach((k) => delete n[k]);
          return n;
        });
        try {
          const res = await analyzeSentences(
            part.map((i) => sentences[i]),
            doc.kind,
            glossary
          );
          const base = cacheRef.current!;
          const nextSentences = { ...base.sentences };
          part.forEach((i, k) => (nextSentences[keyOf(page, i)] = res[k]));
          commitCache({ ...base, sentences: nextSentences });
        } catch (e) {
          const m = errorMessage(e);
          setErrKeys((prev) => {
            const n = { ...prev };
            keys.forEach((k) => (n[k] = m));
            return n;
          });
        } finally {
          keys.forEach((k) => inflight.current.delete(k));
          setBusyKeys((prev) => {
            const n = new Set(prev);
            keys.forEach((k) => n.delete(k));
            return n;
          });
        }
      }
    },
    [doc, page, sentences, glossary, commitCache]
  );

  // 보이는 쪽(또는 읽는 문장)의 분석을 자동으로 준비
  useEffect(() => {
    if (!cache || !sentences.length) return;
    if (!prefs.hk && !prefs.tr) return;
    const idx = prefs.focus ? [cur, cur + 1].filter((i) => i < sentences.length) : sentences.map((_, i) => i);
    void analyze(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache !== null, page, cur, prefs.hk, prefs.tr, prefs.focus, sentences]);

  const goPage = (p: number) => {
    if (!content || !doc) return;
    const np = Math.max(0, Math.min(content.pages.length - 1, p));
    stopSpeaking();
    setPlaying(false);
    setPage(np);
    setCur(0);
    window.scrollTo({ top: 0 });
    if (np !== doc.lastPage) upsertDoc({ ...doc, lastPage: np });
  };

  const playSentence = (i: number) => {
    const s = sentences[i];
    if (!s) return;
    setCur(i);
    setPlaying(true);
    speak(s, speed, () => setPlaying(false));
  };

  const togglePlay = () => {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
    } else playSentence(cur);
  };

  const rename = () => {
    if (!doc) return;
    const t = window.prompt('자료 이름', doc.title);
    if (t && t.trim()) upsertDoc({ ...doc, title: t.trim() });
  };

  const remove = async () => {
    if (!doc) return;
    if (!window.confirm(`"${doc.title}"을(를) 내 자료에서 지울까요?\n단어장에 저장한 단어는 남고, 구글 드라이브의 원본 PDF도 그대로 남아요.`)) return;
    removeDoc(doc.id);
    await removeDocFiles(doc.id);
    router.push('/');
  };

  const wordCached = useCallback((key: string): WordInfo | undefined => cacheRef.current?.words[key], []);
  const onWordCache = useCallback(
    (info: WordInfo) => {
      const base = cacheRef.current;
      if (!base) return;
      commitCache({ ...base, words: { ...base.words, [info.word.toLowerCase()]: info, [info.lemma.toLowerCase()]: info } });
    },
    [commitCache]
  );

  if (!id || (ready && !doc)) {
    return (
      <main className="page no-tabs">
        <div className="banner err">자료를 찾을 수 없어요.</div>
        <Link href="/" className="btn">
          내 자료로
        </Link>
      </main>
    );
  }
  if (!doc) return <main className="page no-tabs muted">불러오는 중…</main>;

  const totalPages = content?.pages.length ?? doc.pageCount;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner" style={{ maxWidth: 1180 }}>
          <Link href="/" className="icon-btn" aria-label="내 자료로">
            <Icon name="back" />
          </Link>
          <button className="topbar-title" onClick={rename} style={{ border: 'none', background: 'none', padding: 0 }} aria-label="자료 이름 바꾸기">
            <strong>{doc.title}</strong>
            <span>
              {page + 1} / {totalPages}쪽 · 문장 {sentences.length}
            </span>
          </button>
          <AaMenu hasTr hasFocus />
        </div>
      </header>

      <main className="page wide no-tabs" style={{ paddingBottom: 150 }}>
        <SyncBanner />
        {loadErr && <div className="banner err">{loadErr}</div>}
        {!content && !loadErr && (
          <div className="stack" role="status">
            <span className="muted">본문을 불러오는 중…</span>
            <span className="skeleton" style={{ width: '90%' }} />
            <span className="skeleton" style={{ width: '75%' }} />
          </div>
        )}

        {content && (
          <div className="reader-layout">
            <article className="card read stack" style={{ gap: 6 }}>
              <div className="between" style={{ fontFamily: 'var(--font-ui)' }}>
                <span className="small" style={{ fontWeight: 700, letterSpacing: 0.3 }}>
                  {page + 1}쪽 · 단어를 누르면 뜻
                </span>
                {doc.driveFileId && (
                  <a href={driveViewUrl(doc.driveFileId)} target="_blank" rel="noreferrer" className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 32 }}>
                    원본 PDF <Icon name="external" size={14} />
                  </a>
                )}
              </div>

              {sentences.length === 0 && <p className="muted">이 쪽에는 글자가 없어요 (그림·표만 있는 쪽일 수 있어요).</p>}

              {sentences.map((s, i) => {
                const k = keyOf(page, i);
                const a = cache?.sentences[k];
                const show = !prefs.focus || i === cur;
                const showHk = prefs.hk && show;
                const showTr = prefs.tr && show;
                const busy = busyKeys.has(k);
                const err = errKeys[k];
                const tokens = tokenize(s);
                return (
                  <div key={k} className={`sentence${i === cur ? ' current' : ''}`}>
                    <div className="tokens">
                      {tokens.map((t, ti) => {
                        const w = cleanWord(t).toLowerCase();
                        const active = target && target.sentence === s && cleanWord(target.word).toLowerCase() === w;
                        return (
                          <span className="tok" key={ti}>
                            <button
                              className={`tok-en${learningSet.has(w) ? ' learning' : ''}${active ? ' active' : ''}`}
                              onClick={() => {
                                setCur(i);
                                if (w) setTarget({ word: t, sentence: s, page });
                              }}
                            >
                              {t}
                            </button>
                            {showHk && (
                              <span className="tok-hk">
                                <Hangul text={a?.hk[ti] ?? ''} />
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                    {(showHk || showTr) && !a && busy && (
                      <div className="stack" style={{ gap: 6, marginTop: 8 }} role="status">
                        <span className="small">발음·번역 만드는 중…</span>
                        <span className="skeleton" style={{ width: '80%' }} />
                      </div>
                    )}
                    {(showHk || showTr) && !a && err && (
                      <div className="banner err" style={{ marginTop: 8, fontFamily: 'var(--font-ui)' }}>
                        <span className="grow">{err}</span>
                        <button className="btn sm danger" onClick={() => void analyze([i])}>
                          다시 시도
                        </button>
                      </div>
                    )}
                    {showTr && a?.translation && <div className="tr">{a.translation}</div>}
                  </div>
                );
              })}

              <div className="between" style={{ marginTop: 12, fontFamily: 'var(--font-ui)' }}>
                <button className="btn" disabled={page === 0} onClick={() => goPage(page - 1)}>
                  <Icon name="back" size={18} /> 이전 쪽
                </button>
                <span className="small">
                  {page + 1} / {totalPages}
                </span>
                <button className="btn" disabled={page >= totalPages - 1} onClick={() => goPage(page + 1)}>
                  다음 쪽 <Icon name="next" size={18} />
                </button>
              </div>
            </article>

            <aside className="reader-side stack">
              <div className="card stack">
                <b style={{ fontSize: 13, color: 'var(--teal)' }}>지금 문장</b>
                <span style={{ fontFamily: 'var(--font-read)', fontSize: 16, lineHeight: 1.5 }}>{sentences[cur] ?? ''}</span>
                {cache?.sentences[keyOf(page, cur)]?.translation && <div className="tr" style={{ marginTop: 0 }}>{cache.sentences[keyOf(page, cur)].translation}</div>}
                <div className="small">문장 구조·문법 분석과 발음 연습은 2단계에서 추가돼요.</div>
              </div>
              <div className="card stack">
                <b style={{ fontSize: 13 }}>자료 관리</b>
                <button className="btn sm" onClick={rename}>
                  이름 바꾸기
                </button>
                <button className="btn sm danger" onClick={remove}>
                  <Icon name="trash" size={16} /> 내 자료에서 지우기
                </button>
              </div>
            </aside>
          </div>
        )}
      </main>

      {content && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 25, background: 'var(--surface)', borderTop: '1px solid var(--line)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button className="icon-btn" aria-label="이전 문장" onClick={() => setCur((c) => Math.max(0, c - 1))} disabled={cur === 0}>
              <Icon name="back" />
            </button>
            <button className="icon-btn" style={{ background: 'var(--teal)', color: '#fff', width: 48, height: 48 }} aria-label={playing ? '멈춤' : '이 문장 듣기'} onClick={togglePlay} disabled={!canSpeak()}>
              <Icon name={playing ? 'pause' : 'play'} filled size={20} />
            </button>
            <button className="icon-btn" aria-label="다음 문장" onClick={() => setCur((c) => Math.min(sentences.length - 1, c + 1))} disabled={cur >= sentences.length - 1}>
              <Icon name="next" />
            </button>
            <div className="seg grow" role="radiogroup" aria-label="재생 속도" style={{ padding: 3, minWidth: 180 }}>
              {SPEEDS.map((s) => (
                <button key={s} role="radio" aria-checked={speed === s} onClick={() => setSpeed(s)} style={{ fontSize: 13 }}>
                  {s}x
                </button>
              ))}
            </div>
            <span className="small">
              문장 {Math.min(cur + 1, sentences.length)} / {sentences.length}
            </span>
          </div>
        </div>
      )}

      <WordSheet target={target} docId={doc.id} docTitle={doc.title} kind={doc.kind} cached={wordCached} onCache={onWordCache} onClose={() => setTarget(null)} />
    </>
  );
}

export default function ReaderPage() {
  return (
    <Suspense fallback={<main className="page no-tabs muted">불러오는 중…</main>}>
      <ReaderInner />
    </Suspense>
  );
}
