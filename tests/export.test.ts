// Anki 내보내기 형식 테스트
import { describe, expect, it } from 'vitest';
import { vocabToAnkiText } from '../src/lib/export';
import { newCard } from '../src/lib/srs';
import type { VocabItem } from '../src/lib/types';

const item: VocabItem = {
  id: 'oblique', word: 'oblique', lemma: 'oblique', pos: 'adjective', ipa: '/əˈbliːk/', hangul: '오*블리*크',
  meaning: '사선의', isMedical: true, etymology: 'Latin obliquus', contextNote: '',
  status: 'learning', sources: [{ docId: 'd', docTitle: 'T', page: 0, sentence: 'An <oblique>\tview\nwas used.' }],
  card: newCard(), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('vocabToAnkiText', () => {
  const lines = vocabToAnkiText([item]).trimEnd().split('\n');

  it('머리말 3줄 + 단어 1줄', () => {
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('#separator:tab');
  });

  it('칸은 탭 3개(앞면·뒷면·태그)로 나뉘고 본문의 탭·줄바꿈은 섞이지 않는다', () => {
    const cols = lines[3].split('\t');
    expect(cols).toHaveLength(3);
    expect(cols[0]).toBe('oblique');
    expect(cols[2]).toBe('영어서재 의학 adjective');
  });

  it('강세는 굵게, HTML 특수문자는 안전하게', () => {
    const back = lines[3].split('\t')[1];
    expect(back).toContain('오<b>블리</b>크');
    expect(back).toContain('&lt;oblique&gt;');
    expect(back).toContain('사선의');
  });
});
