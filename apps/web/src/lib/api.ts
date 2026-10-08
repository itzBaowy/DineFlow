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
async function refreshSession(): Promise<void> {
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
  const multipart = options.body instanceof FormData;
  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    signal: options.signal,
    headers: {
      ...(multipart ? {} : { 'Content-Type': 'application/json' }),
      'X-DineFlow-Client': 'web',
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
  let response = await fetch(`/api/v1${path}`, { credentials: 'same-origin', cache: 'no-store' });
  if (response.status === 401) {
    await refreshSession();
    response = await fetch(`/api/v1${path}`, { credentials: 'same-origin', cache: 'no-store' });
  }
  if (!response.ok) throw new ApiError('Không thể tải mã QR. Vui lòng thử lại.', response.status);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
