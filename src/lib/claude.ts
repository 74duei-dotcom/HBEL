'use client';
// 단어 사전·문장 분석 (AI 제공자는 설정에서 고른 Claude 또는 Gemini - 호출은 ai.ts)
// - 단어 사전: 뜻·품사·발음기호·한글 발음(강세)·의학용어 여부·어원
// - 문장 분석: 번역 + 단어별 한글 발음(연음 반영)

import { AIError, callAI, getProvider } from './ai';
import type { DocKind, SentenceAnalysis, WordInfo } from './types';
import { tokenize } from './util';

export function extractJson<T>(text: string): T {
  const start = text.search(/[[{]/);
  const endObj = text.lastIndexOf('}');
  const endArr = text.lastIndexOf(']');
  const end = Math.max(endObj, endArr);
  if (start < 0 || end < start) throw new AIError('bad-response', getProvider(), 'AI 응답을 읽지 못했어요. 다시 시도해 주세요.');
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    throw new AIError('bad-response', getProvider(), 'AI 응답 형식이 맞지 않아요. 다시 시도해 주세요.');
  }
}

export const KIND_LABEL: Record<DocKind, string> = {
  paper: 'a medical/rehabilitation research paper',
  book: 'a professional medical textbook',
  lecture: 'a conference lecture transcript',
};

const HANGUL_RULES = `Korean pronunciation guide ("hangul") rules:
- Write how a native American English speaker actually says it, in Hangul.
- Wrap ONLY the primary-stressed syllable in asterisks, e.g. "익스*텐*션", "스판덜로리스*씨*시스", "*럼*바".
- Use common Korean loanword-style spelling, but follow real pronunciation (flap t, schwa) rather than spelling.`;

/** 단어 뜻 찾기 (문장 문맥 반영) */
export async function lookupWord(word: string, sentence: string, kind: DocKind): Promise<WordInfo> {
  const system = `You are an English-Korean dictionary for a Korean rehabilitation-exercise center director who reads ${KIND_LABEL[kind]}.
Return ONLY a JSON object, no prose, with these keys:
{"word": string (as it appears), "lemma": string (dictionary form, lowercase unless proper noun),
 "pos": string (Korean part of speech, e.g. "명사","동사","형용사","부사","구동사"),
 "ipa": string (American IPA with slashes),
 "hangul": string (Korean pronunciation guide),
 "meaning": string (concise Korean meaning that fits THIS sentence; for medical terms give the standard Korean medical term, e.g. "척추전방전위증"),
 "isMedical": boolean (true if a medical/anatomical/clinical term),
 "etymology": string (Korean, short morpheme breakdown for medical terms like "spondylo 척추 + olisthesis 미끄러짐", else ""),
 "contextNote": string (one short Korean sentence explaining the meaning in this context)}
${HANGUL_RULES}`;
  const user = `Word: ${word}\nSentence: ${sentence}`;
  const text = await callAI(system, user, 600);
  const j = extractJson<Partial<WordInfo>>(text);
  return {
    word: String(j.word ?? word),
    lemma: String(j.lemma ?? word).trim() || word.toLowerCase(),
    pos: String(j.pos ?? ''),
    ipa: String(j.ipa ?? ''),
    hangul: String(j.hangul ?? ''),
    meaning: String(j.meaning ?? ''),
    isMedical: Boolean(j.isMedical),
    etymology: String(j.etymology ?? ''),
    contextNote: String(j.contextNote ?? ''),
  };
}

/**
 * 여러 문장을 한 번에 분석: 번역 + 단어별 한글 발음
 * glossary: 단어장에 저장된 의학용어 뜻 - 번역할 때 같은 한국어 용어를 쓰도록 전달
 */
export async function analyzeSentences(sentences: string[], kind: DocKind, glossary: Record<string, string>): Promise<SentenceAnalysis[]> {
  const items = sentences.map((s, i) => ({ i, tokens: tokenize(s) }));
  const glossLines = Object.entries(glossary)
    .slice(0, 40)
    .map(([en, ko]) => `${en} = ${ko}`)
    .join('\n');
  const system = `You help a Korean reader study ${KIND_LABEL[kind]}.
For each item you get the sentence as an array of tokens (split by spaces, punctuation attached).
Return ONLY a JSON array: [{"i": number, "translation": string, "hk": string[]}]
- "translation": natural, accurate Korean translation of the whole sentence. Use standard Korean medical terminology.
- "hk": Korean pronunciation for EACH token, same length and order as tokens. Reflect connected speech (linking) across word boundaries,
  e.g. tokens ["a","common","cause","of"] -> ["어","*카*먼","*커*","저브"]; ["look","at"] -> ["*루*","캣"]. Never include punctuation in hk.
${HANGUL_RULES}${glossLines ? `\nUse these Korean terms consistently:\n${glossLines}` : ''}`;
  const user = JSON.stringify(items);
  const text = await callAI(system, user, Math.min(4000, 300 + sentences.join(' ').length * 3));
  const arr = extractJson<{ i: number; translation: string; hk: string[] }[]>(text);
  return items.map((it) => {
    const found = Array.isArray(arr) ? arr.find((a) => a.i === it.i) : undefined;
    const hk = Array.isArray(found?.hk) ? found!.hk.map((h) => String(h ?? '')) : [];
    // 단어 개수가 안 맞으면 길이를 맞춰 화면이 깨지지 않게 함
    const fixed = it.tokens.map((_, k) => hk[k] ?? '');
    return { translation: String(found?.translation ?? ''), hk: fixed };
  });
}
