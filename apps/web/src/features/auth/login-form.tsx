'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import {
  loginSchema,
  staffLoginResultSchema,
  roleLabels,
  type LoginInput,
  type RestaurantChoice,
} from '@dineflow/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, ApiError, bindStaffRestaurant } from '@/lib/api';
import { staffQueryKey } from './use-staff';

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<RestaurantChoice[] | null>(null);
  const [selecting, setSelecting] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  async function onSubmit(input: LoginInput, restaurantId?: string) {
    setError(null);
    try {
      const staff = await api('/auth/login', staffLoginResultSchema, {
        method: 'POST',
        body: { ...input, ...(restaurantId ? { restaurantId } : {}) },
        refresh: false,
      });
      if ('selectionRequired' in staff) {
        setChoices(staff.restaurants);
        return;
      }
      resetField('password');
      bindStaffRestaurant(staff.restaurantId, staff.userId);
      queryClient.clear();
      queryClient.setQueryData(staffQueryKey, staff);
      router.replace('/staff/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Đăng nhập thất bại, vui lòng thử lại');
    }
  }
  if (choices)
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-semibold">Chọn nhà hàng</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Mở không gian làm việc với vai trò của bạn tại nhà hàng đó.
          </p>
        </div>
        <div className="max-h-80 space-y-3 overflow-y-auto">
          {choices.map((choice) => (
            <Button
              key={choice.restaurantId}
              variant="outline"
              className="h-auto min-h-16 w-full justify-between whitespace-normal text-left"
              disabled={selecting}
              onClick={() => {
                setSelecting(true);
                void handleSubmit((input) => onSubmit(input, choice.restaurantId))().finally(
                  () => setSelecting(false),
                );
              }}
            >
              <span className="min-w-0 break-words">
                {choice.name}
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {roleLabels[choice.role]}
                </span>
              </span>
              <ArrowRight className="shrink-0" />
            </Button>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          variant="ghost"
          disabled={selecting}
          onClick={() => {
            resetField('password');
            setChoices(null);
            setError(null);
          }}
        >
          Quay lại đăng nhập
        </Button>
      </div>
    );
  return (
    <form onSubmit={handleSubmit((input) => onSubmit(input))} className="space-y-6" noValidate>
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="text-[10px] font-semibold uppercase tracking-[0.09em]"
        >
          Email nhân viên
        </label>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute left-3.5 top-4 z-10 size-4 text-muted-foreground"
            strokeWidth={1.5}
          />
          <Input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="ten@nhahang.vn"
            className="pl-10"
            {...register('email')}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            disabled={isSubmitting}
          />
        </div>
        {errors.email && (
          <p id="email-error" className="text-xs text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <label
          htmlFor="password"
          className="text-[10px] font-semibold uppercase tracking-[0.09em]"
        >
          Mật khẩu
        </label>
        <div className="relative">
          <LockKeyhole
            className="pointer-events-none absolute left-3.5 top-4 z-10 size-4 text-muted-foreground"
            strokeWidth={1.5}
          />
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Nhập mật khẩu của bạn"
            className="pl-10 pr-12"
            {...register('password')}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
            disabled={isSubmitting}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute inset-y-0 right-0 px-4 text-muted-foreground"
            aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {errors.password && (
          <p id="password-error" className="text-xs text-destructive">
            {errors.password.message}
          </p>
        )}
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/20 bg-red-50 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      <Button type="submit" className="h-12 w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <LoaderCircle className="animate-spin" />
            Đang đăng nhập…
          </>
        ) : (
          <>
            Đăng nhập
            <ArrowRight />
          </>
        )}
      </Button>
      <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <LockKeyhole className="size-3.5" />
        Dành cho chủ quán và đội ngũ được cấp tài khoản
      </p>
      <p className="text-center text-xs leading-6 text-muted-foreground">
        Bạn là chủ nhà hàng?{' '}
        <Link href="/register" className="font-semibold text-primary underline">
          Tạo nhà hàng miễn phí
        </Link>
      </p>
      <div className="flex flex-wrap justify-center gap-5 text-xs text-primary">
        <Link href="/forgot-password" className="underline">
          Quên mật khẩu?
        </Link>
        <Link href="/verify-email" className="underline">
          Gửi lại email xác minh
        </Link>
      </div>
    </form>
  );
}
