'use client';
// 철자 묶음마다 색을 입히고 바로 아래에 그 소리의 한글을 붙여 보여줌 (예: s·i·ng·er → ㅅ·이·ㅇ·어)
import { useMemo } from 'react';
import { spellingChunks } from '@/lib/phonetics';

export function SpellingGuide({ word, ipa }: { word: string; ipa: string }) {
  const chunks = useMemo(() => {
    try {
      return spellingChunks(word, ipa);
    } catch {
      return null;
    }
  }, [word, ipa]);
  if (!chunks || chunks.length < 2) return null;
  return (
    <div className="spell-guide" aria-label="철자별 소리 풀이">
      <div className="spell-row">
        {chunks.map((c, i) => (
          <span key={i} className={`spell ${c.kind}${c.stress ? ' stress' : ''}`}>
            <span className="spell-en">{c.en}</span>
            <span className="spell-ko">{c.kind === 'silent' ? '묵음' : c.ko}</span>
          </span>
        ))}
      </div>
      <div className="spell-legend">
        <i className="c">자음</i> <i className="v">모음</i> <i className="silent">안 읽는 글자</i>
      </div>
    </div>
  );
}
