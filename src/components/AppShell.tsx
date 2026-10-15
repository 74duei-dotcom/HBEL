'use client';
// 앱 전체를 감싸는 틀: 저장소 + 서비스 워커 등록 + 설치 버튼 준비
import { useEffect, type ReactNode } from 'react';
import { StoreProvider } from '@/lib/store';
import { withBase } from '@/lib/config';
import { warmUpLocalVoice } from '@/lib/speech';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    __installPrompt?: BeforeInstallPromptEvent | null;
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    // 앱 설치(홈 화면에 추가) 버튼을 위해 브라우저의 설치 이벤트를 보관
    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__installPrompt = e as BeforeInstallPromptEvent;
      window.dispatchEvent(new Event('installable'));
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', () => {
      window.__installPrompt = null;
      window.dispatchEvent(new Event('installable'));
    });

    // 오프라인 사용을 위한 서비스 워커 (개발 모드에서는 끔)
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register(withBase('/sw.js'), { scope: withBase('/') }).catch(() => undefined);
    }
    // 오픈소스 음성 모델이 이미 저장돼 있으면 미리 불러옴 (앱을 켤 때마다 기계음으로 시작하는 것 방지)
    const warm = setTimeout(warmUpLocalVoice, 1500);
    return () => {
      clearTimeout(warm);
      window.removeEventListener('beforeinstallprompt', onPrompt);
    };
  }, []);

  return <StoreProvider>{children}</StoreProvider>;
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches;
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const ev = window.__installPrompt;
  if (!ev) return 'unavailable';
  await ev.prompt();
  const choice = await ev.userChoice;
  window.__installPrompt = null;
  return choice.outcome;
}
