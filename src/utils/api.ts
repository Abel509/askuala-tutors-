import type {
  MatchRecord,
  ParentApplication,
  TutorApplication,
  UserAccount,
  UserRole,
} from '../types/app';
import {
  ensureSampleStandalonePdf,
  loadStandalonePdfBytes,
  standaloneApi,
} from './standaloneStore';

const TOKEN_STORAGE_KEY = 'askuala_session_token';

export function isStandaloneFileMode(): boolean {
  return window.location.protocol === 'file:';
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface AuthResponse {
  token?: string;
  user: UserAccount;
  tutorApplication: TutorApplication | null;
  parentApplication: ParentApplication | null;
}

export async function registerAccount(payload: {
  phone: string;
  password: string;
  role: UserRole;
  fullName?: string;
}): Promise<AuthResponse> {
  if (isStandaloneFileMode()) {
    const res = standaloneApi.register(payload);
    setStoredToken(res.token);
    return res;
  }
  const res = await request<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (res.token) setStoredToken(res.token);
  return res;
}

export async function loginAccount(payload: {
  phone: string;
  password: string;
}): Promise<AuthResponse> {
  if (isStandaloneFileMode()) {
    const res = standaloneApi.login(payload);
    setStoredToken(res.token);
    return res;
  }
  const res = await request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (res.token) setStoredToken(res.token);
  return res;
}

export async function fetchCurrentSession(): Promise<AuthResponse | null> {
  if (isStandaloneFileMode()) {
    return standaloneApi.me();
  }
  if (!getStoredToken()) return null;
  try {
    return await request<AuthResponse>('/api/auth/me');
  } catch {
    setStoredToken(null);
    return null;
  }
}

export async function logoutAccount(): Promise<void> {
  if (isStandaloneFileMode()) {
    standaloneApi.logout();
    setStoredToken(null);
    return;
  }
  try {
    await request('/api/auth/logout', { method: 'POST' });
  } finally {
    setStoredToken(null);
  }
}

export async function uploadPdfFile(
  filename: string,
  bytes: Uint8Array
): Promise<{
  fileId: string;
  filename: string;
  pageCount: number;
  sizeBytes: number;
}> {
  if (isStandaloneFileMode()) {
    return standaloneApi.uploadPdf(filename, bytes);
  }
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  const base64Data = btoa(binary);
  return request('/api/uploads/pdf', {
    method: 'POST',
    body: JSON.stringify({ filename, base64Data }),
  });
}

export async function getPdfBytes(fileId: string): Promise<Uint8Array | null> {
  if (isStandaloneFileMode()) {
    return (await loadStandalonePdfBytes(fileId)) || (await ensureSampleStandalonePdf(fileId));
  }
  const res = await fetch(`/api/uploads/pdf/${fileId}`);
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

export async function resolvePdfViewUrl(fileId: string): Promise<string | null> {
  if (!isStandaloneFileMode()) {
    return `/api/uploads/pdf/${fileId}`;
  }
  const bytes = await getPdfBytes(fileId);
  if (!bytes) return null;
  return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
}

export async function saveTutorApplication(
  payload: Partial<TutorApplication> & { submit?: boolean }
): Promise<{ application: TutorApplication }> {
  if (isStandaloneFileMode()) {
    return standaloneApi.saveTutorApp(payload);
  }
  return request('/api/tutor/application', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function saveParentApplication(
  payload: Partial<ParentApplication> & { submit?: boolean }
): Promise<{ application: ParentApplication }> {
  if (isStandaloneFileMode()) {
    return standaloneApi.saveParentApp(payload);
  }
  return request('/api/parent/application', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface ExtendedMatch extends MatchRecord {
  tutorVerified?: boolean;
  tutorExperience?: string;
  tutorSex?: string;
  kidsCount?: number;
  kidsGrades?: string[];
}

export async function fetchMyMatches(): Promise<{
  matches: ExtendedMatch[];
  application: TutorApplication | ParentApplication | null;
}> {
  if (isStandaloneFileMode()) {
    return standaloneApi.myMatches();
  }
  return request('/api/matches/mine');
}

export async function actOnMatch(
  matchId: string,
  status: MatchRecord['status']
): Promise<{ match: MatchRecord }> {
  if (isStandaloneFileMode()) {
    return standaloneApi.actOnMatch(matchId, status);
  }
  return request(`/api/matches/${matchId}/action`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

export async function fetchAdminOverview(): Promise<{
  tutors: TutorApplication[];
  parents: ParentApplication[];
  matches: MatchRecord[];
}> {
  if (isStandaloneFileMode()) {
    return standaloneApi.adminOverview();
  }
  return request('/api/admin/overview');
}

export async function updateTutorAdminStatus(
  tutorId: string,
  status: TutorApplication['status']
): Promise<{ tutor: TutorApplication; matches: MatchRecord[] }> {
  if (isStandaloneFileMode()) {
    return standaloneApi.updateTutorStatus(tutorId, status);
  }
  return request(`/api/admin/tutors/${tutorId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

export async function createAdminMatch(
  parentAppId: string,
  tutorAppId: string
): Promise<{ match: MatchRecord }> {
  if (isStandaloneFileMode()) {
    return standaloneApi.createAdminMatch(parentAppId, tutorAppId);
  }
  return request('/api/admin/matches/create', {
    method: 'POST',
    body: JSON.stringify({ parentAppId, tutorAppId }),
  });
}

export async function unlockOwnerWithPasscode(passcode: string): Promise<AuthResponse> {
  if (isStandaloneFileMode()) {
    const res = standaloneApi.unlockOwner(passcode);
    setStoredToken(res.token);
    return res;
  }
  const res = await request<AuthResponse>('/api/admin/unlock', {
    method: 'POST',
    body: JSON.stringify({ passcode }),
  });
  if (res.token) setStoredToken(res.token);
  return res;
}

export async function changeOwnerPasscode(
  currentPasscode: string,
  newPasscode: string
): Promise<{ ok: boolean }> {
  if (isStandaloneFileMode()) {
    return standaloneApi.changeOwnerPasscode(currentPasscode, newPasscode);
  }
  return request('/api/admin/change-passcode', {
    method: 'POST',
    body: JSON.stringify({ currentPasscode, newPasscode }),
  });
}
