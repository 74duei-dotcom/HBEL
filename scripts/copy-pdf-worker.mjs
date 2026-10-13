// pdf.js 작업자(worker) 파일을 public 폴더로 복사합니다.
// 정적 내보내기(output: 'export')에서도 브라우저가 /pdf.worker.min.mjs 로 불러올 수 있게 하기 위함입니다.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
try {
  const pkgDir = dirname(require.resolve('pdfjs-dist/package.json'));
  const candidates = ['build/pdf.worker.min.mjs', 'build/pdf.worker.mjs'];
  const src = candidates.map((c) => join(pkgDir, c)).find((p) => existsSync(p));
  if (!src) throw new Error('pdf.worker 파일을 찾지 못했습니다.');
  const outDir = join(process.cwd(), 'public');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  copyFileSync(src, join(outDir, 'pdf.worker.min.mjs'));
  console.log('[copy-pdf-worker] public/pdf.worker.min.mjs 준비 완료');
} catch (e) {
  console.warn('[copy-pdf-worker] 건너뜀:', e.message);
}
