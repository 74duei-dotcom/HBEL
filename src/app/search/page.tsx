'use client';
// 전체 검색: 내 자료 문장 + 단어장을 한 번에 찾기 (기기에 저장된 본문만 검색)
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import MiniSearch from 'minisearch';
import { activeDocs, activeVocab, loadDocContent, useStore } from '@/lib/store';
import { TabBar } from '@/components/TabBar';
import { Icon } from '@/components/Icon';

interface SentenceHit {
  id: string;
  docId: string;
  docTitle: string;
  page: number;
  index: number;
  text: string;
}

const OPTIONS = { prefix: true, fuzzy: 0.2, combineWith: 'AND' as const };

export default function SearchPage() {
  const { data, ready } = useStore();
  const [query, setQuery] = useState('');
  const [indexing, setIndexing] = useState(true);
  const [sentCount, setSentCount] = useState(0);
  const sentIndex = useRef<MiniSearch<SentenceHit> | null>(null);
  const [version, setVersion] = useState(0);

  const docs = useMemo(() => activeDocs(data).filter((d) => d.status === 'ready'), [data]);
  const vocab = useMemo(() => activeVocab(data), [data]);

  // 문장 색인 만들기 (자료가 바뀔 때만)
  const docKey = docs.map((d) => d.id).join(',');
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setIndexing(true);
    (async () => {
      const ms = new MiniSearch<SentenceHit>({ fields: ['text'], storeFields: ['docId', 'docTitle', 'page', 'index', 'text'] });
      let n = 0;
      for (const d of docs) {
        const c = await loadDocContent(d.id).catch(() => null);
        if (!alive) return;
        if (!c) continue;
        const hits: SentenceHit[] = [];
        c.pages.forEach((p, pi) =>
          p.sentences.forEach((text, si) => hits.push({ id: `${d.id}|${pi}|${si}`, docId: d.id, docTitle: d.title, page: pi, index: si, text }))
        );
        ms.addAll(hits);
        n += hits.length;
      }
      if (!alive) return;
      sentIndex.current = ms;
      setSentCount(n);
      setIndexing(false);
      setVersion((v) => v + 1);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, docKey]);

  const vocabIndex = useMemo(() => {
    const ms = new MiniSearch({
      fields: ['lemma', 'word', 'meaning', 'etymology'],
      storeFields: ['lemma'],
    });
    ms.addAll(vocab.map((v) => ({ id: v.id, lemma: v.lemma, word: v.word, meaning: v.meaning, etymology: v.etymology })));
    return ms;
  }, [vocab]);

  const q = query.trim();
  const vocabHits = useMemo(() => {
    if (!q) return [];
    const ids = new Set(vocabIndex.search(q, OPTIONS).map((r) => r.id as string));
    return vocab.filter((v) => ids.has(v.id)).slice(0, 30);
  }, [q, vocabIndex, vocab]);

  const sentHits = useMemo(() => {
    if (!q || !sentIndex.current) return [];
    return sentIndex.current.search(q, OPTIONS).slice(0, 50) as unknown as (SentenceHit & { id: string })[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, version]);

  return (
    <>
      <main className="page">
        <h1 className="page-title">검색</h1>
        <label className="search">
          <Icon name="search" size={18} />
          <span className="sr-only">전체 검색</span>
          <input type="search" autoFocus placeholder="영어 문장 · 단어 · 한국어 뜻" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <p className="small muted">
          {indexing ? '내 자료 본문을 준비하는 중…' : `이 기기에 있는 문장 ${sentCount.toLocaleString()}개와 단어 ${vocab.length}개에서 찾아요.`}
        </p>

        {q && (
          <>
            <h2 style={{ fontSize: 16 }}>단어장 ({vocabHits.length})</h2>
            {vocabHits.length === 0 ? (
              <div className="card muted">일치하는 단어가 없어요.</div>
            ) : (
              <div className="card flush">
                {vocabHits.map((v) => (
                  <Link key={v.id} href={`/word/?id=${encodeURIComponent(v.id)}`} className="list-row">
                    <span className="grow stack" style={{ gap: 2 }}>
                      <span style={{ fontFamily: 'var(--font-read)', fontSize: 17, fontWeight: 600 }}>{v.lemma}</span>
                      <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>{v.meaning}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}

            <h2 style={{ fontSize: 16 }}>내 자료 문장 ({sentHits.length})</h2>
            {sentHits.length === 0 ? (
              <div className="card muted">{indexing ? '잠시만 기다려 주세요…' : '일치하는 문장이 없어요.'}</div>
            ) : (
              <div className="card flush">
                {sentHits.map((h) => (
                  <Link key={h.id} href={`/reader/?id=${encodeURIComponent(h.docId)}&p=${h.page}&s=${h.index}`} className="list-row">
                    <span className="grow stack" style={{ gap: 3 }}>
                      <span style={{ fontFamily: 'var(--font-read)', fontSize: 15 }}>{h.text}</span>
                      <span className="small">
                        {h.docTitle.length > 30 ? h.docTitle.slice(0, 30) + '…' : h.docTitle} · {h.page + 1}쪽
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <TabBar />
    </>
  );
}
