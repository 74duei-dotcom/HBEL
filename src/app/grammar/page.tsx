'use client';
// 문법 노트: 내 자료에서 저장한 문법 항목 목록 / 상세(설명 · 내 자료 예문 · 연습 문제)
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { activeGrammar, useStore } from '@/lib/store';
import { makeGrammarQuiz } from '@/lib/grammar';
import { basicGrammarList, isBasicGrammarId, PATTERN_SUMMARY, resolveBasicGrammar } from '@/lib/grammarBasics';
import type { GrammarItem } from '@/lib/types';
import { errorMessage } from '@/lib/util';
import { TabBar } from '@/components/TabBar';
import { Icon } from '@/components/Icon';

type StatusFilter = 'learning' | 'known' | 'all';

function GrammarList() {
  const { data } = useStore();
  const [status, setStatus] = useState<StatusFilter>('learning');
  const [query, setQuery] = useState('');
  const basics = useMemo(() => basicGrammarList(data), [data]);
  const saved = useMemo(() => activeGrammar(data).filter((g) => !isBasicGrammarId(g.id)), [data]);
  const all = useMemo(() => [...basics, ...saved], [basics, saved]);
  const counts = { learning: all.filter((g) => g.status === 'learning').length, known: all.filter((g) => g.status === 'known').length, all: all.length };
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pick = (items: GrammarItem[]) =>
      items.filter((g) => status === 'all' || g.status === status).filter((g) => !q || g.name.toLowerCase().includes(q) || g.nameEn.toLowerCase().includes(q));
    // 기본 문법은 1~5형식 순서 그대로, 내 자료에서 저장한 것은 최근 순
    return [...pick(basics), ...pick(saved).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))];
  }, [basics, saved, status, query]);

  return (
    <>
      <main className="page">
        <h1 className="page-title">문법 노트</h1>

        <label className="search">
          <Icon name="search" size={18} />
          <span className="sr-only">문법 검색</span>
          <input type="search" placeholder="문법 이름으로 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>

        <Link href="/grammar/?view=patterns" className="card between" style={{ padding: "12px 16px", textDecoration: "none", color: "inherit" }}>
          <span className="stack" style={{ gap: 2 }}>
            <b>5형식 한눈에 보기</b>
            <span className="small">다섯 문장 형식을 한 장으로 정리</span>
          </span>
          <span aria-hidden>→</span>
        </Link>

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

        {list.length === 0 ? (
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
                    {g.nameEn} · {g.builtin ? '기본 문법' : `내 자료 예문 ${g.examples.length}개`}
                  </span>
                </div>
                {g.status === 'known' ? <span className="chip ok">알아요</span> : <span className="chip later">공부 중</span>}
              </Link>
            ))}
          </div>
        )}

        {saved.length === 0 && (
          <div className="card stack" style={{ textAlign: 'center', padding: 20 }}>
            <b>내 자료에서 뽑은 문법은 아직 없어요</b>
            <span className="muted">
              자료를 읽다가 문장을 고르고 <b>문법</b> 버튼을 누르면 문법을 분석해 줘요. 마음에 드는 항목을 &quot;노트에 저장&quot;하면 여기에 모여요.
            </span>
            <Link href="/" className="btn">
              내 자료로 가기
            </Link>
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
        {!item.builtin && (
          <button className="btn sm" disabled={loading} onClick={() => void make()}>
            {loading ? '만드는 중…' : item.quiz.length ? '새 문제 만들기' : '문제 만들기'}
          </button>
        )}
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
  const item = resolveBasicGrammar(data, id) ?? data.grammar?.[id];

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
          <b>
            {item.builtin ? '예문' : '내 자료 예문'} ({item.examples.length})
          </b>
          {item.examples.map((e, i) => (
            <div className="card stack" key={i} style={{ gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-read)', fontSize: 16, lineHeight: 1.5 }}>{e.sentence}</span>
              {e.ko && <span className="muted">{e.ko}</span>}
              {e.part && <span style={{ fontFamily: 'var(--font-read)', fontSize: 14, background: 'var(--amber-soft)', borderRadius: 6, padding: '2px 6px', alignSelf: 'flex-start' }}>{e.part}</span>}
              {e.docId && (
                <Link href={`/reader/?id=${encodeURIComponent(e.docId)}`} className="small" style={{ fontWeight: 600 }}>
                  {e.docTitle} · {e.page + 1}쪽 →
                </Link>
              )}
            </div>
          ))}
        </div>

        <Quiz item={item} />

        {!item.builtin && (
          <button className="btn danger" onClick={remove}>
            <Icon name="trash" size={16} /> 문법 노트에서 지우기
          </button>
        )}
      </main>
    </>
  );
}

const ROLE_STYLE: Record<string, { bg: string; fg: string }> = {
  S: { bg: 'var(--teal-soft-2)', fg: 'var(--teal-dark)' },
  V: { bg: 'var(--amber-soft)', fg: 'var(--amber-ink)' },
  O: { bg: 'var(--blue-soft)', fg: 'var(--blue-ink)' },
  IO: { bg: 'var(--blue-soft)', fg: 'var(--blue-ink)' },
  DO: { bg: 'var(--blue-soft)', fg: 'var(--blue-ink)' },
  C: { bg: 'var(--red-soft)', fg: 'var(--red)' },
  OC: { bg: 'var(--red-soft)', fg: 'var(--red)' },
};

function RoleChip({ role, text }: { role: string; text?: string }) {
  const st = ROLE_STYLE[role] ?? { bg: 'var(--ground)', fg: 'var(--ink)' };
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span style={{ background: st.bg, color: st.fg, borderRadius: 8, padding: '3px 10px', fontWeight: 700, fontFamily: text ? 'var(--font-read)' : undefined, fontSize: text ? 16 : 14 }}>{text ?? role}</span>
      {text && <span className="small" style={{ fontWeight: 600 }}>{role}</span>}
    </span>
  );
}

const ROLE_KO: Record<string, string> = { S: '주어', V: '동사', O: '목적어', IO: '간접목적어', DO: '직접목적어', C: '보어', OC: '목적격 보어' };

const ROLE_LEGEND: [string, string, string][] = [
  ['S', '주어 (Subject)', '"~은/는, ~이/가" — 동작이나 상태의 주인공. 예: The pain(통증이)'],
  ['V', '동사 (Verb)', '"~하다, ~이다" — 문장의 움직임·상태를 말해요. 예: disappeared(사라졌다)'],
  ['O', '목적어 (Object)', '"~을/를" — 동사의 대상. 예: back pain(허리 통증을)'],
  ['IO', '간접목적어 (Indirect Object)', '"~에게" — 받는 사람. 예: him(그에게)'],
  ['DO', '직접목적어 (Direct Object)', '"~을/를" — 주고받는 물건·내용. 예: a stretching routine(스트레칭 루틴을)'],
  ['C', '보어 (Complement)', '주어가 어떤 상태·무엇인지 설명. 예: infected(감염된)'],
  ['OC', '목적격 보어 (Object Complement)', '목적어가 어떤 상태인지 설명. 예: the joint stable → stable(안정된)'],
];

function PatternOverview() {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/grammar/" className="icon-btn" aria-label="문법 노트로">
            <Icon name="back" />
          </Link>
          <div className="topbar-title">
            <strong>5형식 한눈에 보기</strong>
            <span>S 주어 · V 동사 · O 목적어 · C 보어</span>
          </div>
          <span style={{ width: 44 }} />
        </div>
      </header>
      <main className="page no-tabs">
        <div className="card stack" style={{ gap: 8 }}>
          <b>기호가 뜻하는 것</b>
          {ROLE_LEGEND.map(([r, name, desc]) => (
            <div key={r} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <span style={{ minWidth: 44, display: 'inline-flex', justifyContent: 'center' }}>
                <RoleChip role={r} />
              </span>
              <span style={{ fontSize: 14, lineHeight: 1.5 }}>
                <b>{name}</b> · {desc}
              </span>
            </div>
          ))}
        </div>
        {PATTERN_SUMMARY.map((p) => (
          <Link key={p.n} href={`/grammar/?id=basic-pattern-${p.n}`} className="card stack" style={{ gap: 10, textDecoration: "none", color: "inherit" }}>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <b style={{ fontSize: 18, color: 'var(--teal)', marginRight: 4 }}>{p.n}형식</b>
              {p.formula.map((r, i) => (
                <span key={i} className="row" style={{ gap: 8, alignItems: 'center' }}>
                  {i > 0 && <span className="muted">+</span>}
                  <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <RoleChip role={r} />
                    <span className="small" style={{ fontWeight: 600 }}>
                      {ROLE_KO[r]}
                    </span>
                  </span>
                </span>
              ))}
            </div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6, alignItems: 'flex-start' }}>
              {p.parts.map((x, i) => (
                <RoleChip key={i} role={x.role} text={x.text} />
              ))}
            </div>
            <span className="muted">{p.ko}</span>
            <span style={{ fontSize: 14 }}>{p.tip}</span>
          </Link>
        ))}
        <div className="small" style={{ textAlign: 'center' }}>
          카드를 누르면 자세한 설명과 연습 문제가 나와요.
        </div>
      </main>
    </>
  );
}

function GrammarInner() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  if (params.get('view') === 'patterns') return <PatternOverview />;
  return id ? <GrammarDetail id={id} /> : <GrammarList />;
}

export default function GrammarPage() {
  return (
    <Suspense fallback={<main className="page muted">불러오는 중…</main>}>
      <GrammarInner />
    </Suspense>
  );
}
