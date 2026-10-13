import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import './globals.css';

const BASE = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '');

export const metadata: Metadata = {
  title: '영어 서재',
  description: '내 논문·영상으로 공부하는 개인용 영어 학습 앱',
  manifest: `${BASE}/manifest.webmanifest`,
  icons: {
    icon: `${BASE}/favicon.png`,
    apple: `${BASE}/icons/apple-touch-icon.png`,
  },
  appleWebApp: { capable: true, title: '영어 서재', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B6E69',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" data-font-size="m">
      <head>
        <link rel="preconnect" href="https://generativelanguage.googleapis.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap"
        />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
