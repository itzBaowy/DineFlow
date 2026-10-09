'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  registerSchema,
  registrationSettingsSchema,
  type RegisterInput,
} from '@dineflow/shared';
import { LoaderCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Field, QueryState, selectClass } from '@/features/setup/shared';

export function RegisterForm() {
  const [error, setError] = useState(''),
    [success, setSuccess] = useState(false);
  const settings = useQuery({
    queryKey: ['public', 'registration-settings'],
    queryFn: ({ signal }) =>
      api('/auth/registration-settings', registrationSettingsSchema, {
        signal,
        refresh: false,
      }),
  });
  const form = useForm<z.input<typeof registerSchema>, unknown, RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      restaurantName: '',
      slug: '',
      timezone: 'Asia/Ho_Chi_Minh',
    },
  });
  const fields = [
    { key: 'name', label: 'Tên chủ nhà hàng', type: 'text', autocomplete: 'name' },
    { key: 'email', label: 'Email đăng nhập', type: 'email', autocomplete: 'username' },
    { key: 'password', label: 'Mật khẩu', type: 'password', autocomplete: 'new-password' },
    {
      key: 'restaurantName',
      label: 'Tên nhà hàng',
      type: 'text',
      autocomplete: 'organization',
    },
    { key: 'slug', label: 'Mã nhà hàng', type: 'text', autocomplete: 'off' },
  ] as const;
  if (success)
    return (
      <section role="status" className="space-y-5 rounded-2xl border bg-secondary p-6">
        <CheckCircle2 className="text-primary" />
        <h2 className="editorial text-3xl text-primary">Nhà hàng của bạn đã sẵn sàng.</h2>
        <p className="text-sm leading-7">
          Kiểm tra hộp thư và xác minh email trước khi đăng nhập. Sau đó thêm thực đơn, bàn và
          tài khoản đội ngũ trong mục Nhân viên.
        </p>
        <Link
          href="/staff/login"
          className="inline-flex min-h-12 items-center gap-3 rounded-xl bg-primary px-5 text-sm font-semibold text-white"
        >
          Đăng nhập và bắt đầu <ArrowRight className="size-4" />
        </Link>
        <Link href="/verify-email" className="block text-sm font-medium text-primary underline">
          Gửi lại email xác minh
        </Link>
      </section>
    );
  return (
    <QueryState pending={settings.isPending} error={settings.error} retry={settings.refetch}>
      {settings.data?.registrationsEnabled === false ? (
        <div role="alert" className="space-y-4 rounded-xl border bg-secondary p-6">
          <p className="text-sm leading-7">
            Đăng ký đang tạm dừng. Vui lòng quay lại sau. Nhà hàng đã có tài khoản vẫn đăng nhập
            bình thường.
          </p>
          <Link className="text-sm font-semibold text-primary underline" href="/staff/login">
            Đăng nhập
          </Link>
        </div>
      ) : (
        <form
          className="space-y-5"
          noValidate
          onSubmit={form.handleSubmit(async (input) => {
            setError('');
            try {
              await api('/auth/register', z.object({ registered: z.literal(true) }), {
                method: 'POST',
                body: input,
                refresh: false,
              });
              form.reset();
              setSuccess(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Không thể đăng ký');
            }
          })}
        >
          {fields.map((field) => (
            <Field key={field.key} label={field.label}>
              <Input
                type={field.type}
                autoComplete={field.autocomplete}
                {...form.register(field.key)}
                aria-label={field.label}
                disabled={form.formState.isSubmitting}
                aria-invalid={!!form.formState.errors[field.key]}
                aria-describedby={`${field.key}-hint`}
              />
              <p
                id={`${field.key}-hint`}
                role={form.formState.errors[field.key] ? 'alert' : undefined}
                className={
                  form.formState.errors[field.key]
                    ? 'text-xs text-destructive'
                    : 'text-xs leading-6 text-muted-foreground'
                }
              >
                {form.formState.errors[field.key]?.message ??
                  (field.key === 'password'
                    ? 'Tối thiểu 12 ký tự.'
                    : field.key === 'slug'
                      ? 'Mã duy nhất, ví dụ bep-nha. Chỉ chữ, số và dấu gạch nối.'
                      : '')}
              </p>
            </Field>
          ))}
          <Field label="Múi giờ vận hành">
            <select
              {...form.register('timezone')}
              disabled={form.formState.isSubmitting}
              className={selectClass}
            >
              <option value="Asia/Ho_Chi_Minh">Việt Nam · Asia/Ho_Chi_Minh (UTC+7)</option>
              <option value="Asia/Bangkok">Thái Lan · Asia/Bangkok (UTC+7)</option>
              <option value="Asia/Singapore">Singapore (UTC+8)</option>
              <option value="UTC">UTC</option>
            </select>
          </Field>
          {error && (
            <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? (
              <>
                <LoaderCircle className="animate-spin" />
                Đang tạo nhà hàng…
              </>
            ) : (
              <>
                Tạo nhà hàng miễn phí
                <ArrowRight />
              </>
            )}
          </Button>
          <p className="text-xs leading-6 text-muted-foreground">
            Miễn phí trong giai đoạn hiện tại. Không cần thẻ tín dụng. Nhà hàng mới bắt đầu
            trống, dữ liệu của quán được quản lý riêng.
          </p>
        </form>
      )}
    </QueryState>
  );
}
