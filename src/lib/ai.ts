'use client';
// AI 호출 공통 창구: Gemini를 브라우저에서 직접 호출
// - 키는 이 기기의 localStorage에만 저장 (드라이브 동기화·코드에 넣지 않음)

import { GEMINI_MODEL, LS_KEYS } from './config';
import { lsGet, lsSet } from './util';

export type AIProvider = 'gemini';

export type AIErrorKind = 'no-key' | 'bad-key' | 'rate-limit' | 'network' | 'overloaded' | 'bad-response';

export class AIError extends Error {
  kind: AIErrorKind;
  provider: AIProvider;
  constructor(kind: AIErrorKind, provider: AIProvider, message: string) {
    super(message);
    this.name = 'AIError';
    this.kind = kind;
    this.provider = provider;
  }
}

export function getProvider(): AIProvider {
  return 'gemini';
}

export const MAX_GEMINI_KEYS = 5;

/** 저장된 Gemini 키 목록 (최대 5개). 예전에 저장한 키 1개가 있으면 목록으로 옮김 */
export function getGeminiKeys(): string[] {
  let keys: string[] = [];
  try {
    const raw = lsGet(LS_KEYS.geminiKeys);
    if (raw) keys = (JSON.parse(raw) as unknown[]).filter((k): k is string => typeof k === 'string' && !!k);
  } catch {
    keys = [];
  }
  const legacy = lsGet(LS_KEYS.geminiKey);
  if (legacy) {
    if (!keys.includes(legacy)) keys.unshift(legacy);
    keys = keys.slice(0, MAX_GEMINI_KEYS);
    lsSet(LS_KEYS.geminiKeys, JSON.stringify(keys));
    lsSet(LS_KEYS.geminiKey, null);
  }
  return keys;
}

function saveGeminiKeys(keys: string[]): void {
  lsSet(LS_KEYS.geminiKeys, keys.length ? JSON.stringify(keys.slice(0, MAX_GEMINI_KEYS)) : null);
}

export function addGeminiKey(key: string): void {
  const k = key.trim();
  if (!k) return;
  const keys = getGeminiKeys();
  if (keys.includes(k)) return;
  if (keys.length >= MAX_GEMINI_KEYS) throw new AIError('bad-response', 'gemini', `Gemini 키는 ${MAX_GEMINI_KEYS}개까지 넣을 수 있어요.`);
  saveGeminiKeys([...keys, k]);
}

export function removeGeminiKey(index: number): void {
  saveGeminiKeys(getGeminiKeys().filter((_, i) => i !== index));
}

/** Gemini의 첫 번째 키 */
export function getAIKey(): string {
  return getGeminiKeys()[0] ?? '';
}

export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 12) return '••••••';
  return key.slice(0, 6) + '••••••' + key.slice(-4);
}

export interface AudioInput {
  mimeType: string;
  base64: string;
}

/** 유튜브 주소를 Gemini가 직접 보게 함 (공개 영상만, 구간 지정 가능) */
export interface VideoUrlInput {
  fileUri: string;
  startSec: number;
  endSec: number;
}

type MediaInput = AudioInput | VideoUrlInput;

function mediaPart(m: MediaInput) {
  if ('fileUri' in m) return { fileData: { fileUri: m.fileUri }, videoMetadata: { startOffset: `${m.startSec}s`, endOffset: `${m.endSec}s` } };
  return { inlineData: { mimeType: m.mimeType, data: m.base64 } };
}

export interface AIOptions {
  /** 이 시간(밀리초) 안에 답이 없으면 포기하고 다시 시도하게 함 (기본: 제한 없음) */
  timeoutMs?: number;
  /** 'bg' = 화면 뒤에서 미리 하는 일(문장 분석 등). 사용자가 직접 누른 요청(단어 뜻 등)을 막지 않도록 동시에 2개까지만 보냄 */
  priority?: 'user' | 'bg';
}

// '생각 줄이기' 옵션: 모델 세대마다 이름이 달라서 순서대로 시도하고, 통한 것을 기억함 (모든 요청에 적용)
const THINK_MODES: (Record<string, unknown> | null)[] = [{ thinkingLevel: 'minimal' }, { thinkingBudget: 0 }, null];
let thinkMode = 0;

const BG_SLOTS = 2;
let bgActive = 0;
const bgWaiters: (() => void)[] = [];

async function acquireBg(): Promise<void> {
  if (bgActive < BG_SLOTS) {
    bgActive++;
    return;
  }
  await new Promise<void>((resolve) => bgWaiters.push(resolve));
}

function releaseBg(): void {
  const next = bgWaiters.shift();
  if (next) next(); // 자리를 그대로 다음 대기자에게 넘김
  else bgActive--;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 400 응답이 '생각(thinking) 옵션' 때문인지 확인 (본문은 복사본으로 읽어 원본은 그대로 둠) */
async function mentionsThinking(res: Response): Promise<boolean> {
  try {
    const msg: string = (await res.clone().json())?.error?.message ?? '';
    return /think/i.test(msg);
  } catch {
    return false;
  }
}

async function geminiRequest(key: string, system: string, user: string, maxTokens: number, audio?: MediaInput, opts?: AIOptions): Promise<string> {
  const p: AIProvider = 'gemini';
  const send = (mode: number) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // 키는 주소(?key=)가 아니라 헤더로만 보낸다
        'x-goog-api-key': key,
      },
      signal: opts?.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: audio ? [mediaPart(audio), { text: user }] : [{ text: user }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          // 모델이 속으로 생각하는 분량도 이 한도에 포함될 수 있어 여유를 둠
          maxOutputTokens: Math.max(1024, maxTokens * 2),
          temperature: 0.2,
          ...(THINK_MODES[mode] ? { thinkingConfig: THINK_MODES[mode] } : {}),
        },
      }),
    });
  let res: Response;
  try {
    res = await send(thinkMode);
    // 이 모델이 그 옵션을 모르면(400) 다음 방식으로 다시 보냄
    // (틀린 키 등 다른 이유의 400에는 옵션을 바꾸지 않음)
    while (res.status === 400 && thinkMode < THINK_MODES.length - 1 && (await mentionsThinking(res))) {
      thinkMode++;
      res = await send(thinkMode);
    }
    // 서버가 잠깐 바쁜 경우(503 등) 한 번만 바로 다시 시도
    if (res.status === 503 || res.status === 500) {
      await sleep(700);
      res = await send(thinkMode);
    }
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new AIError('network', p, 'AI 응답이 너무 늦어요. 다시 시도해 주세요.');
    }
    throw new AIError('network', p, '인터넷 연결이 끊겨 AI에 물어보지 못했어요.');
  }
  if (!res.ok) {
    let detail = '';
    let status = '';
    try {
      const e = (await res.json())?.error;
      detail = e?.message ?? '';
      status = `${e?.status ?? ''} ${JSON.stringify(e?.details ?? '')}`;
    } catch {
      /* 무시 */
    }
    const invalid = res.status === 403 || status.includes('API_KEY_INVALID') || /api key not valid/i.test(detail);
    if (invalid) throw new AIError('bad-key', p, 'Gemini API 키가 올바르지 않아요. 설정에서 다시 확인해 주세요.');
    if (res.status === 429) throw new AIError('rate-limit', p, 'Gemini 무료 한도에 도달했어요. 잠시 후 다시 시도해 주세요.');
    if (res.status >= 500) throw new AIError('overloaded', p, 'Gemini 서버가 바빠요. 잠시 후 다시 시도해 주세요.');
    throw new AIError('bad-response', p, `Gemini 오류(${res.status}) ${detail}`.trim());
  }
  const j = await res.json();
  const parts: { text?: string; thought?: boolean }[] = j?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((x) => !x.thought)
    .map((x) => x.text ?? '')
    .join('');
  if (!text) {
    const why = j?.promptFeedback?.blockReason ?? j?.candidates?.[0]?.finishReason ?? '';
    throw new AIError('bad-response', p, `Gemini가 답을 주지 않았어요. ${why}`.trim());
  }
  return text;
}

/** 마지막으로 잘 동작한 Gemini 키 번호 (다음 요청도 이 키부터 시도) */
let geminiStart = 0;

/** 키가 여러 개면 순서대로 시도: 한도 초과(429)·잘못된 키는 다음 키로 넘어감 */
async function callGemini(system: string, user: string, maxTokens: number, audio?: MediaInput, opts?: AIOptions): Promise<string> {
  if (opts?.priority !== 'bg') return callGeminiNow(system, user, maxTokens, audio, opts);
  await acquireBg();
  try {
    return await callGeminiNow(system, user, maxTokens, audio, opts);
  } finally {
    releaseBg();
  }
}

async function callGeminiNow(system: string, user: string, maxTokens: number, audio?: MediaInput, opts?: AIOptions): Promise<string> {
  const keys = getGeminiKeys();
  if (!keys.length) throw new AIError('no-key', 'gemini', 'Gemini API 키가 없어요. 설정에서 입력해 주세요.');
  let lastErr: unknown;
  for (let n = 0; n < keys.length; n++) {
    const i = (geminiStart + n) % keys.length;
    try {
      const text = await geminiRequest(keys[i], system, user, maxTokens, audio, opts);
      geminiStart = i;
      return text;
    } catch (e) {
      lastErr = e;
      if (e instanceof AIError && (e.kind === 'rate-limit' || e.kind === 'bad-key')) continue;
      throw e;
    }
  }
  if (keys.length > 1 && lastErr instanceof AIError && lastErr.kind === 'rate-limit') {
    throw new AIError('rate-limit', 'gemini', `Gemini 키 ${keys.length}개 모두 무료 한도에 도달했어요. 잠시 후 다시 시도해 주세요.`);
  }
  throw lastErr;
}

/** 설정에서 고른 AI에게 물어보고 글자 그대로의 답을 돌려줌 (JSON 해석은 부르는 쪽에서) */
export function callAI(system: string, user: string, maxTokens: number, opts?: AIOptions): Promise<string> {
  return callGemini(system, user, maxTokens, undefined, opts);
}

/** 녹음한 소리와 함께 Gemini에게 물어봄 (소리 입력은 Gemini만 가능 - 제공자 설정과 상관없이 Gemini 키를 사용) */
export function callGeminiWithAudio(system: string, user: string, audio: AudioInput, maxTokens: number): Promise<string> {
  return callGemini(system, user, maxTokens, audio);
}

const PING = 'Reply with the JSON object {"ok":true} and nothing else.';

/** 넣으려는 Gemini 키 하나가 맞는지 확인 (저장 전에 호출) */
export async function testGeminiKey(key: string): Promise<void> {
  await geminiRequest(key.trim(), PING, 'ping', 20, undefined, { timeoutMs: 20000 });
}

/** 유튜브 영상(공개)의 한 구간을 Gemini가 보고 답함 */
export function callGeminiWithVideoUrl(system: string, user: string, video: VideoUrlInput, maxTokens: number): Promise<string> {
  return callGemini(system, user, maxTokens, video);
}
