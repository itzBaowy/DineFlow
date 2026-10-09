'use client';
import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  acceptedSchema,
  emailRequestSchema,
  resetPasswordSchema,
  accountTokenSchema,
} from '@dineflow/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/features/setup/shared';
import { Brand } from '@/components/brand';
function linkTokenStore() {
  let value = '',
    initialized = false;
  const listeners = new Set<() => void>();
  const read = () => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (token) {
      value = token;
      window.history.replaceState(null, '', window.location.pathname);
      listeners.forEach((listener) => listener());
    }
  };
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!initialized) {
        initialized = true;
        read();
      }
      window.addEventListener('hashchange', read);
      return () => {
        listeners.delete(listener);
        window.removeEventListener('hashchange', read);
      };
    },
    set: (token: string) => {
      value = token;
      listeners.forEach((listener) => listener());
    },
  };
}

export function RecoveryPage({ mode }: { mode: 'forgot' | 'verify' | 'reset' }) {
  const [link] = useState(linkTokenStore);
  const token = useSyncExternalStore(link.subscribe, link.getSnapshot, () => ''),
    setToken = link.set;
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [pending, setPending] = useState(false);
  const title =
    mode === 'forgot'
      ? 'Quên mật khẩu'
      : mode === 'reset'
        ? 'Đặt lại mật khẩu'
        : 'Xác minh email';
  return (
    <main className="mx-auto min-h-screen max-w-xl px-5 py-12">
      <Brand />
      <section className="mt-10 space-y-6 rounded-2xl border bg-white p-6 sm:p-9">
        <h1 className="editorial text-4xl text-primary">{title}</h1>
        <p className="text-sm leading-7 text-muted-foreground">
          {mode === 'forgot'
            ? 'Nhập email tài khoản. Nếu phù hợp, bạn sẽ nhận liên kết đặt lại mật khẩu.'
            : mode === 'reset'
              ? 'Chọn mật khẩu mới. Các phiên đăng nhập cũ sẽ kết thúc.'
              : 'Xác nhận quyền sở hữu email để bắt đầu sử dụng nhà hàng.'}
        </p>
        {notice && !token ? (
          <p role="status" className="rounded-xl bg-secondary p-4 text-sm leading-7">
            {notice}
          </p>
        ) : (
          <form
            className="space-y-5"
            noValidate
            onSubmit={async (event) => {
              event.preventDefault();
              setError('');
              let path: string, body: unknown;
              if (mode === 'forgot' || (mode === 'verify' && !token)) {
                const parsed = emailRequestSchema.safeParse({ email });
                if (!parsed.success) {
                  setError(parsed.error.issues[0]!.message);
                  return;
                }
                path =
                  mode === 'forgot' ? '/auth/forgot-password' : '/auth/request-verification';
                body = parsed.data;
              } else if (mode === 'verify') {
                const parsed = accountTokenSchema.safeParse({ token });
                if (!parsed.success) {
                  setError('Liên kết không hợp lệ. Yêu cầu gửi lại email.');
                  return;
                }
                path = '/auth/verify-email';
                body = parsed.data;
              } else {
                const parsed = resetPasswordSchema.safeParse({ token, password });
                if (!parsed.success) {
                  setError(parsed.error.issues[0]!.message);
                  return;
                }
                if (password !== confirmation) {
                  setError('Mật khẩu nhập lại không khớp');
                  return;
                }
                path = '/auth/reset-password';
                body = parsed.data;
              }
              setPending(true);
              try {
                await api(path, acceptedSchema, { method: 'POST', body, refresh: false });
                setPassword('');
                setConfirmation('');
                setToken('');
                setNotice(
                  path.endsWith('verify-email')
                    ? 'Email đã được xác minh. Bạn có thể đăng nhập.'
                    : path.endsWith('reset-password')
                      ? 'Đã đặt lại mật khẩu. Đăng nhập bằng mật khẩu mới.'
                      : 'Nếu tài khoản phù hợp, email sẽ được gửi. Kiểm tra hộp thư và thư rác.',
                );
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'Không thể xử lý yêu cầu');
              } finally {
                setPending(false);
              }
            }}
          >
            {(mode === 'forgot' || (mode === 'verify' && !token)) && (
              <Field label="Email đăng nhập">
                <Input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={pending}
                />
              </Field>
            )}
            {mode === 'reset' && (
              <>
                <Field label="Mật khẩu mới">
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={pending}
                  />
                </Field>
                <Field label="Nhập lại mật khẩu mới">
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    disabled={pending}
                  />
                </Field>
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button className="w-full" disabled={pending}>
              {pending
                ? 'Đang xử lý…'
                : mode === 'forgot'
                  ? 'Gửi liên kết đặt lại mật khẩu'
                  : mode === 'reset'
                    ? 'Đặt lại mật khẩu'
                    : token
                      ? 'Xác nhận email'
                      : 'Gửi lại email xác minh'}
            </Button>
          </form>
        )}
        <div className="flex flex-wrap gap-5 text-sm font-medium text-primary">
          {mode === 'verify' && token && (
            <button
              type="button"
              disabled={pending}
              className="underline"
              onClick={() => {
                setToken('');
                setError('');
              }}
            >
              Yêu cầu email xác minh mới
            </button>
          )}
          <Link href="/staff/login" className="underline">
            Đăng nhập nhà hàng
          </Link>
          <Link href="/platform/login" className="underline">
            Đăng nhập quản trị
          </Link>
          {mode === 'reset' && (
            <Link href="/forgot-password" className="underline">
              Yêu cầu liên kết mới
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
