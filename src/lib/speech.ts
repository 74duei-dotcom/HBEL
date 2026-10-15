'use client';
// 영어 음성 재생
// - 기본: Gemini 음성(TTS)으로 자연스러운 원어민 소리. 한 번 만든 소리는 이 기기에 저장해 다시 쓰므로 같은 문장은 다시 요청하지 않음
// - Gemini 키가 없거나 요청이 실패하면 기기에 내장된 영어 음성으로 대신 읽음
// 사용하는 쪽은 speak / stopSpeaking / canSpeak 만 알면 됨

import { get as idbGet, set as idbSet } from 'idb-keyval';
import { GEMINI_TTS_MODEL, LS_KEYS } from './config';
import { getGeminiKeys } from './ai';
import { lsGet, lsSet } from './util';
import { generateLocal, hasLocalAudio, isLocalReady, loadLocalModel, setLocalStage } from './localTts';

export type TtsEngine = 'local' | 'gemini' | 'device';

const VOICE_NAME = 'Kore';
/** 원어민처럼 또렷하고 자연스러운 미국 발음으로 읽도록 하는 지시문 (소리로 읽히지 않고 말투만 정함) */
const STYLE_PREFIX = 'Say in a clear, natural American English accent, at a calm steady pace: ';
/** 저장된 소리 구분용 버전 (지시문을 바꾸면 올림) */
const AUDIO_VER = 'v2';

/** 핸드폰·태블릿인지 (오픈소스 음성 모델은 무거워서 PC에서만 기본으로 씀) */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return true;
  // iPadOS의 Safari는 자신을 맥(Macintosh)이라고 알리지만 터치 화면이 있음 → 아이패드로 판단
  return /Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
}
/** 설정에서 오픈소스 음성을 직접 골랐는지 */
function chosenLocal(): boolean {
  return lsGet(LS_KEYS.ttsEngine) === 'local';
}

/** 설정에서 고른 음성 방식. 고른 적 없으면 Gemini 키가 있을 때 Gemini */
export function getTtsEngine(): TtsEngine {
  const v = lsGet(LS_KEYS.ttsEngine);
  if (v === 'local' || v === 'gemini') return v; // 예전에 고른 '기기 음성'은 더 이상 선택지가 아니므로 기본값 사용
  // 기본: PC는 키·한도가 필요 없는 오픈소스 음성, 핸드폰은 가벼운 Gemini 음성(안 되면 기기 음성)
  return isMobileDevice() ? 'gemini' : 'local';
}

export function setTtsEngine(e: TtsEngine): void {
  lsSet(LS_KEYS.ttsEngine, e);
}

/* ---------- 기기 내장 음성 ---------- */

let cachedVoice: SpeechSynthesisVoice | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  cachedVoice =
    voices.find((v) => v.lang === 'en-US' && /natural|online/i.test(v.name)) ??
    voices.find((v) => v.lang === 'en-US' && /google|samsung/i.test(v.name)) ??
    voices.find((v) => v.lang === 'en-US') ??
    voices.find((v) => v.lang.startsWith('en')) ??
    null;
  return cachedVoice;
}

function canDeviceSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** 기기 내장 음성(기계음)으로 대신 읽을 때 이유를 화면에 알리기 위한 알림 */
export const TTS_FALLBACK_EVENT = 'tts-fallback';
function notifyFallback(reason: string): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(TTS_FALLBACK_EVENT, { detail: reason }));
}

function deviceSpeak(text: string, rate: number, mine: number, onEnd?: () => void, onProgress?: (f: number) => void, onStart?: () => void): void {
  if (!canDeviceSpeak()) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = rate;
  const v = pickVoice();
  if (v) u.voice = v;
  if (onStart) u.onstart = () => mine === ticket && onStart();
  if (onProgress) u.onboundary = (e) => mine === ticket && onProgress(e.charIndex / Math.max(1, text.length));
  if (onEnd) {
    // 취소된 이전 낭독의 종료 알림이 새 낭독의 상태를 건드리지 않게, 최신 요청일 때만 알림
    const done = () => {
      if (mine === ticket) onEnd();
    };
    u.onend = done;
    u.onerror = done;
  }
  window.speechSynthesis.speak(u);
  // 일부 폰은 음성이 없거나 종료 알림이 오지 않아 '재생 중' 상태에 갇힘 → 넉넉한 시간이 지나면 풀어 줌
  if (onEnd) setTimeout(() => mine === ticket && onEnd(), text.length * 130 / Math.max(0.3, rate) + 6000);
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null;
  };
}

/* ---------- Gemini 음성 ---------- */

/** 지금 재생 중인 소리와, 오래된 요청을 걸러내기 위한 번호 */
let current: HTMLAudioElement | null = null;
let ticket = 0;
/** 이번 접속에서 Gemini 음성이 계속 실패하면(한도·모델 문제 등) 더 시도하지 않고 기기 음성 사용 */
let geminiFailures = 0;
let lastGeminiFailureAt = 0;
const FAILURE_COOLDOWN_MS = 25_000; // 25초 후에는 일시 실패 카운트를 리셋하여 다시 시도
const memory = new Map<string, Blob>();

/** 마지막 Gemini 음성 오류 (설정 화면에서 보여줌) */
export let lastTtsError = '';

function pcmToWav(pcm: Uint8Array, rate: number): Blob {
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // 모노
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, pcm.length, true);
  return new Blob([header, pcm as BlobPart], { type: 'audio/wav' });
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function requestGeminiAudio(text: string): Promise<Blob> {
  const keys = getGeminiKeys();
  if (!keys.length) throw new Error('Gemini 키가 없어요.');
  let lastErr = '';
  for (const key of keys) {
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: STYLE_PREFIX + text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_NAME } } },
          },
        }),
      });
    } catch {
      throw new Error('인터넷 연결을 확인해 주세요.');
    }
    if (res.status === 429) {
      // 분당 한도에 일시적으로 걸린 경우 1.5초 대기 후 한 번 재시도
      await new Promise((r) => setTimeout(r, 1500));
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: STYLE_PREFIX + text }] }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_NAME } } },
            },
          }),
        });
      } catch {
        /* 실패 시 다음 키로 */
      }
    }
    if (res.status === 429 || res.status === 403) {
      lastErr = res.status === 429 ? 'Gemini 무료 한도에 도달했어요.' : 'Gemini 키가 올바르지 않아요.';
      continue; // 다음 키로
    }
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json())?.error?.message ?? '';
      } catch {
        /* 무시 */
      }
      throw new Error(`Gemini 음성 오류(${res.status}) ${detail}`.trim());
    }
    const j = await res.json();
    const parts: { inlineData?: { mimeType?: string; data?: string } }[] = j?.candidates?.[0]?.content?.parts ?? [];
    const inline = parts.find((p) => p.inlineData?.data)?.inlineData;
    if (!inline?.data) throw new Error('Gemini가 소리를 주지 않았어요.');
    const bytes = b64ToBytes(inline.data);
    const mime = inline.mimeType ?? '';
    if (/wav|mpeg|mp3|ogg/i.test(mime)) return new Blob([bytes as BlobPart], { type: mime.split(';')[0] });
    const rate = Number(/rate=(\d+)/i.exec(mime)?.[1] ?? 24000);
    return pcmToWav(bytes, rate);
  }
  throw new Error(lastErr || 'Gemini 음성을 만들지 못했어요.');
}

const audioInflight = new Map<string, Promise<Blob>>();

function getGeminiAudio(text: string): Promise<Blob> {
  const key = `tts:${AUDIO_VER}:${GEMINI_TTS_MODEL}:${VOICE_NAME}:${text}`;
  const going = audioInflight.get(key);
  if (going) return going; // 미리 만드는 중인 소리가 있으면 그걸 기다림 (중복 요청 방지)
  const p = getGeminiAudioNow(key, text).finally(() => audioInflight.delete(key));
  audioInflight.set(key, p);
  return p;
}

async function getGeminiAudioNow(key: string, text: string): Promise<Blob> {
  const mem = memory.get(key);
  if (mem) return mem;
  try {
    const saved = (await idbGet(key)) as Blob | undefined;
    if (saved) {
      memory.set(key, saved);
      return saved;
    }
  } catch {
    /* 저장소를 못 읽어도 새로 만들면 됨 */
  }
  const blob = await requestGeminiAudio(text);
  memory.set(key, blob);
  try {
    await idbSet(key, blob);
  } catch {
    /* 저장 실패는 무시 */
  }
  return blob;
}

/** 하나의 재생기를 계속 재사용 (모바일은 사용자가 누른 순간 재생을 허락받은 재생기만 나중에도 소리를 낼 수 있음) */
let player: HTMLAudioElement | null = null;
let currentUrl = '';
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

/** 버튼을 누른 바로 그 순간(소리가 만들어지기 전)에 호출: 재생기를 미리 '깨워' 둠 */
function unlockAudio(): void {
  if (typeof Audio === 'undefined') return;
  if (!player) player = new Audio();
  try {
    player.src = SILENT_WAV;
    void player.play().catch(() => undefined);
  } catch {
    /* 무시 */
  }
}

function stopCurrent(): void {
  if (current) {
    current.onended = null;
    current.onerror = null;
    current.pause();
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = '';
    current = null;
  }
}

export function canSpeak(): boolean {
  return canDeviceSpeak() || getGeminiKeys().length > 0;
}

/** 만들어 둔 소리를 재생 */
async function playBlob(blob: Blob, rate: number, mine: number, onEnd?: () => void, onProgress?: (f: number) => void, onStart?: () => void): Promise<void> {
  if (mine !== ticket) return; // 그 사이 다른 소리를 요청했거나 멈춤
  const url = URL.createObjectURL(blob);
  const a = player ?? new Audio();
  player = a;
  a.onended = null;
  a.onerror = null;
  a.pause();
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = url;
  a.src = url;
  a.playbackRate = rate;
  // 재생 위치(시간 비율)를 알려 줌 → 읽는 단어 표시에 사용
  let raf = 0;
  const tick = () => {
    if (mine !== ticket || current !== a) return;
    if (onProgress && a.duration > 0) onProgress(a.currentTime / a.duration);
    raf = requestAnimationFrame(tick);
  };
  const done = () => {
    cancelAnimationFrame(raf);
    if (current === a && currentUrl === url) {
      URL.revokeObjectURL(url);
      currentUrl = '';
      current = null;
    }
    if (mine === ticket) onEnd?.();
  };
  a.onended = done;
  a.onerror = done;
  current = a;
  await a.play();
  if (mine === ticket) onStart?.();
  if (onProgress) raf = requestAnimationFrame(tick);
}

/** 오픈소스 음성으로 읽기. 모델이 아직 준비 전이면 기기 음성으로 먼저 읽고 뒤에서 모델을 준비. 성공하면 true */
async function localSpeak(t: string, rate: number, mine: number, onEnd?: () => void, onProgress?: (f: number) => void, onStart?: () => void): Promise<boolean> {
  try {
    if (!isLocalReady() && !(await hasLocalAudio(t))) {
      if (mine !== ticket) return true;
      // 핸드폰은 직접 고르지 않았다면 무거운 모델을 내려받지 않고 바로 다음 방법으로 넘어감
      if (isMobileDevice() && !chosenLocal()) return false;
      void loadLocalModel().catch(() => undefined);
      notifyFallback('오픈소스 음성 모델을 처음 한 번 내려받는 중이에요(약 90MB). 준비되면 자동으로 자연스러운 소리로 바뀌어요.');
      return false;
    }
    const blob = await generateLocal(t);
    await playBlob(blob, rate, mine, onEnd, onProgress, onStart);
    return true;
  } catch (e) {
    lastTtsError = e instanceof Error ? e.message : String(e);
    return false;
  }
}

/** onProgress: 지금 읽는 위치를 글자 수 기준 0~1 비율로 알려 줌 (읽는 단어 표시용) */
/** onStart: 소리가 실제로 나오기 시작한 순간 (준비 중 표시를 끄는 데 사용) */
export function speak(text: string, rate = 1, onEnd?: () => void, onProgress?: (f: number) => void, onStart?: () => void): void {
  const t = text.trim();
  if (!t) {
    onEnd?.();
    return;
  }
  const mine = ++ticket;
  stopCurrent();
  if (canDeviceSpeak()) window.speechSynthesis.cancel();
  unlockAudio(); // 누른 순간에 재생기를 깨워 둠 (모바일 자동 재생 차단 대비)

  const engine = getTtsEngine();
  void (async () => {
    if (engine === 'local') {
      if (await localSpeak(t, rate, mine, onEnd, onProgress, onStart)) return;
      if (mine !== ticket) return;
      if (lastTtsError) notifyFallback(`오픈소스 음성 오류: ${lastTtsError}`);
      deviceSpeak(t, rate, mine, onEnd, onProgress, onStart);
      return;
    }
    if (engine === 'device') {
      notifyFallback('설정에서 음성 방식이 "기기 음성"으로 되어 있어요.');
      deviceSpeak(t, rate, mine, onEnd, onProgress, onStart);
      return;
    }

    // Gemini 음성: 쿨다운(25초)이 지났으면 이전 실패 카운트를 리셋하여 다시 시도
    if (geminiFailures >= 2 && Date.now() - lastGeminiFailureAt > FAILURE_COOLDOWN_MS) geminiFailures = 0;
    if (!getGeminiKeys().length || geminiFailures >= 2) {
      const why = !getGeminiKeys().length ? 'Gemini 키가 없어요.' : `Gemini 음성이 계속 실패했어요. ${lastTtsError}`;
      if (await localSpeak(t, rate, mine, onEnd, onProgress, onStart)) return;
      if (mine !== ticket) return;
      notifyFallback(why);
      deviceSpeak(t, rate, mine, onEnd, onProgress, onStart);
      return;
    }
    try {
      const blob = await getGeminiAudio(t);
      if (mine !== ticket) return;
      geminiFailures = 0;
      lastTtsError = '';
      await playBlob(blob, rate, mine, onEnd, onProgress, onStart);
    } catch (e) {
      if (mine !== ticket) return;
      geminiFailures++;
      lastGeminiFailureAt = Date.now();
      lastTtsError = e instanceof Error ? e.message : String(e);
      // Gemini가 안 되면 오픈소스 음성, 그것도 안 되면 기기 음성
      if (await localSpeak(t, rate, mine, onEnd, onProgress, onStart)) return;
      if (mine !== ticket) return;
      notifyFallback(`Gemini 음성 오류: ${lastTtsError}`);
      deviceSpeak(t, rate, mine, onEnd, onProgress, onStart);
    }
  })();
}

export function stopSpeaking(): void {
  ticket++;
  stopCurrent();
  if (canDeviceSpeak()) window.speechSynthesis.cancel();
}

/** 설정 화면의 "소리 확인": 실패하면 이유를 던짐 (기기 음성으로 대신하지 않음) */
export async function testGeminiVoice(): Promise<void> {
  const mine = ++ticket;
  stopCurrent();
  unlockAudio(); // 버튼을 누른 순간에 재생기를 깨워 둠 (아이패드는 이래야 나중에 소리를 낼 수 있음)
  const blob = await requestGeminiAudio('Hello. This is a test of the voice.');
  geminiFailures = 0;
  await playTestBlob(blob, mine);
}

/** 시험 소리 재생. 재생이 5초 넘게 막히면 이유를 알려 줌 */
async function playTestBlob(blob: Blob, mine: number): Promise<void> {
  const play = playBlob(blob, 1, mine);
  const stuck = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('소리는 만들어졌지만 이 기기가 재생을 막았어요. 아래 버튼을 한 번 더 눌러 보세요(두 번째부터는 저장된 소리라 바로 재생돼요).')), 5000)
  );
  await Promise.race([play, stuck]);
}

/** 곧 들을 문장의 소리를 미리 만들어 저장 → 재생 버튼을 누르면 바로 시작 (하나씩 차례로, 실패는 조용히 무시) */
let prefetchRun = 0;
export function prefetchSpeech(texts: string[]): void {
  const engine = getTtsEngine();
  if (engine === 'device') return;
  if (engine === 'gemini' && (!getGeminiKeys().length || geminiFailures >= 2)) return;
  // 핸드폰: 오픈소스 음성은 누를 때만 만들고, Gemini는 지금 문장 하나만 미리 만듦 (배터리·한도 절약)
  if (isMobileDevice() && engine === 'local') return;
  const run = ++prefetchRun;
  void (async () => {
    for (const t of texts.slice(0, isMobileDevice() ? 1 : 2)) {
      if (run !== prefetchRun) return; // 더 새로운 미리 만들기가 시작되면 중단
      const x = t.trim();
      if (!x) continue;
      try {
        if (engine === 'local') await generateLocal(x);
        else await getGeminiAudio(x);
      } catch {
        return;
      }
    }
  })();
}

/** 설정 화면의 "소리 확인": 오픈소스 음성 (처음에는 모델을 내려받느라 시간이 걸림) */
export async function testLocalVoice(): Promise<void> {
  const mine = ++ticket;
  stopCurrent();
  unlockAudio(); // 버튼을 누른 순간에 재생기를 깨워 둠
  await loadLocalModel();
  const blob = await generateLocal('Hello. This is a test of the voice.');
  setLocalStage('소리 만들기 완료, 재생하는 중…');
  await playTestBlob(blob, mine);
}
