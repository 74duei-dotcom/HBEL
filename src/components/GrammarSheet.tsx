'use client';
// 지금 문장의 문법을 분석해서 보여주는 아래 창 - 마음에 드는 항목은 "문법 노트"에 저장
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/lib/store';
import { analyzeGrammar, grammarId } from '@/lib/grammar';
import type { DocKind, GrammarAnalysis, GrammarExample, GrammarItem, GrammarPoint } from '@/lib/types';
import { errorMessage, nowIso } from '@/lib/util';
import { Icon } from './Icon';

export interface GrammarTarget {
  sentence: string;
  page: number;
}

interface Props {
  target: GrammarTarget | null;
  docId: string;
  docTitle: string;
  kind: DocKind;
  cached: (target: GrammarTarget) => GrammarAnalysis | undefined;
  onCache: (target: GrammarTarget, a: GrammarAnalysis) => void;
  onClose: () => void;
}

export function GrammarSheet({ target, docId, docTitle, kind, cached, onCache, onClose }: Props) {
  const { data, upsertGrammar } = useStore();
  const [info, setInfo] = useState<GrammarAnalysis | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const reqId = useRef(0);

  // PC(넓은 화면)에서는 아래 창 대신 읽기 화면 우측 패널(#grammar-dock) 안에 표시
  const [dock, setDock] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setDock(mq.matches ? document.getElementById('grammar-dock') : null);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [target]);

  const load = useCallback(async () => {
    if (!target) return;
    const my = ++reqId.current; // 더 새로운 요청이 시작되면 이전 요청의 결과는 화면에 반영하지 않음
    setErr('');
    const hit = cached(target);
    if (hit) {
      setInfo(hit);
      return;
    }
    setInfo(null);
    setLoading(true);
    try {
      const res = await analyzeGrammar(target.sentence, kind);
      onCache(target, res); // 늦게 도착해도 캐시에는 저장
      if (my !== reqId.current) return;
      setInfo(res);
    } catch (e) {
      if (my === reqId.current) setErr(errorMessage(e));
    } finally {
      if (my === reqId.current) setLoading(false);
    }
  }, [target, cached, onCache, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [target, onClose]);

  if (!target) return null;

  const save = (p: GrammarPoint) => {
    const id = grammarId(p.nameEn);
    const ex: GrammarExample = { docId, docTitle, page: target.page, sentence: target.sentence, part: p.part };
    const old = data.grammar?.[id];
    const cur = old && !old.deleted ? old : undefined;
    const examples = cur ? [...cur.examples] : [];
    if (!examples.some((e) => e.docId === docId && e.sentence === ex.sentence)) examples.unshift(ex);
    const item: GrammarItem = {
      id,
      name: cur?.name ?? p.name,
      nameEn: cur?.nameEn ?? p.nameEn,
      explanation: cur?.explanation ?? p.explanation,
      usage: cur?.usage ?? p.usage,
      examples: examples.slice(0, 10),
      quiz: cur?.quiz ?? [],
      status: cur?.status ?? 'learning',
      createdAt: cur?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    upsertGrammar(item);
  };

  const isSaved = (p: GrammarPoint) => {
    const g = data.grammar?.[grammarId(p.nameEn)];
    return !!g && !g.deleted && g.examples.some((e) => e.docId === docId && e.sentence === target.sentence);
  };

  const docked = !!dock;
  const body = (
    <>
      {!docked && <button className="scrim" aria-label="문법 창 닫기" onClick={onClose} />}
      <div className={docked ? 'dock-panel' : 'sheet'} role="dialog" aria-label="문법 분석">
        <div className="sheet-inner">
          <div className="between" style={{ alignItems: 'flex-start' }}>
            <b style={{ fontSize: 16, color: 'var(--teal)' }}>문법 분석</b>
            <button className="icon-btn" style={{ background: 'var(--ground)' }} aria-label="닫기" onClick={onClose}>
              <Icon name="close" size={18} />
            </button>
          </div>
          <span style={{ fontFamily: 'var(--font-read)', fontSize: 16, lineHeight: 1.5 }}>{target.sentence}</span>

          {loading && (
            <div className="stack" role="status" aria-label="문법 분석 중">
              <span className="muted">문법을 분석하는 중…</span>
              <span className="skeleton" style={{ width: '80%' }} />
              <span className="skeleton" style={{ width: '60%' }} />
            </div>
          )}

          {err && (
            <div className="banner err">
              <span className="grow">{err}</span>
              <button className="btn sm danger" onClick={() => void load()}>
                다시 시도
              </button>
            </div>
          )}

          {info && (
            <>
              {info.structure && (
                <div className="banner info" style={{ alignItems: 'flex-start' }}>
                  <span className="grow">
                    <b>문장 구조</b> · {info.structure}
                  </span>
                </div>
              )}
              {info.points.length === 0 && <div className="muted">이 문장에서는 따로 공부할 문법이 없어요.</div>}
              {info.points.map((p) => {
                const saved = isSaved(p);
                return (
                  <div className="card stack" key={p.nameEn} style={{ gap: 6 }}>
                    <div className="between" style={{ alignItems: 'flex-start' }}>
                      <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                        <b style={{ fontSize: 16 }}>{p.name}</b>
                        <span className="small">{p.nameEn}</span>
                      </div>
                      <button className={`btn sm${saved ? '' : ' primary'}`} disabled={saved} onClick={() => save(p)}>
                        {saved ? '✓ 저장됨' : '노트에 저장'}
                      </button>
                    </div>
                    {p.part && <span style={{ fontFamily: 'var(--font-read)', fontSize: 15, background: 'var(--amber-soft)', borderRadius: 6, padding: '2px 6px', alignSelf: 'flex-start' }}>{p.part}</span>}
                    <div style={{ fontSize: 14 }}>{p.explanation}</div>
                    {p.usage && <div className="muted">{p.usage}</div>}
                  </div>
                );
              })}
              <Link href="/grammar/" className="small" style={{ fontWeight: 600, minHeight: 32, display: 'inline-flex', alignItems: 'center' }}>
                내 문법 노트 보기 →
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );
  return dock ? createPortal(body, dock) : body;
}
