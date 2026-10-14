'use client';
// 오픈소스 음성(Kokoro 82M)을 이 기기 브라우저 안에서 직접 돌려 영어를 읽어 주는 기능
// - 인터넷 요청·사용 한도·키가 필요 없음. 처음 한 번만 모델(약 90MB)을 내려받아 기기에 저장
// - 한 번 만든 문장 소리는 기기에 저장해 다시 쓰므로 같은 문장은 즉시 재생
import { get as idbGet, set as idbSet } from 'idb-keyval';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const VOICE = 'af_heart'; // 미국 영어 여성 음성 (Kokoro 음성 중 품질 최상)
const AUDIO_VER = 'k1';

type Tts = { generate: (text: string, o: { voice: string; speed?: number }) => Promise<{ toBlob: () => Blob }> };

let model: Promise<Tts> | null = null;
let ready = false;
let loadError = '';
/** 모델 내려받기 진행률 (0~100) */
export let localProgress = 0;

export function isLocalReady(): boolean {
  return ready;
}
export function getLocalError(): string {
  return loadError;
}

/** 모델을 미리 내려받아 준비 (이미 시작했으면 그대로 기다림) */
export function loadLocalModel(): Promise<Tts> {
  if (model) return model;
  model = (async () => {
    const { KokoroTTS } = await import('kokoro-js');
    const tts = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p: { status?: string; progress?: number }) => {
        if (p?.status === 'progress' && typeof p.progress === 'number') localProgress = Math.round(p.progress);
      },
    });
    ready = true;
    loadError = '';
    return tts as unknown as Tts;
  })().catch((e) => {
    model = null; // 다음에 다시 시도할 수 있게
    loadError = e instanceof Error ? e.message : String(e);
    throw e;
  });
  return model;
}

const memory = new Map<string, Blob>();
const going = new Map<string, Promise<Blob>>();
let queue: Promise<unknown> = Promise.resolve();

/** 문장 소리 만들기 (같은 문장은 저장본 사용, 동시에 여러 개를 만들지 않고 한 줄로 처리) */
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
    const tts = await loadLocalModel();
    const job = queue.catch(() => undefined).then(() => tts.generate(text, { voice: VOICE }));
    queue = job;
    const blob = (await job).toBlob();
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
