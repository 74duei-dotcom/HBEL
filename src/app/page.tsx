'use client';
// A1 내 자료 (홈)
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { activeDocs, activeVocab, useStore } from '@/lib/store';
import { buildQueue } from '@/lib/srs';
import { lsGet } from '@/lib/util';
import { LS_KEYS } from '@/lib/config';
import { TabBar } from '@/components/TabBar';
import { SyncBanner } from '@/components/SyncBanner';
import { Icon } from '@/components/Icon';
import { AlphabetLinkCard } from '@/components/AlphabetSheet';

const KIND_STYLE = {
  paper: { bg: '#f7e9e6', fg: 'var(--med)' },
  book: { bg: 'var(--blue-soft)', fg: 'var(--blue-ink)' },
  lecture: { bg: 'var(--amber-soft)', fg: 'var(--amber-ink)' },
} as const;
const KIND_LABEL = { paper: '논문', book: '전문서적', lecture: '강의' } as const;

export default function HomePage() {
  const { data, ready } = useStore();
  const [mounted, setMounted] = useState(false);
  const [setupDone, setSetupDone] = useState(true);
  const [tab, setTab] = useState<'all' | 'pdf' | 'video'>('all');
  useEffect(() => {
    try {
      const t = localStorage.getItem('hbel.homeTab');
      if (t === 'pdf' || t === 'video' || t === 'all') setTab(t);
    } catch {}
    setMounted(true);
    setSetupDone(lsGet(LS_KEYS.setupDone) === '1');
  }, []);

  const docs = useMemo(() => activeDocs(data), [data]);
  const queue = useMemo(() => buildQueue(activeVocab(data), data.prefs.newPerDay), [data]);
  const newCount = queue.filter((v) => v.card.reps === 0).length;
  const pdfDocs = useMemo(() => docs.filter((d) => d.kind !== 'lecture'), [docs]);
  const videoDocs = useMemo(() => docs.filter((d) => d.kind === 'lecture'), [docs]);
  const shownDocs = tab === 'pdf' ? pdfDocs : tab === 'video' ? videoDocs : docs;
  const changeTab = (t: 'all' | 'pdf' | 'video') => {
    setTab(t);
    try {
      localStorage.setItem('hbel.homeTab', t);
    } catch {}
  };
  const lastRead = docs.find((d) => d.status === 'ready');
  const today = mounted ? new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }) : '';

  return (
    <>
      <main className="page">
        <div className="between">
          <div>
            <div className="muted" suppressHydrationWarning>
              {today}
            </div>
            <h1 className="page-title">내 자료</h1>
          </div>
          <Link href="/settings/" className="icon-btn outline" aria-label="설정">
            <Icon name="settings" size={20} />
          </Link>
        </div>

        {mounted && !setupDone && (
          <div className="card stack" style={{ borderColor: 'var(--teal)', borderWidth: 2 }}>
            <b>처음 오셨네요</b>
            <span className="muted">API 키 입력, 구글 드라이브 연결, 앱 설치를 차례로 안내해 드려요.</span>
            <Link href="/setup/" className="btn primary">
              시작하기
            </Link>
          </div>
        )}

        <SyncBanner />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <Link href="/review/" className="card hero" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 13, opacity: 0.9 }}>오늘 복습할 용어</span>
            <span style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.15 }}>{ready ? queue.length : '…'}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{newCount > 0 ? `새 용어 ${newCount} 포함 · ` : ''}복습 시작 →</span>
          </Link>
          {lastRead ? (
            <Link href={`/reader/?id=${lastRead.id}`} className="card" style={{ textDecoration: 'none', color: 'var(--ink)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="muted">이어서 읽기</span>
              <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{lastRead.title}</span>
              <span className="bar">
                <span style={{ width: `${Math.round(((lastRead.lastPage + 1) / Math.max(1, lastRead.pageCount)) * 100)}%` }} />
              </span>
              <span className="small">
                {lastRead.lastPage + 1} / {lastRead.pageCount}쪽
              </span>
            </Link>
          ) : (
            <div className="card stack" style={{ gap: 4 }}>
              <span className="muted">이어서 읽기</span>
              <span className="small">아직 올린 자료가 없어요</span>
            </div>
          )}
        </div>

        <Link href="/upload/" className="card" style={{ border: '2px dashed #9fb3bf', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'var(--ink)' }}>
          <span className="icon-btn" style={{ background: 'var(--teal)', color: '#fff' }} aria-hidden="true">
            <Icon name="upload" size={20} />
          </span>
          <span className="stack" style={{ gap: 2 }}>
            <b style={{ fontSize: 15 }}>PDF · 강의 영상 올리기</b>
            <span className="small">논문 · 전문서적 · 강의 영상 (영상은 PC 권장)</span>
          </span>
        </Link>

        {docs.length > 0 && (
          <section className="stack">
            <div className="seg" role="tablist" aria-label="자료 종류">
              {(
                [
                  ['all', '전체', docs.length],
                  ['pdf', 'PDF', pdfDocs.length],
                  ['video', '동영상', videoDocs.length],
                ] as const
              ).map(([key, label, count]) => (
                <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => changeTab(key)}>
                  {label} {count}
                </button>
              ))}
            </div>
            {shownDocs.length === 0 && (
              <div className="card">
                <span className="muted">{tab === 'video' ? '아직 올린 동영상이 없어요' : '아직 올린 PDF가 없어요'}</span>
              </div>
            )}
            {shownDocs.length > 0 && (
            <div className="card flush">
              {shownDocs.map((d) => (
                <Link key={d.id} href={d.status === 'ready' ? `/reader/?id=${d.id}` : '/upload/'} className="list-row">
                  <span className="icon-btn" style={{ background: KIND_STYLE[d.kind].bg, color: KIND_STYLE[d.kind].fg, borderRadius: 10, width: 40, height: 40 }} aria-hidden="true">
                    <Icon name={d.kind === 'lecture' ? 'play' : 'pdf'} size={19} />
                  </span>
                  <span className="grow stack" style={{ gap: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                    <span className="small">
                      {KIND_LABEL[d.kind]} · {d.pageCount}쪽 · 문장 {d.sentenceCount}
                      {d.status === 'ready' && d.lastPage > 0 ? ` · ${d.lastPage + 1}쪽까지 읽음` : ''}
                      {d.status === 'ready' && d.lastPage === 0 ? ' · 아직 안 읽음' : ''}
                    </span>
                    {d.status === 'error' && <span className="small" style={{ color: 'var(--red)' }}>{d.error ? d.error.slice(0, 60) : '처리하지 못했어요'} · 눌러서 다시 올리기</span>}
                    {d.status === 'processing' && <span className="small">처리가 끝나면 읽을 수 있어요 · 눌러서 진행 보기</span>}
                  </span>
                  {d.status === 'processing' && <span className="chip warn">처리 중</span>}
                  {d.status === 'error' && <span className="chip err">오류</span>}
                  {d.status === 'ready' && d.scanned && <span className="chip warn">스캔본</span>}
                  {d.status === 'ready' && d.lastPage === 0 && <span className="chip ok">새 자료</span>}
                </Link>
              ))}
            </div>
            )}
          </section>
        )}

        <AlphabetLinkCard />
      </main>
      <TabBar />
    </>
  );
}
