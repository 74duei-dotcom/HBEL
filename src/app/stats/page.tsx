'use client';
// 학습 통계: 저장한 단어·복습 기록으로 만든 간단한 현황 (모두 이 기기에 있는 데이터로 계산)
import Link from 'next/link';
import { useMemo } from 'react';
import { activeVocab, useStore } from '@/lib/store';
import { TabBar } from '@/components/TabBar';
import { Icon } from '@/components/Icon';

const DAY = 86400000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const label = (t: number) => `${new Date(t).getMonth() + 1}/${new Date(t).getDate()}`;

function Bars({ values, days, color }: { values: number[]; days: number[]; color: string }) {
  const max = Math.max(1, ...values);
  return (
    <div role="img" aria-label="일별 막대 그래프" style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 96 }}>
      {values.map((v, i) => (
        <div key={days[i]} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}>
          <span className="small" style={{ fontSize: 10 }}>{v || ''}</span>
          <div style={{ width: '100%', height: `${(v / max) * 64}px`, minHeight: v ? 3 : 1, background: v ? color : 'var(--line-2)', borderRadius: 3 }} />
        </div>
      ))}
    </div>
  );
}

export default function StatsPage() {
  const { data } = useStore();
  const all = useMemo(() => activeVocab(data), [data]);

  const s = useMemo(() => {
    const today = startOfDay(new Date());
    const days14 = Array.from({ length: 14 }, (_, i) => today - (13 - i) * DAY);
    const added = days14.map(() => 0);
    const reviewed = days14.map(() => 0);
    const upcoming = Array.from({ length: 7 }, () => 0);
    const reviewDays = new Set<number>();
    for (const v of all) {
      const a = Math.round((today - startOfDay(new Date(v.createdAt))) / DAY);
      if (a >= 0 && a < 14) added[13 - a]++;
      if (v.card.last_review) {
        const d = startOfDay(new Date(v.card.last_review));
        reviewDays.add(d);
        const r = Math.round((today - d) / DAY);
        if (r >= 0 && r < 14) reviewed[13 - r]++;
      }
      if (v.status === 'learning' && v.card.reps > 0) {
        const u = Math.max(0, Math.round((startOfDay(new Date(v.card.due)) - today) / DAY));
        if (u < 7) upcoming[u]++;
      }
    }
    // 연속 학습일: 오늘(없으면 어제)부터 거꾸로 이어진 복습한 날 수
    let streak = 0;
    let t = reviewDays.has(today) ? today : today - DAY;
    while (reviewDays.has(t)) {
      streak++;
      t -= DAY;
    }
    const known = all.filter((v) => v.status === 'known').length;
    const medical = all.filter((v) => v.isMedical).length;
    const mature = all.filter((v) => v.card.stability >= 21).length;
    return { days14, added, reviewed, upcoming, streak, known, medical, mature, today };
  }, [all]);

  const days7 = Array.from({ length: 7 }, (_, i) => s.today + i * DAY);

  return (
    <>
      <main className="page">
        <div className="between">
          <h1 className="page-title">학습 통계</h1>
          <Link href="/" className="icon-btn outline" aria-label="홈으로">
            <Icon name="back" size={20} />
          </Link>
        </div>

        <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {[
            ['연속 학습일', `${s.streak}일`],
            ['저장한 단어', `${all.length}개`],
            ['알아요', `${s.known}개`],
            ['의학 용어', `${s.medical}개`],
            ['단단히 외움', `${s.mature}개`],
          ].map(([k, v]) => (
            <div key={k} className="stack" style={{ gap: 2 }}>
              <span className="small">{k}</span>
              <span style={{ fontSize: 22, fontWeight: 700 }}>{v}</span>
            </div>
          ))}
        </div>

        <div className="card stack">
          <b>최근 14일 새로 저장한 단어</b>
          <Bars values={s.added} days={s.days14} color="var(--teal)" />
          <div className="between small"><span>{label(s.days14[0])}</span><span>{label(s.days14[13])}</span></div>
        </div>

        <div className="card stack">
          <b>최근 14일 복습한 단어</b>
          <Bars values={s.reviewed} days={s.days14} color="var(--navy, #1f3a5f)" />
          <div className="between small"><span>{label(s.days14[0])}</span><span>{label(s.days14[13])}</span></div>
          <span className="small muted">단어마다 마지막으로 복습한 날을 기준으로 세요(같은 단어를 여러 번 복습해도 마지막 날에 한 번만 셉니다).</span>
        </div>

        <div className="card stack">
          <b>앞으로 7일 복습 예정</b>
          <Bars values={s.upcoming} days={days7} color="var(--teal)" />
          <div className="between small"><span>오늘</span><span>{label(days7[6])}</span></div>
        </div>
      </main>
      <TabBar />
    </>
  );
}
