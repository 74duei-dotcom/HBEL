'use client';
// 단어 발음을 이 기기 안에서 직접 만든다 (AI·인터넷·사용 한도 없음)
// 1) espeak-ng(오픈소스, phonemizer)로 미국 영어 IPA 발음기호를 만들고
// 2) 아래 규칙표로 IPA → 한글 발음(음절·강세·읽는 요령)으로 바꾼다
import type { Syllable } from './types';

export interface LocalPron {
  ipa: string; // 예) "/ˈmɛʒɚ/"
  syllables: Syllable[]; // en 칸에는 철자 대신 그 음절의 IPA 조각을 넣음
  hangul: string; // 강세 음절은 *로 감쌈
}

const L = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const V = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const T = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';

function compose(onset: string, medial: string, coda = ''): string {
  return String.fromCharCode(0xac00 + (L.indexOf(onset) * 21 + V.indexOf(medial)) * 28 + (coda ? T.indexOf(coda) : 0));
}

/** 모음 IPA → [한글 모음, 뒤에 붙는 소리] (이중모음은 뒤에 '이/우'가 붙음) */
const VOWELS: Record<string, [string, string]> = {
  'ɑː': ['ㅏ', ''], ɑ: ['ㅏ', ''], æ: ['ㅐ', ''], ɛ: ['ㅔ', ''], ɪ: ['ㅣ', ''], ᵻ: ['ㅣ', ''], 'iː': ['ㅣ', ''], i: ['ㅣ', ''],
  ə: ['ㅓ', ''], ɐ: ['ㅓ', ''], ʌ: ['ㅓ', ''], ɚ: ['ㅓ', ''], 'ɜː': ['ㅓ', ''], 'ɝ': ['ㅓ', ''], 'oʊ': ['ㅗ', ''], 'oː': ['ㅗ', ''], o: ['ㅗ', ''],
  'ɔː': ['ㅗ', ''], ɔ: ['ㅗ', ''], ʊ: ['ㅜ', ''], 'uː': ['ㅜ', ''], u: ['ㅜ', ''],
  eɪ: ['ㅔ', '이'], aɪ: ['ㅏ', '이'], ɔɪ: ['ㅗ', '이'], aʊ: ['ㅏ', '우'],
};
const CONS: Record<string, string> = {
  p: 'ㅍ', b: 'ㅂ', t: 'ㅌ', d: 'ㄷ', k: 'ㅋ', ɡ: 'ㄱ', g: 'ㄱ', f: 'ㅍ', v: 'ㅂ', θ: 'ㅆ', ð: 'ㄷ', s: 'ㅅ', z: 'ㅈ', ʃ: 'ㅅ', ʒ: 'ㅈ',
  tʃ: 'ㅊ', dʒ: 'ㅈ', h: 'ㅎ', m: 'ㅁ', n: 'ㄴ', ŋ: 'ㅇ', l: 'ㄹ', ɹ: 'ㄹ', ɾ: 'ㄹ', w: 'ㅇ', j: 'ㅇ',
};
/** 받침이 될 수 있는 자음 */
const CODA: Record<string, string> = { m: 'ㅁ', n: 'ㄴ', ŋ: 'ㅇ', l: 'ㄹ' };
/** 모음 앞이 아닌 자리의 자음을 혼자 적을 때(받침으로 못 쓰는 경우) */
const ALONE: Record<string, string> = { ʃ: '시', ʒ: '지', tʃ: '치', dʒ: '지' };
const SHY: Record<string, string> = { 'ㅏ': 'ㅑ', 'ㅐ': 'ㅒ', 'ㅓ': 'ㅕ', 'ㅔ': 'ㅖ', 'ㅗ': 'ㅛ', 'ㅜ': 'ㅠ', 'ㅣ': 'ㅣ' }; // ʃ·j + 모음
const WGL: Record<string, string> = { 'ㅏ': 'ㅘ', 'ㅐ': 'ㅙ', 'ㅓ': 'ㅝ', 'ㅔ': 'ㅞ', 'ㅣ': 'ㅟ', 'ㅗ': 'ㅗ', 'ㅜ': 'ㅜ' }; // w + 모음

/** 음절에 들어 있는 까다로운 소리에 대한 초보자용 한 줄 설명 */
const TIPS: [string, string][] = [
  ['ʒ', "ʒ는 '슈'가 아니라 '쥐'쪽 소리 (vision의 s)"],
  ['ʃ', "ʃ는 입술을 모으고 내는 '쉬' 소리"],
  ['tʃ', "tʃ는 ch 소리 'ㅊ'"],
  ['dʒ', "dʒ는 j 소리 'ㅈ'"],
  ['θ', "θ는 혀를 이 사이에 끼고 내는 'ㅆ' 소리"],
  ['ð', "ð는 혀를 이 사이에 끼고 울리는 'ㄷ' 소리"],
  ['ɾ', "모음 사이의 t/d는 혀를 가볍게 튕겨 'ㄹ'처럼"],
  ['æ', "æ는 '아'와 '에' 사이 '애' (입을 크게 벌리기)"],
  ['v', "v는 아랫입술을 윗니에 대고 내는 'ㅂ'"],
  ['f', "f는 윗니를 아랫입술에 대고 내는 'ㅍ'"],
  ['z', "z는 울리는 s 소리 '즈'"],
  ['ŋ', "ng는 받침 'ㅇ' 소리"],
];

function tokenize(ipa: string): string[] {
  const keys = [...Object.keys(VOWELS), ...Object.keys(CONS)].sort((a, b) => b.length - a.length);
  const out: string[] = [];
  let i = 0;
  while (i < ipa.length) {
    const c = ipa[i];
    if (c === 'ˈ' || c === 'ˌ') {
      out.push(c);
      i++;
      continue;
    }
    const hit = keys.find((k) => ipa.startsWith(k, i));
    if (hit) {
      out.push(hit);
      i += hit.length;
    } else i++; // 모르는 기호는 건너뜀
  }
  return out;
}

interface Sy {
  onset: string;
  medial: string;
  extra: string;
  coda: string;
  stress: boolean;
  sec: boolean;
  alone?: string; // 'ㅡ' 음절이 아닌 통글자 (예: '시', '치')
  ipa: string;
}

/** IPA → 음절 목록 (한글 규칙) */
export function ipaToSyllables(ipa: string): Syllable[] {
  const items: { kind: 'V' | 'C'; t: string; st: boolean; sec: boolean }[] = [];
  let st = false;
  let sec = false;
  for (const t of tokenize(ipa)) {
    if (t === 'ˈ') st = true;
    else if (t === 'ˌ') sec = true;
    else if (VOWELS[t]) {
      items.push({ kind: 'V', t, st, sec });
      st = false;
      sec = false;
    } else items.push({ kind: 'C', t, st: false, sec: false });
  }

  const res: Sy[] = [];
  let prev: Sy | null = null;
  let cons: string[] = [];
  const own = (c: string) => {
    res.push({ onset: CONS[c], medial: 'ㅡ', extra: '', coda: '', stress: false, sec: false, alone: ALONE[c], ipa: c });
  };

  for (const it of [...items, { kind: 'V' as const, t: '', st: false, sec: false }]) {
    if (it.kind === 'C') {
      cons.push(it.t);
      continue;
    }
    const last = it.t === ''; // 단어 끝
    let cl = cons;
    cons = [];
    // 모음 뒤·자음 앞(또는 끝)의 r은 적지 않음 (park → 파크)
    const whole = cl;
    cl = cl.filter((c, k) => c !== 'ɹ' || (!last && k === whole.length - 1));
    if (prev && cl.length >= (last ? 1 : 2) && CODA[cl[0]]) {
      prev.coda = CODA[cl[0]];
      prev.ipa += cl[0];
      cl = cl.slice(1);
    }
    if (last) {
      cl.forEach(own);
      break;
    }
    let onset = 'ㅇ';
    let glide = '';
    let onsetIpa = '';
    if (cl.length) {
      const lastC = cl[cl.length - 1];
      if ((lastC === 'w' || lastC === 'j') && cl.length >= 2) {
        // 'kw' 같은 경우: 앞 자음이 첫소리, w/j는 모음에 섞어 적음 (kw+ɪ → 퀴)
        glide = lastC;
        onset = CONS[cl[cl.length - 2]];
        onsetIpa = cl[cl.length - 2] + lastC;
        cl.slice(0, -2).forEach(own);
      } else if (lastC === 'w' || lastC === 'j') {
        glide = lastC;
        onsetIpa = lastC;
        cl.slice(0, -1).forEach(own);
      } else {
        onset = CONS[lastC];
        onsetIpa = lastC;
        cl.slice(0, -1).forEach(own);
        // 강세 모음 뒤 모음 사이의 l은 받침 ㄹ + 첫소리 ㄹ로 겹쳐 적음 (날리지)
        if (lastC === 'l' && cl.length === 1 && prev && (prev.stress || prev.sec) && !prev.coda) {
          prev.coda = 'ㄹ';
          prev.ipa += 'l';
        }
      }
    }
    const [medial0, extra] = VOWELS[it.t];
    let medial = medial0;
    if (cl.length && cl[cl.length - 1] === 'ʃ') medial = SHY[medial] ?? medial;
    if (glide === 'j') medial = SHY[medial] ?? medial;
    if (glide === 'w') medial = WGL[medial] ?? medial;
    const d: Sy = { onset, medial, extra, coda: '', stress: it.st, sec: it.sec, ipa: onsetIpa + it.t };
    res.push(d);
    prev = d;
  }

  return res.map((d) => {
    let ko = d.alone ?? compose(d.onset, d.medial, d.coda);
    if (d.extra) ko += d.extra;
    const tip = TIPS.find(([k]) => d.ipa.includes(k))?.[1] ?? '';
    return { en: d.ipa, ko, stress: d.stress, why: tip };
  });
}

let phonemizeFn: ((text: string, lang?: string) => Promise<string[]>) | null = null;

/** 단어 하나의 발음(IPA·한글·음절)을 이 기기에서 만듦. 만들 수 없으면 null */
export async function localPronunciation(word: string): Promise<LocalPron | null> {
  const w = word.trim();
  if (!/^[A-Za-z][A-Za-z'’-]*$/.test(w)) return null;
  try {
    if (!phonemizeFn) phonemizeFn = (await import('phonemizer')).phonemize;
    const out = (await phonemizeFn(w, 'en-us')).join(' ').trim();
    if (!out) return null;
    const syllables = ipaToSyllables(out);
    if (!syllables.length || !syllables.some((s) => s.stress)) {
      // 강세가 없는 한 음절 단어는 그 음절을 강세로 표시
      if (syllables.length === 1) syllables[0].stress = true;
      else if (!syllables.length) return null;
    }
    const hangul = syllables.map((s) => (s.stress ? `*${s.ko}*` : s.ko)).join('');
    return { ipa: `/${out}/`, syllables, hangul };
  } catch {
    return null;
  }
}

// ───────── 철자 ↔ 소리 짝짓기 ("소리 풀이") ─────────
// 단어의 철자 묶음(예: s · i · ng · er)마다 어떤 소리가 나는지 보여주기 위한 규칙.
// IPA 소리 목록과 철자를 맞춰 보고(가장 자연스러운 짝을 점수로 고름), 맞추지 못하면 null을 돌려줌.

export interface SpellChunk {
  en: string; // 철자 묶음 (예: "ng")
  ko: string; // 한글 소리 (예: "ㅇ"), 안 읽는 글자는 빈 문자열
  kind: 'v' | 'c' | 'silent'; // 모음 / 자음 / 읽지 않는 글자
  stress: boolean; // 강세 모음이 들어 있으면 true
}

/** 'V' = 아무 모음, 'R' = ɚ·ɝ(r이 섞인 모음), 그 외는 그 소리 그대로 */
type Pat = string[];
const SPELL: Record<string, Pat[]> = {};
function addG(letters: string, pats: Pat[]) {
  SPELL[letters] = [...(SPELL[letters] ?? []), ...pats];
}
const SINGLE_C: Record<string, Pat[]> = {
  b: [['b']], c: [['k'], ['s']], d: [['d'], ['ɾ'], ['dʒ'], ['t']], f: [['f']], g: [['ɡ'], ['dʒ']], h: [['h']], j: [['dʒ']], k: [['k']],
  l: [['l']], m: [['m']], n: [['n'], ['ŋ']], p: [['p']], q: [['k']], r: [['ɹ']], s: [['s'], ['z'], ['ʃ'], ['ʒ']], t: [['t'], ['ɾ'], ['tʃ']],
  v: [['v']], w: [['w']], x: [['k', 's'], ['ɡ', 'z']], y: [['j']], z: [['z'], ['s'], ['ʒ']],
};
for (const [c, pats] of Object.entries(SINGLE_C)) {
  addG(c, pats);
  if (!'cqwxyh'.includes(c)) addG(c + c, pats); // ll, ss, tt …
}
addG('cc', [['k'], ['k', 's']]);
const DIGRAPHS: [string, Pat[]][] = [
  ['ch', [['tʃ'], ['k'], ['ʃ']]], ['sh', [['ʃ']]], ['th', [['θ'], ['ð'], ['t']]], ['ph', [['f']]], ['ng', [['ŋ'], ['ŋ', 'ɡ']]], ['nk', [['ŋ', 'k']]],
  ['wh', [['w'], ['h']]], ['gh', [['ɡ'], ['f']]], ['ck', [['k']]], ['qu', [['k', 'w'], ['k']]], ['kn', [['n']]], ['wr', [['ɹ']]], ['gn', [['n']]],
  ['mb', [['m']]], ['tch', [['tʃ']]], ['dg', [['dʒ']]], ['ti', [['ʃ']]], ['ci', [['ʃ']]], ['si', [['ʒ'], ['ʃ']]], ['sc', [['s'], ['s', 'k']]],
  ['ps', [['s']]], ['rh', [['ɹ']]], ['ed', [['d'], ['t'], ['V', 'd']]], ['es', [['z'], ['V', 'z'], ['s']]],
];
DIGRAPHS.forEach(([g, p]) => addG(g, p));
for (const v of 'aeiouy') addG(v, [['V'], ['j', 'V']]);
for (const v of ['ai', 'ay', 'ea', 'ee', 'ei', 'ey', 'ie', 'oa', 'oi', 'oy', 'oo', 'ou', 'ow', 'au', 'aw', 'ui', 'ue', 'eu', 'ew', 'io', 'ia']) addG(v, [['V'], ['j', 'V']]);
for (const v of ['ar', 'er', 'ir', 'or', 'ur', 'yr']) addG(v, [['R']]);
addG('le', [['V', 'l'], ['l']]);
addG('al', [['V', 'l']]);

/** 읽지 않는 글자로 둘 때의 벌점 (낮을수록 흔한 묵음) */
function silentCost(g: string, atEnd: boolean): number {
  if (g === 'gh') return 1;
  if (g === 'e' && atEnd) return 1;
  return g.length === 1 ? 4 : Infinity;
}

function matchTok(p: string, t: string): boolean {
  if (p === 'V') return !!VOWELS[t];
  if (p === 'R') return t === 'ɚ' || t === 'ɝ';
  return p === t;
}

interface PT {
  t: string;
  st: boolean;
}

/** 한 철자 묶음에 대응하는 소리들을 한글로 적기 */
function chunkKo(toks: string[]): string {
  const vi = toks.findIndex((t) => VOWELS[t]);
  const parts: string[] = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    const v = VOWELS[t];
    if (v) {
      const [medial0, extra] = v;
      let medial = medial0;
      const prev = toks[i - 1];
      if (prev === 'j') medial = SHY[medial] ?? medial;
      else if (prev === 'w') medial = WGL[medial] ?? medial;
      const next = toks[i + 1];
      if (!extra && next && CODA[next] && i + 2 >= toks.length) {
        parts.push(compose('ㅇ', medial, CODA[next]));
        i += 2;
        continue;
      }
      parts.push(compose('ㅇ', medial) + extra);
    } else if ((t === 'j' || t === 'w') && vi > i) {
      // 뒤 모음에 섞어 적음
    } else if (t === 'w') parts.push('우');
    else if (t === 'j') parts.push('이');
    else parts.push(ALONE[t] ?? CONS[t] ?? '');
    i++;
  }
  return parts.join('');
}

/** 단어 철자와 IPA를 묶음 단위로 짝지음. 짝을 못 찾으면 null */
export function spellingChunks(word: string, ipa: string): SpellChunk[] | null {
  const w = word.trim().toLowerCase();
  if (!/^[a-z]+$/.test(w) || !ipa) return null;
  const toks: PT[] = [];
  let st = false;
  for (const t of tokenize(ipa)) {
    if (t === 'ˈ') st = true;
    else if (t === 'ˌ') st = false;
    else {
      const vowel = !!VOWELS[t];
      toks.push({ t: t === 'g' ? 'ɡ' : t, st: vowel && st });
      if (vowel) st = false;
    }
  }
  if (!toks.length) return null;
  if (!toks.some((t) => t.st) && toks.filter((t) => VOWELS[t.t]).length === 1) toks.forEach((t) => (t.st = !!VOWELS[t.t]));

  interface Cell {
    cost: number;
    chunks: { en: string; toks: PT[] }[];
  }
  const memo = new Map<number, Cell | null>();
  const solve = (i: number, j: number): Cell | null => {
    if (i === w.length) return j === toks.length ? { cost: 0, chunks: [] } : null;
    const key = i * 1000 + j;
    if (memo.has(key)) return memo.get(key) ?? null;
    let best: Cell | null = null;
    const take = (cost: number, en: string, used: PT[], ni: number, nj: number) => {
      const rest = solve(ni, nj);
      if (!rest) return;
      const total = cost + 0.01 + rest.cost; // 묶음이 적을수록(= 긴 철자 묶음일수록) 유리
      if (!best || total < best.cost) best = { cost: total, chunks: [{ en, toks: used }, ...rest.chunks] };
    };
    for (let len = 1; len <= 3 && i + len <= w.length; len++) {
      const g = w.slice(i, i + len);
      for (const pat of SPELL[g] ?? []) {
        if (j + pat.length > toks.length) continue;
        if (pat.every((p, k) => matchTok(p, toks[j + k].t))) take(0, g, toks.slice(j, j + pat.length), i + len, j + pat.length);
      }
      const sc = silentCost(g, i + len === w.length);
      if (sc < Infinity) take(sc, g, [], i + len, j);
    }
    memo.set(key, best);
    return best;
  };
  const res = solve(0, 0);
  if (!res) return null;
  return res.chunks.map((c) => ({
    en: c.en,
    ko: c.toks.length ? chunkKo(c.toks.map((p) => p.t)) : '',
    kind: c.toks.length === 0 ? 'silent' : c.toks.some((p) => VOWELS[p.t]) ? 'v' : 'c',
    stress: c.toks.some((p) => p.st),
  }));
}
