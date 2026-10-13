'use client';
// 구글 드라이브 REST API 도우미
// - 원본 파일(PDF·영상): 내 드라이브 > 영어서재 폴더
// - 학습 데이터(JSON): 앱 전용 숨김 폴더(appDataFolder) - 사용자 드라이브 목록에는 보이지 않음

import { AuthRequiredError, getToken, invalidateToken, loadGis } from './google';
import { DRIVE_FOLDER_NAME, GOOGLE_API_KEY, GOOGLE_PROJECT_NUMBER } from './config';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export class DriveError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'DriveError';
    this.status = status;
  }
}

async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  } catch {
    throw new DriveError('인터넷 연결이 끊겨 드라이브에 접근하지 못했어요.', 0);
  }
  if (res.status === 401) {
    invalidateToken();
    throw new AuthRequiredError('구글 연결 시간이 끝났어요. "다시 연결"을 눌러 주세요.');
  }
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.error?.message ?? '';
    } catch {
      /* 무시 */
    }
    if (res.status === 403 && /storage|quota/i.test(detail)) throw new DriveError('구글 드라이브 저장 공간이 부족해요.', 403);
    throw new DriveError(`드라이브 오류(${res.status}) ${detail}`.trim(), res.status);
  }
  return res;
}

function q(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

interface DriveFileMeta {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
}

/* ---------- 사용자 정보 ---------- */

export async function getDriveUser(): Promise<{ email: string; name: string }> {
  const res = await driveFetch(`${API}/about?fields=user(emailAddress,displayName)`);
  const j = await res.json();
  return { email: j.user?.emailAddress ?? '', name: j.user?.displayName ?? '' };
}

/* ---------- 영어서재 폴더 ---------- */

let folderIdCache: string | null = null;

export async function ensureFolder(): Promise<string> {
  if (folderIdCache) return folderIdCache;
  const query = `name='${q(DRIVE_FOLDER_NAME)}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
  const res = await driveFetch(`${API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`);
  const j = await res.json();
  if (j.files?.length) {
    folderIdCache = j.files[0].id as string;
    return folderIdCache;
  }
  const created = await driveFetch(`${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', parents: ['root'] }),
  });
  folderIdCache = (await created.json()).id as string;
  return folderIdCache;
}

/* ---------- 큰 파일 올리기(이어올리기 방식, 진행률 표시) ---------- */

export async function uploadFile(
  file: Blob,
  name: string,
  mimeType: string,
  onProgress?: (ratio: number) => void
): Promise<DriveFileMeta> {
  const folderId = await ensureFolder();
  const token = getToken();
  const init = await driveFetch(`${UPLOAD}/files?uploadType=resumable&fields=id,name,webViewLink`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': String(file.size),
    },
    body: JSON.stringify({ name, mimeType, parents: [folderId] }),
  });
  const location = init.headers.get('Location');
  if (!location) throw new DriveError('드라이브 업로드 주소를 받지 못했어요.', 0);

  return new Promise<DriveFileMeta>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', location);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', mimeType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as DriveFileMeta);
        } catch {
          reject(new DriveError('업로드 결과를 읽지 못했어요.', xhr.status));
        }
      } else if (xhr.status === 401) {
        invalidateToken();
        reject(new AuthRequiredError());
      } else {
        reject(new DriveError(`드라이브 업로드 실패(${xhr.status})`, xhr.status));
      }
    };
    xhr.onerror = () => reject(new DriveError('업로드 중 인터넷 연결이 끊겼어요.', 0));
    xhr.send(file);
  });
}

export async function downloadFile(fileId: string): Promise<ArrayBuffer> {
  const res = await driveFetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media`);
  return res.arrayBuffer();
}

export async function getFileMeta(fileId: string): Promise<DriveFileMeta> {
  const res = await driveFetch(`${API}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,webViewLink`);
  return res.json();
}

export async function trashFile(fileId: string): Promise<void> {
  await driveFetch(`${API}/files/${encodeURIComponent(fileId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
}

export function driveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

/* ---------- 앱 전용 숨김 폴더의 JSON 파일 ---------- */

const appFileIds = new Map<string, string>();

async function findAppFile(name: string): Promise<DriveFileMeta | null> {
  const query = `name='${q(name)}' and trashed=false`;
  const res = await driveFetch(`${API}/files?spaces=appDataFolder&q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)`);
  const j = await res.json();
  const f = (j.files?.[0] as DriveFileMeta | undefined) ?? null;
  if (f) appFileIds.set(name, f.id);
  return f;
}

export async function readAppJson<T>(name: string): Promise<T | null> {
  let id = appFileIds.get(name);
  if (!id) {
    const f = await findAppFile(name);
    if (!f) return null;
    id = f.id;
  }
  try {
    const res = await driveFetch(`${API}/files/${encodeURIComponent(id)}?alt=media`);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof DriveError && e.status === 404) {
      appFileIds.delete(name);
      return null;
    }
    throw e;
  }
}

export async function writeAppJson(name: string, data: unknown): Promise<void> {
  const body = JSON.stringify(data);
  let id = appFileIds.get(name);
  if (!id) {
    const f = await findAppFile(name);
    id = f?.id;
  }
  if (id) {
    try {
      await driveFetch(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      return;
    } catch (e) {
      if (!(e instanceof DriveError && e.status === 404)) throw e;
      appFileIds.delete(name);
    }
  }
  const boundary = 'el' + Math.random().toString(36).slice(2);
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name, parents: ['appDataFolder'] }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    body +
    `\r\n--${boundary}--`;
  const res = await driveFetch(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  appFileIds.set(name, (await res.json()).id);
}

export async function deleteAppFile(name: string): Promise<void> {
  const f = appFileIds.get(name) ?? (await findAppFile(name))?.id;
  if (!f) return;
  await driveFetch(`${API}/files/${encodeURIComponent(f)}`, { method: 'DELETE' });
  appFileIds.delete(name);
}

/* ---------- 구글 드라이브에서 파일 고르기(Picker) ---------- */

let pickerPromise: Promise<void> | null = null;

function loadPicker(): Promise<void> {
  if (!pickerPromise) {
    pickerPromise = new Promise<void>((resolve, reject) => {
      const done = () => window.gapi.load('picker', { callback: () => resolve(), onerror: () => reject(new Error('파일 고르기 창을 불러오지 못했어요.')) });
      if (window.gapi) {
        done();
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://apis.google.com/js/api.js';
      s.async = true;
      s.onload = done;
      s.onerror = () => reject(new Error('구글 API 스크립트를 불러오지 못했어요.'));
      document.head.appendChild(s);
    });
    pickerPromise.catch(() => {
      pickerPromise = null;
    });
  }
  return pickerPromise;
}

export interface PickedFile {
  id: string;
  name: string;
  mimeType: string;
}

/** 드라이브에 이미 있는 PDF를 골라 이 앱에서 쓸 수 있게 허용받습니다 */
export async function pickFromDrive(): Promise<PickedFile[]> {
  if (!GOOGLE_API_KEY || !GOOGLE_PROJECT_NUMBER) {
    throw new Error('드라이브 파일 고르기에 필요한 API 키·프로젝트 번호가 .env.local에 없어요.');
  }
  const token = getToken();
  await loadGis();
  await loadPicker();
  const g = window.google;
  return new Promise<PickedFile[]>((resolve) => {
    const view = new g.picker.DocsView(g.picker.ViewId.DOCS).setMimeTypes('application/pdf').setIncludeFolders(true).setSelectFolderEnabled(false);
    const picker = new g.picker.PickerBuilder()
      .addView(view)
      .enableFeature(g.picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(token)
      .setDeveloperKey(GOOGLE_API_KEY)
      .setAppId(GOOGLE_PROJECT_NUMBER)
      .setLocale('ko')
      .setTitle('영어 서재에서 쓸 PDF 고르기')
      .setCallback((data: { action: string; docs?: { id: string; name: string; mimeType: string }[] }) => {
        if (data.action === g.picker.Action.PICKED) {
          resolve((data.docs ?? []).map((d) => ({ id: d.id, name: d.name, mimeType: d.mimeType })));
        } else if (data.action === g.picker.Action.CANCEL) {
          resolve([]);
        }
      })
      .build();
    picker.setVisible(true);
  });
}
