'use client';
// D3 단어 상세: 발음·뜻·어원, 학습 상태 바꾸기, 내 자료 속 문장, 삭제
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useStore } from '@/lib/store';
import { speak } from '@/lib/speech';
import { newCard } from '@/lib/srs';
import { relativeDue } from '@/lib/util';
import { Hangul } from '@/components/Hangul';
import { SyllableGuide } from '@/components/SyllableGuide';
import { SpellingGuide } from '@/components/SpellingGuide';
import { Icon } from '@/components/Icon';

function WordInner() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get('id') ?? '';
  const { data, ready, upsertVocab, removeVocab } = useStore();
  const v = data.vocab[id];

  if (ready && (!v || v.deleted)) {
    return (
      <main className="page no-tabs">
        <div className="banner err">단어를 찾을 수 없어요.</div>
        <Link href="/vocab/" className="btn">
          단어장으로
        </Link>
      </main>
    );
  }
  if (!v) return <main className="page no-tabs muted">불러오는 중…</main>;

  const setStatus = (status: 'learning' | 'known') => {
    if (status === v.status) return;
    upsertVocab({ ...v, status, card: status === 'learning' && v.status === 'known' ? newCard() : v.card });
  };

  const remove = () => {
    if (!window.confirm(`"${v.lemma}"을(를) 단어장에서 지울까요?`)) return;
    removeVocab(v.id);
    router.push('/vocab/');
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/vocab/" className="icon-btn" aria-label="단어장으로">
            <Icon name="back" />
          </Link>
          <div className="topbar-title">
            <strong>단어 상세</strong>
          </div>
          <span style={{ width: 44 }} />
        </div>
      </header>
      <main className="page no-tabs">
        <div className="card stack">
          <div className="between" style={{ alignItems: 'flex-start' }}>
            <div className="stack" style={{ gap: 6, minWidth: 0 }}>
              <span style={{ fontFamily: 'var(--font-read)', fontSize: 26, fontWeight: 600, overflowWrap: 'anywhere' }}>{v.lemma}</span>
              <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {v.isMedical && <span className="chip med">의학용어</span>}
                {v.ipa && <span className="ipa" aria-label="발음기호">{v.ipa}</span>}
                {v.pos && <span className="small">{v.pos}</span>}
              </span>
              {v.hangul && (
                <span className="hk-badge">
                  <small>한글</small>
                  <Hangul text={v.hangul} />
                </span>
              )}
            </div>
            <button className="icon-btn soft" aria-label="발음 듣기" onClick={() => speak(v.lemma, 0.9)}>
              <Icon name="speaker" size={20} />
            </button>
          </div>
          <div style={{ fontSize: 19, fontWeight: 700 }}>{v.meaning}</div>
          {data.prefs.hk && <SpellingGuide word={v.word} ipa={v.ipa} />}
          <SyllableGuide syllables={v.syllables} />
          {v.etymology && (
            <div className="origin-box">
              <b>어원</b>
              {v.etymology}
            </div>
          )}
          {v.contextNote && <span className="muted" style={{ fontSize: 14 }}>{v.contextNote}</span>}
        </div>

        <div className="card stack">
          <div className="between">
            <b style={{ fontSize: 13 }}>학습 상태</b>
            <span className="small">{v.status === 'learning' ? `다음 복습: ${v.card.reps === 0 ? '새 단어' : relativeDue(v.card.due)} · 복습 ${v.card.reps}번` : '복습에서 빠져요 (언제든 되돌리기)'}</span>
          </div>
          <div className="seg" role="radiogroup" aria-label="학습 상태">
            <button role="radio" aria-checked={v.status === 'learning'} onClick={() => setStatus('learning')}>
              학습 중
            </button>
            <button role="radio" aria-checked={v.status === 'known'} onClick={() => setStatus('known')}>
              알아요
            </button>
          </div>
        </div>

        <section className="stack">
          <b style={{ fontSize: 13, color: 'var(--ink-2)' }}>내 자료에서 나온 문장 · {v.sources.length}</b>
          {v.sources.map((s, i) => (
            <Link key={i} href={`/reader/?id=${s.docId}`} className="card stack" style={{ textDecoration: 'none', color: 'var(--ink)', gap: 6 }}>
              <span className="small">
                {s.docTitle.length > 40 ? s.docTitle.slice(0, 40) + '…' : s.docTitle} · {s.page + 1}쪽 →
              </span>
              <span style={{ fontFamily: 'var(--font-read)', fontSize: 15, lineHeight: 1.5 }}>{s.sentence}</span>
            </Link>
          ))}
        </section>

        <div className="row">
          <button className="btn danger" onClick={remove}>
            삭제
          </button>
          <Link href="/review/" className="btn primary grow">
            복습하러 가기
          </Link>
        </div>
      </main>
    </>
  );
}

export default function WordPage() {
  return (
    <Suspense fallback={<main className="page no-tabs muted">불러오는 중…</main>}>
      <WordInner />
    </Suspense>
  );
}
