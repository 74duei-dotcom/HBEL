'use client';
// 문법 분석·연습 문제 (AI 호출은 ai.ts 사용)
// - 문장 하나에서 문법 항목(수동태, 완곡 표현 등)을 뽑고 문장 구조를 요약
// - 저장한 문법 항목으로 객관식 연습 문제를 만듦

import { callAI } from './ai';
import { extractJson, KIND_LABEL } from './claude';
import type { DocKind, GrammarAnalysis, GrammarExample, GrammarPoint, GrammarQuiz, PatternRole, PatternPart, SentencePattern } from './types';

/** 문법 이름(영어)을 저장용 id로 */
export function grammarId(nameEn: string): string {
  return nameEn
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const PATTERN_ROLES: Record<number, PatternRole[]> = {
  1: ['S', 'V'],
  2: ['S', 'V', 'C'],
  3: ['S', 'V', 'O'],
  4: ['S', 'V', 'IO', 'DO'],
  5: ['S', 'V', 'O', 'OC'],
};

/** AI가 돌려준 형식 판정을 검사한다. 성분 순서가 형식과 맞지 않거나 원문에 없는 조각이 있으면 버린다(틀린 판정을 보여주느니 안 보여줌). */
export function checkPattern(raw: unknown, sentence: string): SentencePattern | undefined {
  const r = raw as { n?: unknown; parts?: unknown } | null | undefined;
  const n = Number(r?.n);
  if (!Number.isInteger(n) || n < 1 || n > 5 || !Array.isArray(r?.parts)) return undefined;
  const parts: PatternPart[] = [];
  for (const p of r.parts as { role?: unknown; text?: unknown }[]) {
    const role = String(p?.role ?? '').toUpperCase() as PatternRole;
    const text = String(p?.text ?? '').trim();
    if (!['S', 'V', 'O', 'C', 'IO', 'DO', 'OC', 'M'].includes(role) || !text) return undefined;
    parts.push({ role, text });
  }
  const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase();
  const whole = norm(sentence);
  if (parts.some((p) => !whole.includes(norm(p.text)))) return undefined;
  const core = parts.filter((p) => p.role !== 'M').map((p) => p.role);
  const want = PATTERN_ROLES[n];
  if (core.length !== want.length || core.some((role, i) => role !== want[i])) return undefined;
  return { n: n as SentencePattern['n'], parts };
}

export async function analyzeGrammar(sentence: string, kind: DocKind): Promise<GrammarAnalysis> {
  const system = `You are an English grammar tutor for a Korean rehabilitation-exercise center director who reads ${KIND_LABEL[kind]}.
Analyze ONE sentence. Return ONLY a JSON object, no prose:
{"structure": string (Korean, one line summarizing the sentence skeleton, e.g. "주어: X / 동사: Y / 목적어: Z / 수식: …"),
 "pattern": null or {"n": 1|2|3|4|5 (the traditional English sentence pattern of the MAIN clause: 1 = S+V, 2 = S+V+C, 3 = S+V+O, 4 = S+V+IO+DO, 5 = S+V+O+OC),
   "parts": [{"role": "S"|"V"|"O"|"C"|"IO"|"DO"|"OC"|"M" (M = modifier or adverbial, not part of the pattern),
              "text": string (the EXACT substring of the sentence, in sentence order)}]}.
   The non-M roles in "parts" must appear in exactly the order of the pattern and cover the whole main clause. If the sentence is a fragment, a question, or you are not sure which pattern it is, set "pattern" to null.
   Passive sentences: the grammatical subject is S, the participle is V (pattern 1 for "The knee was injured.", pattern 2 is NOT used for passives). Subordinate clauses stay inside the part they belong to.
 "points": [{"nameEn": string (standard English grammar name, lowercase, e.g. "passive voice", "hedging with modal verbs", "relative clause", "participial phrase"),
   "name": string (Korean name, e.g. "수동태", "조동사를 이용한 완곡 표현", "관계절", "분사구문"),
   "part": string (the EXACT substring of the sentence where it appears),
   "explanation": string (Korean, 1-2 plain sentences explaining how to read it),
   "usage": string (Korean, one sentence on how it is typically used in medical/academic writing)}]}
- List at most 4 points, only ones worth studying for an intermediate learner. Skip trivial ones (simple present, plain nouns).
- If nothing notable, return an empty "points" array.`;
  const text = await callAI(system, sentence, 1200);
  const j = extractJson<Partial<Omit<GrammarAnalysis, 'pattern'>> & { pattern?: unknown }>(text);
  const points: GrammarPoint[] = (Array.isArray(j.points) ? j.points : [])
    .map((p) => ({
      nameEn: String(p?.nameEn ?? '').trim().toLowerCase(),
      name: String(p?.name ?? '').trim(),
      part: String(p?.part ?? '').trim(),
      explanation: String(p?.explanation ?? '').trim(),
      usage: String(p?.usage ?? '').trim(),
    }))
    .filter((p) => p.nameEn && p.name && grammarId(p.nameEn));
  return { structure: String(j.structure ?? '').trim(), points, pattern: checkPattern(j.pattern, sentence) ?? null };
}

export async function makeGrammarQuiz(name: string, nameEn: string, examples: GrammarExample[], kind: DocKind = 'paper'): Promise<GrammarQuiz[]> {
  const system = `You write grammar practice questions for a Korean learner who reads ${KIND_LABEL[kind]}.
Grammar point: ${nameEn} (${name}).
Return ONLY a JSON array of exactly 3 multiple-choice questions:
[{"q": string (an English sentence in a medical/rehabilitation context with ONE blank written as "____"),
  "choices": string[] (exactly 4 short options, only one correct),
  "answer": number (0-3, index of the correct option),
  "explain": string (Korean, 1-2 sentences why the answer is right)}]
Base the questions on the learner's own example sentences when given, but change them so they are not copied verbatim.`;
  const user = examples.length ? examples.slice(0, 4).map((e) => `- ${e.sentence}`).join('\n') : '(no examples yet)';
  const text = await callAI(system, user, 1500);
  const arr = extractJson<Partial<GrammarQuiz>[]>(text);
  return (Array.isArray(arr) ? arr : [])
    .map((q) => ({
      q: String(q?.q ?? '').trim(),
      choices: Array.isArray(q?.choices) ? q.choices.map((c) => String(c)) : [],
      answer: Number(q?.answer ?? -1),
      explain: String(q?.explain ?? '').trim(),
    }))
    .filter((q) => q.q.includes('____') && q.choices.length >= 2 && q.answer >= 0 && q.answer < q.choices.length)
    .slice(0, 3);
}
