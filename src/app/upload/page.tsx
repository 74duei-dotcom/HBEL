'use client';
// D1 자료 올리기: PDF 고르기 → 글자 추출(기기 안) → 드라이브 저장 → 읽기 준비
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useStore, saveDocContent } from '@/lib/store';
import { extractPdf, guessTitle } from '@/lib/pdf';
import { isVideoFile, parseYoutubeId, saveVideo, transcribeVideo, transcribeYoutube, youtubeTitle } from '@/lib/video';
import { getGeminiKeys } from '@/lib/ai';
import { uploadFile, downloadFile, pickFromDrive } from '@/lib/drive';
import { hasValidToken } from '@/lib/google';
import type { DocKind, LibraryDoc } from '@/lib/types';
import { errorMessage, nowIso, uid } from '@/lib/util';
import { Icon } from '@/components/Icon';

type Stage = 'waiting' | 'extracting' | 'ocr' | 'listening' | 'uploading' | 'saving' | 'done' | 'error';

interface Job {
  key: string;
  name: string;
  size?: number;
  file?: File;
  driveId?: string;
  ytId?: string;
  stage: Stage;
  progress: number;
  message: string;
  docId?: string;
  warn?: string;
}

const STAGE_LABEL: Record<Stage, string> = {
  waiting: '대기 중',
  extracting: '글자 추출 중',
  ocr: '스캔 글자 인식 중 (쪽마다 몇 초, 화면을 켜 두세요)',
  listening: '영상 소리를 영어 자막으로 받아 적는 중 (화면을 켜 두세요)',
  uploading: '드라이브에 올리는 중',
  saving: '저장 중',
  done: '완료',
  error: '실패',
};

export default function UploadPage() {
  const { upsertDoc, connect } = useStore();
  const [kind, setKind] = useState<DocKind>('paper');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');
  const [ocr, setOcr] = useState(true);
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = (key: string, p: Partial<Job>) => setJobs((prev) => prev.map((j) => (j.key === key ? { ...j, ...p } : j)));

  const addLocal = (files: FileList | null) => {
    if (!files) return;
    const list: Job[] = [];
    for (const f of Array.from(files)) {
      const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
      if (!isPdf && !isVideoFile(f)) {
        setMsg(`"${f.name}"은(는) PDF나 영상이 아니에요.`);
        continue;
      }
      list.push({ key: uid('j'), name: f.name, size: f.size, file: f, stage: 'waiting', progress: 0, message: '' });
    }
    setJobs((prev) => [...prev, ...list]);
  };

  const addUrl = () => {
    const id = parseYoutubeId(url);
    if (!id) {
      setMsg('유튜브 주소를 확인해 주세요. 예) https://www.youtube.com/watch?v=...');
      return;
    }
    setMsg('');
    setJobs((prev) => (prev.some((j) => j.ytId === id) ? prev : [...prev, { key: uid('j'), name: `유튜브 ${id}`, ytId: id, stage: 'waiting' as Stage, progress: 0, message: '' }]));
    setUrl('');
  };

  const processYoutube = async (job: Job) => {
    const id = uid('d');
    const now = nowIso();
    try {
      if (!getGeminiKeys().length) throw new Error('유튜브 자막은 Gemini 키가 필요해요. 설정의 AI 연결에서 Gemini 키를 넣어 주세요.');
      patch(job.key, { stage: 'listening', progress: 0, message: '' });
      const title = (await youtubeTitle(job.ytId!)) ?? job.name;
      patch(job.key, { name: title });
      const res = await transcribeYoutube(job.ytId!, (done) => patch(job.key, { progress: done / (done + 1.5) }));
      const doc: LibraryDoc = {
        id,
        title,
        kind: 'lecture',
        fileName: `youtube:${job.ytId}`,
        pageCount: res.pages.length,
        sentenceCount: res.sentenceCount,
        lastPage: 0,
        status: 'processing',
        duration: res.duration,
        youtubeId: job.ytId,
        createdAt: now,
        updatedAt: now,
      };
      // 본문 저장이 끝난 뒤에 목록에 올림 (중간에 실패해도 '처리 중' 빈 자료가 남지 않게)
      patch(job.key, { stage: 'saving', progress: 1 });
      const synced = await saveDocContent({ id, pages: res.pages });
      upsertDoc({ ...doc, status: 'ready' });
      patch(job.key, { stage: 'done', docId: id, warn: (res.partial ? res.partial + ' ' : '') + 'AI가 들은 대로 받아 적은 자막이라 틀린 곳이 있을 수 있어요.' + (synced || !hasValidToken() ? '' : ' 드라이브에는 저장하지 못해 이 기기에만 저장했어요.') });
    } catch (e) {
      patch(job.key, { stage: 'error', message: errorMessage(e) });
    }
  };

  const addFromDrive = async () => {
    setMsg('');
    try {
      if (!hasValidToken()) await connect();
      const picked = await pickFromDrive();
      setJobs((prev) => [...prev, ...picked.map((p) => ({ key: uid('j'), name: p.name, driveId: p.id, stage: 'waiting' as Stage, progress: 0, message: '' }))]);
    } catch (e) {
      setMsg(errorMessage(e));
    }
  };

  const processVideo = async (job: Job, file: File) => {
    const id = uid('d');
    const now = nowIso();
    try {
      if (!getGeminiKeys().length) throw new Error('영상 자막은 Gemini 키가 필요해요. 설정의 AI 연결에서 Gemini 키를 넣어 주세요.');
      patch(job.key, { stage: 'extracting', progress: 0, message: '' });
      const res = await transcribeVideo(file, (p) => patch(job.key, p.phase === 'decode' ? { stage: 'extracting', progress: 0 } : { stage: 'listening', progress: p.done / p.total }));
      if (res.sentenceCount === 0) throw new Error('영어 말소리를 찾지 못했어요. 소리가 없거나 영어가 아닌 영상일 수 있어요.');
      const doc: LibraryDoc = {
        id,
        title: job.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || '강의 영상',
        kind: 'lecture',
        fileName: job.name,
        pageCount: res.pages.length,
        sentenceCount: res.sentenceCount,
        lastPage: 0,
        status: 'processing',
        duration: res.duration,
        createdAt: now,
        updatedAt: now,
      };
      patch(job.key, { stage: 'saving', progress: 1 });
      const synced = await saveDocContent({ id, pages: res.pages });
      let warn = 'AI가 들은 대로 받아 적은 자막이라 틀린 곳이 있을 수 있어요.' + (synced || !hasValidToken() ? '' : ' 드라이브에는 저장하지 못해 이 기기에만 저장했어요.');
      try {
        await saveVideo(id, file);
      } catch {
        warn += ' 영상 파일은 이 기기에 저장하지 못해 자막만 읽을 수 있어요.';
      }
      if (hasValidToken()) {
        try {
          patch(job.key, { stage: 'uploading', progress: 0 });
          const meta = await uploadFile(file, job.name, file.type || 'video/mp4', (r) => patch(job.key, { progress: r }));
          doc.driveFileId = meta.id;
        } catch (e) {
          warn += ` 영상을 드라이브에 올리지 못해 이 기기에만 저장했어요(${errorMessage(e)}).`;
        }
      } else {
        warn += ' 구글 드라이브에 연결되지 않아 영상은 이 기기에만 저장했어요.';
      }
      upsertDoc({ ...doc, status: 'ready' });
      patch(job.key, { stage: 'done', docId: id, warn });
    } catch (e) {
      patch(job.key, { stage: 'error', message: errorMessage(e) });
    }
  };

  const processOne = async (job: Job) => {
    if (job.ytId) return processYoutube(job);
    if (job.file && !(job.file.type === 'application/pdf' || job.file.name.toLowerCase().endsWith('.pdf'))) return processVideo(job, job.file);
    const id = uid('d');
    const now = nowIso();
    try {
      patch(job.key, { stage: 'extracting', progress: 0, message: '' });
      const buf = job.file ? await job.file.arrayBuffer() : await downloadFile(job.driveId!);
      const res = await extractPdf(buf.slice(0), {
        ocr,
        onProgress: (done, total, phase) => patch(job.key, { stage: phase === 'ocr' ? 'ocr' : 'extracting', progress: done / total }),
      });
      if (res.sentenceCount === 0) {
        throw new Error(ocr ? '글자를 찾지 못했어요. 사진이 너무 흐리거나 영어가 아닌 문서일 수 있어요.' : '글자를 찾지 못했어요. 스캔본이면 아래 "스캔본이면 글자 인식"을 켜고 다시 해 보세요.');
      }
      const doc: LibraryDoc = {
        id,
        title: guessTitle(res.pages, job.name),
        kind,
        fileName: job.name,
        driveFileId: job.driveId,
        pageCount: res.pageCount,
        sentenceCount: res.sentenceCount,
        lastPage: 0,
        status: 'processing',
        scanned: res.scanned,
        createdAt: now,
        updatedAt: now,
      };
      let warn = res.ocrPages > 0 ? `${res.ocrPages}쪽을 글자 인식으로 읽었어요. 잘못 읽은 글자가 있을 수 있어요.` : res.scanned ? '글자가 적어 스캔본일 수 있어요. 빠진 문장이 있으면 글자 인식을 켜고 다시 올려 주세요.' : '';
      if (job.file && hasValidToken()) {
        patch(job.key, { stage: 'uploading', progress: 0 });
        const meta = await uploadFile(job.file, job.name, 'application/pdf', (r) => patch(job.key, { progress: r }));
        doc.driveFileId = meta.id;
      } else if (job.file) {
        warn = (warn ? warn + ' ' : '') + '구글 드라이브에 연결되지 않아 이 기기에만 저장했어요.';
      }

      patch(job.key, { stage: 'saving', progress: 1 });
      const synced = await saveDocContent({ id, pages: res.pages });
      if (!synced && hasValidToken()) warn = (warn ? warn + ' ' : '') + '드라이브에는 저장하지 못해 이 기기에만 저장했어요.';
      upsertDoc({ ...doc, status: 'ready' });
      patch(job.key, { stage: 'done', docId: id, warn });
    } catch (e) {
      patch(job.key, { stage: 'error', message: errorMessage(e) });
    }
  };

  const start = async () => {
    setRunning(true);
    setMsg('');
    const pending = jobs.filter((j) => j.stage === 'waiting' || j.stage === 'error');
    for (const j of pending) {
      // 하나씩 처리 (휴대폰 메모리 보호)
      await processOne(j);
    }
    setRunning(false);
  };

  const waitingCount = jobs.filter((j) => j.stage === 'waiting' || j.stage === 'error').length;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="icon-btn" aria-label="닫기">
            <Icon name="close" size={20} />
          </Link>
          <div className="topbar-title">
            <strong>자료 올리기</strong>
          </div>
          <span style={{ width: 44 }} />
        </div>
      </header>

      <main className="page no-tabs">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <button className="card" style={{ border: '2px dashed #9fb3bf', minHeight: 72 }} onClick={() => inputRef.current?.click()} disabled={running}>
            <b>파일 선택</b>
            <div className="small">PDF 또는 강의 영상</div>
          </button>
          <button className="card" style={{ minHeight: 72 }} onClick={addFromDrive} disabled={running}>
            <b>구글 드라이브에서</b>
            <div className="small">이미 올려둔 PDF</div>
          </button>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf,video/*,audio/*,.mp4,.mov,.mkv,.mp3,.m4a" multiple hidden onChange={(e) => {
            addLocal(e.target.files);
            e.target.value = '';
          }} />
        </div>

        <div className="stack" style={{ gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>자료 종류</span>
          <div className="seg" role="radiogroup" aria-label="자료 종류">
            {(
              [
                ['paper', '논문'],
                ['book', '전문서적'],
              ] as [DocKind, string][]
            ).map(([k, label]) => (
              <button key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)} disabled={running}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={ocr} disabled={running} onChange={(e) => setOcr(e.target.checked)} style={{ marginTop: 4 }} />
          <span className="stack" style={{ gap: 2 }}>
            <span>스캔본이면 글자 인식(OCR)</span>
            <span className="small">글자가 없는 쪽(사진·스캔)만 이 기기에서 읽어 와요. 쪽마다 몇 초 걸려 두꺼운 책은 오래 걸릴 수 있어요. 처음 한 번은 약 8MB를 내려받아요.</span>
          </span>
        </label>

        <div className="small" style={{ lineHeight: 1.6 }}>
          강의 영상(mp4·mp3 등)도 올릴 수 있어요. PC에서 올리는 것을 권해요. 소리를 4분씩 나눠 Gemini가 영어 자막으로 받아 적으며, 10분 영상에 1~3분 걸려요. 영상 파일은 이 기기와 내 구글 드라이브 › 영어서재 폴더에 저장되고, 다른 기기에서는 읽기 화면에서 내려받아 볼 수 있어요.
        </div>

        <div className="stack" style={{ gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>유튜브 주소로 추가</span>
          <div className="row" style={{ gap: 8 }}>
            <input className="input grow" style={{ padding: '0 10px' }} placeholder="https://www.youtube.com/watch?v=..." value={url} disabled={running} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addUrl()} />
            <button className="btn" disabled={running || !url.trim()} onClick={addUrl}>
              추가
            </button>
          </div>
          <span className="small">공개 영상만 돼요(비공개·연령 제한 영상은 안 됨). 10분씩 나눠 받아 적고, 영상은 유튜브 화면 그대로 재생해요. 영상 파일을 내려받지 않아 휴대폰에서도 돼요.</span>
        </div>

        {msg && <div className="banner err">{msg}</div>}

        {jobs.length > 0 && (
          <div className="card flush">
            {jobs.map((j) => (
              <div key={j.key} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, background: j.stage === 'error' ? 'var(--red-soft)' : undefined }}>
                <div className="row">
                  <span className="icon-btn" style={{ background: '#f7e9e6', color: 'var(--med)', borderRadius: 10, width: 38, height: 38 }} aria-hidden="true">
                    <Icon name="pdf" size={18} />
                  </span>
                  <span className="grow stack" style={{ gap: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</span>
                    <span className="small" style={{ color: j.stage === 'error' ? '#6e2312' : undefined }}>
                      {j.driveId ? '구글 드라이브 · ' : ''}{j.ytId ? '유튜브 · ' : ''}
                      {j.size ? `${(j.size / 1024 / 1024).toFixed(1)}MB · ` : ''}
                      {STAGE_LABEL[j.stage]}
                    </span>
                  </span>
                  {j.stage === 'done' && j.docId && (
                    <Link href={`/reader/?id=${j.docId}`} className="btn sm primary">
                      읽기
                    </Link>
                  )}
                  {(j.stage === 'waiting' || j.stage === 'error') && !running && (
                    <button className="icon-btn" aria-label="목록에서 빼기" onClick={() => setJobs((prev) => prev.filter((x) => x.key !== j.key))}>
                      <Icon name="close" size={18} />
                    </button>
                  )}
                </div>
                {['extracting', 'ocr', 'listening', 'uploading', 'saving'].includes(j.stage) && (
                  <span className="bar">
                    <span style={{ width: `${Math.round(j.progress * 100)}%` }} />
                  </span>
                )}
                {j.message && <span className="small" style={{ color: '#6e2312' }}>{j.message}</span>}
                {j.warn && <span className="small" style={{ color: '#6b4600' }}>{j.warn}</span>}
              </div>
            ))}
          </div>
        )}

        <p className="small" style={{ margin: 0, lineHeight: 1.6 }}>
          글자 추출은 이 기기 안에서 처리하고, 원본은 구글 드라이브 ‘영어서재’ 폴더에 저장해요. 단어 뜻·한글 발음·번역은 읽을 때 필요한 문장만 AI에게 물어보고 저장해 두어 다시 묻지 않아요.
        </p>

        <button className="btn primary block" style={{ minHeight: 54, fontSize: 16 }} disabled={running || waitingCount === 0} onClick={start}>
          {running ? '처리 중… 화면을 닫지 마세요' : waitingCount > 0 ? `${waitingCount}개 올리고 처리 시작` : '먼저 PDF를 골라 주세요'}
        </button>
      </main>
    </>
  );
}
