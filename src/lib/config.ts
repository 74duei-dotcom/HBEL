// 환경 변수(.env.local)와 앱 공통 설정

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
export const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? '';
export const GOOGLE_PROJECT_NUMBER = process.env.NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER ?? '';
/** GitHub Pages처럼 하위 경로에 올릴 때의 경로 (예: /english-library). PC·로컬에서는 비워 둠 */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '');
export const withBase = (p: string) => `${BASE_PATH}${p}`;

export const GEMINI_MODEL = process.env.NEXT_PUBLIC_GEMINI_MODEL || 'gemini-3.5-flash-lite';
export const GEMINI_TTS_MODEL = process.env.NEXT_PUBLIC_GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts';

/** 드라이브 권한: 이 앱이 만들거나 사용자가 고른 파일만 + 앱 전용 숨김 폴더 */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata',
].join(' ');

/** 내 드라이브에 만들 폴더 이름 */
export const DRIVE_FOLDER_NAME = '영어서재';

export const LS_KEYS = {
  geminiKey: 'el.geminiKey', // 예전 단일 키 (geminiKeys로 옮겨짐)
  geminiKeys: 'el.geminiKeys',
  ttsEngine: 'el.ttsEngine', // 'gemini' | 'device' (기본: Gemini 키가 있으면 gemini)
  googleToken: 'el.googleToken',
  googleConnected: 'el.googleConnected',
  setupDone: 'el.setupDone',
} as const;

export function isGoogleConfigured(): boolean {
  return GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com');
}
