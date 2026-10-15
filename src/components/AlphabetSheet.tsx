'use client';
// 알파벳 소리표: 2열 타일로 한 화면에 최대한 많이 보이게. 팁은 타일을 누르면 펼침 (홈·발음 연습 공통 사용)
import Link from 'next/link';
import { useState } from 'react';
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

const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(156px, 1fr))', gap: 8 } as const;

export function AlphabetSheet() {
  const [open, setOpen] = useState('');
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/pronounce/" className="icon-btn" aria-label="발음 연습으로">
            <Icon name="back" />
          </Link>
          <div className="topbar-title">
            <strong>알파벳 소리표</strong>
            <span>이름이 아니라 단어 속 소리를 익혀요</span>
          </div>
          <span style={{ width: 44 }} />
        </div>
      </header>
      <main className="page no-tabs" style={{ gap: 12 }}>
        <div style={grid2}>
          {ALPHABET.map((r) => {
            const isOpen = open === r.letter;
            return (
              <button
                key={r.letter}
                type="button"
                className="card"
                onClick={() => r.tip && setOpen(isOpen ? '' : r.letter)}
                aria-expanded={r.tip ? isOpen : undefined}
                style={{
                  padding: '8px 10px',
                  textAlign: 'left',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '0 8px',
                  cursor: r.tip ? 'pointer' : 'default',
                  gridColumn: isOpen ? '1 / -1' : undefined,
                  borderColor: isOpen ? 'var(--teal)' : undefined,
                }}
              >
                <b style={{ fontSize: 26, lineHeight: 1, color: 'var(--teal)', width: 24, textAlign: 'center' }}>{r.letter}</b>
                <span className="stack" style={{ gap: 1, flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 'clamp(12px, 3.5vw, 16px)', lineHeight: 1.3 }}>{r.sounds}</b>
                  <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{r.name}</span>
                </span>
                {r.tip && <span aria-hidden style={{ color: 'var(--ink-2)', fontSize: 11 }}>{isOpen ? '▲' : 'ⓘ'}</span>}
                {isOpen && r.tip && <span className="small" style={{ flexBasis: '100%', marginTop: 6, color: 'var(--ink)' }}>{r.tip}</span>}
              </button>
            );
          })}
        </div>
        <span className="small">ⓘ 표시 타일을 누르면 발음 팁이 펼쳐져요.</span>

        <b style={{ fontSize: 15 }}>같은 글자, 다른 소리</b>
        <div style={grid2}>
          {ALPHABET_EXAMPLES.map((e) => (
            <div key={e.letter} className="card" style={{ padding: '8px 10px', borderLeft: `4px solid ${e.color}`, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <b style={{ fontSize: 22, lineHeight: 1.1, color: e.color }}>{e.letter}</b>
              <span style={{ fontFamily: 'var(--font-read)', fontSize: 14, lineHeight: 1.45 }}>
                {e.words.map((w) => (
                  <span key={w.en} style={{ display: 'block' }}>
                    {w.en} <span className="muted">{w.ko}</span>
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>

        <b style={{ fontSize: 15 }}>두 글자가 합쳐지는 소리</b>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {DIGRAPHS.map((d) => (
            <span key={d.en} className="chip later" style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)', gap: 6 }}>
              <b style={{ color: 'var(--teal)' }}>{d.en}</b>
              <span style={{ fontFamily: 'var(--font-read)' }}>
                {d.word}({d.ko})
              </span>
            </span>
          ))}
        </div>

        <div className="card" style={{ background: 'var(--teal)', color: '#fff', textAlign: 'center', padding: '10px 12px', fontSize: 14 }}>
          알파벳의 이름을 읽는 게 아니라 <b>단어 안에서 나는 소리</b>를 익힌다!
        </div>
        <span className="small">한글 발음은 영어 소리를 이해하기 위한 근사 표기예요. 정확한 소리는 &apos;원어민 소리 듣기&apos;로 확인하세요.</span>
      </main>
    </>
  );
}
