'use client';
// E1 첫 실행 안내: AI 연결(Gemini) → 구글 연결 → 앱 설치 → 발음 평가 키(2단계)
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getAIKey } from '@/lib/ai';
import { AIConnect } from '@/components/AIConnect';
import { useStore } from '@/lib/store';
import { hasValidToken } from '@/lib/google';
import { isGoogleConfigured, LS_KEYS } from '@/lib/config';
import { errorMessage, lsSet } from '@/lib/util';
import { isStandalone, promptInstall } from '@/components/AppShell';

type StepState = 'todo' | 'done';

export default function SetupPage() {
  const router = useRouter();
  const { connect, userEmail } = useStore();
  const [step, setStep] = useState(0);
  const [states, setStates] = useState<StepState[]>(['todo', 'todo', 'todo', 'todo']);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [installable, setInstallable] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const k = getAIKey();
    const s: StepState[] = ['todo', 'todo', 'todo', 'todo'];
    if (k) s[0] = 'done';
    if (hasValidToken()) s[1] = 'done';
    if (isStandalone()) s[2] = 'done';
    setStates(s);
    setStep(s.findIndex((x) => x === 'todo') === -1 ? 3 : s.findIndex((x) => x === 'todo'));
    setInstalled(isStandalone());
    const upd = () => setInstallable(!!window.__installPrompt);
    upd();
    window.addEventListener('installable', upd);
    return () => window.removeEventListener('installable', upd);
  }, []);

  const markDone = (i: number) => {
    setStates((prev) => prev.map((s, k) => (k === i ? 'done' : s)));
    setStep(i + 1);
    setMsg('');
  };

  const doConnect = async () => {
    setBusy(true);
    setMsg('');
    try {
      await connect();
      markDone(1);
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const doInstall = async () => {
    const r = await promptInstall();
    if (r === 'accepted') {
      setInstalled(true);
      markDone(2);
    } else if (r === 'unavailable') setMsg('이 브라우저에서는 설치 버튼을 바로 띄울 수 없어요. 아래 방법으로 설치해 주세요.');
  };

  const finish = () => {
    lsSet(LS_KEYS.setupDone, '1');
    router.push('/');
  };

  const allDone = states[0] === 'done' && states[1] === 'done';

  const steps = [
    { title: 'AI 연결 (Gemini)', help: '번역 · 한글 발음 · 용어 사전 · 문법 · AI 대화' },
    { title: '구글 계정으로 연결', help: '드라이브 ‘영어서재’ 폴더에 자료·기록 저장 · PC와 휴대폰 함께 쓰기' },
    { title: '앱 설치', help: '홈 화면·바탕화면 아이콘으로 바로 열기 · 오프라인 읽기' },
    { title: '발음 평가 키 (선택)', help: '발음 점수가 필요할 때만 · 2단계에서 설정해요' },
  ];

  return (
    <main className="page no-tabs">
      <div className="stack" style={{ gap: 8, marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)' }}>처음 설정 · {Math.min(step + 1, 4)} / 4</div>
        <h1 className="page-title" style={{ fontSize: 26, lineHeight: 1.3 }}>
          내 논문과 영상으로
          <br />
          영어를 공부해요
        </h1>
        <p className="muted" style={{ margin: 0, fontSize: 15 }}>
          네 단계만 거치면 바로 시작할 수 있어요. 나중에 설정에서 언제든 바꿀 수 있어요.
        </p>
      </div>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map((s, i) => {
          const done = states[i] === 'done';
          const active = i === step;
          return (
            <li key={s.title} className="card" style={{ border: active ? '2px solid var(--teal)' : undefined, opacity: done && !active ? 0.75 : 1 }}>
              <button
                onClick={() => setStep(i)}
                style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', border: 'none', background: 'none', padding: 0, textAlign: 'left' }}
                aria-expanded={active}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    flexShrink: 0,
                    background: done ? 'var(--teal)' : active ? 'var(--teal-soft)' : '#eef1f4',
                    color: done ? '#fff' : active ? 'var(--teal-dark)' : 'var(--ink-2)',
                  }}
                >
                  {done ? '✓' : i + 1}
                </span>
                <span className="stack grow" style={{ gap: 2 }}>
                  <b style={{ fontSize: 16 }}>{s.title}</b>
                  <span className="muted">{s.help}</span>
                </span>
              </button>

              {active && i === 0 && (
                <div className="stack" style={{ marginTop: 12 }}>
                  <AIConnect saveLabel="저장하고 다음" onSaved={() => markDone(0)} />
                  {done && (
                    <button className="btn" onClick={() => setStep(1)}>
                      지금 설정 그대로 다음
                    </button>
                  )}
                </div>
              )}

              {active && i === 1 && (
                <div className="stack" style={{ marginTop: 12 }}>
                  {!isGoogleConfigured() && <div className="banner err">구글 클라이언트 ID가 설정되지 않았어요. 코드 폴더의 .env.local 파일을 확인한 뒤 앱을 다시 실행해 주세요.</div>}
                  <span className="muted" style={{ background: 'var(--ground)', borderRadius: 10, padding: '10px 12px' }}>
                    이 앱이 만든 파일만 볼 수 있게 권한을 제한해요. 드라이브의 다른 파일은 열지 않아요. 처음 연결할 때 나오는 체크 상자 두 개를 모두 선택해 주세요.
                  </span>
                  {done && userEmail && <span className="small">연결됨: {userEmail}</span>}
                  <button className="btn primary" disabled={busy || !isGoogleConfigured()} onClick={doConnect}>
                    {busy ? '연결 중…' : done ? '다시 연결' : 'Google 계정으로 연결'}
                  </button>
                </div>
              )}

              {active && i === 2 && (
                <div className="stack" style={{ marginTop: 12 }}>
                  {installed ? (
                    <span className="chip ok" style={{ alignSelf: 'flex-start' }}>
                      설치된 앱으로 열려 있어요
                    </span>
                  ) : (
                    <>
                      {installable && (
                        <button className="btn primary" onClick={doInstall}>
                          앱 설치하기
                        </button>
                      )}
                      <div className="muted" style={{ background: 'var(--ground)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.6 }}>
                        <b>갤럭시</b> · 크롬: 오른쪽 위 ⋮ → ‘앱 설치’ 또는 ‘홈 화면에 추가’
                        <br />
                        <b>갤럭시</b> · 삼성 인터넷: 아래 메뉴 → ‘현재 페이지 추가’ → ‘홈 화면’
                        <br />
                        <b>PC</b> · 크롬·엣지: 주소창 오른쪽의 설치 아이콘(모니터 모양)
                      </div>
                    </>
                  )}
                  <button className="btn" onClick={() => markDone(2)}>
                    {installed ? '다음' : '설치했어요 / 나중에 하기'}
                  </button>
                </div>
              )}

              {active && i === 3 && (
                <div className="stack" style={{ marginTop: 12 }}>
                  <span className="muted">발음 평가는 2단계에서 추가돼요. 지금은 건너뛰어도 돼요.</span>
                  <button className="btn" onClick={() => markDone(3)}>
                    지금은 건너뛰기
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {msg && <div className="banner err">{msg}</div>}

      <div className="stack">
        <button className="btn primary block" disabled={!allDone} onClick={finish} style={{ minHeight: 54, fontSize: 16 }}>
          {allDone ? '시작하기' : 'AI 연결과 구글 연결을 마치면 시작할 수 있어요'}
        </button>
        <Link href="/" className="btn block" style={{ border: 'none', background: 'none', color: 'var(--ink-2)' }} onClick={() => lsSet(LS_KEYS.setupDone, '1')}>
          나중에 하고 둘러보기
        </Link>
      </div>
    </main>
  );
}
