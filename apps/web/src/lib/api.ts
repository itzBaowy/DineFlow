import { z } from 'zod';

export class ApiError extends Error { constructor(message: string, public readonly status: number) { super(message); } }
let refreshInFlight: Promise<void> | null = null;
async function refreshSession(): Promise<void> {
  if (!refreshInFlight) {
    refreshInFlight = fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-DineFlow-Client': 'web' }, body: '{}' })
      .then(response => { if (!response.ok) throw new ApiError('Phiên đăng nhập đã hết hạn', response.status); })
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}
export async function api<T>(path: string, schema: z.ZodType<T>, options: { method?: 'GET' | 'POST'; body?: unknown; refresh?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const init: RequestInit = { method, credentials: 'same-origin', cache: 'no-store', signal: options.signal, headers: { 'Content-Type': 'application/json', 'X-DineFlow-Client': 'web' }, ...(method === 'POST' ? { body: JSON.stringify(options.body ?? {}) } : {}) };
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, init);
    // Only retry reads. Mutations require an explicit user retry or business idempotency.
    if (response.status === 401 && method === 'GET' && options.refresh !== false) { await refreshSession(); response = await fetch(`/api/v1${path}`, init); }
  } catch (error) {
    if (error instanceof ApiError || (error instanceof Error && error.name === 'AbortError')) throw error;
    throw new ApiError('Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối và thử lại.', 0);
  }
  if (!response.ok) {
    const errorBody: unknown = await response.json().catch(() => null);
    const parsed = z.object({ message: z.string() }).safeParse(errorBody);
    throw new ApiError(parsed.success ? parsed.data.message : 'Không thể xử lý yêu cầu', response.status);
  }
  if (response.status === 204) return schema.parse(undefined);
  const result = schema.safeParse(await response.json());
  if (!result.success) throw new ApiError('Dữ liệu phản hồi không hợp lệ', 500);
  return result.data;
}
