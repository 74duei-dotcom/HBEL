// 동기화 병합 규칙 테스트: "마지막으로 고친 쪽을 남기고, 삭제 표시도 지켜진다"
import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, mergeData } from '../src/lib/store';
import type { AppData, VocabItem } from '../src/lib/types';

function vocab(id: string, updatedAt: string, extra: Partial<VocabItem> = {}): VocabItem {
  return {
    id,
    word: id,
    lemma: id,
    pos: 'n',
    ipa: '',
    hangul: '',
    meaning: '뜻',
    isMedical: false,
    etymology: '',
    contextNote: '',
    status: 'learning',
    sources: [],
    card: { due: updatedAt, stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
    ...extra,
  };
}

function data(v: VocabItem[]): AppData {
  return { version: 1, library: {}, grammar: {}, vocab: Object.fromEntries(v.map((x) => [x.id, x])), prefs: { ...DEFAULT_PREFS } };
}

describe('mergeData', () => {
  it('원격이 없으면 로컬 그대로', () => {
    const local = data([vocab('a', '2026-02-01T00:00:00.000Z')]);
    expect(mergeData(local, null)).toBe(local);
  });

  it('더 늦게 고친 쪽을 남긴다', () => {
    const local = data([vocab('a', '2026-02-01T00:00:00.000Z', { meaning: '로컬' })]);
    const remote = data([vocab('a', '2026-03-01T00:00:00.000Z', { meaning: '원격' })]);
    expect(mergeData(local, remote).vocab.a.meaning).toBe('원격');
    expect(mergeData(remote, local).vocab.a.meaning).toBe('원격');
  });

  it('한쪽에만 있는 항목은 합쳐진다', () => {
    const merged = mergeData(data([vocab('a', '2026-02-01T00:00:00.000Z')]), data([vocab('b', '2026-02-01T00:00:00.000Z')]));
    expect(Object.keys(merged.vocab).sort()).toEqual(['a', 'b']);
  });

  it('나중에 삭제한 표시가 옛 내용보다 우선한다', () => {
    const local = data([vocab('a', '2026-02-01T00:00:00.000Z')]);
    const remote = data([vocab('a', '2026-03-01T00:00:00.000Z', { deleted: true })]);
    expect(mergeData(local, remote).vocab.a.deleted).toBe(true);
  });
});
