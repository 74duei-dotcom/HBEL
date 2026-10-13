'use client';
// Aa 보기 메뉴: 한글 발음 · 번역 · 읽는 문장에만 · 글자 크기 (모든 화면 공통 설정)
import { useEffect, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import type { FontSize } from '@/lib/types';

export function AaMenu({ hasTr = true, hasFocus = false }: { hasTr?: boolean; hasFocus?: boolean }) {
  const { data, setPrefs } = useStore();
  const p = data.prefs;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const rows: { key: 'hk' | 'tr' | 'focus'; label: string; help: string }[] = [{ key: 'hk', label: '한글 발음', help: '영어 단어 바로 아래' }];
  if (hasTr) rows.push({ key: 'tr', label: '번역', help: '문장 아래 한국어 뜻' });
  if (hasFocus) rows.push({ key: 'focus', label: '읽는 문장에만', help: '긴 글은 지금 문장만 표시' });

  const sizes: [FontSize, string][] = [
    ['s', '작게'],
    ['m', '보통'],
    ['l', '크게'],
  ];

  return (
    <div className="aa" ref={ref}>
      <button className="aa-btn" aria-label="보기 설정" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Aa
        {(p.hk || (hasTr && p.tr)) && <span className="aa-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="aa-panel" role="dialog" aria-label="보기 설정">
          {rows.map((r) => (
            <div className="aa-row" key={r.key}>
              <span className="stack" style={{ gap: 2 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{r.label}</span>
                <span className="small">{r.help}</span>
              </span>
              <button className="switch" role="switch" aria-checked={p[r.key]} aria-label={r.label} onClick={() => setPrefs({ [r.key]: !p[r.key] })}>
                <span />
              </button>
            </div>
          ))}
          <div className="between" style={{ minHeight: 56 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>글자 크기</span>
            <div className="seg" role="radiogroup" aria-label="글자 크기" style={{ padding: 3 }}>
              {sizes.map(([k, label]) => (
                <button key={k} role="radio" aria-checked={p.fontSize === k} onClick={() => setPrefs({ fontSize: k })} style={{ padding: '0 8px', fontSize: 13 }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <span className="small">여기서 바꾸면 모든 화면에 함께 적용돼요</span>
        </div>
      )}
    </div>
  );
}
