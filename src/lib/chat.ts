'use client';
// AI 영어 대화(롤플레이): 상황을 정하면 AI가 상대 역할을 하고, 내 말을 바로 교정해 주고, 끝나면 정리해 줌
// AI 호출은 ai.ts의 callAI(한 번에 한 질문) 사용 → 지금까지의 대화를 글로 이어 붙여서 보냄

import { callAI } from './ai';
import { extractJson } from './claude';

export interface Scenario {
  id: string;
  title: string;
  desc: string;
  /** AI가 맡을 역할과 상황 (영어) */
  role: string;
  /** 첫 인사 (AI가 먼저 말함) */
  opening: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'patient',
    title: '외국인 환자 상담',
    desc: '무릎 통증으로 센터를 처음 찾은 외국인 환자와 초기 상담',
    role: 'a foreign patient visiting a rehabilitation exercise center for the first time because of chronic knee pain. You answer the director\'s questions about pain, history, and goals, and you also ask your own questions about the program, cost and schedule. Speak like a real, slightly anxious, non-expert patient.',
    opening: "Hi, I'm Daniel. My knee has been hurting for a few months, and my doctor suggested I come here. I'm not sure what to expect.",
  },
  {
    id: 'qa',
    title: '학회 발표 질의응답',
    desc: '내 발표가 끝난 뒤 청중의 날카로운 질문에 답하기',
    role: 'a researcher in the audience at an international sports medicine / rehabilitation conference. The user just finished presenting. Ask probing but polite questions about methods, sample size, limitations and clinical implications, one at a time, and follow up on the answer.',
    opening: 'Thank you for the interesting talk. I have a question about your methods: how did you decide on the sample size, and do you think it limits your conclusions?',
  },
  {
    id: 'journal',
    title: '논문 토론',
    desc: '동료와 최근 읽은 논문의 결과·한계를 토론',
    role: 'a colleague discussing a recent paper with the user at a journal club. Share your own opinions, politely disagree sometimes, and ask the user to explain findings, limitations and whether they would change clinical practice.',
    opening: "Did you get a chance to read that paper on exercise therapy for low back pain? I'm not totally convinced by the results. What did you think?",
  },
];

export interface ChatTurn {
  role: 'ai' | 'me';
  text: string;
  /** 내 말에 대한 짧은 교정 (한국어 설명 포함). 문제 없으면 비어 있음 */
  tip?: string;
  /** 더 자연스러운 표현 */
  better?: string;
}

function transcript(turns: ChatTurn[]): string {
  return turns.map((t) => `${t.role === 'ai' ? 'AI' : 'User'}: ${t.text}`).join('\n');
}

export interface ChatReply {
  reply: string;
  tip: string;
  better: string;
}

/** 내 말에 대한 상대(AI)의 답 + 내 말 교정 */
export async function chatTurn(sc: Scenario, history: ChatTurn[], targets: string[]): Promise<ChatReply> {
  const goal = targets.length ? `\nThe learner is trying to use these words naturally: ${targets.join(', ')}. Steer the conversation so they get chances to use them, but never force them.` : '';
  const system = `You are role-playing as ${sc.role}
The user is a Korean rehabilitation exercise center director practicing professional English. Keep your spoken reply to 1-3 short sentences and end with a question or a prompt when natural, at a level a non-native speaker can follow.${goal}
Also review the user's LAST message. Return ONLY a JSON object:
{"reply": string (your in-character reply, English),
 "tip": string (Korean, one short sentence about a real grammar/word-choice/naturalness problem in the user's last message; empty string "" if it was fine),
 "better": string (a more natural, professional English version of the user's last message; empty string "" if it was fine)}
Do not nitpick punctuation or capitalization. If the user wrote Korean, set tip to a short Korean hint and better to the English they could say.`;
  const text = await callAI(system, transcript(history), 700);
  const j = extractJson<Partial<ChatReply>>(text);
  const reply = String(j.reply ?? '').trim();
  if (!reply) throw new Error('AI의 답을 읽지 못했어요. 다시 시도해 주세요.');
  return { reply, tip: String(j.tip ?? '').trim(), better: String(j.better ?? '').trim() };
}

export interface ChatReview {
  summary: string;
  fixes: { original: string; better: string; why: string }[];
  goodPoints: string[];
  phrases: string[];
}

/** 대화가 끝난 뒤 정리: 총평, 고칠 표현, 잘한 점, 외워 둘 표현 */
export async function reviewChat(sc: Scenario, history: ChatTurn[]): Promise<ChatReview> {
  const system = `You are an English coach for a Korean rehabilitation exercise center director. Review the user's lines in this role-play (${sc.title}).
Return ONLY a JSON object:
{"summary": string (Korean, 2-3 sentences overall feedback),
 "fixes": [{"original": string (the user's phrase), "better": string (natural professional English), "why": string (Korean, short)}] (at most 5, the most useful ones),
 "goodPoints": string[] (Korean, at most 3 things done well),
 "phrases": string[] (at most 5 useful English expressions from this scenario worth memorizing, each followed by a Korean meaning in parentheses)}`;
  const text = await callAI(system, transcript(history), 1500);
  const j = extractJson<Partial<ChatReview>>(text);
  const strs = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
  const fixes = (Array.isArray(j.fixes) ? j.fixes : [])
    .map((f) => ({ original: String(f?.original ?? '').trim(), better: String(f?.better ?? '').trim(), why: String(f?.why ?? '').trim() }))
    .filter((f) => f.original && f.better)
    .slice(0, 5);
  return { summary: String(j.summary ?? '').trim(), fixes, goodPoints: strs(j.goodPoints).slice(0, 3), phrases: strs(j.phrases).slice(0, 5) };
}

/* ---------- 음성으로 말하기(받아쓰기): 브라우저 기능 사용, 크롬·갤럭시에서 가능 ---------- */

interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canListen(): boolean {
  return recognitionCtor() !== null;
}

/** 말하기 시작. 인식 중인 글자를 onText로 계속 알려주고, 끝나면 onEnd. 멈추는 함수를 돌려줌 */
export function listen(onText: (text: string) => void, onEnd: (error?: string) => void): () => void {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    onEnd('이 브라우저는 음성 입력을 지원하지 않아요.');
    return () => {};
  }
  const r = new Ctor();
  r.lang = 'en-US';
  r.interimResults = true;
  r.continuous = false;
  let error: string | undefined;
  r.onresult = (e) => {
    let s = '';
    for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
    onText(s.trim());
  };
  r.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') error = '마이크 사용이 허용되지 않았어요. 브라우저 주소창의 마이크 권한을 허용해 주세요.';
    else if (e.error !== 'no-speech' && e.error !== 'aborted') error = '음성을 인식하지 못했어요.';
  };
  r.onend = () => onEnd(error);
  try {
    r.start();
  } catch {
    onEnd('음성 입력을 시작하지 못했어요.');
  }
  return () => {
    try {
      r.stop();
    } catch {
      /* 무시 */
    }
  };
}
