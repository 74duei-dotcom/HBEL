// 논문 PDF 첫머리에서 DOI를 찾아 Crossref(무료·키 불필요)에서 제목·저널·연도를 가져옴
// 보내는 정보는 DOI 하나뿐이며, 실패하면 조용히 넘어감
import type { DocContent } from './types';

export interface PaperMeta {
  doi: string;
  title?: string;
  authors?: string;
  journal?: string;
  year?: number;
}

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"<>]+)/i;

export function findDoi(pages: DocContent['pages']): string | null {
  for (const p of pages.slice(0, 2)) {
    for (const s of p.sentences) {
      const m = DOI_RE.exec(s);
      if (m) return m[1].replace(/[.,;:)\]]+$/, '');
    }
  }
  return null;
}

interface CrossrefWork {
  title?: string[];
  author?: { family?: string; given?: string }[];
  'container-title'?: string[];
  issued?: { 'date-parts'?: number[][] };
}

export async function fetchPaperMeta(doi: string): Promise<PaperMeta | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const w = ((await res.json()) as { message?: CrossrefWork }).message;
    if (!w) return null;
    const names = (w.author ?? []).map((a) => a.family).filter((x): x is string => !!x);
    return {
      doi,
      title: w.title?.[0]?.replace(/<[^>]+>/g, '').trim() || undefined,
      authors: names.length ? (names.length > 3 ? `${names.slice(0, 3).join(', ')} 외` : names.join(', ')) : undefined,
      journal: w['container-title']?.[0] || undefined,
      year: w.issued?.['date-parts']?.[0]?.[0],
    };
  } catch {
    return null;
  }
}
