'use client';
// AI 호출 공통 창구: Claude 또는 Gemini 중 설정에서 고른 쪽으로 브라우저에서 직접 호출
// - 키는 이 기기의 localStorage에만 저장 (드라이브 동기화·코드에 넣지 않음)

import { CLAUDE_MODEL, GEMINI_MODEL, LS_KEYS } from './config';
import { lsGet, lsSet } from './util';

export type AIProvider = 'claude' | 'gemini';

export const PROVIDER_LABEL: Record<AIProvider, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
};

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
  const v = lsGet(LS_KEYS.aiProvider);
  return v === 'claude' || v === 'gemini' ? v : 'gemini';
}

export function setProvider(p: AIProvider): void {
  lsSet(LS_KEYS.aiProvider, p);
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

/** Claude 키, 또는 Gemini의 첫 번째 키 */
export function getAIKey(p: AIProvider = getProvider()): string {
  return p === 'gemini' ? (getGeminiKeys()[0] ?? '') : (lsGet(LS_KEYS.claudeKey) ?? '');
}

export function setClaudeKey(key: string): void {
  lsSet(LS_KEYS.claudeKey, key.trim() || null);
}

export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 12) return '••••••';
  return key.slice(0, 6) + '••••••' + key.slice(-4);
}

async function callClaude(system: string, user: string, maxTokens: number): Promise<string> {
  const p: AIProvider = 'claude';
  const key = getAIKey(p);
  if (!key) throw new AIError('no-key', p, 'Claude API 키가 없어요. 설정에서 입력해 주세요.');
  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        temperature: 0.2,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
  } catch {
    throw new AIError('network', p, '인터넷 연결이 끊겨 AI에 물어보지 못했어요.');
  }
  if (res.status === 401 || res.status === 403) throw new AIError('bad-key', p, 'Claude API 키가 올바르지 않아요. 설정에서 다시 확인해 주세요.');
  if (res.status === 429) throw new AIError('rate-limit', p, 'Claude 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.');
  if (res.status === 529 || res.status >= 500) throw new AIError('overloaded', p, 'Claude 서버가 바빠요. 잠시 후 다시 시도해 주세요.');
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error?.message ?? '';
    } catch {
      /* 무시 */
    }
    throw new AIError('bad-response', p, `Claude 오류(${res.status}) ${detail}`.trim());
  }
  const j = await res.json();
  return (j.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('');
}

async function geminiRequest(key: string, system: string, user: string, maxTokens: number): Promise<string> {
  const p: AIProvider = 'gemini';
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // 키는 주소(?key=)가 아니라 헤더로만 보낸다
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          // 모델이 속으로 생각하는 분량도 이 한도에 포함될 수 있어 여유를 둠
          maxOutputTokens: Math.max(1024, maxTokens * 2),
          temperature: 0.2,
        },
      }),
    });
  } catch {
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
async function callGemini(system: string, user: string, maxTokens: number): Promise<string> {
  const keys = getGeminiKeys();
  if (!keys.length) throw new AIError('no-key', 'gemini', 'Gemini API 키가 없어요. 설정에서 입력해 주세요.');
  let lastErr: unknown;
  for (let n = 0; n < keys.length; n++) {
    const i = (geminiStart + n) % keys.length;
    try {
      const text = await geminiRequest(keys[i], system, user, maxTokens);
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
export function callAI(system: string, user: string, maxTokens: number): Promise<string> {
  return getProvider() === 'claude' ? callClaude(system, user, maxTokens) : callGemini(system, user, maxTokens);
}

const PING = 'Reply with the JSON object {"ok":true} and nothing else.';

/** 지금 저장된 Claude 키가 맞는지 짧게 확인 */
export async function testClaudeKey(): Promise<void> {
  await callClaude(PING, 'ping', 20);
}

/** 넣으려는 Gemini 키 하나가 맞는지 확인 (저장 전에 호출) */
export async function testGeminiKey(key: string): Promise<void> {
  await geminiRequest(key.trim(), PING, 'ping', 20);
}
