// 오픈소스 음성(Kokoro) 모델을 화면과 따로 도는 작업 스레드(Web Worker)에서 실행
// → 모델을 불러오거나 문장 소리를 만드는 동안에도 화면(버튼·스크롤)이 멈추지 않음
import { KokoroTTS } from 'kokoro-js';

interface Req {
  id: number;
  type: 'load' | 'generate';
  text?: string;
  voice?: string;
}

const ctx = self as unknown as { postMessage: (m: unknown) => void; onmessage: ((e: MessageEvent<Req>) => void) | null };

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let model: Promise<KokoroTTS> | null = null;
let chain: Promise<unknown> = Promise.resolve();

function load(): Promise<KokoroTTS> {
  if (!model) {
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
