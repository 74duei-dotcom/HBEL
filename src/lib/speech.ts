'use client';
// 영어 음성 재생
// - 기본: Gemini 음성(TTS)으로 자연스러운 원어민 소리. 한 번 만든 소리는 이 기기에 저장해 다시 쓰므로 같은 문장은 다시 요청하지 않음
// - Gemini 키가 없거나 요청이 실패하면 기기에 내장된 영어 음성으로 대신 읽음
// 사용하는 쪽은 speak / stopSpeaking / canSpeak 만 알면 됨

import { get as idbGet, set as idbSet } from 'idb-keyval';
import { GEMINI_TTS_MODEL, LS_KEYS } from './config';
import { getGeminiKeys } from './ai';
import { lsGet, lsSet, tokenize, tokenTimings } from './util';
import { generateLocal, hasLocalAudio, isLocalReady, loadLocalModel, setLocalStage, wasModelDownloaded } from './localTts';

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
  if (onProgress) {
    // 기기 음성은 읽는 글자 위치를 정확히 알려 줌 → 그 단어의 가중치 구간 가운데 값으로 변환 (화면 쪽 환산과 같은 기준)
    const starts: number[] = [];
    for (const m of text.matchAll(/\S+/g)) starts.push(m.index ?? 0);
    const { dur, gap } = tokenTimings(tokenize(text));
    const cum = [0];
    dur.forEach((d, i) => cum.push(cum[i] + d + gap[i]));
    const total = cum[cum.length - 1] || 1;
    u.onboundary = (e) => {
      if (mine !== ticket) return;
      let k = starts.length - 1;
      while (k > 0 && starts[k] > e.charIndex) k--;
      onProgress(Math.max(0, (cum[k] + dur[k] / 2) / total));
    };
  }
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

/**
 * 소리 파형을 분석해 "소리 시간(초) → 이 조각 안에서 읽은 비율(0~1)" 변환 함수를 만듦.
 * - 앞뒤 무음을 뺀 실제 말하는 구간만 기준으로 삼음
 * - 쉼표·마침표 자리의 실제 쉬는 구간을 찾아, 개수가 맞으면 구절마다 시작·끝을 맞춤
 */
async function buildWarp(blob: Blob, tokens: string[], breaks: Set<number>): Promise<((t: number) => number) | null> {
  try {
    const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC || !tokens.length) return null;
    const ctx = new AC();
    let buf: AudioBuffer;
    try {
      buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    } finally {
      void ctx.close().catch(() => undefined);
    }
    const data = buf.getChannelData(0);
    const win = Math.max(1, Math.round(buf.sampleRate * 0.01)); // 10ms
    const n = Math.floor(data.length / win);
    if (n < 5) return null;
    const rms = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = i * win; j < (i + 1) * win; j++) s += data[j] * data[j];
      rms[i] = Math.sqrt(s / win);
    }
    const sorted = Array.from(rms).sort((x, y) => x - y);
    const thr = Math.max(0.004, sorted[Math.floor(n * 0.95)] * 0.06);
    let first = 0;
    while (first < n && rms[first] < thr) first++;
    let last = n - 1;
    while (last > first && rms[last] < thr) last--;
    if (last - first < 5) return null;
    const S = first * 0.01;
    const E = (last + 1) * 0.01;
    // 말하는 구간 안의 쉬는 구간(0.1초 이상)
    const pauses: { s: number; e: number }[] = [];
    let run = -1;
    for (let i = first; i <= last + 1; i++) {
      const quiet = i <= last && rms[i] < thr;
      if (quiet && run < 0) run = i;
      if (!quiet && run >= 0) {
        if (i - run >= 15) pauses.push({ s: run * 0.01, e: i * 0.01 });
        run = -1;
      }
    }
    // 글자 쪽 가중치: 구절 경계(쉼표·마침표 뒤)와 그 위치의 누적값
    const { dur, gap } = tokenTimings(tokens);
    const cum = [0]; // cum[i] = i번째 단어가 시작하는 위치 (쉼 포함)
    dur.forEach((d, i) => cum.push(cum[i] + d + gap[i]));
    const audible = Math.max(0.01, cum[tokens.length] - gap[tokens.length - 1]);
    // 실제로 찾은 쉼(문장부호가 없어도 음성이 구절 사이에서 쉬므로)이 어느 단어 뒤인지, 구절별 말한 시간이 단어 가중치와 가장 잘 맞도록 고름
    const N = tokens.length;
    const use = [...pauses].sort((p, q) => q.e - q.s - (p.e - p.s)).slice(0, Math.max(0, N - 1)).sort((p, q) => p.s - q.s); // 너무 많으면 긴 쉼만
    const K = use.length;
    const pts: [number, number][] = [[S, 0]];
    if (K > 0) {
      const W = [0];
      dur.forEach((d, i) => W.push(W[i] + d));
      const D: number[] = []; // 쉼 사이 실제 말한 시간
      let pauseSum = 0;
      use.forEach((p, j) => {
        const t0 = j === 0 ? S : use[j - 1].e;
        D.push(p.s - t0);
        pauseSum += p.e - p.s;
      });
      D.push(E - use[K - 1].e);
      const r = Math.max(1e-6, E - S - pauseSum) / W[N]; // 가중치 1당 초
      const hasHints = breaks.size > 0 || gap.some((g) => g > 0);
      const INF = 1e18;
      const f: number[][] = Array.from({ length: K + 1 }, () => new Array(N + 1).fill(INF));
      const from: number[][] = Array.from({ length: K + 1 }, () => new Array(N + 1).fill(0));
      f[0][0] = 0;
      for (let j = 1; j <= K; j++) {
        for (let b = j; b <= N - (K - j) - 1; b++) {
          const hint = !hasHints || gap[b - 1] > 0 || breaks.has(b - 1) ? 0 : 0.5; // 표시된 위치(쉼표·마침표·끊어 읽기)가 아닌 곳에서 쉬었다고 보면 벌점
          for (let a = j - 1; a < b; a++) {
            if (f[j - 1][a] >= INF) continue;
            const c = f[j - 1][a] + (D[j - 1] - (W[b] - W[a]) * r) ** 2 + hint;
            if (c < f[j][b]) {
              f[j][b] = c;
              from[j][b] = a;
            }
          }
        }
      }
      let best = INF;
      let bb = K;
      for (let b = K; b <= N - 1; b++) {
        if (f[K][b] >= INF) continue;
        const c = f[K][b] + (D[K] - (W[N] - W[b]) * r) ** 2;
        if (c < best) {
          best = c;
          bb = b;
        }
      }
      const cuts: number[] = []; // 각 쉼 앞의 마지막 단어 번호
      for (let j = K, b = bb; j >= 1; j--) {
        cuts.unshift(b - 1);
        b = from[j][b];
      }
      use.forEach((p, j) => {
        const i = cuts[j];
        pts.push([p.s, cum[i] + dur[i] - 1e-3]); // 쉬는 동안은 방금 읽은 단어를 유지
        pts.push([p.e - 0.04, cum[i + 1]]); // 다음 말이 시작되기 직전에 다음 단어로
      });
    }
    pts.push([E, audible]);
    return (t: number) => {
      if (t <= pts[0][0]) return 0;
      for (let k = 1; k < pts.length; k++) {
        if (t <= pts[k][0]) {
          const [t0, w0] = pts[k - 1];
          const [t1, w1] = pts[k];
          return (w0 + ((t - t0) / Math.max(1e-6, t1 - t0)) * (w1 - w0)) / audible;
        }
      }
      return 1;
    };
  } catch {
    return null;
  }
}

/** 만들어 둔 소리를 재생 */
async function playBlob(blob: Blob, rate: number, mine: number, onEnd?: () => void, onProgress?: (f: number) => void, onStart?: () => void, tokens?: string[], breaks: Set<number> = new Set()): Promise<void> {
  if (mine !== ticket) return; // 그 사이 다른 소리를 요청했거나 멈춤
  // 소리를 미리 분석해 실제로 말하기 시작·끝나는 때와 쉬는 구간을 찾음 (분석이 안 되면 null → 전체 길이 비율 사용)
  const warp = onProgress && tokens ? await buildWarp(blob, tokens, breaks) : null;
  if (mine !== ticket) return;
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
    if (onProgress && a.duration > 0) onProgress(warp ? warp(a.currentTime) : a.currentTime / a.duration);
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
      notifyFallback(
        wasModelDownloaded()
          ? '저장해 둔 오픈소스 음성 모델을 불러오는 중이에요(앱을 켠 뒤 처음 한 번, 몇 초). 준비되면 자동으로 자연스러운 소리로 바뀌어요.'
          : '오픈소스 음성 모델을 처음 한 번 내려받는 중이에요(약 90MB). 준비되면 자동으로 자연스러운 소리로 바뀌어요.'
      );
      return false;
    }
    // 저장된 소리가 있으면 통째로, 없으면 조각내어 첫 조각부터 재생 (기기에서 직접 만들기 때문에 짧게 나눌수록 빨리 시작)
    const chunks = (await hasLocalAudio(t)) ? [t] : splitForSpeech(t, 60, 140, 80);
    await playChunked(chunks, generateLocal, rate, mine, onEnd, onProgress, onStart);
    return true;
  } catch (e) {
    lastTtsError = e instanceof Error ? e.message : String(e);
    return false;
  }
}

/** 조각들을 차례로 재생: 조각을 재생하는 동안 다음 조각을 미리 만듦. 마지막까지 읽으면 onEnd */
async function playChunked(
  chunks: string[],
  getAudio: (t: string) => Promise<Blob>,
  rate: number,
  mine: number,
  onEnd?: () => void,
  onProgress?: (f: number) => void,
  onStart?: () => void
): Promise<void> {
  if (chunks.length === 1) {
    const blob = await getAudio(chunks[0]);
    if (mine !== ticket) return;
    await playBlob(blob, rate, mine, onEnd, onProgress, onStart, tokenize(chunks[0]), speakBreaks);
    return;
  }
  // 조각별 시작 위치·실제 소리 길이를 단어별 읽는 시간(음절·쉼 기준) 가중치로 계산 → 글자 수보다 실제 소리와 잘 맞음
  const perChunk = chunks.map((c) => tokenize(c).length);
  const { dur, gap } = tokenTimings(chunks.flatMap((c) => tokenize(c)));
  const cum = [0];
  dur.forEach((d, i) => cum.push(cum[i] + d + gap[i]));
  const total = cum[cum.length - 1] || 1;
  let tokStart = 0;
  for (let k = 0; k < chunks.length; k++) {
    const c = chunks[k];
    const a = tokStart;
    const b = a + perChunk[k];
    tokStart = b;
    const base = cum[a];
    const audible = Math.max(0.01, cum[b] - cum[a] - (b > a ? gap[b - 1] : 0));
    for (const nx of chunks.slice(k + 1, k + 3)) void getAudio(nx).catch(() => undefined); // 재생 중에 다음 두 조각 준비 (끊김 방지)
    const blob = await getAudio(c);
    if (mine !== ticket) return;
    await new Promise<void>((resolve, reject) => {
      playBlob(blob, rate, mine, () => resolve(), onProgress ? (f) => onProgress((base + f * audible) / total) : undefined, k === 0 ? onStart : undefined, tokenize(c), new Set([...speakBreaks].filter((x) => x >= a && x < b).map((x) => x - a))).catch(reject);
    });
    if (mine !== ticket) return;
  }
  if (mine === ticket) onEnd?.();
}

/** 긴 글을 소리 만들기 좋은 조각(문장·절)으로 나눔. 첫 조각은 짧게 해서 빨리 시작 */
function splitForSpeech(text: string, first = 90, rest = 160, minLen = 140): string[] {
  if (text.length <= minLen) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/).flatMap((s) => (s.length > rest ? s.split(/(?<=[,;:])\s+/) : [s]));
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    const limit = out.length === 0 ? first : rest;
    if (cur && cur.length + s.length + 1 > limit) {
      out.push(cur);
      cur = s;
    } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  return out;
}

/** onProgress: 지금 읽는 위치를 글자 수 기준 0~1 비율로 알려 줌 (읽는 단어 표시용) */
/** onStart: 소리가 실제로 나오기 시작한 순간 (준비 중 표시를 끄는 데 사용) */
/** 지금 읽는 문장의 끊어 읽기 위치(단어 번호). 소리의 실제 쉼이 어느 단어 뒤인지 정할 때 참고 */
let speakBreaks = new Set<number>();

export function speak(text: string, rate = 1, onEnd?: () => void, onProgress?: (f: number) => void, onStart?: () => void, breaks: number[] = []): void {
  speakBreaks = new Set(breaks);
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
      // 긴 글은 문장 단위로 나눠, 첫 조각이 만들어지면 바로 재생
      geminiFailures = 0;
      lastTtsError = '';
      await playChunked(splitForSpeech(t), getGeminiAudio, rate, mine, onEnd, onProgress, onStart);
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
  if (isMobileDevice() && engine === 'local' && !isLocalReady()) return; // 모델 준비 전에는 내려받기를 시작하지 않음
  const run = ++prefetchRun;
  void (async () => {
    for (const t of texts.slice(0, isMobileDevice() ? 2 : 3)) {
      if (run !== prefetchRun) return; // 더 새로운 미리 만들기가 시작되면 중단
      const x = t.trim();
      if (!x) continue;
      try {
        if (engine === 'local') for (const c of splitForSpeech(x, 60, 140, 80).slice(0, 2)) await generateLocal(c);
        else for (const c of splitForSpeech(x).slice(0, 2)) await getGeminiAudio(c); // 재생할 때와 같은 조각으로 미리 만듦
      } catch {
        return;
      }
    }
  })();
}

/** 앱을 켤 때: 오픈소스 음성을 쓰고 모델이 이미 저장돼 있으면 미리 불러와 첫 읽기부터 바로 자연스러운 소리가 나게 함 */
export function warmUpLocalVoice(): void {
  if (getTtsEngine() !== 'local' || !wasModelDownloaded() || isLocalReady()) return;
  void loadLocalModel().catch(() => undefined);
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
