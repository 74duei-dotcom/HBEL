'use client';
// D2 복습: 간격 반복 카드 (용어+한글 발음 → 정답 보기 → 4단계 평가)
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { activeVocab, useStore } from '@/lib/store';
import { buildQueue, previewIntervals, reviewCard, type ReviewGrade } from '@/lib/srs';
import { speak } from '@/lib/speech';
import type { VocabItem } from '@/lib/types';
import { Hangul } from '@/components/Hangul';
import { Icon } from '@/components/Icon';

const GRADES: { g: ReviewGrade; label: string }[] = [
  { g: 'again', label: '다시' },
  { g: 'hard', label: '어려움' },
  { g: 'good', label: '알맞음' },
  { g: 'easy', label: '쉬움' },
];

export default function ReviewPage() {
  const { data, ready, upsertVocab } = useStore();
  const [queueIds, setQueueIds] = useState<string[] | null>(null);
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  // 화면을 열 때 한 번 오늘의 복습 목록을 정함
  useEffect(() => {
    if (ready && queueIds === null) setQueueIds(buildQueue(activeVocab(data), data.prefs.newPerDay).map((v) => v.id));
  }, [ready, data, queueIds]);

  const item: VocabItem | undefined = queueIds ? data.vocab[queueIds[pos]] : undefined;
  const intervals = useMemo(() => (item ? previewIntervals(item.card) : null), [item]);
  const total = queueIds?.length ?? 0;

  const grade = (g: ReviewGrade) => {
    if (!item || !queueIds) return;
    const card = reviewCard(item.card, g);
    upsertVocab({ ...item, card });
    // '다시'는 오늘 안에 한 번 더 보도록 목록 뒤에 붙임
    if (g === 'again') setQueueIds([...queueIds, item.id]);
    setDoneCount((n) => n + 1);
    setPos((p) => p + 1);
    setRevealed(false);
  };

  const finished = queueIds !== null && pos >= total;

  return (
    <>
      <header style={{ maxWidth: 760, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px 4px' }}>
        <Link href="/vocab/" className="icon-btn" aria-label="복습 그만하기">
          <Icon name="close" size={20} />
        </Link>
        <span className="bar grow" style={{ height: 8 }}>
          <span style={{ width: `${total ? Math.min(100, (pos / total) * 100) : 0}%` }} />
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, minWidth: 56, textAlign: 'center' }}>
          {Math.min(pos + 1, total)} / {total}
        </span>
      </header>

      <main className="page no-tabs" style={{ minHeight: 'calc(100vh - 70px)' }}>
        {queueIds === null && <span className="muted">불러오는 중…</span>}

        {finished && (
          <div className="card stack" style={{ alignItems: 'center', textAlign: 'center', padding: 28 }}>
            <span style={{ fontSize: 20, fontWeight: 700 }}>{total === 0 ? '오늘 복습할 단어가 없어요' : '오늘 복습 끝!'}</span>
            <span className="muted">{total === 0 ? '자료를 읽다가 모르는 단어를 "학습하기"로 저장해 보세요.' : `${doneCount}장을 복습했어요. 다음 복습일은 단어장에서 볼 수 있어요.`}</span>
            <div className="row" style={{ marginTop: 8 }}>
              <Link href="/vocab/" className="btn">
                단어장
              </Link>
              <Link href="/" className="btn primary">
                내 자료
              </Link>
            </div>
          </div>
        )}

        {item && !finished && (
          <>
            <div className="card stack" style={{ alignItems: 'center', textAlign: 'center', padding: '24px 20px', gap: 12, borderRadius: 24, boxShadow: '0 10px 30px rgba(21,32,43,0.08)' }}>
              {item.sources[0] && (
                <span className="chip later" style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.sources[0].docTitle.length > 30 ? item.sources[0].docTitle.slice(0, 30) + '…' : item.sources[0].docTitle} · {item.sources[0].page + 1}쪽
                </span>
              )}
              <span style={{ fontFamily: 'var(--font-read)', fontSize: 30, fontWeight: 600, overflowWrap: 'anywhere' }}>{item.lemma}</span>
              {data.prefs.hk && item.hangul && (
                <span className="hk-badge" style={{ alignSelf: 'center' }}>
                  <Hangul text={item.hangul} />
                </span>
              )}
              <button className="icon-btn soft" aria-label="발음 듣기" onClick={() => speak(item.lemma, 0.9)}>
                <Icon name="speaker" size={20} />
              </button>

              {revealed ? (
                <div className="stack" style={{ alignItems: 'center', width: '100%', gap: 12 }}>
                  <span style={{ width: 60, height: 1, background: 'var(--line)' }} />
                  <span style={{ fontSize: 22, fontWeight: 700 }}>{item.meaning}</span>
                  {item.etymology && <span className="root-chip" style={{ alignSelf: 'center' }}>{item.etymology}</span>}
                  {item.sources[0] && (
                    <span style={{ fontFamily: 'var(--font-read)', fontSize: 16, lineHeight: 1.55, background: '#f7f9fa', borderRadius: 12, padding: '12px 14px', width: '100%', textAlign: 'left' }}>
                      {item.sources[0].sentence}
                    </span>
                  )}
                </div>
              ) : (
                <span className="muted" style={{ marginTop: 16 }}>
                  뜻을 떠올려 본 뒤 확인하세요
                </span>
              )}
            </div>

            {!revealed ? (
              <button className="btn dark block" style={{ minHeight: 56, fontSize: 16 }} onClick={() => setRevealed(true)}>
                정답 보기
              </button>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                <span className="small" style={{ textAlign: 'center' }}>
                  얼마나 잘 기억했나요? 아래는 다음 복습까지의 간격
                </span>
                <div className="grades">
                  {GRADES.map(({ g, label }) => (
                    <button key={g} className={`grade ${g}`} onClick={() => grade(g)}>
                      {label}
                      <small>{intervals?.[g]}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
