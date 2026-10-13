// 강세 표시(*…*)가 있는 한글 발음을 굵게+밑줄로 그려줌
import { stressSegments } from '@/lib/util';

export function Hangul({ text }: { text: string }) {
  return (
    <>
      {stressSegments(text).map((g, i) => (g.strong ? <b key={i}>{g.t}</b> : <span key={i}>{g.t}</span>))}
    </>
  );
}
