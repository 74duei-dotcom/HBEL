// 알파벳 소리표: 글자 이름(읽는 법)과 단어 속 소리(한글 근사)
export interface AlphabetRow {
  letter: string;
  name: string; // 글자 이름
  sounds: string; // 단어 속 소리(한글 근사)
  tip?: string; // 한국어에 없는 소리 등 짧은 팁
}

export const ALPHABET: AlphabetRow[] = [
  { letter: 'A', name: '에이', sounds: '에이 · 애 · 아 · 어' },
  { letter: 'B', name: '비', sounds: 'ㅂ' },
  { letter: 'C', name: '씨', sounds: 'ㅋ · ㅅ', tip: 'e·i·y 앞에서는 ㅅ' },
  { letter: 'D', name: '디', sounds: 'ㄷ' },
  { letter: 'E', name: '이', sounds: '이 · 에 · 어 · 묵음' },
  { letter: 'F', name: '에프', sounds: 'ㅍ', tip: '윗니로 아랫입술을 살짝 물고 바람 내기 (P와 달라요)' },
  { letter: 'G', name: '지', sounds: 'ㄱ · ㅈ', tip: 'e·i·y 앞에서는 ㅈ일 때가 많아요' },
  { letter: 'H', name: '에이치', sounds: 'ㅎ · 묵음' },
  { letter: 'I', name: '아이', sounds: '아이 · 이' },
  { letter: 'J', name: '제이', sounds: 'ㅈ' },
  { letter: 'K', name: '케이', sounds: 'ㅋ · 묵음', tip: 'kn-은 k가 묵음 (knee)' },
  { letter: 'L', name: '엘', sounds: 'ㄹ · 을', tip: '혀끝을 윗잇몸에 붙여요' },
  { letter: 'M', name: '엠', sounds: 'ㅁ' },
  { letter: 'N', name: '엔', sounds: 'ㄴ' },
  { letter: 'O', name: '오우', sounds: '오우 · 아 · 오 · 어 · 우' },
  { letter: 'P', name: '피', sounds: 'ㅍ' },
  { letter: 'Q', name: '큐', sounds: 'ㅋ + 우', tip: '대개 qu = 크웨 (queen)' },
  { letter: 'R', name: '아르', sounds: '영어식 R', tip: '혀를 말아 올리되 입천장에 닿지 않게' },
  { letter: 'S', name: '에스', sounds: 'ㅅ · ㅈ · ㅈ', tip: '단어 속에서 z(ㅈ)·zh 소리가 되기도 해요 (rose, vision)' },
  { letter: 'T', name: '티', sounds: 'ㅌ' },
  { letter: 'U', name: '유', sounds: '유 · 어 · 우' },
  { letter: 'V', name: '비', sounds: '영어식 V', tip: '윗니로 아랫입술을 살짝 물고 (B와 달라요)' },
  { letter: 'W', name: '더블유', sounds: '영어식 W', tip: '입술을 동그랗게 모았다가 "우"로 시작' },
  { letter: 'X', name: '엑스', sounds: '크스 · 그즈 · ㅈ', tip: 'box=박스, exam=이그잼, xylophone=자일러폰' },
  { letter: 'Y', name: '와이', sounds: '이 · 아이' },
  { letter: 'Z', name: '지/제드', sounds: 'ㅈ', tip: '미국은 "지", 영국은 "제드". 소리는 z(울리는 ㅈ)' },
];

export interface AlphabetExample {
  letter: string;
  color: string;
  words: { en: string; ko: string }[];
}

// 같은 글자가 단어마다 다르게 읽히는 대표 예
export const ALPHABET_EXAMPLES: AlphabetExample[] = [
  { letter: 'A', color: '#c2461f', words: [{ en: 'name', ko: '네임' }, { en: 'apple', ko: '애플' }, { en: 'father', ko: '파더' }, { en: 'about', ko: '어바웃' }] },
  { letter: 'C', color: '#1f7a3d', words: [{ en: 'cat', ko: '캣' }, { en: 'city', ko: '시티' }] },
  { letter: 'G', color: '#1f4fa3', words: [{ en: 'go', ko: '고우' }, { en: 'giant', ko: '자이언트' }] },
  { letter: 'O', color: '#c2461f', words: [{ en: 'home', ko: '홈' }, { en: 'hot', ko: '핫' }, { en: 'love', ko: '러브' }, { en: 'do', ko: '두' }] },
];

// 두 글자가 합쳐져 나는 소리
export const DIGRAPHS: { en: string; sound: string; word: string; ko: string }[] = [
  { en: 'sh', sound: '쉬', word: 'ship', ko: '쉽' },
  { en: 'ch', sound: '치', word: 'chair', ko: '체어' },
  { en: 'th', sound: '혀를 이 사이에 두고 내는 소리', word: 'think', ko: '씽크' },
  { en: 'ph', sound: 'ㅍ(F 소리)', word: 'phone', ko: '포운' },
  { en: 'ng', sound: '받침 ㅇ', word: 'sing', ko: '씽' },
  { en: 'ck', sound: 'ㅋ', word: 'back', ko: '백' },
];
