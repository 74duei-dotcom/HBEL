'use client';
// 동기화·연결 상태 안내 띠 (문제가 있을 때만 보임)
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { errorMessage } from '@/lib/util';

export function SyncBanner() {
  const { sync, syncError, connect, syncNow } = useStore();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (sync === 'idle' || sync === 'syncing') return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (sync === 'offline')
    return (
      <div className="banner warn" role="status">
        <span className="grow">
          <b>오프라인</b> · 저장된 자료는 볼 수 있어요. 연결되면 자동으로 올려요.
        </span>
      </div>
    );

  if (sync === 'signed-out')
    return (
      <div className="banner info" role="status">
        <span className="grow">구글 드라이브에 연결하면 PC와 휴대폰에서 함께 쓸 수 있어요.</span>
        <button className="btn sm" disabled={busy} onClick={() => run(connect)}>
          연결
        </button>
      </div>
    );

  return (
    <div className="banner err" role="status">
      <span className="grow">
        <b>{sync === 'auth-expired' ? '구글 연결 시간이 끝났어요' : '동기화 안 됨'}</b>
        <br />
        <span>{err || (sync === 'auth-expired' ? '기록은 이 기기에 저장해 두었어요.' : syncError)}</span>
      </span>
      <button className="btn sm danger" disabled={busy} onClick={() => run(sync === 'auth-expired' ? connect : syncNow)}>
        {sync === 'auth-expired' ? '다시 연결' : '다시 시도'}
      </button>
    </div>
  );
}
