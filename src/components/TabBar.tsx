'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './Icon';

const TABS = [
  { href: '/', label: '내 자료', icon: 'folder', match: (p: string) => p === '/' || p.startsWith('/upload') || p.startsWith('/reader') },
  { href: '/vocab/', label: '단어장', icon: 'cards', match: (p: string) => p.startsWith('/vocab') || p.startsWith('/word') || p.startsWith('/review') },
  { href: '/grammar/', label: '문법', icon: 'grammar', match: (p: string) => p.startsWith('/grammar') },
  { href: '/pronounce/', label: '발음', icon: 'mic', match: (p: string) => p.startsWith('/pronounce') },
  { href: '/chat/', label: 'AI 대화', icon: 'chat', match: (p: string) => p.startsWith('/chat') },
];

export function TabBar() {
  const path = usePathname() || '/';
  return (
    <nav className="tabbar" aria-label="메인 메뉴">
      <div className="tabbar-inner">
        {TABS.map((t) => {
          const active = t.match(path);
          return (
            <Link key={t.label} href={t.href} className="tab" aria-current={active ? 'page' : undefined}>
              <Icon name={t.icon} size={24} />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
