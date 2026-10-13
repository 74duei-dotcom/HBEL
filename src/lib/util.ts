// 작은 도구 함수 모음

export function nowIso(): string {
  return new Date().toISOString();
}

export function uid(prefix = ''): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix + rnd.replace(/-/g, '').slice(0, 16);
}

/** localStorage 안전하게 읽기/쓰기 (사생활 보호 모드 등에서 오류가 나도 앱이 멈추지 않게) */
export function lsGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function lsSet(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* 무시 */
  }
}

/** 단어에서 앞뒤 문장부호를 떼어냄 */
export function cleanWord(raw: string): string {
  return raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
}

/** 영어 문장을 화면 표시용 토큰(공백 기준)으로 나눔 */
export function tokenize(sentence: string): string[] {
  return sentence.split(/\s+/).filter(Boolean);
}

/** 강세 표시 "익스*텐*션" → [{t:'익스'},{t:'텐',strong:true},{t:'션'}] */
export function stressSegments(s: string): { t: string; strong: boolean }[] {
  if (!s) return [];
  return s
    .split('*')
    .map((t, i) => ({ t, strong: i % 2 === 1 }))
    .filter((g) => g.t !== '');
}

export function formatInterval(from: Date, to: Date): string {
  const min = Math.max(1, Math.round((to.getTime() - from.getTime()) / 60000));
  if (min < 60) return `${min}분`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours}시간`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days}일`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}달`;
  return `${(days / 365).toFixed(1)}년`;
}

export function relativeDue(dueIso: string): string {
  const due = new Date(dueIso);
  const now = new Date();
  if (due.getTime() <= now.getTime()) return '오늘';
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(due) - startOfDay(now)) / 86400000);
  if (dayDiff === 0) {
    const min = Math.round((due.getTime() - now.getTime()) / 60000);
    return min < 60 ? `${Math.max(1, min)}분 후` : `${Math.round(min / 60)}시간 후`;
  }
  if (dayDiff === 1) return '내일';
  return `${dayDiff}일 후`;
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = () => {
    if (t) {
      clearTimeout(t);
      t = undefined;
      fn(...([] as unknown as Parameters<T>));
    }
  };
  return wrapped;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
