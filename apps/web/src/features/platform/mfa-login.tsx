'use client';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  platformPrincipalSchema,
  platformLoginResultSchema,
  loginSchema,
  mfaCodeSchema,
  mfaSetupSchema,
} from '@dineflow/shared';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Field } from '@/features/setup/shared';
export function PlatformLogin() {
  const router = useRouter(),
    client = useQueryClient();
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false),
    [mfa, setMfa] = useState(false),
    [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        setError('');
        setPending(true);
        try {
          if (!mfa) {
            const parsed = loginSchema.safeParse({ email, password });
            if (!parsed.success) {
              setError(parsed.error.issues[0]!.message);
              return;
            }
            const result = await api('/platform/auth/login', platformLoginResultSchema, {
              method: 'POST',
              body: parsed.data,
              refresh: false,
            });
            setPassword('');
            if ('mfaRequired' in result) {
              setMfa(true);
              if (result.setupRequired) {
                const enrollment = await api('/platform/auth/mfa/setup', mfaSetupSchema, {
                  refresh: false,
                });
                setSetup({ secret: enrollment.secret, qr: enrollment.qr });
              }
              return;
            }
          }
          const parsed = mfaCodeSchema.safeParse({ code });
          if (!parsed.success) {
            setError(parsed.error.issues[0]!.message);
            return;
          }
          const principal = await api('/platform/auth/mfa/verify', platformPrincipalSchema, {
            method: 'POST',
            body: parsed.data,
            refresh: false,
          });
          setCode('');
          setSetup(null);
          client.removeQueries({ queryKey: ['platform'] });
          client.setQueryData(['platform', 'me'], principal);
          router.replace('/platform');
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Không thể đăng nhập');
        } finally {
          setPending(false);
        }
      }}
    >
      {!mfa ? (
        <>
          <Field label="Email quản trị">
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={pending}
            />
          </Field>
          <Field label="Mật khẩu quản trị">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={pending}
            />
          </Field>
        </>
      ) : (
        <>
          <div className="space-y-3 rounded-xl border bg-secondary p-4">
            <h2 className="font-semibold">
              {setup ? 'Thiết lập xác thực hai bước' : 'Xác thực hai bước'}
            </h2>
            <p className="text-xs leading-6">
              {setup
                ? 'Quét mã bằng ứng dụng Authenticator, lưu khóa an toàn rồi nhập mã để hoàn tất.'
                : 'Nhập mã từ ứng dụng Authenticator. Mỗi mã chỉ dùng một lần.'}
            </p>
            {setup && (
              <>
                <Image
                  src={setup.qr}
                  alt="Mã QR thiết lập Authenticator"
                  width={240}
                  height={240}
                  unoptimized
                  className="mx-auto h-auto max-w-full"
                />
                <p className="break-all font-mono text-xs" data-mfa-secret>
                  {setup.secret}
                </p>
              </>
            )}
          </div>
          <Field label="Mã xác thực">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value)}
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
        {pending ? 'Đang xác thực…' : mfa ? 'Xác nhận mã' : 'Vào quản trị nền tảng'}
      </Button>
      {mfa && (
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setMfa(false);
            setSetup(null);
            setCode('');
            setError('');
          }}
        >
          Đăng nhập lại
        </Button>
      )}
      <Link
        href="/forgot-password"
        className="block text-center text-xs text-primary underline"
      >
        Quên mật khẩu?
      </Link>
    </form>
  );
}
