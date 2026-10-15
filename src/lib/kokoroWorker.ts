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
if (isMobile && env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;

let model: Promise<KokoroTTS> | null = null;
let chain: Promise<unknown> = Promise.resolve();

function load(): Promise<KokoroTTS> {
  if (!model) {
    ctx.postMessage({ stage: '모델 불러오는 중…' });
    model = KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p: { status?: string; progress?: number }) => {
        if (p?.status === 'progress' && typeof p.progress === 'number') ctx.postMessage({ progress: Math.round(p.progress) });
      },
    }).catch((e) => {
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
        ctx.postMessage({ stage: type === 'load' ? '준비 완료, 시험 음성 만드는 중…' : '문장 소리 만드는 중…' });
        if (type === 'load') {
          ctx.postMessage({ id, ok: true });
          return;
        }
        const audio = await tts.generate(text ?? '', { voice: (voice ?? 'af_heart') as 'af_heart' });
        ctx.postMessage({ id, blob: audio.toBlob() });
      } catch (err) {
        ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
      }
    });
};
