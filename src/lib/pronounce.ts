'use client';
// 발음 연습(쉐도잉): 마이크로 녹음 → Gemini가 소리를 듣고 원문과 비교해 평가
// 소리 입력은 Gemini만 가능. 녹음은 이 기기에서 평가 요청에만 쓰이고 저장하지 않음

import { callGeminiWithAudio } from './ai';
import { extractJson } from './claude';

export interface PronWord {
  word: string;
  ok: boolean;
  tip: string; // 고칠 점 (한국어). 잘 읽었으면 빈 문자열
}

export interface PronResult {
  score: number; // 0~100
  summary: string;
  heard: string; // AI가 들은 문장
  words: PronWord[];
}

export function canRecord(): boolean {
  return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

export interface Recording {
  stop: () => Promise<Blob>;
  cancel: () => void;
}

/** 녹음 시작. 마이크 허용을 못 받으면 오류를 던짐 */
export async function startRecording(): Promise<Recording> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    throw new Error('마이크 사용이 허용되지 않았어요. 브라우저 주소창의 마이크 권한을 허용해 주세요.');
  }
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  rec.start();
  const release = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          release();
          resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
        };
        if (rec.state !== 'inactive') rec.stop();
        else rec.onstop?.(new Event('stop'));
      }),
    cancel: () => {
      rec.onstop = null;
      if (rec.state !== 'inactive') rec.stop();
      release();
    },
  };
}

/** 녹음 파일을 16kHz 모노 WAV로 바꿈 (모든 기기에서 Gemini가 읽을 수 있는 형식, 용량도 작음) */
export async function toWav16k(blob: Blob): Promise<Blob> {
  const buf = await blob.arrayBuffer();
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(buf);
  } finally {
    void ctx.close();
  }
  const rate = 16000;
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const mono = (await off.startRendering()).getChannelData(0);
  const pcm = new DataView(new ArrayBuffer(mono.length * 2));
  for (let i = 0; i < mono.length; i++) pcm.setInt16(i * 2, Math.max(-1, Math.min(1, mono[i])) * 0x7fff, true);
  const header = new DataView(new ArrayBuffer(44));
  const w = (o: number, s: string) => [...s].forEach((c, i) => header.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  header.setUint32(4, 36 + pcm.byteLength, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, rate, true);
  header.setUint32(28, rate * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  w(36, 'data');
  header.setUint32(40, pcm.byteLength, true);
  return new Blob([header, pcm], { type: 'audio/wav' });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function evaluatePronunciation(sentence: string, recording: Blob): Promise<PronResult> {
  const wav = await toWav16k(recording);
  const system = `You are an English pronunciation coach for a Korean adult learner. You will hear a recording of the learner reading a target sentence aloud.
Compare what you HEAR with the target sentence. Return ONLY a JSON object:
{"score": number (0-100, overall clarity and accuracy; be fair, 80+ means easily understood),
 "summary": string (Korean, 1-2 sentences: what was good and the single most important thing to fix),
 "heard": string (the sentence as you actually heard it),
 "words": [{"word": string (each word of the target sentence in order, punctuation removed),
   "ok": boolean (false if mispronounced, skipped, or noticeably unclear),
   "tip": string (Korean, short tip on how to fix it, e.g. "th 소리는 혀를 이 사이에 살짝 넣어요"; empty string if ok)}]}
Be concrete about sounds (stress, th, r/l, f/p, final consonants). If the recording is silent or unrelated, give score 0 and say so.`;
  const text = await callGeminiWithAudio(system, `Target sentence: ${sentence}`, { mimeType: 'audio/wav', base64: await blobToBase64(wav) }, 1500);
  const j = extractJson<Partial<PronResult>>(text);
  const words = (Array.isArray(j.words) ? j.words : []).map((x) => ({ word: String(x?.word ?? '').trim(), ok: x?.ok !== false, tip: String(x?.tip ?? '').trim() })).filter((x) => x.word);
  const score = Math.max(0, Math.min(100, Math.round(Number(j.score ?? 0))));
  return { score, summary: String(j.summary ?? '').trim(), heard: String(j.heard ?? '').trim(), words };
}
