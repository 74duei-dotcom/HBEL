// 간격 반복 복습(FSRS 알고리즘, Anki가 쓰는 방식) - ts-fsrs 라이브러리 사용

import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from 'ts-fsrs';
import type { SrsCard, VocabItem } from './types';
import { formatInterval } from './util';

const scheduler = fsrs(generatorParameters({ enable_fuzz: true, request_retention: 0.9 }));

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

const GRADE_MAP: Record<ReviewGrade, Grade> = {
  again: Rating.Again as Grade,
  hard: Rating.Hard as Grade,
  good: Rating.Good as Grade,
  easy: Rating.Easy as Grade,
};

function toCard(c: SrsCard): Card {
  return {
    ...c,
    due: new Date(c.due),
    last_review: c.last_review ? new Date(c.last_review) : undefined,
  } as Card;
}

function fromCard(c: Card): SrsCard {
  return {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: (c as Card & { learning_steps?: number }).learning_steps ?? 0,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.toISOString() : undefined,
  };
}

export function newCard(): SrsCard {
  return fromCard(createEmptyCard(new Date()));
}

export function reviewCard(card: SrsCard, grade: ReviewGrade, now = new Date()): SrsCard {
  const result = scheduler.next(toCard(card), now, GRADE_MAP[grade]);
  return fromCard(result.card);
}

/** 버튼 아래에 보여줄 "다음 복습까지" 간격 */
export function previewIntervals(card: SrsCard, now = new Date()): Record<ReviewGrade, string> {
  const preview = scheduler.repeat(toCard(card), now);
  const pick = (g: ReviewGrade) => {
    const item = preview[GRADE_MAP[g] as unknown as keyof typeof preview] as unknown as { card: Card };
    return formatInterval(now, item.card.due);
  };
  return { again: pick('again'), hard: pick('hard'), good: pick('good'), easy: pick('easy') };
}

export function isDue(item: VocabItem, now = new Date()): boolean {
  return !item.deleted && item.status === 'learning' && new Date(item.card.due).getTime() <= now.getTime();
}

/** 오늘 복습할 카드 목록: 기한이 된 카드 + 새 카드(하루 한도) */
export function buildQueue(items: VocabItem[], newPerDay: number, now = new Date()): VocabItem[] {
  const active = items.filter((v) => !v.deleted && v.status === 'learning');
  const due = active.filter((v) => v.card.reps > 0 && new Date(v.card.due) <= now).sort((a, b) => a.card.due.localeCompare(b.card.due));
  const fresh = active.filter((v) => v.card.reps === 0).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, Math.max(0, newPerDay));
  return [...due, ...fresh];
}
