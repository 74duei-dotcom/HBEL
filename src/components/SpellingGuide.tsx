'use client';
// 철자 묶음마다 색을 입히고 바로 아래에 그 소리의 한글을 붙여 보여줌 (예: s·i·ng·er → ㅅ·이·ㅇ·어)
// 음절 경계는 세로 선과 "trans · ferred" 줄로 함께 보여줌
import { useMemo } from 'react';
import { spellingChunks, syllabify } from '@/lib/phonetics';

export function SpellingGuide({ word, ipa }: { word: string; ipa: string }) {
  const res = useMemo(() => {
    try {
      const chunks = spellingChunks(word, ipa);
      if (!chunks) return null;
      return { chunks, syls: syllabify(chunks) };
    } catch {
      return null;
    }
  }, [word, ipa]);
  if (!res || res.chunks.length < 2) return null;
  const { chunks, syls } = res;
  return (
    <div className="spell-guide" aria-label="철자별 소리 풀이">
      <div className="spell-syl">
        <b>음절</b> {syls.join(' · ')} <span>({syls.length}음절)</span>
      </div>
      <div className="spell-row">
        {chunks.map((c, i) => (
          <span key={i} className={`spell ${c.kind}${c.stress ? ' stress' : ''}${c.sylStart ? ' syl-start' : ''}`}>
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
