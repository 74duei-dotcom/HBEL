'use client';
// 영어 음성 재생
// - 기본: Gemini 음성(TTS)으로 자연스러운 원어민 소리. 한 번 만든 소리는 이 기기에 저장해 다시 쓰므로 같은 문장은 다시 요청하지 않음
// - Gemini 키가 없거나 요청이 실패하면 기기에 내장된 영어 음성으로 대신 읽음
// 사용하는 쪽은 speak / stopSpeaking / canSpeak 만 알면 됨

import { get as idbGet, set as idbSet } from 'idb-keyval';
import { GEMINI_TTS_MODEL, LS_KEYS } from './config';
import { getGeminiKeys } from './ai';
import { lsGet, lsSet } from './util';

export type TtsEngine = 'gemini' | 'device';

const VOICE_NAME = 'Kore';

/** 설정에서 고른 음성 방식. 고른 적 없으면 Gemini 키가 있을 때 Gemini */
export function getTtsEngine(): TtsEngine {
  const v = lsGet(LS_KEYS.ttsEngine);
  if (v === 'gemini' || v === 'device') return v;
  return getGeminiKeys().length ? 'gemini' : 'device';
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
    voices.find((v) => v.lang === 'en-US' && /google|samsung|natural/i.test(v.name)) ??
    voices.find((v) => v.lang === 'en-US') ??
    voices.find((v) => v.lang.startsWith('en')) ??
    null;
  return cachedVoice;
}

function canDeviceSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function deviceSpeak(text: string, rate: number, mine: number, onEnd?: () => void): void {
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
  if (onEnd) {
    // 취소된 이전 낭독의 종료 알림이 새 낭독의 상태를 건드리지 않게, 최신 요청일 때만 알림
    const done = () => {
      if (mine === ticket) onEnd();
    };
    u.onend = done;
    u.onerror = done;
  }
  window.speechSynthesis.speak(u);
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
/** 이 글자 수 이하(단어 수준)면 느릴 때 기기 음성으로 먼저 읽음 */
const SHORT_TEXT_LEN = 40;
const INSTANT_WAIT_MS = 350;

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
          contents: [{ role: 'user', parts: [{ text }] }],
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
            contents: [{ role: 'user', parts: [{ text }] }],
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

async function getGeminiAudio(text: string): Promise<Blob> {
  const key = `tts:${GEMINI_TTS_MODEL}:${VOICE_NAME}:${text}`;
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

function stopCurrent(): void {
  if (current) {
    current.pause();
    URL.revokeObjectURL(current.src);
    current = null;
  }
}

export function canSpeak(): boolean {
  return canDeviceSpeak() || getGeminiKeys().length > 0;
}

export function speak(text: string, rate = 1, onEnd?: () => void): void {
  const t = text.trim();
  if (!t) {
    onEnd?.();
    return;
  }
  const mine = ++ticket;
  stopCurrent();
  if (canDeviceSpeak()) window.speechSynthesis.cancel();

  // 쿨다운(25초)이 지났으면 이전 실패 카운트를 리셋하여 Gemini 음성을 다시 시도
  if (geminiFailures >= 2 && Date.now() - lastGeminiFailureAt > FAILURE_COOLDOWN_MS) {
    geminiFailures = 0;
  }

  if (getTtsEngine() !== 'gemini' || !getGeminiKeys().length || geminiFailures >= 2) {
    deviceSpeak(t, rate, mine, onEnd);
    return;
  }
  void (async () => {
    let usedDevice = false;
    try {
      const pending = getGeminiAudio(t);
      let blob: Blob;
      if (t.length <= SHORT_TEXT_LEN && canDeviceSpeak()) {
        // 짧은 단어는 Gemini 소리가 0.35초 안에 안 오면 기기 음성으로 바로 읽고,
        // Gemini 소리는 뒤에서 저장해 두었다가 다음번부터 즉시 재생
        const quick = await Promise.race([
          pending,
          new Promise<null>((r) => setTimeout(() => r(null), INSTANT_WAIT_MS)),
        ]);
        if (quick) {
          blob = quick;
        } else {
          if (mine !== ticket) return;
          usedDevice = true;
          deviceSpeak(t, rate, mine, onEnd);
          void pending.then(() => { geminiFailures = 0; }, () => {});
          return;
        }
      } else {
        blob = await pending;
      }
      if (mine !== ticket) return; // 그 사이 다른 소리를 요청했거나 멈춤
      geminiFailures = 0;
      lastTtsError = '';
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      a.playbackRate = rate;
      const done = () => {
        if (current === a) {
          URL.revokeObjectURL(url);
          current = null;
        }
        if (mine === ticket) onEnd?.();
      };
      a.onended = done;
      a.onerror = done;
      current = a;
      await a.play();
    } catch (e) {
      if (mine !== ticket || usedDevice) return;
      geminiFailures++;
      lastGeminiFailureAt = Date.now();
      lastTtsError = e instanceof Error ? e.message : String(e);
      deviceSpeak(t, rate, mine, onEnd);
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
  const blob = await requestGeminiAudio('Hello. This is a test of the voice.');
  const url = URL.createObjectURL(blob);
  const a = new Audio(url);
  a.onended = () => URL.revokeObjectURL(url);
  await a.play();
  geminiFailures = 0;
}
