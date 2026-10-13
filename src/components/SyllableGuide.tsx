// 음절별 철자 · 한글 소리 · 그렇게 읽는 이유를 보여주는 표
import type { Syllable } from '@/lib/types';

export function SyllableGuide({ syllables }: { syllables?: Syllable[] }) {
  if (!syllables || syllables.length === 0) return null;
  return (
    <div className="syl-guide" aria-label="음절별 발음 설명">
      <div className="syl-row">
        {syllables.map((s, i) => (
          <span key={i} className={`syl${s.stress ? ' stress' : ''}`}>
            <span className="syl-en">{s.en}</span>
            <span className="syl-ko">{s.ko}</span>
          </span>
        ))}
      </div>
      <ul className="syl-why">
        {syllables.map((s, i) =>
          s.why ? (
            <li key={i}>
              <b>{s.en}</b> → {s.ko}
              {s.stress && <em> (강세)</em>} · {s.why}
            </li>
          ) : null,
        )}
      </ul>
    </div>
  );
}
