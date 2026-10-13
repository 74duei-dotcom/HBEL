'use client';
// 문법 노트: 내 자료에서 저장한 문법 항목 목록 / 상세(설명 · 내 자료 예문 · 연습 문제)
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { activeGrammar, useStore } from '@/lib/store';
import { makeGrammarQuiz } from '@/lib/grammar';
import type { GrammarItem } from '@/lib/types';
import { errorMessage } from '@/lib/util';
import { TabBar } from '@/components/TabBar';
import { Icon } from '@/components/Icon';

type StatusFilter = 'learning' | 'known' | 'all';

function GrammarList() {
  const { data } = useStore();
  const [status, setStatus] = useState<StatusFilter>('learning');
  const [query, setQuery] = useState('');
  const all = useMemo(() => activeGrammar(data), [data]);
  const counts = { learning: all.filter((g) => g.status === 'learning').length, known: all.filter((g) => g.status === 'known').length, all: all.length };
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((g) => status === 'all' || g.status === status)
      .filter((g) => !q || g.name.includes(q) || g.nameEn.includes(q))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [all, status, query]);

  return (
    <>
      <main className="page">
        <h1 className="page-title">문법 노트</h1>

        <label className="search">
          <Icon name="search" size={18} />
          <span className="sr-only">문법 검색</span>
          <input type="search" placeholder="문법 이름으로 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>

        <div className="seg" role="tablist">
          {(
            [
              ['learning', `공부 중 ${counts.learning}`],
              ['known', `알아요 ${counts.known}`],
              ['all', `전체 ${counts.all}`],
            ] as [StatusFilter, string][]
          ).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={status === k} onClick={() => setStatus(k)}>
              {label}
            </button>
          ))}
        </div>

        {all.length === 0 ? (
          <div className="card stack" style={{ textAlign: 'center', padding: 24 }}>
            <b>아직 저장한 문법이 없어요</b>
            <span className="muted">
              자료를 읽다가 문장을 고르고 <b>문법</b> 버튼을 누르면 문법을 분석해 줘요. 마음에 드는 항목을 &quot;노트에 저장&quot;하면 여기에 모여요.
            </span>
            <Link href="/" className="btn primary">
              내 자료로 가기
            </Link>
          </div>
        ) : list.length === 0 ? (
          <div className="muted" style={{ textAlign: 'center', padding: 16 }}>
            조건에 맞는 문법이 없어요.
          </div>
        ) : (
          <div className="card flush">
            {list.map((g) => (
              <Link key={g.id} href={`/grammar/?id=${encodeURIComponent(g.id)}`} className="list-row">
                <div className="grow stack" style={{ gap: 2 }}>
                  <b style={{ fontSize: 16 }}>{g.name}</b>
                  <span className="small">
                    {g.nameEn} · 내 자료 예문 {g.examples.length}개
                  </span>
                </div>
                {g.status === 'known' ? <span className="chip ok">알아요</span> : <span className="chip later">공부 중</span>}
              </Link>
            ))}
          </div>
        )}
      </main>
      <TabBar />
    </>
  );
}

function Quiz({ item }: { item: GrammarItem }) {
  const { upsertGrammar } = useStore();
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const make = async () => {
    setLoading(true);
    setErr('');
    try {
      const quiz = await makeGrammarQuiz(item.name, item.nameEn, item.examples);
      if (quiz.length === 0) throw new Error('문제를 만들지 못했어요. 다시 시도해 주세요.');
      setPicked({});
      upsertGrammar({ ...item, quiz });
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const done = item.quiz.length > 0 && item.quiz.every((_, i) => picked[i] !== undefined);
  const score = item.quiz.filter((q, i) => picked[i] === q.answer).length;

  return (
    <div className="stack">
      <div className="between">
        <b>연습 문제</b>
        <button className="btn sm" disabled={loading} onClick={() => void make()}>
          {loading ? '만드는 중…' : item.quiz.length ? '새 문제 만들기' : '문제 만들기'}
        </button>
      </div>
      {err && <div className="banner err">{err}</div>}
      {item.quiz.length === 0 && !loading && <div className="muted">내 자료의 예문을 바탕으로 객관식 3문제를 만들어 줘요.</div>}
      {item.quiz.map((q, qi) => {
        const chosen = picked[qi];
        return (
          <div className="card stack" key={qi} style={{ gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-read)', fontSize: 16, lineHeight: 1.5 }}>
              {qi + 1}. {q.q}
            </span>
            <div className="stack" style={{ gap: 6 }}>
              {q.choices.map((c, ci) => {
                const isAnswer = ci === q.answer;
                const show = chosen !== undefined;
                const style = show ? (isAnswer ? { background: 'var(--teal-soft-2)', borderColor: 'var(--teal)' } : ci === chosen ? { background: 'var(--red-soft)', borderColor: 'var(--red-line)' } : {}) : {};
                return (
                  <button key={ci} className="btn" style={{ justifyContent: 'flex-start', textAlign: 'left', ...style }} disabled={show} onClick={() => setPicked((p) => ({ ...p, [qi]: ci }))}>
                    {c}
                    {show && isAnswer && ' ✓'}
                  </button>
                );
              })}
            </div>
            {chosen !== undefined && <div className="muted">{q.explain}</div>}
          </div>
        );
      })}
      {done && (
        <div className="banner info">
          <b>
            {item.quiz.length}문제 중 {score}문제 맞았어요
          </b>
        </div>
      )}
    </div>
  );
}

function GrammarDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data, ready, upsertGrammar, removeGrammar } = useStore();
  const item = data.grammar?.[id];

  if (!ready) return <main className="page no-tabs muted">불러오는 중…</main>;
  if (!item || item.deleted) {
    return (
      <main className="page no-tabs">
        <div className="banner err">문법 항목을 찾을 수 없어요.</div>
        <Link href="/grammar/" className="btn">
          문법 노트로
        </Link>
      </main>
    );
  }

  const remove = () => {
    if (!window.confirm(`"${item.name}"을(를) 문법 노트에서 지울까요?`)) return;
    removeGrammar(item.id);
    router.push('/grammar/');
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/grammar/" className="icon-btn" aria-label="문법 노트로">
            <Icon name="back" />
          </Link>
          <div className="topbar-title">
            <strong>{item.name}</strong>
            <span>{item.nameEn}</span>
          </div>
          <span style={{ width: 44 }} />
        </div>
      </header>
      <main className="page no-tabs">
        <div className="card stack">
          <div style={{ fontSize: 15, lineHeight: 1.6 }}>{item.explanation}</div>
          {item.usage && <div className="muted">{item.usage}</div>}
          <div className="row" style={{ gap: 10 }}>
            <button className="btn grow" aria-pressed={item.status === 'known'} onClick={() => upsertGrammar({ ...item, status: 'known' })}>
              {item.status === 'known' ? '✓ 알아요' : '알아요'}
            </button>
            <button className="btn primary grow" onClick={() => upsertGrammar({ ...item, status: 'learning' })}>
              {item.status === 'learning' ? '✓ 공부 중' : '공부하기'}
            </button>
          </div>
        </div>

        <div className="stack">
          <b>내 자료 예문 ({item.examples.length})</b>
          {item.examples.map((e, i) => (
            <div className="card stack" key={i} style={{ gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-read)', fontSize: 16, lineHeight: 1.5 }}>{e.sentence}</span>
              {e.part && <span style={{ fontFamily: 'var(--font-read)', fontSize: 14, background: 'var(--amber-soft)', borderRadius: 6, padding: '2px 6px', alignSelf: 'flex-start' }}>{e.part}</span>}
              <Link href={`/reader/?id=${encodeURIComponent(e.docId)}`} className="small" style={{ fontWeight: 600 }}>
                {e.docTitle} · {e.page + 1}쪽 →
              </Link>
            </div>
          ))}
        </div>

        <Quiz item={item} />

        <button className="btn danger" onClick={remove}>
          <Icon name="trash" size={16} /> 문법 노트에서 지우기
        </button>
      </main>
    </>
  );
}

function GrammarInner() {
  const id = useSearchParams().get('id') ?? '';
  return id ? <GrammarDetail id={id} /> : <GrammarList />;
}

export default function GrammarPage() {
  return (
    <Suspense fallback={<main className="page muted">불러오는 중…</main>}>
      <GrammarInner />
    </Suspense>
  );
}
