// 오픈소스 음성(Kokoro) 모델을 화면과 따로 도는 작업 스레드(Web Worker)에서 실행
// → 모델을 불러오거나 문장 소리를 만드는 동안에도 화면(버튼·스크롤)이 멈추지 않음
import { KokoroTTS } from 'kokoro-js';
import { env } from '@huggingface/transformers';

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

let engineName = '';
let model: Promise<KokoroTTS> | null = null;
let chain: Promise<unknown> = Promise.resolve();

const onProgress = (p: { status?: string; progress?: number }) => {
  if (p?.status === 'progress' && typeof p.progress === 'number') ctx.postMessage({ progress: Math.round(p.progress) });
};

/** 그래픽 칩(WebGPU)을 쓸 수 있는지 (최신 아이패드·크롬 등) */
async function gpuAvailable(): Promise<boolean> {
  try {
    const gpu = (self.navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    return !!gpu && !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

async function loadWasm(): Promise<KokoroTTS> {
  ctx.postMessage({ stage: '모델 파일 받는 중…' });
  engineName = '기본 방식';
  return KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'wasm', progress_callback: onProgress });
}

async function loadModel(): Promise<KokoroTTS> {
  // 핸드폰·태블릿은 CPU(wasm) 계산이 멈추는 경우가 있어, 그래픽 칩(WebGPU)이 되면 먼저 시도하고 실패하면 기존 방식으로 되돌아감
  if (isMobile && (await gpuAvailable())) {
    try {
      ctx.postMessage({ stage: '그래픽 칩용 모델 받는 중(약 326MB, 처음 한 번)…' });
      const gpuModel = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'fp32', device: 'webgpu', progress_callback: onProgress });
      ctx.postMessage({ stage: '그래픽 칩으로 시험 계산 중…' });
      await gpuModel.generate('Hi.', { voice: 'af_heart' }); // 실제로 계산이 되는지 먼저 확인
      engineName = '그래픽 칩';
      return gpuModel;
    } catch (err) {
      ctx.postMessage({ stage: `그래픽 칩 사용 실패(${err instanceof Error ? err.message.slice(0, 60) : '오류'}), 기본 방식으로 전환…` });
    }
  }
  return loadWasm();
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
        const audio = await tts.generate(text ?? '', { voice: (voice ?? 'af_heart') as 'af_heart' });
        ctx.postMessage({ id, blob: audio.toBlob() });
      } catch (err) {
        ctx.postMessage({ id, error: `${err instanceof Error ? err.message : String(err)} [${lastUrl.replace(/^https?:\/\//, '').slice(0, 90)}]` });
      }
    });
};
