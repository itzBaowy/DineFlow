'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import { loginSchema, staffPrincipalSchema, type LoginInput } from '@dineflow/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { staffQueryKey } from './use-staff';

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  async function onSubmit(input: LoginInput) {
    setError(null);
    try {
      const staff = await api('/auth/login', staffPrincipalSchema, { method: 'POST', body: input, refresh: false });
      queryClient.clear();
      queryClient.setQueryData(staffQueryKey, staff);
      router.replace('/staff/dashboard');
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Đăng nhập thất bại, vui lòng thử lại'); }
  }
  return <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
    <div className="space-y-2"><label htmlFor="email" className="text-[10px] font-semibold uppercase tracking-[0.09em]">Email nhân viên</label><div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-4 z-10 size-4 text-muted-foreground" strokeWidth={1.5} /><Input id="email" type="email" autoComplete="username" placeholder="ten@nhahang.vn" className="pl-10" {...register('email')} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined} disabled={isSubmitting} /></div>{errors.email && <p id="email-error" className="text-xs text-destructive">{errors.email.message}</p>}</div>
    <div className="space-y-2"><label htmlFor="password" className="text-[10px] font-semibold uppercase tracking-[0.09em]">Mật khẩu</label><div className="relative"><LockKeyhole className="pointer-events-none absolute left-3.5 top-4 z-10 size-4 text-muted-foreground" strokeWidth={1.5} /><Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Nhập mật khẩu của bạn" className="pl-10 pr-12" {...register('password')} aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined} disabled={isSubmitting} /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 right-0 px-4 text-muted-foreground" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>{errors.password && <p id="password-error" className="text-xs text-destructive">{errors.password.message}</p>}</div>
    {error && <div role="alert" className="rounded-xl border border-destructive/20 bg-red-50 p-3 text-sm text-destructive">{error}</div>}
    <Button type="submit" className="h-12 w-full" disabled={isSubmitting}>{isSubmitting ? <><LoaderCircle className="animate-spin" />Đang đăng nhập…</> : <>Đăng nhập<ArrowRight /></>}</Button>
    <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><LockKeyhole className="size-3.5" />Chỉ dành cho nhân viên được cấp tài khoản</p>
  </form>;
}
