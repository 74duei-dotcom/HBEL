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
  error?: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

/** PDF에서 뽑아낸 본문 (문서마다 별도 파일로 저장) */
export interface DocContent {
  id: string;
  pages: { sentences: string[] }[];
}

/** 문장 하나에 대한 AI 분석 결과 */
export interface SentenceAnalysis {
  translation: string;
  /** 영어 단어(공백 기준) 순서와 1:1로 맞춘 한글 발음. 강세 음절은 *로 감쌈 예) "익스*텐*션" */
  hk: string[];
}

/** 단어 하나에 대한 사전 결과 */
export interface WordInfo {
  word: string;
  lemma: string;
  pos: string;
  ipa: string;
  hangul: string; // 강세 음절은 *로 감쌈
  meaning: string;
  isMedical: boolean;
  etymology: string;
  contextNote: string;
}

/** 문서별 AI 결과 캐시 (같은 문장·단어를 다시 묻지 않도록) */
export interface DocAnalysisCache {
  id: string;
  sentences: Record<string, SentenceAnalysis>; // key: "page-index"
  words: Record<string, WordInfo>; // key: lemma 소문자
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
  prefs: ViewPrefs;
}

export type SyncState = 'signed-out' | 'idle' | 'syncing' | 'offline' | 'error' | 'auth-expired';
