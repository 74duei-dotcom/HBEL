'use client';
// 단어를 누르면 아래에서 올라오는 사전 창
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { lookupWord } from '@/lib/claude';
import { newCard } from '@/lib/srs';
import { speak } from '@/lib/speech';
import type { DocKind, VocabItem, WordInfo, WordSource } from '@/lib/types';
import { cleanWord, errorMessage, nowIso } from '@/lib/util';
import { Hangul } from './Hangul';
import { SyllableGuide } from './SyllableGuide';
import { Icon } from './Icon';

export interface WordTarget {
  word: string; // 화면의 단어 그대로
  sentence: string;
  page: number;
}

interface Props {
  target: WordTarget | null;
  docId: string;
  docTitle: string;
  kind: DocKind;
  cached: (key: string) => WordInfo | undefined;
  onCache: (info: WordInfo) => void;
  onClose: () => void;
}

export function WordSheet({ target, docId, docTitle, kind, cached, onCache, onClose }: Props) {
  const { data, upsertVocab } = useStore();
  const [info, setInfo] = useState<WordInfo | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState<'' | 'learning' | 'known'>('');
  const vocabRef = useRef(data.vocab);
  vocabRef.current = data.vocab;

  const reqId = useRef(0);

  const load = useCallback(async () => {
    if (!target) return;
    const my = ++reqId.current; // 더 새로운 요청이 시작되면 이전 요청의 결과는 화면에 반영하지 않음
    const key = cleanWord(target.word).toLowerCase();
    setErr('');
    setSaved('');
    // 문서 캐시 → 내 단어장(음절 설명까지 있는 것) 순으로 찾아 AI를 부르지 않음
    const mine = vocabRef.current[key];
    const hit = cached(key) ?? (mine && !mine.deleted && mine.syllables?.length ? mine : undefined);
    if (hit) {
      setInfo(hit);
      return;
    }
    setInfo(null);
    setLoading(true);
    try {
      const res = await lookupWord(cleanWord(target.word), target.sentence, kind);
      onCache(res); // 늦게 도착해도 캐시에는 저장
      if (my !== reqId.current) return;
      setInfo(res);
    } catch (e) {
      if (my === reqId.current) setErr(errorMessage(e));
    } finally {
      if (my === reqId.current) setLoading(false);
    }
  }, [target, cached, onCache, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [target, onClose]);

  if (!target) return null;

  const id = info ? info.lemma.toLowerCase() : '';
  const existing: VocabItem | undefined = id ? data.vocab[id] : undefined;
  const current = existing && !existing.deleted ? existing : undefined;

  const save = (status: 'learning' | 'known') => {
    if (!info) return;
    const source: WordSource = { docId, docTitle, page: target.page, sentence: target.sentence };
    const sources = current ? [...current.sources] : [];
    if (!sources.some((s) => s.docId === docId && s.sentence === source.sentence)) sources.unshift(source);
    const item: VocabItem = {
      ...(current ?? { card: newCard(), createdAt: nowIso() }),
      ...info,
      id,
      status,
      sources: sources.slice(0, 10),
      updatedAt: nowIso(),
      // '알아요'였던 단어를 다시 '학습하기'로 바꾸면 복습 카드를 새로 시작 (단어 상세 화면과 같은 동작)
      card: current && !(current.status === 'known' && status === 'learning') ? current.card : newCard(),
      createdAt: current?.createdAt ?? nowIso(),
    } as VocabItem;
    upsertVocab(item);
    setSaved(status);
  };

  return (
    <>
      <button className="scrim" aria-label="뜻 창 닫기" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="단어 뜻">
        <div className="sheet-inner">
          <div className="between" style={{ alignItems: 'flex-start' }}>
            <div className="stack" style={{ gap: 6, minWidth: 0 }}>
              <span style={{ fontFamily: 'var(--font-read)', fontSize: 26, fontWeight: 600, overflowWrap: 'anywhere' }}>{info?.word ?? cleanWord(target.word)}</span>
              {info && (
                <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  {info.isMedical && <span className="chip med">의학용어</span>}
                  {info.ipa && <span className="ipa" aria-label="발음기호">{info.ipa}</span>}
                  {info.pos && <span className="small">{info.pos}</span>}
                </span>
              )}
              {info && data.prefs.hk && info.hangul && (
                <span className="hk-badge">
                  <small>한글</small>
                  <Hangul text={info.hangul} />
                </span>
              )}
            </div>
            <span className="row" style={{ gap: 6 }}>
              <button className="icon-btn soft" aria-label="발음 듣기" onClick={() => speak(info?.word ?? cleanWord(target.word), 0.9)}>
                <Icon name="speaker" size={20} />
              </button>
              <button className="icon-btn" style={{ background: 'var(--ground)' }} aria-label="닫기" onClick={onClose}>
                <Icon name="close" size={18} />
              </button>
            </span>
          </div>

          {loading && (
            <div className="stack" role="status" aria-label="뜻 찾는 중">
              <span className="muted">뜻을 찾는 중…</span>
              <span className="skeleton" style={{ width: '70%' }} />
              <span className="skeleton" style={{ width: '50%' }} />
            </div>
          )}

          {err && (
            <div className="banner err">
              <span className="grow">{err}</span>
              <button className="btn sm danger" onClick={() => void load()}>
                다시 시도
              </button>
            </div>
          )}

          {info && (
            <>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{info.meaning}</div>
              <SyllableGuide syllables={info.syllables} />
              {info.etymology && (
                <div className="origin-box">
                  <b>어원</b>
                  {info.etymology}
                </div>
              )}
              {info.contextNote && <div className="muted" style={{ fontSize: 14 }}>{info.contextNote}</div>}
              <div className="row" style={{ gap: 10 }}>
                <button className="btn grow" aria-pressed={saved === 'known' || current?.status === 'known'} onClick={() => save('known')}>
                  {saved === 'known' ? '✓ 알아요' : '알아요'}
                </button>
                <button className="btn primary grow" onClick={() => save('learning')}>
                  {saved === 'learning' || (current?.status === 'learning' && !saved) ? '✓ 학습 중' : '학습하기'}
                </button>
              </div>
              {(current || saved) && (
                <Link href={`/word/?id=${encodeURIComponent(id)}`} className="small" style={{ fontWeight: 600, minHeight: 32, display: 'inline-flex', alignItems: 'center' }}>
                  단어 상세 · 이 단어가 나온 문장 보기 →
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
