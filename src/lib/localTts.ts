'use client';
// 오픈소스 음성(Kokoro 82M)을 이 기기 브라우저 안에서 직접 돌려 영어를 읽어 주는 기능
// - 인터넷 요청·사용 한도·키가 필요 없음. 처음 한 번만 모델(약 90MB)을 내려받아 기기에 저장
// - 한 번 만든 문장 소리는 기기에 저장해 다시 쓰므로 같은 문장은 즉시 재생
// - 무거운 계산은 별도 작업 스레드(kokoroWorker.ts)에서 해서 화면이 멈추지 않음
import { get as idbGet, set as idbSet } from 'idb-keyval';

const VOICE = 'af_heart'; // 미국 영어 여성 음성 (Kokoro 음성 중 품질 최상)
const AUDIO_VER = 'k1';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: Blob | true) => void; reject: (e: Error) => void }>();
let ready = false;
let loadP: Promise<void> | null = null;
let loadError = '';
/** 모델 내려받기 진행률 (0~100) */
export let localProgress = 0;

/** 지금 단계 설명 (설정 화면에 표시) */
export function getLocalStage(): string {
  return localStage;
}
let localStage = '';
let lastActivity = 0;

export function isLocalReady(): boolean {
  return ready;
}
export function getLocalError(): string {
  return loadError;
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./kokoroWorker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<{ id?: number; ok?: boolean; blob?: Blob; error?: string; progress?: number; stage?: string }>) => {
    const m = e.data;
    if (typeof m.stage === 'string') {
      localStage = m.stage;
      lastActivity = Date.now();
      return;
    }
    if (typeof m.progress === 'number') {
      localProgress = m.progress;
      localStage = `모델 내려받는 중 ${m.progress}%`;
      lastActivity = Date.now();
      return;
    }
    const p = m.id !== undefined ? pending.get(m.id) : undefined;
    if (!p || m.id === undefined) return;
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error));
    else p.resolve(m.blob ?? true);
  };
  w.onerror = (e) => {
    // 작업 스레드 자체가 죽은 경우: 대기 중인 요청을 모두 실패 처리하고 다음에 새로 시작
    const err = new Error(e.message || '음성 작업 스레드 오류');
    pending.forEach((p) => p.reject(err));
    pending.clear();
    worker = null;
    loadP = null;
    ready = false;
  };
  worker = w;
  return w;
}

function call(msg: { type: 'load' | 'generate'; text?: string }): Promise<Blob | true> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, voice: VOICE, ...msg });
    if (msg.type === 'load') {
      // 3분 동안 아무 진행(내려받기 %·단계 변화)이 없으면 무한 대기하지 않고 오류로 알림
      lastActivity = Date.now();
      const watch = setInterval(() => {
        if (!pending.has(id)) {
          clearInterval(watch);
          return;
        }
        if (Date.now() - lastActivity < 180_000) return;
        clearInterval(watch);
        pending.delete(id);
        worker?.terminate();
        worker = null;
        loadP = null;
        reject(new Error(`음성 모델 준비가 멈췄어요(마지막 단계: ${localStage || '시작 전'}). 잠시 후 다시 시도하거나 Gemini 음성을 써 주세요.`));
      }, 5000);
    }
  });
}

/** 모델을 미리 내려받아 준비 (이미 시작했으면 그대로 기다림) */
export function loadLocalModel(): Promise<void> {
  if (loadP) return loadP;
  loadP = call({ type: 'load' })
    .then(() => {
      ready = true;
      loadError = '';
    })
    .catch((e) => {
      loadP = null; // 다음에 다시 시도할 수 있게
      loadError = e instanceof Error ? e.message : String(e);
      throw e;
    });
  return loadP;
}

const memory = new Map<string, Blob>();
const going = new Map<string, Promise<Blob>>();

/** 문장 소리 만들기 (같은 문장은 저장본 사용) */
export function generateLocal(text: string): Promise<Blob> {
  const key = `tts:${AUDIO_VER}:${VOICE}:${text}`;
  const mem = memory.get(key);
  if (mem) return Promise.resolve(mem);
  const run = going.get(key);
  if (run) return run;
  const p = (async () => {
    try {
      const saved = (await idbGet(key)) as Blob | undefined;
      if (saved) {
        memory.set(key, saved);
        return saved;
      }
    } catch {
      /* 저장소를 못 읽어도 새로 만들면 됨 */
    }
    await loadLocalModel();
    const blob = (await call({ type: 'generate', text })) as Blob;
    ready = true;
    memory.set(key, blob);
    try {
      await idbSet(key, blob);
    } catch {
      /* 저장 실패는 무시 */
    }
    return blob;
  })().finally(() => going.delete(key));
  going.set(key, p);
  return p;
}

/** 이미 만들어 저장된 소리인지 (모델 준비 전이어도 저장본은 바로 재생 가능) */
export async function hasLocalAudio(text: string): Promise<boolean> {
  const key = `tts:${AUDIO_VER}:${VOICE}:${text}`;
  if (memory.has(key)) return true;
  try {
    return !!(await idbGet(key));
  } catch {
    return false;
  }
}
