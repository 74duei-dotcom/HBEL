// 앱 전체에서 쓰는 데이터 모양 정의

export type DocKind = 'paper' | 'book' | 'lecture';
export type DocStatus = 'processing' | 'ready' | 'error';

/** 내 자료 목록의 한 항목 (가벼운 정보만) */
export interface LibraryDoc {
  id: string;
  title: string;
  kind: DocKind;
  fileName: string;
  driveFileId?: string;
  pageCount: number;
  sentenceCount: number;
  lastPage: number; // 0부터 시작
  status: DocStatus;
  scanned?: boolean; // 글자가 거의 없는 스캔본 PDF
  duration?: number; // 강의 영상 길이(초). 있으면 영상 자료
  youtubeId?: string; // 유튜브 영상이면 그 ID
  error?: string;
  doi?: string; // 논문 DOI (PDF 첫머리에서 찾음)
  authors?: string; // 저자 (Crossref)
  journal?: string; // 학술지 이름 (Crossref)
  year?: number; // 발행 연도 (Crossref)
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

/** PDF에서 뽑아낸 본문 (문서마다 별도 파일로 저장) */
export interface DocContent {
  id: string;
  /** 영상 자료는 한 "쪽" = 약 4분 구간, times = 문장별 시작 시각(초) */
  pages: { sentences: string[]; times?: number[] }[];
}

/** 문장 하나에 대한 AI 분석 결과 */
export interface SentenceAnalysis {
  translation: string;
  /** 영어 단어(공백 기준) 순서와 1:1로 맞춘 한글 발음. 강세 음절은 *로 감쌈 예) "익스*텐*션" */
  hk: string[];
  /** 끊어 읽는 자리: 이 번호의 단어 바로 뒤에서 잠깐 쉼 (단어 순서 0부터). 없으면 아직 분석 전 */
  br?: number[];
  /** 어떤 버전의 발음 규칙으로 만들었는지 (없으면 옛 규칙) */
  hv?: number;
}

/** 단어 하나에 대한 사전 결과 */
/** 단어를 음절로 나눈 것 하나 (철자 조각 + 한글 소리 + 왜 그렇게 읽는지) */
export interface Syllable {
  en: string; // 예) "press"
  ko: string; // 예) "프레스"
  stress: boolean; // 강세 음절이면 true
  why: string; // 예) "pr는 '프ㄹ'로 붙여 읽고 e는 짧은 '에'"
}

export interface WordInfo {
  word: string;
  syllables?: Syllable[];
  lemma: string;
  pos: string;
  ipa: string;
  hangul: string; // 강세 음절은 *로 감쌈
  meaning: string;
  isMedical: boolean;
  etymology: string;
  contextNote: string;
  /** 어떤 버전의 발음 규칙으로 만들었는지 (없으면 옛 규칙) */
  hv?: number;
}

/** 문장 안에서 찾은 문법 항목 하나 */
export interface GrammarPoint {
  nameEn: string; // 예) "passive voice"
  name: string; // 예) "수동태"
  part: string; // 문장 속에서 그 문법이 쓰인 부분 (원문 그대로)
  explanation: string;
  usage: string; // 의학·학술 글에서 어떻게 쓰이는지
}

/** 문장 성분 한 조각: S 주어 / V 동사 / O 목적어 / C 보어 / IO 간접목적어 / DO 직접목적어 / OC 목적격 보어 / M 수식어 */
export type PatternRole = 'S' | 'V' | 'O' | 'C' | 'IO' | 'DO' | 'OC' | 'M';

export interface PatternPart {
  role: PatternRole;
  text: string; // 문장 속 원문 그대로
}

/** 문장의 주절 형식(1~5형식) 판정 결과 */
export interface SentencePattern {
  n: 1 | 2 | 3 | 4 | 5;
  parts: PatternPart[];
}

/** 문장 하나의 문법 분석 결과 */
export interface GrammarAnalysis {
  structure: string; // 문장 구조 한 줄 요약
  points: GrammarPoint[];
  pattern?: SentencePattern | null; // undefined = 예전에 저장된 분석(판정 안 함), null = 판정이 애매해서 보여주지 않음
}

/** 문서별 AI 결과 캐시 (같은 문장·단어를 다시 묻지 않도록) */
export interface DocAnalysisCache {
  id: string;
  sentences: Record<string, SentenceAnalysis>; // key: "page-index"
  words: Record<string, WordInfo>; // key: lemma 소문자
  grammar?: Record<string, GrammarAnalysis>; // key: "page-index"
}

export interface GrammarExample {
  docId: string;
  docTitle: string;
  page: number;
  sentence: string;
  part: string;
  ko?: string; // 한글 번역 (기본 예문에만 있음)
}

export interface GrammarQuiz {
  q: string; // 빈칸(____)이 있는 문장
  choices: string[];
  answer: number; // choices 안의 번호(0부터)
  explain: string;
}

/** 문법 노트에 저장한 문법 항목 */
export interface GrammarItem {
  id: string; // nameEn을 소문자·하이픈으로 바꾼 값
  name: string;
  nameEn: string;
  explanation: string;
  usage: string;
  examples: GrammarExample[];
  quiz: GrammarQuiz[];
  status: 'learning' | 'known';
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
  builtin?: boolean; // 앱에 기본으로 들어 있는 문법 (지울 수 없음)
}

/** 간격 반복(FSRS) 카드 상태 - 날짜는 ISO 문자열로 저장 */
export interface SrsCard {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
}

export interface WordSource {
  docId: string;
  docTitle: string;
  page: number;
  sentence: string;
}

export type VocabStatus = 'learning' | 'known';

export interface VocabItem extends WordInfo {
  id: string; // lemma 소문자
  status: VocabStatus;
  sources: WordSource[];
  card: SrsCard;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export type FontSize = 's' | 'm' | 'l';

export interface ViewPrefs {
  hk: boolean; // 한글 발음
  tr: boolean; // 번역
  ph: boolean; // 끊어 읽기 표시
  focus: boolean; // 읽는 문장에만 표시
  fontSize: FontSize;
  newPerDay: number;
  updatedAt: string;
}

/** 구글 드라이브에 동기화되는 학습 데이터 전체 */
export interface AppData {
  version: 1;
  library: Record<string, LibraryDoc>;
  vocab: Record<string, VocabItem>;
  grammar: Record<string, GrammarItem>;
  prefs: ViewPrefs;
}

export type SyncState = 'signed-out' | 'idle' | 'syncing' | 'offline' | 'error' | 'auth-expired';
