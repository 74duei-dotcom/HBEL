'use client';
// 알파벳 소리표 한 장 화면 + 바로가기 카드 (홈·발음 연습에서 공통 사용)
import Link from 'next/link';
import { ALPHABET, ALPHABET_EXAMPLES, DIGRAPHS } from '@/lib/alphabet';
import { Icon } from '@/components/Icon';

export function AlphabetLinkCard() {
  return (
    <Link href="/pronounce/?view=alphabet" className="card between" style={{ padding: '12px 16px', textDecoration: 'none', color: 'inherit' }}>
      <span className="stack" style={{ gap: 2 }}>
        <b>알파벳 소리표</b>
        <span className="small">글자 이름과 단어 속 소리는 달라요 — 한 장으로 보기</span>
      </span>
      <span aria-hidden>→</span>
    </Link>
  );
}

export function AlphabetSheet() {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/pronounce/" className="icon-btn" aria-label="발음 연습으로">
            <Icon name="back" />
          </Link>
          <div className="topbar-title">
            <strong>알파벳 소리표</strong>
            <span>알파벳의 이름과 단어 속 소리는 다릅니다</span>
          </div>
          <span style={{ width: 44 }} />
        </div>
      </header>
      <main className="page no-tabs">
        <div className="card flush">
          <div className="list-row small" style={{ fontWeight: 600, gap: 8 }}>
            <span style={{ width: 28 }}>글자</span>
            <span style={{ width: 64 }}>이름</span>
            <span className="grow">단어 속 소리</span>
          </div>
          {ALPHABET.map((r) => (
            <div key={r.letter} className="list-row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <b style={{ width: 28, fontSize: 24, lineHeight: 1.1, color: 'var(--teal)' }}>{r.letter}</b>
              <span style={{ width: 64, fontSize: 15, paddingTop: 3 }}>{r.name}</span>
              <span className="grow stack" style={{ gap: 2 }}>
                <b style={{ fontSize: 15, paddingTop: 3 }}>{r.sounds}</b>
                {r.tip && <span className="small">{r.tip}</span>}
              </span>
            </div>
          ))}
        </div>

        <b>같은 글자, 다른 소리</b>
        {ALPHABET_EXAMPLES.map((e) => (
          <div key={e.letter} className="card row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap', borderLeft: `4px solid ${e.color}` }}>
            <b style={{ fontSize: 28, color: e.color, width: 28 }}>{e.letter}</b>
            {e.words.map((w) => (
              <span key={w.en} style={{ fontFamily: 'var(--font-read)', fontSize: 18 }}>
                {w.en} <span className="muted">({w.ko})</span>
              </span>
            ))}
          </div>
        ))}

        <b>두 글자가 합쳐지는 소리</b>
        <div className="card flush">
          {DIGRAPHS.map((d) => (
            <div key={d.en} className="list-row" style={{ gap: 8 }}>
              <b style={{ width: 40, fontSize: 18, color: 'var(--teal)' }}>{d.en}</b>
              <span className="grow" style={{ fontSize: 14 }}>{d.sound}</span>
              <span style={{ fontFamily: 'var(--font-read)' }}>
                {d.word} <span className="muted">({d.ko})</span>
              </span>
            </div>
          ))}
        </div>

        <div className="card stack" style={{ background: 'var(--teal)', color: '#fff', textAlign: 'center', gap: 4 }}>
          <span>알파벳의 이름을 읽는 것이 아니라</span>
          <b style={{ fontSize: 18 }}>단어 안에서 나는 소리를 익힌다!</b>
        </div>
        <span className="small">한글 발음은 영어 소리를 이해하기 위한 근사 표기예요. 정확한 소리는 &apos;원어민 소리 듣기&apos;로 확인하세요.</span>
      </main>
    </>
  );
}
