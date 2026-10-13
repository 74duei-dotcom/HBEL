'use client';
// 2단계 이후에 만들 기능 자리 (하단 메뉴는 설계대로 미리 배치)
import Link from 'next/link';
import { TabBar } from './TabBar';

export function ComingSoon({ title, items }: { title: string; items: string[] }) {
  return (
    <>
      <main className="page">
        <h1 className="page-title">{title}</h1>
        <div className="card stack">
          <b>다음 단계에서 추가돼요</b>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
            {items.map((it) => (
              <li key={it}>{it}</li>
            ))}
          </ul>
          <span className="muted">지금은 내 자료 읽기와 단어장·복습을 먼저 써 보세요.</span>
          <Link href="/" className="btn primary">
            내 자료로 가기
          </Link>
        </div>
      </main>
      <TabBar />
    </>
  );
}
