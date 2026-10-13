'use client';
// PDF에서 글자를 뽑아 쪽별 문장 목록으로 만듭니다 (pdf.js 사용, 모두 기기 안에서 처리)

import type { DocContent } from './types';
import { withBase } from './config';

export interface ExtractResult {
  pages: DocContent['pages'];
  pageCount: number;
  sentenceCount: number;
  scanned: boolean; // 글자가 거의 없으면 스캔본으로 판단
  ocrPages: number; // 글자 인식(OCR)으로 읽은 쪽 수
}

export interface ExtractOptions {
  /** 글자가 없는 쪽을 이미지로 그려 글자 인식(OCR)할지 */
  ocr?: boolean;
  onProgress?: (done: number, total: number, phase: 'text' | 'ocr') => void;
}

/** 이 글자 수보다 적은 쪽은 스캔 이미지로 보고 글자 인식 대상으로 삼음 */
const OCR_MIN_CHARS = 40;

type PdfPage = import('pdfjs-dist').PDFPageProxy;

type OcrWorker = { recognize: (img: HTMLCanvasElement) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> };

async function createOcrWorker(): Promise<OcrWorker> {
  const { createWorker } = await import('tesseract.js');
  // 파일은 모두 이 앱 주소(public/ocr)에서 불러옴
  return (await createWorker('eng', 1, {
    workerPath: withBase('/ocr/worker.min.js'),
    corePath: withBase('/ocr'),
    langPath: withBase('/ocr'),
    gzip: true,
  })) as unknown as OcrWorker;
}

/** 쪽을 그림으로 그려 글자를 읽음 */
async function ocrPage(
  page: PdfPage,
  worker: OcrWorker,
): Promise<string[]> {
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지를 그릴 수 없어요.');
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  const { data } = await worker.recognize(canvas);
  canvas.width = canvas.height = 0; // 메모리 바로 반환
  return data.text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => /[A-Za-z0-9]/.test(l));
}

type TextItem = { str: string; hasEOL?: boolean; transform?: number[] };

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = withBase('/pdf.worker.min.mjs');
  return pdfjs;
}

/** 쪽 하나의 글자 조각을 줄 단위로 모음 */
function itemsToLines(items: TextItem[]): string[] {
  const lines: string[] = [];
  let cur = '';
  let lastY: number | null = null;
  for (const it of items) {
    const y = it.transform ? it.transform[5] : null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && cur.trim()) {
      lines.push(cur);
      cur = '';
    }
    cur += it.str;
    if (it.hasEOL) {
      lines.push(cur);
      cur = '';
    }
    lastY = y;
  }
  if (cur.trim()) lines.push(cur);
  return lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function normalizeForRepeat(line: string): string {
  return line.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
}

/** 줄 끝 하이픈으로 끊긴 단어를 붙이고 줄들을 하나의 글로 합침 */
function joinLines(lines: string[]): string {
  let text = '';
  for (const line of lines) {
    if (!text) {
      text = line;
    } else if (/[A-Za-z]-$/.test(text) && /^[a-z]/.test(line)) {
      text = text.slice(0, -1) + line;
    } else {
      text += ' ' + line;
    }
  }
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 제목·소제목처럼 짧고 문장부호로 끝나지 않는 줄은 앞뒤 문장과 붙지 않게 따로 떼어냄
 * 예) "Abstract", "2. Methods", 논문 제목 줄
 */
function isHeadingLine(line: string, next: string | undefined): boolean {
  if (line.length > 90) return false;
  if (/[.,;:?!)\-–]$/.test(line)) return false;
  if (/^(abstract|introduction|background|methods?|materials and methods|results|discussion|conclusions?|references|keywords?)\b/i.test(line)) return true;
  if (!next) return false;
  // 다음 줄이 대문자로 시작하고, 지금 줄이 짧으면 제목으로 봄
  return /^[A-Z0-9]/.test(next) && line.length < 70 && line.split(' ').length <= 12;
}

function paragraphs(lines: string[]): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  lines.forEach((line, i) => {
    if (isHeadingLine(line, lines[i + 1])) {
      if (cur.length) out.push(cur);
      out.push([line]);
      cur = [];
    } else {
      cur.push(line);
    }
  });
  if (cur.length) out.push(cur);
  return out;
}

const ABBREV = /\b(e\.g|i\.e|et al|Fig|Figs|vs|Dr|Mr|Mrs|Ms|No|approx|cf|etc|al)\.$/i;

/** 문장 나누기: 브라우저의 Intl.Segmenter 사용, 약어(e.g., et al.) 뒤에서는 끊지 않음 */
export function splitSentences(text: string): string[] {
  if (!text) return [];
  let parts: string[];
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter('en', { granularity: 'sentence' });
    parts = Array.from(seg.segment(text), (s) => s.segment.trim());
  } else {
    parts = text.split(/(?<=[.!?])\s+(?=[A-Z(])/).map((s) => s.trim());
  }
  const merged: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    const prev = merged[merged.length - 1];
    if (prev && (ABBREV.test(prev) || /^[a-z(]/.test(p) || prev.length < 4)) {
      merged[merged.length - 1] = prev + ' ' + p;
    } else {
      merged.push(p);
    }
  }
  // 너무 긴 문장(표 등)은 읽기 좋게 자름
  return merged.flatMap((s) => (s.length > 600 ? s.match(/.{1,400}(\s|$)/g)?.map((x) => x.trim()) ?? [s] : [s])).filter((s) => /[A-Za-z]/.test(s));
}

export async function extractPdf(data: ArrayBuffer, opts: ExtractOptions = {}): Promise<ExtractResult> {
  const { ocr = false, onProgress } = opts;
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const pageCount = doc.numPages;
  const pageLines: string[][] = [];
  let totalChars = 0;

  for (let p = 1; p <= pageCount; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const lines = itemsToLines(content.items as TextItem[]);
    totalChars += lines.join('').length;
    pageLines.push(lines);
    page.cleanup();
    onProgress?.(p, pageCount, 'text');
  }

  // 글자가 없는 쪽(스캔 이미지)은 글자 인식(OCR)으로 채움
  let ocrPages = 0;
  const blank = ocr ? pageLines.map((l, i) => (l.join('').length < OCR_MIN_CHARS ? i : -1)).filter((i) => i >= 0) : [];
  if (blank.length) {
    const worker = await createOcrWorker();
    try {
      let n = 0;
      for (const i of blank) {
        const page = await doc.getPage(i + 1);
        const lines = await ocrPage(page, worker);
        page.cleanup();
        pageLines[i] = lines;
        totalChars += lines.join('').length;
        ocrPages++;
        onProgress?.(++n, blank.length, 'ocr');
      }
    } finally {
      await worker.terminate();
    }
  }
  await doc.destroy();

  // 여러 쪽에 반복되는 머리말·꼬리말(학술지 이름, 쪽 번호 등) 제거
  const counts = new Map<string, number>();
  for (const lines of pageLines) {
    const uniq = new Set([...lines.slice(0, 3), ...lines.slice(-3)].map(normalizeForRepeat));
    for (const l of uniq) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  const threshold = Math.max(2, Math.ceil(pageCount * 0.5));
  const repeated = new Set([...counts.entries()].filter(([l, c]) => pageCount >= 2 && c >= threshold && l.length < 120).map(([l]) => l));

  const pages = pageLines.map((lines) => {
    const body = lines.filter((l) => !repeated.has(normalizeForRepeat(l)) && !/^#?\s*\d{1,4}\s*$/.test(l));
    return { sentences: paragraphs(body).flatMap((para) => splitSentences(joinLines(para))) };
  });

  const sentenceCount = pages.reduce((n, pg) => n + pg.sentences.length, 0);
  const scanned = totalChars < pageCount * 80;
  return { pages, pageCount, sentenceCount, scanned, ocrPages };
}

/** PDF 첫 줄들로 제목 짐작 (실패하면 파일 이름) */
export function guessTitle(pages: DocContent['pages'], fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
  // 첫 쪽 앞부분에서 학술지 이름·DOI·날짜가 아닌, 적당한 길이의 첫 줄을 제목으로
  const candidates = (pages[0]?.sentences ?? []).slice(0, 6);
  const skip = /^(abstract|journal|vol\.?|volume|doi|https?:|www\.|received|accepted|published|copyright|©|issn|original (article|research)|review article|research article)/i;
  const title = candidates.find((s) => s.length >= 15 && s.length <= 160 && !skip.test(s) && !/\b(19|20)\d{2}\s*$/.test(s));
  if (title) return title.replace(/[.\s]+$/, '');
  return base || '제목 없는 문서';
}
