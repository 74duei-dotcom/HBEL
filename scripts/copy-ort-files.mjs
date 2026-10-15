// 오픈소스 음성(Kokoro)이 쓰는 음성 엔진(onnxruntime) 파일을 public/ort 폴더로 복사합니다.
// 외부 사이트(CDN)에서 약 21MB를 따로 받다가 멈추는 일을 막고, 이 앱 주소에서 바로 불러오기 위함.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
try {
  const out = join(process.cwd(), 'public', 'ort');
  if (!existsSync(out)) mkdirSync(out, { recursive: true });
  const dist = join(process.cwd(), 'node_modules', '@huggingface', 'transformers', 'dist');
  for (const f of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) {
    copyFileSync(join(dist, f), join(out, f));
  }
  console.log('[copy-ort-files] public/ort 준비 완료');
} catch (e) {
  console.warn('[copy-ort-files] 건너뜀:', e.message);
}
