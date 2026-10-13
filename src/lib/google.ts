'use client';
// 구글 로그인(Google Identity Services) - 브라우저에서 바로 드라이브용 접근 토큰을 받습니다.
// 비밀키(client secret)는 쓰지 않습니다. 토큰은 1시간 동안 유효하고, 만료되면 버튼 한 번으로 다시 받습니다.

import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES, LS_KEYS, isGoogleConfigured } from './config';
import { lsGet, lsSet } from './util';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google?: any;
    gapi?: any;
  }
}

interface StoredToken {
  access_token: string;
  expires_at: number; // ms
}

export class AuthRequiredError extends Error {
  constructor(message = '구글 연결이 필요해요. 설정에서 다시 연결해 주세요.') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

let memToken: StoredToken | null = null;
let gisPromise: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('구글 로그인 스크립트를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'));
    document.head.appendChild(s);
  });
}

export function loadGis(): Promise<void> {
  if (!gisPromise) {
    gisPromise = loadScript('https://accounts.google.com/gsi/client').then(async () => {
      // 스크립트가 붙은 뒤 google 객체가 준비될 때까지 잠시 기다림
      for (let i = 0; i < 50 && !window.google?.accounts?.oauth2; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!window.google?.accounts?.oauth2) throw new Error('구글 로그인 준비에 실패했어요.');
    });
    gisPromise.catch(() => {
      gisPromise = null;
    });
  }
  return gisPromise;
}

function readStored(): StoredToken | null {
  if (memToken) return memToken;
  const raw = lsGet(LS_KEYS.googleToken);
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as StoredToken;
    memToken = t;
    return t;
  } catch {
    return null;
  }
}

type AuthListener = () => void;
const authListeners = new Set<AuthListener>();

export function onAuthExpired(cb: AuthListener): () => void {
  authListeners.add(cb);
  return () => authListeners.delete(cb);
}

function notifyAuthExpired(): void {
  authListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* 무시 */
    }
  });
}

/** 유효한 토큰이 있으면 돌려주고, 없으면 AuthRequiredError */
export function getToken(): string {
  const t = readStored();
  if (t && t.expires_at - 60_000 > Date.now()) return t.access_token;
  invalidateToken();
  throw new AuthRequiredError(isConnectedBefore() ? '구글 연결 시간이 끝났어요. "다시 연결"을 눌러 주세요.' : undefined);
}

export function hasValidToken(): boolean {
  try {
    getToken();
    return true;
  } catch {
    return false;
  }
}

export function isConnectedBefore(): boolean {
  return lsGet(LS_KEYS.googleConnected) === '1';
}

/**
 * 구글 연결 창을 띄워 토큰을 받습니다. 반드시 버튼 클릭 같은 사용자 동작 안에서 불러야 합니다(팝업 차단 방지).
 * hint(이메일)를 넘기면 계정 선택 과정 없이 바로 그 계정으로 연결합니다.
 */
export async function connectGoogle(hint?: string): Promise<string> {
  if (!isGoogleConfigured()) {
    throw new Error('구글 클라이언트 ID가 설정되지 않았어요. .env.local 파일을 확인해 주세요.');
  }
  await loadGis();
  return new Promise<string>((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES,
      prompt: isConnectedBefore() ? '' : 'consent',
      hint: hint || undefined,
      callback: (resp: any) => {
        if (resp?.error) {
          reject(new Error(resp.error === 'access_denied' ? '구글 연결을 취소했어요.' : `구글 연결 실패: ${resp.error}`));
          return;
        }
        const granted: string = resp.scope ?? '';
        if (!granted.includes('drive.file') || !granted.includes('drive.appdata')) {
          reject(new Error('드라이브 권한 두 가지를 모두 허용해야 해요. 다시 연결해서 체크 상자를 모두 선택해 주세요.'));
          return;
        }
        const token: StoredToken = {
          access_token: resp.access_token,
          expires_at: Date.now() + Number(resp.expires_in ?? 3600) * 1000,
        };
        memToken = token;
        lsSet(LS_KEYS.googleToken, JSON.stringify(token));
        lsSet(LS_KEYS.googleConnected, '1');
        resolve(token.access_token);
      },
      error_callback: (err: any) => {
        reject(new Error(err?.type === 'popup_closed' ? '구글 연결 창이 닫혔어요.' : '구글 연결 창을 열지 못했어요. 팝업 차단을 확인해 주세요.'));
      },
    });
    client.requestAccessToken();
  });
}

/** 연결 해제: 토큰을 구글에 반납하고 기기에서 지웁니다 */
export async function disconnectGoogle(): Promise<void> {
  const t = readStored();
  memToken = null;
  lsSet(LS_KEYS.googleToken, null);
  lsSet(LS_KEYS.googleConnected, null);
  if (t && window.google?.accounts?.oauth2) {
    try {
      window.google.accounts.oauth2.revoke(t.access_token, () => undefined);
    } catch {
      /* 무시 */
    }
  }
}

/** API 응답이 401이거나 토큰 만료 시 무효 처리 */
export function invalidateToken(): void {
  const wasValid = memToken !== null || lsGet(LS_KEYS.googleToken) !== null;
  memToken = null;
  lsSet(LS_KEYS.googleToken, null);
  if (wasValid) notifyAuthExpired();
}
