'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { platformPrincipalSchema, loginSchema } from '@dineflow/shared';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Field } from '@/features/setup/shared';
export function PlatformLogin() {
  const router = useRouter(),
    client = useQueryClient();
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setError('');
        const parsed = loginSchema.safeParse({ email, password });
        if (!parsed.success) {
          setError(parsed.error.issues[0]!.message);
          return;
        }
        setPending(true);
        try {
          const principal = await api('/platform/auth/login', platformPrincipalSchema, {
            method: 'POST',
            body: parsed.data,
            refresh: false,
          });
          setPassword('');
          client.removeQueries({ queryKey: ['platform'] });
          client.setQueryData(['platform', 'me'], principal);
          router.replace('/platform');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Không thể đăng nhập');
        } finally {
          setPending(false);
        }
      }}
    >
      <Field label="Email quản trị">
        <Input
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending}
        />
      </Field>
      <Field label="Mật khẩu quản trị">
        <Input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={pending}
        />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button className="w-full" disabled={pending}>
        {pending ? 'Đang đăng nhập…' : 'Vào quản trị nền tảng'}
      </Button>
    </form>
  );
}
