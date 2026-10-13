// 스캔 PDF 글자 인식(OCR)에 필요한 파일을 public/ocr 폴더로 복사합니다.
// 외부 사이트에서 내려받지 않고 이 앱 주소에서 바로 불러오기 위함(오프라인·개인정보 보호).
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
try {
  const out = join(process.cwd(), 'public', 'ocr');
  if (!existsSync(out)) mkdirSync(out, { recursive: true });

  const workerDir = dirname(require.resolve('tesseract.js/package.json'));
  copyFileSync(join(workerDir, 'dist', 'worker.min.js'), join(out, 'worker.min.js'));

  const coreDir = dirname(require.resolve('tesseract.js-core/package.json'));
  for (const f of readdirSync(coreDir)) {
    if (/^tesseract-core.*lstm.*\.(js|wasm)$/.test(f)) copyFileSync(join(coreDir, f), join(out, f));
  }

  const langDir = join(dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');
  copyFileSync(join(langDir, 'eng.traineddata.gz'), join(out, 'eng.traineddata.gz'));
  console.log('[copy-ocr-files] public/ocr 준비 완료');
} catch (e) {
  console.warn('[copy-ocr-files] 건너뜀:', e.message);
}
