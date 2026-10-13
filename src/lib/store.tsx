'use client';
// 앱 데이터 저장소
// 1) 기기 안(IndexedDB)에 먼저 저장 → 인터넷이 없어도 바로 반영
// 2) 연결되면 구글 드라이브(앱 전용 숨김 폴더)와 동기화
// 3) PC·휴대폰에서 같은 항목을 고쳤다면 "마지막으로 고친 쪽"을 남김

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type { AppData, DocAnalysisCache, DocContent, GrammarItem, LibraryDoc, SyncState, ViewPrefs, VocabItem } from './types';
import { readAppJson, writeAppJson, deleteAppFile, getDriveUser, DriveError } from './drive';
import { AuthRequiredError, connectGoogle, disconnectGoogle, hasValidToken, isConnectedBefore } from './google';
import { nowIso, errorMessage } from './util';

const APPDATA_FILE = 'appdata.json';
const LOCAL_KEY = 'appdata';

export const DEFAULT_PREFS: ViewPrefs = {
  hk: true,
  tr: true,
  focus: false,
  fontSize: 'm',
  newPerDay: 10,
  updatedAt: '1970-01-01T00:00:00.000Z',
};

function emptyData(): AppData {
  return { version: 1, library: {}, vocab: {}, grammar: {}, prefs: { ...DEFAULT_PREFS } };
}

function newer<T extends { updatedAt: string }>(a: T | undefined, b: T | undefined): T | undefined {
  if (!a) return b;
  if (!b) return a;
  return a.updatedAt >= b.updatedAt ? a : b;
}

function mergeRecords<T extends { updatedAt: string }>(a: Record<string, T>, b: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const v = newer(a[key], b[key]);
    if (v) out[key] = v;
  }
  return out;
}

export function mergeData(local: AppData, remote: AppData | null): AppData {
  if (!remote) return local;
  return {
    version: 1,
    library: mergeRecords(local.library, remote.library ?? {}),
    vocab: mergeRecords(local.vocab, remote.vocab ?? {}),
    grammar: mergeRecords(local.grammar ?? {}, remote.grammar ?? {}),
    prefs: newer(local.prefs, { ...DEFAULT_PREFS, ...(remote.prefs ?? {}) }) ?? local.prefs,
  };
}

function sameData(a: AppData, b: AppData): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* ---------- 문서 본문·분석 캐시 (문서마다 별도 파일) ---------- */

export async function loadDocContent(id: string): Promise<DocContent | null> {
  const local = await idbGet<DocContent>(`doc:${id}`);
  if (local) return local;
  if (!hasValidToken()) return null;
  const remote = await readAppJson<DocContent>(`doc-${id}.json`);
  if (remote) await idbSet(`doc:${id}`, remote);
  return remote;
}

/** 본문 저장: 기기에는 항상, 드라이브는 연결돼 있을 때만 (돌려주는 값: 드라이브 저장 여부) */
export async function saveDocContent(content: DocContent): Promise<boolean> {
  await idbSet(`doc:${content.id}`, content);
  if (!hasValidToken()) return false;
  await writeAppJson(`doc-${content.id}.json`, content);
  return true;
}

export async function loadAnalysis(id: string): Promise<DocAnalysisCache> {
  const empty: DocAnalysisCache = { id, sentences: {}, words: {} };
  const local = (await idbGet<DocAnalysisCache>(`ana:${id}`)) ?? empty;
  if (!hasValidToken()) return local;
  try {
    const remote = await readAppJson<DocAnalysisCache>(`ana-${id}.json`);
    if (!remote) return local;
    const merged: DocAnalysisCache = {
      id,
      sentences: { ...remote.sentences, ...local.sentences },
      words: { ...remote.words, ...local.words },
      grammar: { ...(remote.grammar ?? {}), ...(local.grammar ?? {}) },
    };
    await idbSet(`ana:${id}`, merged);
    return merged;
  } catch {
    return local;
  }
}

const analysisTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** 분석 결과는 자주 바뀌므로 기기에 바로 저장하고, 드라이브에는 몇 초 모았다가 올림 */
export async function saveAnalysis(cache: DocAnalysisCache): Promise<void> {
  await idbSet(`ana:${cache.id}`, cache);
  const prev = analysisTimers.get(cache.id);
  if (prev) clearTimeout(prev);
  analysisTimers.set(
    cache.id,
    setTimeout(() => {
      analysisTimers.delete(cache.id);
      if (hasValidToken()) writeAppJson(`ana-${cache.id}.json`, cache).catch(() => undefined);
    }, 4000)
  );
}

export async function removeDocFiles(id: string): Promise<void> {
  await idbDel(`doc:${id}`);
  await idbDel(`ana:${id}`);
  if (hasValidToken()) {
    await deleteAppFile(`doc-${id}.json`).catch(() => undefined);
    await deleteAppFile(`ana-${id}.json`).catch(() => undefined);
  }
}

/* ---------- React 컨텍스트 ---------- */

interface StoreValue {
  data: AppData;
  ready: boolean;
  sync: SyncState;
  syncError: string;
  lastSynced: string | null;
  userEmail: string;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  syncNow: () => Promise<void>;
  upsertDoc: (doc: LibraryDoc) => void;
  removeDoc: (id: string) => void;
  upsertVocab: (item: VocabItem) => void;
  removeVocab: (id: string) => void;
  upsertGrammar: (item: GrammarItem) => void;
  removeGrammar: (id: string) => void;
  setPrefs: (patch: Partial<Omit<ViewPrefs, 'updatedAt'>>) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncState>('signed-out');
  const [syncError, setSyncError] = useState('');
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const dataRef = useRef(data);
  const syncing = useRef(false);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback((next: AppData) => {
    dataRef.current = next;
    setData(next);
    idbSet(LOCAL_KEY, next).catch(() => undefined);
  }, []);

  const syncNow = useCallback(async () => {
    if (!hasValidToken()) {
      setSync(isConnectedBefore() ? 'auth-expired' : 'signed-out');
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSync('offline');
      return;
    }
    if (syncing.current) {
      pending.current = true;
      return;
    }
    syncing.current = true;
    setSync('syncing');
    try {
      const remote = await readAppJson<AppData>(APPDATA_FILE);
      const merged = mergeData(dataRef.current, remote);
      if (!remote || !sameData(merged, remote)) await writeAppJson(APPDATA_FILE, merged);
      if (!sameData(merged, dataRef.current)) commit(merged);
      setSync('idle');
      setSyncError('');
      setLastSynced(nowIso());
    } catch (e) {
      if (e instanceof AuthRequiredError) setSync('auth-expired');
      else if (e instanceof DriveError && e.status === 0) setSync('offline');
      else {
        setSync('error');
        setSyncError(errorMessage(e));
      }
    } finally {
      syncing.current = false;
      if (pending.current) {
        pending.current = false;
        setTimeout(() => void syncNow(), 500);
      }
    }
  }, [commit]);

  const scheduleSync = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void syncNow(), 2500);
  }, [syncNow]);

  const update = useCallback(
    (fn: (d: AppData) => AppData) => {
      commit(fn(dataRef.current));
      scheduleSync();
    },
    [commit, scheduleSync]
  );

  // 처음 열 때: 기기 저장본 → 드라이브 동기화
  useEffect(() => {
    let alive = true;
    (async () => {
      const local = await idbGet<AppData>(LOCAL_KEY).catch(() => undefined);
      if (!alive) return;
      if (local) {
        const fixed: AppData = { ...emptyData(), ...local, prefs: { ...DEFAULT_PREFS, ...local.prefs } };
        dataRef.current = fixed;
        setData(fixed);
      }
      setReady(true);
      if (hasValidToken()) {
        getDriveUser()
          .then((u) => alive && setUserEmail(u.email))
          .catch(() => undefined);
        void syncNow();
      } else {
        setSync(isConnectedBefore() ? 'auth-expired' : 'signed-out');
      }
    })();
    const onOnline = () => void syncNow();
    const onOffline = () => setSync('offline');
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncNow();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [syncNow]);

  // 글자 크기 설정을 화면 전체에 적용
  useEffect(() => {
    document.documentElement.dataset.fontSize = data.prefs.fontSize;
  }, [data.prefs.fontSize]);

  const connect = useCallback(async () => {
    await connectGoogle();
    try {
      const u = await getDriveUser();
      setUserEmail(u.email);
    } catch {
      /* 무시 */
    }
    await syncNow();
  }, [syncNow]);

  const disconnect = useCallback(async () => {
    await disconnectGoogle();
    setUserEmail('');
    setSync('signed-out');
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      data,
      ready,
      sync,
      syncError,
      lastSynced,
      userEmail,
      connect,
      disconnect,
      syncNow,
      upsertDoc: (doc) => update((d) => ({ ...d, library: { ...d.library, [doc.id]: { ...doc, updatedAt: nowIso() } } })),
      removeDoc: (id) =>
        update((d) => {
          const cur = d.library[id];
          if (!cur) return d;
          return { ...d, library: { ...d.library, [id]: { ...cur, deleted: true, updatedAt: nowIso() } } };
        }),
      upsertVocab: (item) => update((d) => ({ ...d, vocab: { ...d.vocab, [item.id]: { ...item, deleted: false, updatedAt: nowIso() } } })),
      removeVocab: (id) =>
        update((d) => {
          const cur = d.vocab[id];
          if (!cur) return d;
          return { ...d, vocab: { ...d.vocab, [id]: { ...cur, deleted: true, updatedAt: nowIso() } } };
        }),
      upsertGrammar: (item) => update((d) => ({ ...d, grammar: { ...(d.grammar ?? {}), [item.id]: { ...item, deleted: false, updatedAt: nowIso() } } })),
      removeGrammar: (id) =>
        update((d) => {
          const cur = d.grammar?.[id];
          if (!cur) return d;
          return { ...d, grammar: { ...d.grammar, [id]: { ...cur, deleted: true, updatedAt: nowIso() } } };
        }),
      setPrefs: (patch) => update((d) => ({ ...d, prefs: { ...d.prefs, ...patch, updatedAt: nowIso() } })),
    }),
    [data, ready, sync, syncError, lastSynced, userEmail, connect, disconnect, syncNow, update]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('StoreProvider 밖에서 useStore를 쓸 수 없어요.');
  return v;
}

/* ---------- 자주 쓰는 계산 ---------- */

export function activeDocs(data: AppData): LibraryDoc[] {
  return Object.values(data.library)
    .filter((d) => !d.deleted)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function activeVocab(data: AppData): VocabItem[] {
  return Object.values(data.vocab).filter((v) => !v.deleted);
}

export function activeGrammar(data: AppData): GrammarItem[] {
  return Object.values(data.grammar ?? {}).filter((g) => !g.deleted);
}
