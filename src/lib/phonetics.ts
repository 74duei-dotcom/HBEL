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
    let [medial, extra] = VOWELS[it.t];
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
