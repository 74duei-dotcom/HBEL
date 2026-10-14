'use client';
// 단어 사전·문장 분석 (AI는 Gemini - 호출은 ai.ts)
// - 단어 사전: 뜻·품사·발음기호·한글 발음(강세)·의학용어 여부·어원
// - 문장 분석: 번역 + 단어별 한글 발음(연음 반영)

import { AIError, callAI, getProvider } from './ai';
import type { DocKind, SentenceAnalysis, WordInfo } from './types';
import { tokenize } from './util';

export function extractJson<T>(text: string): T {
  let cleaned = text.trim();
  // 마크다운 코드 블록(```json ... ```) 제거
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  const start = cleaned.search(/[[{]/);
  const endObj = cleaned.lastIndexOf('}');
  const endArr = cleaned.lastIndexOf(']');
  const end = Math.max(endObj, endArr);
  if (start < 0 || end < start) throw new AIError('bad-response', getProvider(), 'AI 응답을 읽지 못했어요. 다시 시도해 주세요.');
  const raw = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(raw) as T;
  } catch {
    // 흔한 오류 보정: 후행 쉼표(trailing comma: , } 또는 , ]) 제거 후 다시 시도
    try {
      const sanitized = raw.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(sanitized) as T;
    } catch {
      throw new AIError('bad-response', getProvider(), 'AI 응답 형식이 맞지 않아요. 다시 시도해 주세요.');
    }
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
- Use common Korean loanword-style spelling, but follow real pronunciation (flap t, schwa) rather than spelling.
- The reader is a complete beginner: spell sounds that do not exist in Korean so they are easy to tell apart:
  - /ʒ/ (measure, vision, treasure, usual): "저/져" family, never "슈" -> "*메*저", "*비*젼". /ʃ/ (sure, pressure, -tion): "슈/션" family -> "*프레*셔", "엑스텐*션*". /tʃ/ ch: "치/체", /dʒ/ j, g: "지/제".
  - th: voiced /ð/ (the, this, that, with) -> "더/디/댓/위드"; voiceless /θ/ (think, thyroid, bath) -> "씽크", "*싸*이로이드", "배쓰" (use "ㅆ", not "ㅅ").
  - r vs l: initial r -> "뤼/뤠/롸" style (red "*뤠*드", right "*롸*잇"); initial l -> plain "ㄹ" ("라/레"); American final r keeps a soft "ㄹ" ("*워*러", "*메*저").
  - f -> "ㅍ" and v -> "ㅂ" (fever "*퓌*버", very "*베*뤼"); mention in "why" that f/v use the lip-on-teeth position when confusing.
  - z/-s voiced endings: "즈" (is -> "이즈", muscles -> "*머*쓸즈"); unvoiced s: "스".
  - final -tion/-sion/-cial: "션/젼/셜"; -ture: "철", -ous: "어스", -ed: "ㅌ/ㄷ/드" by sound (walked -> "*워*크트", moved -> "*무*브드").
  - short a /æ/ (cat, anatomy) -> "애" (not "아"); /ʌ/ (cut) -> "어"; /ɑ/ (hot) -> "아"; schwa -> weak "어/으".
  - Silent letters are not pronounced (knee "니", debt "뎃", psychology "싸이*칼*러지").
  - In "why", give a one-line beginner tip for tricky sounds, e.g. "s 뒤 u는 'ʒ'(저) 소리, '슈' 아님".`;

/** 음절 목록에서 강세(*) 표시가 있는 한글 발음을 만듦 */
function joinHangul(syl: { ko: string; stress: boolean }[]): string {
  return syl.map((x) => (x.stress ? `*${x.ko}*` : x.ko)).join('');
}

/** 단어 뜻 찾기 (문장 문맥 반영) */
const lookupInflight = new Map<string, Promise<WordInfo>>();

/** 같은 단어를 동시에 두 번 묻지 않게 함 (개발 모드 이중 실행·연타 대비) */
export function lookupWord(word: string, sentence: string, kind: DocKind): Promise<WordInfo> {
  const key = `${word.toLowerCase()}|${sentence}`;
  const hit = lookupInflight.get(key);
  if (hit) return hit;
  const p = lookupWordNow(word, sentence, kind).finally(() => lookupInflight.delete(key));
  lookupInflight.set(key, p);
  return p;
}

async function lookupWordNow(word: string, sentence: string, kind: DocKind): Promise<WordInfo> {
  const system = `You are an English-Korean dictionary for a Korean rehabilitation-exercise center director who reads ${KIND_LABEL[kind]}.
Be fast and concise. Return ONLY a JSON object, no prose, with these keys:
{"word": string (as it appears), "lemma": string (dictionary form, lowercase unless proper noun),
 "pos": string (Korean part of speech, e.g. "명사","동사","형용사","부사","구동사"),
 "ipa": string (American IPA with slashes AND stress marks ˈ (primary) ˌ (secondary), e.g. "/ɪkˈsprɛs/"),
 "syllables": [{"en": string (spelling chunk), "ko": string (Hangul sound of this syllable), "stress": boolean (true for the primary-stressed syllable), "why": string (very short Korean reason, <=25 chars, why it is read this way, e.g. "x는 'ks' 소리라 '익스'")}] (spelling chunks joined must equal the word),
 "meaning": string (concise Korean meaning that fits THIS sentence; for medical terms give the standard Korean medical term, e.g. "척추전방전위증"),
 "isMedical": boolean (true if a medical/anatomical/clinical term),
 "etymology": string (Korean, ONE short line on the word's origin for EVERY word: source language + original word + its meaning, e.g. "라틴어 ex(밖으로) + premere(누르다) → 짜내다 → 표현하다"; for medical terms break into morphemes like "spondylo 척추 + olisthesis 미끄러짐"),
 "contextNote": string (one short Korean sentence explaining the meaning in this context)}
${HANGUL_RULES}`;
  const user = `Word: ${word}\nSentence: ${sentence}`;
  const text = await callAI(system, user, 400, { timeoutMs: 60000, priority: 'user' });
  const j = extractJson<Partial<WordInfo>>(text);
  const syllables = Array.isArray(j.syllables)
    ? j.syllables
        .map((s) => ({ en: String(s?.en ?? ''), ko: String(s?.ko ?? ''), stress: Boolean(s?.stress), why: String(s?.why ?? '') }))
        .filter((s) => s.en || s.ko)
    : [];
  return {
    syllables,
    word: String(j.word ?? word),
    lemma: String(j.lemma ?? word).trim() || word.toLowerCase(),
    pos: String(j.pos ?? ''),
    ipa: String(j.ipa ?? ''),
    hangul: String(j.hangul ?? '') || joinHangul(syllables),
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
export async function analyzeSentences(sentences: string[], kind: DocKind, glossary: Record<string, string>, retry = false): Promise<SentenceAnalysis[]> {
  const items = sentences.map((s, i) => ({ i, tokens: tokenize(s) }));
  const glossLines = Object.entries(glossary)
    .slice(0, 40)
    .map(([en, ko]) => `${en} = ${ko}`)
    .join('\n');
  const system = `You help a Korean reader study ${KIND_LABEL[kind]}.
For each item you get the sentence as an array of tokens (split by spaces, punctuation attached).
Return ONLY a JSON array: [{"i": number, "translation": string, "hk": string[], "br": number[]}]
- "translation": natural, accurate Korean translation of the whole sentence. Use standard Korean medical terminology.
- "hk": Korean pronunciation for EACH token, same length and order as tokens. Reflect connected speech (linking) across word boundaries,
  e.g. tokens ["a","common","cause","of"] -> ["어","*카*먼","*커*","저브"]; ["look","at"] -> ["*루*","캣"]. Never include punctuation in hk.
- "br": phrase-break (pause) positions for reading aloud, as 0-based token indices; a pause comes right AFTER that token. Break between meaningful thought groups (about 3-7 words each): before prepositional phrases, relative/subordinate clauses and conjunctions, and after commas or a long subject. Never put a break after the last token. Short sentences may have [].
${HANGUL_RULES}${glossLines ? `\nUse these Korean terms consistently:\n${glossLines}` : ''}`;
  const user = JSON.stringify(items);
  const text = await callAI(system, user, Math.min(4000, 300 + sentences.join(' ').length * 3), { timeoutMs: 60000, priority: 'bg' });
  const arr = extractJson<{ i: number; translation: string; hk: string[]; br?: number[] }[]>(text);
  const result: SentenceAnalysis[] = items.map((it, pos) => {
    // i 번호가 맞는 항목을 찾고, 없으면 같은 순서의 항목을 사용
    const found = Array.isArray(arr) ? (arr.find((a) => Number(a?.i) === it.i) ?? (arr.length === items.length ? arr[pos] : undefined)) : undefined;
    const hk = Array.isArray(found?.hk) ? found!.hk.map((h) => String(h ?? '')) : [];
    // 단어 개수가 안 맞으면 길이를 맞춰 화면이 깨지지 않게 함
    const fixed = it.tokens.map((_, k) => hk[k] ?? '');
    const last = it.tokens.length - 1;
    const br = Array.isArray(found?.br)
      ? [...new Set(found!.br.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < last))].sort((a, b) => a - b)
      : [];
    return { translation: String(found?.translation ?? '').trim(), hk: fixed, br };
  });

  // 번역이나 한글 발음이 빠진 문장은 그 문장만 한 번 더 요청하고, 그래도 비면 오류로 알려 "다시 시도"가 뜨게 함 (빈 번역이 저장되지 않도록)
  const missing = result.map((r, k) => (r.translation && r.hk.some((h) => h.trim()) ? -1 : k)).filter((k) => k >= 0);
  if (missing.length) {
    if (!retry) {
      const again = await analyzeSentences(
        missing.map((k) => sentences[k]),
        kind,
        glossary,
        true
      );
      missing.forEach((k, n) => (result[k] = again[n]));
    } else {
      throw new AIError('bad-response', getProvider(), 'AI가 일부 문장의 번역·발음을 빠뜨렸어요. 다시 시도해 주세요.');
    }
  }
  return result;
}
