// 오픈소스 음성(Kokoro) 모델을 화면과 따로 도는 작업 스레드(Web Worker)에서 실행
// → 모델을 불러오거나 문장 소리를 만드는 동안에도 화면(버튼·스크롤)이 멈추지 않음
import './streamPolyfill'; // 반드시 가장 먼저: Safari에 없는 기능을 채워 넣음 (음성 엔진보다 먼저 실행되어야 함)
import { KokoroTTS } from 'kokoro-js';
import { env } from '@huggingface/transformers';
import { phonemize } from 'phonemizer';

interface Req {
  id: number;
  type: 'load' | 'generate';
  text?: string;
  voice?: string;
}

const ctx = self as unknown as { postMessage: (m: unknown) => void; onmessage: ((e: MessageEvent<Req>) => void) | null };

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
// 핸드폰·태블릿은 메모리를 아끼도록 계산 스레드를 1개로 제한 (여러 개면 메모리가 배로 늘어 멈출 수 있음)
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(self.navigator.userAgent) || (/Macintosh/i.test(self.navigator.userAgent) && self.navigator.maxTouchPoints > 1);
// 음성 엔진 파일을 외부 CDN이 아니라 이 앱 주소(public/ort)에서 불러옴
const BASE = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '');
if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = `${self.location.origin}${BASE}/ort/`;
if (isMobile && env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;

// 파일 받기가 실패했을 때 어떤 주소였는지 오류 메시지에 함께 보여 주기 위해 마지막 요청 주소를 기억
let lastUrl = '';
const origFetch = self.fetch.bind(self);
self.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  lastUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  ctx.postMessage({ stage: `파일 받는 중: ${lastUrl.replace(/^https?:\/\//, '').slice(0, 70)}` });
  return origFetch(input, init);
};

// 작업 스레드가 살아 있는지 알리는 신호 (계산에 몰두하면 신호가 멈추므로 '계산 중'과 '죽음'을 가늠하는 단서)
setInterval(() => ctx.postMessage({ beat: Date.now() }), 1000);

// 진단용: 이 기기가 지원하는 기능과, 엔진 안에서 조용히 난 오류를 기억해 두었다가 멈췄을 때 함께 알림
const caps = `v${process.env.NEXT_PUBLIC_BUILD_ID ?? '?'} 스트림반복:${'asyncIterator' in ReadableStream.prototype ? 'O' : 'X'} 압축풀기:${typeof DecompressionStream !== 'undefined' ? 'O' : 'X'} Blob스트림:${typeof Blob.prototype.stream === 'function' ? 'O' : 'X'}`;
let hiddenError = '';
self.addEventListener('unhandledrejection', (ev) => {
  const r = (ev as PromiseRejectionEvent).reason;
  hiddenError = `숨은오류: ${(r instanceof Error ? r.message : String(r)).slice(0, 120)}`;
  ctx.postMessage({ caps: `${caps} ${hiddenError}` });
});
self.addEventListener('error', (ev) => {
  hiddenError = `숨은오류: ${String((ev as ErrorEvent).message).slice(0, 120)}`;
  ctx.postMessage({ caps: `${caps} ${hiddenError}` });
});
ctx.postMessage({ caps });

let engineName = '';
let model: Promise<KokoroTTS> | null = null;
let chain: Promise<unknown> = Promise.resolve();

const onProgress = (p: { status?: string; progress?: number }) => {
  if (p?.status === 'progress' && typeof p.progress === 'number') ctx.postMessage({ progress: Math.round(p.progress) });
};

async function loadModel(): Promise<KokoroTTS> {
  ctx.postMessage({ stage: '모델 파일 받는 중…' });
  engineName = '기본 방식';
  return KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'wasm', progress_callback: onProgress });
}

function load(): Promise<KokoroTTS> {
  if (!model) {
    model = loadModel().catch((e) => {
      model = null; // 다음에 다시 시도할 수 있게
      throw e;
    });
  }
  return model;
}

/** 단계가 제한 시간 안에 끝나지 않으면 어느 단계에서 멈췄는지 알리는 오류로 바꿈 */
function withLimit<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} 단계에서 ${Math.round(ms / 1000)}초 넘게 멈춰서 중단했어요.`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

ctx.onmessage = (e) => {
  const { id, type, text, voice } = e.data;
  // 한 번에 하나씩 차례로 처리
  chain = chain
    .catch(() => undefined)
    .then(async () => {
      try {
        const tts = await load();
        ctx.postMessage({ stage: type === 'load' ? `준비 완료(${engineName}), 시험 음성 만드는 중…` : `문장 소리 만드는 중(${engineName})…` });
        if (type === 'load') {
          ctx.postMessage({ id, ok: true });
          return;
        }
        const name = engineName;
        // 단계별로 나눠 진행 상황을 알리고, 멈추면 어느 단계인지 알려 줌
        ctx.postMessage({ stage: `1/3 영어를 발음 기호로 바꾸는 중(${name})…` });
        await withLimit(phonemize((text ?? '').slice(0, 200), 'en-us'), 90_000, '1/3 발음 기호 변환');
        ctx.postMessage({ stage: `2·3/3 목소리 준비와 소리 계산 중(${name})…` });
        const audio = await withLimit(tts.generate(text ?? '', { voice: (voice ?? 'af_heart') as 'af_heart' }), 240_000, '2·3/3 소리 계산');
        ctx.postMessage({ id, blob: audio.toBlob() });
      } catch (err) {
        ctx.postMessage({ id, error: `${err instanceof Error ? err.message : String(err)} [${caps} ${hiddenError}]` });
      }
    });
};
