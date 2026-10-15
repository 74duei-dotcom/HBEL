// 복습 대기열(buildQueue) 규칙 테스트
import { describe, expect, it } from 'vitest';
import { buildQueue, newCard, reviewCard } from '../src/lib/srs';
import type { VocabItem } from '../src/lib/types';

function item(id: string, over: Partial<VocabItem> = {}, cardOver: Partial<VocabItem['card']> = {}): VocabItem {
  return {
    id, word: id, lemma: id, pos: '', ipa: '', hangul: '', meaning: '', isMedical: false, etymology: '', contextNote: '',
    status: 'learning', sources: [], card: { ...newCard(), ...cardOver },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
  };
}

describe('buildQueue', () => {
  const now = new Date('2026-06-01T12:00:00.000Z');

  it('새 카드는 하루 한도까지만', () => {
    const items = [item('a'), item('b'), item('c')];
    expect(buildQueue(items, 2, now)).toHaveLength(2);
  });

  it('알아요·삭제된 단어는 제외', () => {
    const items = [item('a', { status: 'known' }), item('b', { deleted: true }), item('c')];
    expect(buildQueue(items, 10, now).map((v) => v.id)).toEqual(['c']);
  });

  it('기한이 지난 카드가 새 카드보다 앞에 온다', () => {
    const due = item('old', {}, { reps: 2, due: '2026-05-30T00:00:00.000Z' });
    const future = item('later', {}, { reps: 2, due: '2026-07-01T00:00:00.000Z' });
    expect(buildQueue([item('new'), future, due], 10, now).map((v) => v.id)).toEqual(['old', 'new']);
  });
});

describe('reviewCard', () => {
  it('"쉬움"이 "다시"보다 다음 복습이 멀다', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    const easy = reviewCard(newCard(), 'easy', now);
    const again = reviewCard(newCard(), 'again', now);
    expect(new Date(easy.due).getTime()).toBeGreaterThan(new Date(again.due).getTime());
  });
});
