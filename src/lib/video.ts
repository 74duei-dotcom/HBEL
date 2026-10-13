'use client';
// 강의 영상: 영상에서 소리를 뽑아(기기 안) → 4분씩 나눠 Gemini가 영어 자막으로 받아 적음
// 영상 파일 자체는 이 기기에만 저장하고(IndexedDB) 구글 드라이브·AI에는 올리지 않음. AI에는 소리 조각만 보냄

import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import { AIError, callGeminiWithAudio, callGeminiWithVideoUrl } from './ai';
import { extractJson } from './claude';
import { splitSentences } from './pdf';
import type { DocContent } from './types';

const RATE = 16000;
const CHUNK_SECONDS = 240; // 4분 = 약 7.7MB (한 번에 보낼 수 있는 크기 안)
const MAX_FILE_MB = 700;

export interface TranscribeProgress {
  done: number;
  total: number;
  phase: 'decode' | 'transcribe';
}

export function isVideoFile(f: File): boolean {
  return f.type.startsWith('video/') || f.type.startsWith('audio/') || /\.(mp4|m4v|mov|webm|mkv|mp3|m4a|wav)$/i.test(f.name);
}

/* ---------- 영상 파일 보관 (이 기기에만) ---------- */

export async function saveVideo(id: string, file: Blob): Promise<void> {
  await idbSet(`video:${id}`, file);
}

export async function loadVideo(id: string): Promise<Blob | null> {
  return ((await idbGet(`video:${id}`)) as Blob | undefined) ?? null;
}

export async function removeVideo(id: string): Promise<void> {
  await idbDel(`video:${id}`);
}

/* ---------- 소리 뽑기 ---------- */

/** 영상 파일의 소리를 16kHz 모노로 디코딩 (브라우저가 열 수 있는 영상 형식이어야 함) */
async function decodeMono16k(file: File): Promise<Float32Array> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    throw new Error(`영상이 너무 커요(${Math.round(file.size / 1024 / 1024)}MB). ${MAX_FILE_MB}MB 이하로 줄이거나 소리만(mp3) 뽑아 올려 주세요.`);
  }
  const buf = await file.arrayBuffer();
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  let ctx: AudioContext;
  try {
    ctx = new Ctx({ sampleRate: RATE }); // 디코딩하면서 16kHz로 바로 줄임 (메모리 절약)
  } catch {
    ctx = new Ctx();
  }
  try {
    const decoded = await ctx.decodeAudioData(buf);
    // 2채널 이상이면 평균내서 모노로
    const n = decoded.length;
    const mono = new Float32Array(n);
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const d = decoded.getChannelData(c);
      for (let i = 0; i < n; i++) mono[i] += d[i] / decoded.numberOfChannels;
    }
    if (decoded.sampleRate === RATE) return mono;
    // 기기가 16kHz 디코딩을 지원하지 않으면 따로 줄임
    const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * RATE), RATE);
    const src = off.createBufferSource();
    const b = off.createBuffer(1, n, decoded.sampleRate);
    b.copyToChannel(mono, 0);
    src.buffer = b;
    src.connect(off.destination);
    src.start();
    return (await off.startRendering()).getChannelData(0);
  } catch {
    throw new Error('이 영상의 소리를 읽지 못했어요. mp4(H.264/AAC)나 mp3 같은 흔한 형식인지 확인해 주세요. 휴대폰에서는 큰 영상이 메모리 때문에 실패할 수 있으니 PC에서 올려 주세요.');
  } finally {
    void ctx.close();
  }
}

function toWavBase64(samples: Float32Array): string {
  const pcm = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(pcm.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  let bin = '';
  for (let i = 0; i < pcm.length; i += 0x8000) bin += String.fromCharCode(...pcm.subarray(i, i + 0x8000));
  return btoa(bin);
}

/* ---------- 받아 적기 ---------- */

const SYSTEM = `You transcribe an English lecture or medical talk audio segment for a Korean learner.
Return ONLY a JSON object: {"segments":[{"t":"MM:SS","text":string}]}
- "t" is when that segment starts, counted from the START OF THIS AUDIO CLIP (not the whole lecture).
- Each segment is one or two natural, complete sentences, in the order spoken. Use correct punctuation and capitalization.
- Write exactly what is said in English. Keep medical terms spelled correctly. Do not translate, summarize or add anything.
- Skip filler sounds (um, uh). If a part is silent, music, or not English speech, skip it. If there is no speech at all, return {"segments":[]}.`;

function parseT(t: unknown): number {
  const m = /^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(String(t ?? '').trim());
  if (m) return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 잠시 쉬었다 다시 시도할 만한 오류인가 (한도·서버 혼잡·느린 응답·깨진 답) */
function isRetryable(e: unknown): boolean {
  if (!(e instanceof AIError)) return false;
  if (e.kind === 'rate-limit' || e.kind === 'overloaded' || e.kind === 'network') return true;
  return e.kind === 'bad-response' && /읽지 못|형식이 맞지|답을 주지/.test(e.message);
}

async function transcribeClip(samples: Float32Array, offset: number): Promise<{ time: number; text: string }[]> {
  const b64 = toWavBase64(samples);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const text = await callGeminiWithAudio(SYSTEM, 'Transcribe this clip.', { mimeType: 'audio/wav', base64: b64 }, 6000);
      const j = extractJson<{ segments?: { t?: unknown; text?: unknown }[] }>(text);
      const clipLen = samples.length / RATE;
      return (Array.isArray(j.segments) ? j.segments : [])
        .map((s) => ({ time: offset + Math.min(clipLen, Math.max(0, parseT(s?.t))), text: String(s?.text ?? '').trim() }))
        .filter((s) => /[A-Za-z]/.test(s.text));
    } catch (e) {
      lastErr = e;
      // 무료 한도·서버 혼잡이면 잠시 쉬었다 다시 시도
      if (isRetryable(e) && attempt < 3) {
        await sleep(attempt === 0 ? 8000 : 25000);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

export interface VideoTranscript {
  pages: DocContent['pages'];
  duration: number;
  sentenceCount: number;
  /** 중간에 오류로 멈춰 앞부분만 받았을 때의 안내 문구 */
  partial?: string;
}

/** 영상 → 영어 자막 문서. 4분 구간이 한 "쪽"이 됨 */
export async function transcribeVideo(file: File, onProgress?: (p: TranscribeProgress) => void): Promise<VideoTranscript> {
  onProgress?.({ done: 0, total: 1, phase: 'decode' });
  const samples = await decodeMono16k(file);
  const duration = samples.length / RATE;
  const step = CHUNK_SECONDS * RATE;
  const total = Math.max(1, Math.ceil(samples.length / step));
  const pages: DocContent['pages'] = [];
  for (let c = 0; c < total; c++) {
    onProgress?.({ done: c, total, phase: 'transcribe' });
    const clip = samples.subarray(c * step, Math.min(samples.length, (c + 1) * step));
    const segs = await transcribeClip(clip, c * CHUNK_SECONDS);
    const sentences: string[] = [];
    const times: number[] = [];
    for (const s of segs) {
      const parts = splitSentences(s.text);
      const list = parts.length ? parts : [s.text];
      // 한 구간 안에서 문장이 여러 개면 글자 수에 비례해 시작 시각을 나눠 붙임
      const totalLen = list.reduce((n, x) => n + x.length, 0) || 1;
      let acc = 0;
      for (const sent of list) {
        sentences.push(sent);
        times.push(Math.round((s.time + (acc / totalLen) * 6) * 10) / 10);
        acc += sent.length;
      }
    }
    pages.push({ sentences, times });
  }
  onProgress?.({ done: total, total, phase: 'transcribe' });
  const sentenceCount = pages.reduce((n, p) => n + p.sentences.length, 0);
  return { pages, duration, sentenceCount };
}

/** 초 → "12:05" 또는 "1:02:05" */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

/* ---------- 유튜브 ---------- */

/** 유튜브 주소(watch, youtu.be, shorts, embed)에서 영상 ID를 뽑음. 아니면 null */
export function parseYoutubeId(input: string): string | null {
  try {
    const u = new URL(input.trim());
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id = '';
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v') ?? '';
      else {
        const m = /^\/(shorts|embed|live)\/([\w-]{11})/.exec(u.pathname);
        if (m) id = m[2];
      }
    }
    return /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** 영상 제목 (실패하면 null) */
export async function youtubeTitle(id: string): Promise<string | null> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}&format=json`);
    if (!r.ok) return null;
    return ((await r.json()) as { title?: string }).title ?? null;
  } catch {
    return null;
  }
}

const YT_CHUNK = 600; // 10분씩
const YT_MAX_CHUNKS = 18; // 최대 3시간

const YT_SYSTEM = `You transcribe the English speech of a YouTube lecture or medical talk for a Korean learner.
Return ONLY a JSON object: {"length":"MM:SS","segments":[{"t":"MM:SS","text":string}]}
- "length" is the total running time of the whole video.
- "t" is when the segment starts, counted from the START OF THE WHOLE VIDEO (absolute time, e.g. a segment 12 minutes in is "12:00").
- Each segment is one or two natural, complete sentences, in the order spoken. Use correct punctuation and capitalization.
- Write exactly what is said in English. Keep medical terms spelled correctly. Do not translate, summarize or add anything.
- Skip filler sounds, music, and non-English speech. If there is no speech in the requested range, return {"segments":[]}.`;

async function transcribeYoutubeRange(id: string, start: number, end: number): Promise<{ segs: { time: number; text: string }[]; length: number }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const text = await callGeminiWithVideoUrl(
        YT_SYSTEM,
        `Transcribe only the speech between ${formatTime(start)} and ${formatTime(end)} of the video.`,
        { fileUri: `https://www.youtube.com/watch?v=${id}`, startSec: start, endSec: end },
        8000,
      );
      const j = extractJson<{ length?: unknown; segments?: { t?: unknown; text?: unknown }[] }>(text);
      const segs = (Array.isArray(j.segments) ? j.segments : [])
        .map((s) => {
          let t = parseT(s?.t);
          if (start > 0 && t < start - 5) t += start; // 구간 기준 시각으로 답했으면 보정
          return { time: Math.max(start, t), text: String(s?.text ?? '').trim() };
        })
        .filter((s) => /[A-Za-z]/.test(s.text));
      return { segs, length: parseT(j.length) };
    } catch (e) {
      lastErr = e;
      if (isRetryable(e) && attempt < 3) {
        await sleep(attempt === 0 ? 8000 : 25000);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

/** 유튜브 영상 → 영어 자막 문서 (10분 구간이 한 "쪽"). 영상 끝에 닿으면 멈춤 */
export async function transcribeYoutube(id: string, onProgress?: (done: number) => void): Promise<VideoTranscript> {
  const pages: DocContent['pages'] = [];
  let chunks = YT_MAX_CHUNKS; // 영상 길이를 알게 되면 줄임
  let lengthKnown = false;
  let partial: string | undefined;
  for (let c = 0; c < chunks; c++) {
    onProgress?.(c);
    const start = c * YT_CHUNK;
    let segs: { time: number; text: string }[];
    try {
      const r = await transcribeYoutubeRange(id, start, start + YT_CHUNK);
      segs = r.segs;
      if (c === 0 && r.length >= 10 && r.length < YT_MAX_CHUNKS * YT_CHUNK) {
        chunks = Math.max(1, Math.ceil(r.length / YT_CHUNK));
        lengthKnown = true;
      }
    } catch (e) {
      if (c === 0) throw e;
      // 영상 길이를 아는데 중간에 실패했다면 진짜 오류 → 앞부분만 받았다고 알림. 길이를 모르면 영상 끝으로 보고 마무리
      if (lengthKnown) partial = `${c + 1}번째 10분 구간부터는 받아 적지 못했어요(${e instanceof Error ? e.message : '오류'}). 앞부분만 저장했어요.`;
      break;
    }
    if (!segs.length) {
      if (c === 0) throw new Error('영어 말소리를 찾지 못했어요. 비공개·연령 제한 영상이거나 영어가 아닐 수 있어요.');
      break;
    }
    const sentences: string[] = [];
    const times: number[] = [];
    for (const s of segs) {
      const parts = splitSentences(s.text);
      const list = parts.length ? parts : [s.text];
      const totalLen = list.reduce((n, x) => n + x.length, 0) || 1;
      let acc = 0;
      for (const sent of list) {
        sentences.push(sent);
        times.push(Math.round((s.time + (acc / totalLen) * 6) * 10) / 10);
        acc += sent.length;
      }
    }
    pages.push({ sentences, times });
  }
  const sentenceCount = pages.reduce((n, p) => n + p.sentences.length, 0);
  const lastTime = pages.length ? Math.max(...(pages[pages.length - 1].times ?? [0])) : 0;
  return { pages, duration: lastTime, sentenceCount, partial };
}

/* 유튜브 플레이어(IFrame API) */
export interface YTPlayer {
  seekTo(s: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  destroy(): void;
}

let ytApi: Promise<void> | null = null;

export function loadYouTubeApi(): Promise<void> {
  if (ytApi) return ytApi;
  ytApi = new Promise<void>((resolve, reject) => {
    const w = window as unknown as { YT?: { Player?: unknown }; onYouTubeIframeAPIReady?: () => void };
    if (w.YT?.Player) return resolve();
    w.onYouTubeIframeAPIReady = () => resolve();
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onerror = () => {
      ytApi = null;
      reject(new Error('유튜브 플레이어를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'));
    };
    document.head.appendChild(tag);
  });
  return ytApi;
}

export function createYouTubePlayer(el: HTMLElement, videoId: string): Promise<YTPlayer> {
  return loadYouTubeApi().then(
    () =>
      new Promise<YTPlayer>((resolve) => {
        const YT = (window as unknown as { YT: { Player: new (e: HTMLElement, o: unknown) => YTPlayer } }).YT;
        const p: YTPlayer = new YT.Player(el, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: { playsinline: 1, rel: 0 },
          events: { onReady: () => resolve(p) },
        });
      }),
  );
}
