import { z } from 'zod';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
let refreshInFlight: Promise<void> | null = null;
let staffRestaurantId: string | null = null;
let staffUserId: string | null = null;
let staffTransition = false;
export function bindStaffRestaurant(id: string, userId: string) {
  staffRestaurantId = id;
  staffUserId = userId;
}
export function clearStaffDrafts(userId: string) {
  try {
    for (const storage of [sessionStorage, localStorage])
      for (const key of Object.keys(storage))
        if (key.startsWith(`dineflow:cart:staff:${userId}:`)) storage.removeItem(key);
  } catch {
    /* Storage can be disabled; in-memory drafts are discarded on reload. */
  }
}
const staffPath = (path: string) =>
  !path.startsWith('/public/') &&
  !path.startsWith('/platform/') &&
  !path.startsWith('/health/') &&
  ![
    '/auth/login',
    '/auth/register',
    '/auth/registration-settings',
    '/auth/forgot-password',
    '/auth/request-verification',
    '/auth/verify-email',
    '/auth/reset-password',
  ].includes(path);
export async function beginStaffTransition() {
  staffTransition = true;
  window.dispatchEvent(new Event('dineflow:transition'));
  await refreshInFlight?.catch(() => undefined);
}
export function endStaffTransition(message: string) {
  staffTransition = false;
  window.dispatchEvent(new CustomEvent('dineflow:transition-end', { detail: message }));
}
export function reloadStaffWorkspace() {
  try {
    localStorage.setItem('dineflow:staff-scope-change', crypto.randomUUID());
  } catch {
    /* Scope header also protects tabs without storage. */
  }
  window.location.replace('/staff/dashboard');
}
async function refreshSession(): Promise<void> {
  if (staffTransition) throw new DOMException('Đang chuyển nhà hàng', 'AbortError');
  if (!refreshInFlight) {
    refreshInFlight = fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-DineFlow-Client': 'web' },
      body: '{}',
    })
      .then((response) => {
        if (!response.ok) throw new ApiError('Phiên đăng nhập đã hết hạn', response.status);
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}
export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    refresh?: boolean;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  if (staffTransition && staffPath(path) && path !== '/auth/switch-restaurant')
    throw new DOMException('Đang chuyển nhà hàng', 'AbortError');
  const multipart = options.body instanceof FormData;
  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    signal: options.signal,
    headers: {
      ...(multipart ? {} : { 'Content-Type': 'application/json' }),
      'X-DineFlow-Client': 'web',
      ...(staffRestaurantId && staffPath(path)
        ? { 'X-DineFlow-Restaurant': staffRestaurantId }
        : {}),
    },
    ...(method !== 'GET'
      ? { body: multipart ? (options.body as FormData) : JSON.stringify(options.body ?? {}) }
      : {}),
  };
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, init);
    // Only retry reads. Mutations require an explicit user retry or business idempotency.
    if (response.status === 401 && method === 'GET' && options.refresh !== false) {
      await refreshSession();
      response = await fetch(`/api/v1${path}`, init);
    }
  } catch (error) {
    if (error instanceof ApiError || (error instanceof Error && error.name === 'AbortError'))
      throw error;
    throw new ApiError('Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối và thử lại.', 0);
  }
  if (!response.ok) {
    if (response.headers.get('X-DineFlow-Scope-Mismatch') === '1') {
      if (staffUserId) clearStaffDrafts(staffUserId);
      window.location.replace('/staff/dashboard');
      throw new DOMException('Nhà hàng đã thay đổi', 'AbortError');
    }
    const errorBody: unknown = await response.json().catch(() => null);
    const parsed = z.object({ message: z.string() }).safeParse(errorBody);
    const issues = z
      .object({ issues: z.array(z.object({ message: z.string() })) })
      .safeParse(errorBody);
    const message =
      issues.success && issues.data.issues.length
        ? issues.data.issues.map((issue) => issue.message).join('. ')
        : parsed.success
          ? parsed.data.message
          : 'Không thể xử lý yêu cầu';
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return schema.parse(undefined);
  const result = schema.safeParse(await response.json());
  if (!result.success) throw new ApiError('Dữ liệu phản hồi không hợp lệ', 500);
  return result.data;
}

export async function downloadFile(path: string, filename: string): Promise<void> {
  if (staffTransition) throw new DOMException('Đang chuyển nhà hàng', 'AbortError');
  const init: RequestInit = {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: staffRestaurantId ? { 'X-DineFlow-Restaurant': staffRestaurantId } : {},
  };
  let response = await fetch(`/api/v1${path}`, init);
  if (response.status === 401) {
    await refreshSession();
    response = await fetch(`/api/v1${path}`, init);
  }
  if (!response.ok)
    throw new ApiError('Không thể tải mã QR. Vui lòng thử lại.', response.status);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
