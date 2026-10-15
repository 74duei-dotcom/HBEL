'use client';
// A2 PDF 리더: 쪽 넘기기 · 단어 탭 사전 · 단어 아래 한글 발음 · 문장 번역 · 듣기
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { activeVocab, loadAnalysis, loadDocContent, removeDocFiles, saveAnalysis, useStore } from '@/lib/store';
import { analyzeSentences, HANGUL_VERSION } from '@/lib/claude';
import { driveViewUrl } from '@/lib/drive';
import { createYouTubePlayer, formatTime, loadVideo, saveVideo, type YTPlayer } from '@/lib/video';
import { speak, stopSpeaking, canSpeak, prefetchSpeech, TTS_FALLBACK_EVENT } from '@/lib/speech';
import type { DocAnalysisCache, DocContent, GrammarAnalysis, WordInfo } from '@/lib/types';
import { cleanWord, errorMessage, tokenize } from '@/lib/util';
import { AaMenu } from '@/components/AaMenu';
import { Hangul } from '@/components/Hangul';
import { GrammarSheet, type GrammarTarget } from '@/components/GrammarSheet';
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
  const [gTarget, setGTarget] = useState<GrammarTarget | null>(null);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const initDone = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoChecked, setVideoChecked] = useState(false);
  const pageRef = useRef(0);
  pageRef.current = page;
  const ytRef = useRef<YTPlayer | null>(null);
  const ytBox = useRef<HTMLDivElement>(null);
  const ytId = doc?.youtubeId ?? '';
  const isLecture = !!doc?.duration || !!ytId;

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

  // 강의 영상 파일 (이 기기에 저장돼 있을 때만)
  useEffect(() => {
    if (!id || !doc?.duration || ytId) return;
    let url = '';
    let alive = true;
    loadVideo(id)
      .then((b) => {
        if (!alive) return;
        if (b) {
          url = URL.createObjectURL(b);
          setVideoUrl(url);
        }
        setVideoChecked(true);
      })
      .catch(() => alive && setVideoChecked(true));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!doc?.duration]);

  // 유튜브 플레이어: 재생 중에는 0.5초마다 시각을 보고 문장을 따라감
  const followRef = useRef<(t: number) => void>(() => undefined);
  useEffect(() => {
    if (!ytId || !ytBox.current) return;
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const host = document.createElement('div');
    ytBox.current.appendChild(host);
    createYouTubePlayer(host, ytId)
      .then((p) => {
        if (!alive) {
          p.destroy();
          return;
        }
        ytRef.current = p;
        timer = setInterval(() => {
          if (p.getPlayerState() === 1) followRef.current(p.getCurrentTime());
        }, 500);
      })
      .catch((e) => alive && setLoadErr(errorMessage(e)));
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      try {
        ytRef.current?.destroy();
      } catch {
        /* 무시 */
      }
      ytRef.current = null;
    };
  }, [ytId, !!content]);

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
        const old = cacheRef.current!.sentences[k];
        // 끊어 읽기 정보가 없는 예전 분석은 다시 받아옴
        // 번역·한글 발음이 비어 저장된 예전 분석도 다시 받아옴
        const need = !old || (old.hv ?? 0) < HANGUL_VERSION || !old.translation || !old.hk.some((h) => h.trim()) || (prefs.ph && old.br === undefined);
        return need && !inflight.current.has(k) && sentences[i];
      });
      const parts: number[][] = [];
      for (let s = 0; s < todo.length; s += CHUNK) parts.push(todo.slice(s, s + CHUNK));
      // 묶음들을 한꺼번에 요청 (실제 동시 전송 수는 ai.ts가 2개로 조절)
      await Promise.all(
        parts.map(async (part) => {
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
        })
      );
    },
    [doc, page, sentences, glossary, commitCache, prefs.ph]
  );

  // 보이는 쪽(또는 읽는 문장)의 분석을 자동으로 준비
  useEffect(() => {
    if (!cache || !sentences.length) return;
    if (!prefs.hk && !prefs.tr && !prefs.ph) return;
    const idx = prefs.focus ? [cur, cur + 1].filter((i) => i < sentences.length) : sentences.map((_, i) => i);
    void analyze(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache !== null, page, cur, prefs.hk, prefs.tr, prefs.ph, prefs.focus, sentences]);

  const [ttsNote, setTtsNote] = useState('');
  useEffect(() => {
    const h = (e: Event) => setTtsNote(String((e as CustomEvent).detail ?? ''));
    window.addEventListener(TTS_FALLBACK_EVENT, h);
    return () => window.removeEventListener(TTS_FALLBACK_EVENT, h);
  }, []);

  // 지금 문장과 다음 문장들의 소리를 미리 만들어 두어 재생 버튼을 누르면 바로 시작되게 함
  useEffect(() => {
    if (!sentences.length) return;
    const t = setTimeout(() => prefetchSpeech([cur, cur + 1, cur + 2].map((i) => sentences[i]).filter(Boolean)), 400);
    return () => clearTimeout(t);
  }, [cur, sentences]);

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

  const attachVideo = async (f: File | undefined) => {
    if (!f || !doc) return;
    try {
      await saveVideo(doc.id, f);
      setVideoUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(f);
      });
    } catch (e) {
      setLoadErr(errorMessage(e));
    }
  };

  /** 영상이 재생되는 동안 지금 시각에 맞는 쪽·문장을 따라감 */
  const followAt = (t: number) => {
    if (!content) return;
    let p = -1;
    for (let k = 0; k < content.pages.length; k++) {
      const ts = content.pages[k].times;
      if (ts?.length && ts[0] <= t + 0.5) p = k;
    }
    if (p < 0) return;
    const ts = content.pages[p].times ?? [];
    let i = 0;
    for (let k = 0; k < ts.length; k++) if (ts[k] <= t + 0.3) i = k;
    if (p !== pageRef.current) setPage(p);
    setCur(i);
  };

  followRef.current = followAt;
  const followVideo = () => {
    const v = videoRef.current;
    if (v) followAt(v.currentTime);
  };

  const seekTo = (i: number) => {
    const v = videoRef.current;
    const t = sentences.length ? content?.pages[page]?.times?.[i] : undefined;
    setCur(i);
    if (t === undefined) return;
    if (ytRef.current) {
      ytRef.current.seekTo(Math.max(0, t - 0.3), true);
      ytRef.current.playVideo();
    } else if (v) {
      v.currentTime = Math.max(0, t - 0.3);
      void v.play();
    }
  };

  const [speakTok, setSpeakTok] = useState(-1);
  const [preparing, setPreparing] = useState(false); // 누른 뒤 소리가 나기 전까지

  const playSentence = (i: number) => {
    const s = sentences[i];
    if (!s) return;
    setCur(i);
    setPlaying(true);
    setPreparing(true);
    // 읽는 위치(글자 비율) → 지금 읽고 있는 단어 번호로 바꿔 표시
    const toks = tokenize(s);
    const total = toks.reduce((n, t) => n + t.length + 1, 0);
    const done = () => {
      setPlaying(false);
      setPreparing(false);
      setSpeakTok(-1);
    };
    setSpeakTok(0);
    speak(s, speed, done, (f) => {
      const pos = f * total;
      let acc = 0;
      let idx = toks.length - 1;
      for (let k = 0; k < toks.length; k++) {
        acc += toks[k].length + 1;
        if (pos < acc) {
          idx = k;
          break;
        }
      }
      setSpeakTok(idx);
    }, () => setPreparing(false));
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (ytRef.current) {
      if (ytRef.current.getPlayerState() === 1) ytRef.current.pauseVideo();
      else seekTo(cur);
      return;
    }
    if (v && videoUrl) {
      if (v.paused) seekTo(cur);
      else v.pause();
      return;
    }
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      setPreparing(false);
      setSpeakTok(-1);
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

  const grammarCached = useCallback((t: GrammarTarget): GrammarAnalysis | undefined => cacheRef.current?.grammar?.[keyOf(t.page, sentences.indexOf(t.sentence))], [sentences]);
  const onGrammarCache = useCallback(
    (t: GrammarTarget, a: GrammarAnalysis) => {
      const base = cacheRef.current;
      if (!base) return;
      commitCache({ ...base, grammar: { ...(base.grammar ?? {}), [keyOf(t.page, sentences.indexOf(t.sentence))]: a } });
    },
    [commitCache, sentences]
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
              {page + 1} / {totalPages}쪽 · 문장 {Math.min(cur + 1, sentences.length)} / {sentences.length}
            </span>
          </button>
          <AaMenu hasTr hasFocus />
        </div>
      </header>

      <main className="page wide no-tabs" style={{ paddingBottom: 110 }}>
        <SyncBanner />
        {loadErr && <div className="banner err">{loadErr}</div>}
        {ttsNote && (
          <div className="banner warn">
            <span className="grow">기계음으로 읽었어요: {ttsNote} <Link href="/settings/">설정에서 확인</Link></span>
            <button className="btn sm" onClick={() => setTtsNote('')}>닫기</button>
          </div>
        )}
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
                  {isLecture ? `${formatTime(content.pages[page]?.times?.[0] ?? 0)} 부터` : `${page + 1}쪽`} · 단어를 누르면 뜻
                </span>
                {!isLecture && doc.driveFileId && (
                  <a href={driveViewUrl(doc.driveFileId)} target="_blank" rel="noreferrer" className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 32 }}>
                    원본 PDF <Icon name="external" size={14} />
                  </a>
                )}
              </div>

              {ytId && <div ref={ytBox} style={{ width: '100%', aspectRatio: '16 / 9', maxHeight: '38vh', background: '#000', borderRadius: 10, overflow: 'hidden', position: 'sticky', top: 64, zIndex: 5 }} />}
              {isLecture && videoUrl && (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  playsInline
                  onTimeUpdate={followVideo}
                  onPlay={() => setPlaying(false)}
                  style={{ width: '100%', maxHeight: '38vh', background: '#000', borderRadius: 10, position: 'sticky', top: 64, zIndex: 5 }}
                />
              )}
              {isLecture && !ytId && videoChecked && !videoUrl && (
                <div className="banner warn" style={{ fontFamily: 'var(--font-ui)', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                  <span>이 기기에는 영상 파일이 없어요. 자막은 그대로 읽을 수 있어요. 같은 영상 파일을 연결하면 문장을 눌러 그 장면을 볼 수 있어요.</span>
                  <label className="btn sm" style={{ cursor: 'pointer' }}>
                    영상 파일 연결
                    <input type="file" accept="video/*,audio/*" hidden onChange={(e) => void attachVideo(e.target.files?.[0])} />
                  </label>
                </div>
              )}

              {sentences.length === 0 && <p className="muted">이 쪽에는 글자가 없어요 (그림·표만 있는 쪽일 수 있어요).</p>}

              {sentences.map((s, i) => {
                const k = keyOf(page, i);
                const a = cache?.sentences[k];
                const show = !prefs.focus || i === cur;
                const showHk = prefs.hk && show;
                const showTr = prefs.tr && show;
                const brSet = new Set(prefs.ph && show ? (a?.br ?? []) : []);
                const busy = busyKeys.has(k);
                const err = errKeys[k];
                const tokens = tokenize(s);
                return (
                  <div key={k} className={`sentence${i === cur ? ' current' : ''}`} onClick={() => setCur(i)}>
                    {isLecture && (videoUrl || ytId) && content?.pages[page]?.times?.[i] !== undefined && (
                      <button className="small" style={{ background: 'none', border: 'none', color: 'var(--teal)', minHeight: 28, padding: 0, fontFamily: 'var(--font-ui)' }} onClick={() => seekTo(i)}>
                        ▶ {formatTime(content.pages[page].times![i])}
                      </button>
                    )}
                    <div className="tokens">
                      {tokens.map((t, ti) => {
                        const w = cleanWord(t).toLowerCase();
                        const active = target && target.sentence === s && cleanWord(target.word).toLowerCase() === w;
                        return (
                          <span className={`tok${brSet.has(ti) ? " br" : ""}`} key={ti}>
                            <button
                              className={`tok-en${learningSet.has(w) ? ' learning' : ''}${active ? ' active' : ''}${playing && i === cur && ti === speakTok ? ' speaking' : ''}`}
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
                            {brSet.has(ti) && (
                              <span className="tok-br" aria-hidden="true">
                                /
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
                    {(showHk || showTr || (prefs.ph && show)) && (!a || (prefs.ph && a.br === undefined && !busy)) && err && (
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
              <div id="grammar-dock" />
              <div className="card stack">
                <b style={{ fontSize: 13, color: 'var(--teal)' }}>지금 문장</b>
                <span style={{ fontFamily: 'var(--font-read)', fontSize: 16, lineHeight: 1.5 }}>{sentences[cur] ?? ''}</span>
                {cache?.sentences[keyOf(page, cur)]?.translation && <div className="tr" style={{ marginTop: 0 }}>{cache.sentences[keyOf(page, cur)].translation}</div>}
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
          <div style={{ maxWidth: 1480, margin: '0 auto', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
            <button className="icon-btn" aria-label="이전 문장" onClick={() => setCur((c) => Math.max(0, c - 1))} disabled={cur === 0}>
              <Icon name="back" />
            </button>
            <button className="icon-btn" style={{ background: 'var(--teal)', color: '#fff', width: 48, height: 48 }} aria-label={preparing ? '소리 준비 중' : playing ? '멈춤' : '이 문장 듣기'} onClick={togglePlay} disabled={!canSpeak()}>
              {preparing ? <span className="spin" aria-hidden="true" /> : <Icon name={playing ? 'pause' : 'play'} filled size={20} />}
            </button>
            <button className="icon-btn" aria-label="다음 문장" onClick={() => setCur((c) => Math.min(sentences.length - 1, c + 1))} disabled={cur >= sentences.length - 1}>
              <Icon name="next" />
            </button>
            <button className="btn sm" aria-label={`재생 속도 ${speed}배, 누르면 바뀜`} onClick={() => setSpeed((v) => SPEEDS[(SPEEDS.indexOf(v) + 1) % SPEEDS.length])} style={{ minWidth: 64 }}>
              {speed}x
            </button>
            <span className="grow" />
            <button className="btn sm" disabled={!sentences[cur]} onClick={() => sentences[cur] && setGTarget({ sentence: sentences[cur], page })}>
              <Icon name="grammar" size={16} /> 문법
            </button>
          </div>
        </div>
      )}

      <GrammarSheet target={gTarget} docId={doc.id} docTitle={doc.title} kind={doc.kind} cached={grammarCached} onCache={onGrammarCache} onClose={() => setGTarget(null)} />
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
