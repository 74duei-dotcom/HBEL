// 단어장을 Anki(안키)로 가져올 수 있는 텍스트 파일로 내보내기
import type { VocabItem } from './types';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 한 칸 안에서 탭·줄바꿈이 섞이지 않게 정리 */
function cell(s: string): string {
  return s.replace(/[\t\r\n]+/g, ' ').trim();
}

/** 한글 발음의 강세 표시 *텐* → <b>텐</b> */
function hangulHtml(h: string): string {
  return h
    .split('*')
    .map((t, i) => (i % 2 === 1 ? `<b>${esc(t)}</b>` : esc(t)))
    .join('');
}

/**
 * Anki "텍스트 가져오기" 형식(탭으로 구분, HTML 허용).
 * 앞면 = 단어, 뒷면 = 발음·뜻·어원·예문, 마지막 칸 = 태그
 */
export function vocabToAnkiText(items: VocabItem[]): string {
  const lines = ['#separator:tab', '#html:true', '#tags column:3'];
  for (const v of items) {
    const back: string[] = [];
    if (v.ipa) back.push(`<div>${esc(v.ipa)}</div>`);
    if (v.hangul) back.push(`<div>${hangulHtml(v.hangul)}</div>`);
    back.push(`<div><b>${esc(v.meaning)}</b></div>`);
    if (v.etymology) back.push(`<div>${esc(v.etymology)}</div>`);
    const src = v.sources[0];
    if (src?.sentence) back.push(`<div><i>${esc(src.sentence)}</i></div>`);
    const tags = ['영어서재', v.isMedical ? '의학' : '', v.pos ? v.pos.replace(/\s+/g, '_') : ''].filter(Boolean).join(' ');
    lines.push([cell(v.lemma), cell(back.join('')), cell(tags)].join('\t'));
  }
  return lines.join('\n') + '\n';
}

/** 브라우저에서 파일 저장 창을 띄움 */
export function downloadText(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
