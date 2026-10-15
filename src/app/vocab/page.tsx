'use client';
// B1 단어장: 학습 상태·출처 필터, 검색, 복습 시작
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { activeDocs, activeVocab, useStore } from '@/lib/store';
import { buildQueue } from '@/lib/srs';
import type { VocabItem } from '@/lib/types';
import { relativeDue } from '@/lib/util';
import { downloadText, vocabToAnkiText } from '@/lib/export';
import { TabBar } from '@/components/TabBar';
import { AaMenu } from '@/components/AaMenu';
import { Hangul } from '@/components/Hangul';
import { Icon } from '@/components/Icon';

type StatusFilter = 'learning' | 'known' | 'all';

function dueChip(v: VocabItem) {
  if (v.status === 'known') return <span className="chip ok">알아요</span>;
  if (v.card.reps === 0) return <span className="chip later">새 단어</span>;
  const label = relativeDue(v.card.due);
  return <span className={`chip ${label === '오늘' ? 'due' : label === '내일' ? 'soon' : 'later'}`}>{label}</span>;
}

export default function VocabPage() {
  const { data } = useStore();
  const [status, setStatus] = useState<StatusFilter>('learning');
  const [docId, setDocId] = useState('all');
  const [query, setQuery] = useState('');

  const all = useMemo(() => activeVocab(data), [data]);
  const docs = useMemo(() => activeDocs(data), [data]);
  const queue = useMemo(() => buildQueue(all, data.prefs.newPerDay), [all, data.prefs.newPerDay]);

  const counts = {
    learning: all.filter((v) => v.status === 'learning').length,
    known: all.filter((v) => v.status === 'known').length,
    all: all.length,
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((v) => status === 'all' || v.status === status)
      .filter((v) => docId === 'all' || v.sources.some((s) => s.docId === docId))
      .filter((v) => !q || v.lemma.toLowerCase().includes(q) || v.word.toLowerCase().includes(q) || v.meaning.includes(q))
      .sort((a, b) => (status === 'learning' ? a.card.due.localeCompare(b.card.due) : b.updatedAt.localeCompare(a.updatedAt)));
  }, [all, status, docId, query]);

  return (
    <>
      <main className="page">
        <div className="between">
          <h1 className="page-title">단어장</h1>
          <AaMenu hasTr={false} />
        </div>

        <label className="search">
          <Icon name="search" size={18} />
          <span className="sr-only">단어 검색</span>
          <input type="search" placeholder="용어 · 한국어 뜻으로 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>

        <div className="card hero between">
          <div className="stack" style={{ gap: 2 }}>
            <span style={{ fontSize: 13, opacity: 0.9 }}>오늘 복습 (간격 반복)</span>
            <span style={{ fontSize: 24, fontWeight: 700 }}>{queue.length}개</span>
          </div>
          <Link href="/review/" className="btn" style={{ border: 'none', color: 'var(--teal)', fontWeight: 700 }}>
            복습 시작
          </Link>
        </div>

        <div className="seg" role="tablist">
          {(
            [
              ['learning', `학습 중 ${counts.learning}`],
              ['known', `알아요 ${counts.known}`],
              ['all', `전체 ${counts.all}`],
            ] as [StatusFilter, string][]
          ).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={status === k} onClick={() => setStatus(k)}>
              {label}
            </button>
          ))}
        </div>

        {docs.length > 0 && (
          <label className="field">
            출처
            <select className="input" value={docId} onChange={(e) => setDocId(e.target.value)}>
              <option value="all">모든 자료</option>
              {docs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title.length > 40 ? d.title.slice(0, 40) + '…' : d.title}
                </option>
              ))}
            </select>
          </label>
        )}

        {list.length > 0 && (
          <button
            className="btn"
            onClick={() => downloadText(`영어서재-단어장-${new Date().toISOString().slice(0, 10)}.txt`, vocabToAnkiText(list))}
          >
            Anki용 파일로 내보내기 ({list.length}개)
          </button>
        )}

        {list.length === 0 ? (
          <div className="card muted">
            {all.length === 0 ? '아직 저장한 단어가 없어요. 자료를 읽다가 모르는 단어를 누르고 "학습하기"를 눌러 보세요.' : '조건에 맞는 단어가 없어요.'}
          </div>
        ) : (
          <div className="card flush">
            {list.map((v) => (
              <Link key={v.id} href={`/word/?id=${encodeURIComponent(v.id)}`} className="list-row">
                <span className="grow stack" style={{ gap: 3 }}>
                  <span className="row" style={{ gap: 6 }}>
                    <span style={{ fontFamily: 'var(--font-read)', fontSize: 17, fontWeight: 600 }}>{v.lemma}</span>
                    {v.isMedical && <span className="chip med" style={{ fontSize: 11, padding: '1px 6px' }}>의학</span>}
                  </span>
                  {data.prefs.hk && v.hangul && (
                    <span className="hk-badge" style={{ fontSize: 13, padding: '1px 8px' }}>
                      <Hangul text={v.hangul} />
                    </span>
                  )}
                  <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>{v.meaning}</span>
                  {v.sources[0] && (
                    <span className="small">
                      {v.sources[0].docTitle.length > 30 ? v.sources[0].docTitle.slice(0, 30) + '…' : v.sources[0].docTitle} · {v.sources[0].page + 1}쪽
                    </span>
                  )}
                </span>
                {dueChip(v)}
              </Link>
            ))}
          </div>
        )}
      </main>
      <TabBar />
    </>
  );
}
