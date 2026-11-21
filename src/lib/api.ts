import { auth } from './firebase';

const ADMIN_TOKEN_STORAGE_KEY = 'keyai_admin_session_token';
const USER_TOKEN_STORAGE_KEY = 'keyai_user_session_token';

export function getStoredAdminToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredAdminToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restriction errors
  }
}

export function getStoredUserToken(): string | null {
  try {
    return sessionStorage.getItem(USER_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredUserToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(USER_TOKEN_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(USER_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restriction errors
  }
}

export async function getAuthToken(): Promise<string | null> {
  const adminToken = getStoredAdminToken();
  if (adminToken) {
    return adminToken;
  }
  const userToken = getStoredUserToken();
  if (userToken) {
    return userToken;
  }
  if (auth.currentUser) {
    return auth.currentUser.getIdToken();
  }
  return null;
}

export async function apiFetch<T>(
  url: string,
  options: RequestInit = {},
  explicitToken?: string
): Promise<T> {
  const token = explicitToken ?? (await getAuthToken());
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const text = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = { error: text || `Request failed with status ${response.status}` };
  }

  if (!response.ok) {
    const message =
      typeof data.error === 'string' && data.error
        ? data.error
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}
