'use client';
// D4 설정: 보기 · 저장/동기화 · 키 · 백업
import Link from 'next/link';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { isGoogleConfigured } from '@/lib/config';
import { errorMessage } from '@/lib/util';
import type { FontSize } from '@/lib/types';
import { Icon } from '@/components/Icon';
import { AIConnect } from '@/components/AIConnect';
import { VoiceSettings } from '@/components/VoiceSettings';

const SYNC_LABEL: Record<string, [string, string]> = {
  idle: ['연결됨', 'ok'],
  syncing: ['동기화 중', 'ok'],
  offline: ['오프라인', 'warn'],
  error: ['오류', 'err'],
  'auth-expired': ['다시 연결 필요', 'err'],
  'signed-out': ['연결 안 됨', 'warn'],
};

export default function SettingsPage() {
  const { data, setPrefs, sync, syncError, lastSynced, userEmail, connect, disconnect, syncNow } = useStore();
  const p = data.prefs;
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true);
    setMsg('');
    setOk('');
    try {
      await fn();
      if (done) setOk(done);
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `영어서재-백업-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const [label, tone] = SYNC_LABEL[sync] ?? ['', 'warn'];
  const switches: { k: 'hk' | 'tr' | 'focus'; label: string; help: string }[] = [
    { k: 'hk', label: '한글 발음', help: '영어 단어 바로 아래에 표시' },
    { k: 'tr', label: '번역', help: '영어 문장 아래에 한국어 뜻' },
    { k: 'focus', label: '읽는 문장에만 표시', help: '긴 글에서 발음·번역을 현재 문장에만 (AI 사용량도 줄어요)' },
  ];

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="icon-btn" aria-label="내 자료로">
            <Icon name="back" />
          </Link>
          <div className="topbar-title">
            <strong>설정</strong>
          </div>
          <span style={{ width: 44 }} />
        </div>
      </header>

      <main className="page no-tabs">
        {msg && <div className="banner err">{msg}</div>}
        {ok && <div className="banner info">{ok}</div>}

        <section className="stack" style={{ gap: 6 }}>
          <h2 className="small" style={{ margin: 0, fontWeight: 700 }}>
            보기 · 모든 화면 공통
          </h2>
          <div className="card flush">
            {switches.map((s) => (
              <div key={s.k} className="list-row" style={{ justifyContent: 'space-between' }}>
                <span className="stack" style={{ gap: 2 }}>
                  <span style={{ fontSize: 15 }}>{s.label}</span>
                  <span className="small">{s.help}</span>
                </span>
                <button className="switch" role="switch" aria-checked={p[s.k]} aria-label={s.label} onClick={() => setPrefs({ [s.k]: !p[s.k] })}>
                  <span />
                </button>
              </div>
            ))}
            <div className="list-row" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15 }}>글자 크기</span>
              <div className="seg" role="radiogroup" aria-label="글자 크기" style={{ padding: 3 }}>
                {(
                  [
                    ['s', '작게'],
                    ['m', '보통'],
                    ['l', '크게'],
                  ] as [FontSize, string][]
                ).map(([k, l]) => (
                  <button key={k} role="radio" aria-checked={p.fontSize === k} onClick={() => setPrefs({ fontSize: k })} style={{ padding: '0 10px', fontSize: 13 }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="list-row" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15 }}>하루 새 용어</span>
              <select className="input" style={{ width: 110, minHeight: 44 }} value={p.newPerDay} onChange={(e) => setPrefs({ newPerDay: Number(e.target.value) })} aria-label="하루 새 용어 수">
                {[5, 10, 15, 20, 30].map((n) => (
                  <option key={n} value={n}>
                    {n}개
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="stack" style={{ gap: 6 }}>
          <h2 className="small" style={{ margin: 0, fontWeight: 700 }}>
            저장 · PC와 휴대폰 동기화
          </h2>
          <div className="card stack">
            <div className="between" style={{ alignItems: 'flex-start' }}>
              <span className="stack" style={{ gap: 2 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Google 드라이브</span>
                <span className="small">내 드라이브 › 영어서재 · 원본 / 앱 숨김 폴더 · 학습 기록</span>
                {userEmail && <span className="small">{userEmail}</span>}
                {lastSynced && <span className="small">마지막 동기화 {new Date(lastSynced).toLocaleTimeString('ko-KR')}</span>}
                {sync === 'error' && syncError && <span className="small" style={{ color: '#6e2312' }}>{syncError}</span>}
              </span>
              <span className={`chip ${tone}`}>{label}</span>
            </div>
            {!isGoogleConfigured() && <div className="banner err">.env.local에 구글 클라이언트 ID가 없어요.</div>}
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {sync === 'signed-out' || sync === 'auth-expired' ? (
                <button className="btn primary grow" disabled={busy || !isGoogleConfigured()} onClick={() => run(connect, '구글 드라이브에 연결했어요.')}>
                  {sync === 'auth-expired' ? '다시 연결' : 'Google 계정으로 연결'}
                </button>
              ) : (
                <>
                  <button className="btn grow" disabled={busy || sync === 'syncing'} onClick={() => run(syncNow, '동기화했어요.')}>
                    <Icon name="refresh" size={18} /> 지금 동기화
                  </button>
                  <button className="btn danger" disabled={busy} onClick={() => window.confirm('이 기기에서 구글 연결을 끊을까요? 이 기기의 기록은 남아요.') && run(disconnect)}>
                    연결 끊기
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="card between">
            <span className="stack" style={{ gap: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>PC 도우미</span>
              <span className="small">영상 자막 · 스캔본 글자 인식 · 휴대폰용 압축본</span>
            </span>
            <span className="chip later">3단계에서 추가</span>
          </div>
        </section>

        <section className="stack" style={{ gap: 6 }}>
          <h2 className="small" style={{ margin: 0, fontWeight: 700 }}>
            AI 연결 · Gemini · 키는 이 기기에만 저장
          </h2>
          <div className="card">
            <AIConnect />
          </div>
        </section>

        <section className="stack" style={{ gap: 6 }}>
          <h2 className="small" style={{ margin: 0, fontWeight: 700 }}>
            음성 · 문장 듣기
          </h2>
          <div className="card">
            <VoiceSettings />
          </div>
        </section>

        <section className="stack" style={{ gap: 6 }}>
          <h2 className="small" style={{ margin: 0, fontWeight: 700 }}>
            기타
          </h2>
          <div className="card flush">
            <Link href="/setup/" className="list-row">
              <span className="grow">처음 설정 · 앱 설치 안내 다시 보기</span>
              <Icon name="next" size={18} />
            </Link>
            <button className="list-row" onClick={exportData}>
              <span className="grow">학습 기록 백업 파일로 내려받기 (JSON)</span>
              <Icon name="upload" size={18} />
            </button>
          </div>
          <span className="small">영어 서재 0.1.0 · 1단계</span>
        </section>
      </main>
    </>
  );
}
