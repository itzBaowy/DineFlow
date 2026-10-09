'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptedSchema,
  accountSecuritySchema,
  changePasswordSchema,
  type StaffPrincipal,
} from '@dineflow/shared';
import { KeyRound, MailCheck, ShieldCheck } from 'lucide-react';
import { api, clearStaffDrafts, reloadStaffWorkspace } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Field, QueryState } from '@/features/setup/shared';

export function AccountSecurity({ platform = false }: { platform?: boolean }) {
  const prefix = platform ? '/platform' : '/auth',
    client = useQueryClient(),
    staff = client.getQueryData<StaffPrincipal>(['auth', 'me']);
  const [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [sending, setSending] = useState(false),
    [saved, setSaved] = useState(false);
  const query = useQuery({
    queryKey: [platform ? 'platform' : 'auth', 'security'],
    queryFn: ({ signal }) =>
      api(`${prefix}/security`, accountSecuritySchema, { signal, refresh: !platform }),
  });
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-primary">Bảo mật tài khoản</p>
        <h1 className="editorial mt-3 text-4xl text-primary sm:text-5xl">
          An tâm trong mỗi phiên làm việc.
        </h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          {platform
            ? 'Bảo vệ quyền quản trị nền tảng bằng email, mật khẩu và ứng dụng Authenticator.'
            : 'Email và mật khẩu thuộc tài khoản của bạn, dùng chung cho các nhà hàng bạn tham gia.'}
        </p>
      </div>
      {saved ? (
        <Card className="space-y-4 p-6" role="status">
          <ShieldCheck />
          <h2 className="text-xl font-semibold">Đã đổi mật khẩu</h2>
          <p className="text-sm leading-7">
            Các phiên đăng nhập cũ đã kết thúc. Đăng nhập lại bằng mật khẩu mới.
          </p>
          <Button
            onClick={() => {
              if (staff) clearStaffDrafts(staff.userId);
              if (platform) window.location.replace('/platform/login');
              else reloadStaffWorkspace();
            }}
          >
            Đăng nhập lại
          </Button>
        </Card>
      ) : (
        <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
          <Card className="space-y-4 p-6">
            <MailCheck className="text-primary" />
            <h2 className="text-xl font-semibold">Email đăng nhập</h2>
            <p className="break-all text-sm">{query.data?.email}</p>
            <p className="text-sm text-muted-foreground">
              {query.data?.emailVerified
                ? 'Đã xác minh email'
                : query.data?.verificationRequired
                  ? 'Email chưa xác minh'
                  : 'Email chưa xác minh. Bạn vẫn có thể sử dụng tài khoản.'}
            </p>
            {!query.data?.emailVerified && (
              <Button
                variant="outline"
                disabled={sending}
                onClick={async () => {
                  setError('');
                  setSending(true);
                  try {
                    await api('/auth/request-verification', acceptedSchema, {
                      method: 'POST',
                      body: { email: query.data!.email },
                      refresh: false,
                    });
                    setNotice(
                      'Nếu tài khoản phù hợp, email xác minh sẽ được gửi. Kiểm tra hộp thư của bạn.',
                    );
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : 'Không thể gửi yêu cầu');
                  } finally {
                    setSending(false);
                  }
                }}
              >
                Gửi email xác minh
              </Button>
            )}
            {notice && (
              <p role="status" className="text-sm leading-7">
                {notice}
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </Card>
          <Card className="space-y-4 p-6">
            <KeyRound className="text-primary" />
            <h2 className="text-xl font-semibold">Đổi mật khẩu</h2>
            <p className="text-xs leading-6 text-muted-foreground">
              Mật khẩu mới tối thiểu 12 ký tự. Mọi phiên của tài khoản sẽ kết thúc, kể cả tại
              nhà hàng khác.
            </p>
            <PasswordForm path={`${prefix}/change-password`} onSaved={() => setSaved(true)} />
          </Card>
        </QueryState>
      )}
      <Link
        href="/forgot-password"
        className="inline-flex min-h-12 items-center text-sm font-medium text-primary underline"
      >
        Quên mật khẩu?
      </Link>
    </div>
  );
}
function PasswordForm({ path, onSaved }: { path: string; onSaved: () => void }) {
  const [currentPassword, setCurrent] = useState(''),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        setError('');
        const parsed = changePasswordSchema.safeParse({ currentPassword, password });
        if (!parsed.success) {
          setError(parsed.error.issues[0]!.message);
          return;
        }
        if (password !== confirmation) {
          setError('Mật khẩu nhập lại không khớp');
          return;
        }
        setPending(true);
        try {
          await api(path, acceptedSchema, {
            method: 'POST',
            body: parsed.data,
            refresh: false,
          });
          setCurrent('');
          setPassword('');
          setConfirmation('');
          onSaved();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Không thể đổi mật khẩu');
        } finally {
          setPending(false);
        }
      }}
    >
      <Field label="Mật khẩu hiện tại">
        <Input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrent(event.target.value)}
          disabled={pending}
        />
      </Field>
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
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button disabled={pending}>{pending ? 'Đang cập nhật…' : 'Đổi mật khẩu'}</Button>
    </form>
  );
}
