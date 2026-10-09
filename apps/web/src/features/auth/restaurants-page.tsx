'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowRight,
  Building2,
  Check,
  Globe2,
  LoaderCircle,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import {
  createRestaurantSchema,
  restaurantChoiceSchema,
  restaurantChoicesSchema,
  registrationSettingsSchema,
  staffPrincipalSchema,
  roleLabels,
  type CreateRestaurantInput,
  type RestaurantChoice,
} from '@dineflow/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Editor, Field, QueryState, selectClass } from '@/features/setup/shared';
import {
  api,
  beginStaffTransition,
  clearStaffDrafts,
  endStaffTransition,
  reloadStaffWorkspace,
} from '@/lib/api';
import { useStaff } from './use-staff';

export function RestaurantsPage() {
  const { data: staff } = useStaff(),
    client = useQueryClient();
  const [creating, setCreating] = useState(false),
    [target, setTarget] = useState<RestaurantChoice | null>(null),
    [switching, setSwitching] = useState(false),
    [error, setError] = useState(''),
    [created, setCreated] = useState('');
  const query = useQuery({
    queryKey: ['auth', 'restaurants', staff?.userId],
    queryFn: ({ signal }) => api('/auth/restaurants', restaurantChoicesSchema, { signal }),
    enabled: !!staff,
  });
  const settings = useQuery({
    queryKey: ['registration-settings'],
    queryFn: ({ signal }) =>
      api('/auth/registration-settings', registrationSettingsSchema, {
        signal,
        refresh: false,
      }),
    enabled: staff?.role === 'OWNER',
  });
  async function switchTo() {
    if (!target || switching) return;
    setSwitching(true);
    setError('');
    // Unmount operational pages and realtime before changing the shared HttpOnly cookies.
    await beginStaffTransition();
    await client.cancelQueries();
    try {
      await api('/auth/switch-restaurant', staffPrincipalSchema, {
        method: 'POST',
        body: { restaurantId: target.restaurantId },
        refresh: false,
      });
      // Remove only this staff account's persisted draft carts; guest carts are independent.
      clearStaffDrafts(staff!.userId);
      client.clear();
      reloadStaffWorkspace();
    } catch (cause) {
      // Workspace owns the error because this page is unmounted while switching.
      endStaffTransition(
        cause instanceof Error ? cause.message : 'Không thể chuyển nhà hàng. Vui lòng thử lại.',
      );
    }
  }
  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-end justify-between gap-6 rounded-2xl border bg-white p-6 sm:p-8">
        <div className="min-w-0">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">
            Nhà hàng của tôi
          </p>
          <h1 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Mỗi nhà hàng,
            <br />
            một không gian riêng.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">
            Thực đơn, bàn, nhân viên và đơn gọi món thuộc từng nhà hàng. Chọn nơi bạn muốn làm
            việc hôm nay.
          </p>
        </div>
        {staff?.role === 'OWNER' && (
          <Button
            disabled={!settings.data?.registrationsEnabled}
            onClick={() => {
              setCreated('');
              setCreating(true);
            }}
          >
            <Plus />
            Tạo thêm nhà hàng
          </Button>
        )}
      </section>
      {staff?.role === 'OWNER' && settings.data?.registrationsEnabled === false && (
        <p role="status" className="rounded-xl border bg-secondary p-4 text-sm">
          Hệ thống đang tạm dừng tạo nhà hàng mới. Bạn vẫn có thể sử dụng các nhà hàng hiện có.
        </p>
      )}
      {settings.error && staff?.role === 'OWNER' && (
        <p role="alert" className="text-sm text-destructive">
          Không thể kiểm tra trạng thái tạo nhà hàng.{' '}
          <button className="underline" onClick={() => void settings.refetch()}>
            Thử lại
          </button>
        </p>
      )}
      {created && (
        <p role="status" className="rounded-xl border bg-secondary p-4 text-sm">
          Đã tạo {created}. Chọn “Chuyển nhà hàng” để bắt đầu thiết lập.
        </p>
      )}
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900">
        Khi chuyển nhà hàng, giỏ gọi món chưa gửi của tài khoản này sẽ được xóa và các tab làm
        việc sẽ tải lại. Đơn đã gửi được giữ tại nhà hàng ban đầu.
      </p>
      <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {query.data?.restaurants.map((restaurant) => {
            const current = restaurant.restaurantId === staff?.restaurantId,
              suspended = restaurant.status === 'SUSPENDED';
            return (
              <Card
                key={restaurant.restaurantId}
                className="flex min-w-0 flex-col p-6"
                data-restaurant-card={restaurant.restaurantId}
              >
                <div className="mb-5 flex items-center justify-between gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-semibold ${suspended ? 'bg-amber-50 text-amber-900' : 'bg-secondary text-primary'}`}
                  >
                    {current ? 'Đang làm việc' : suspended ? 'Tạm ngừng' : 'Đang hoạt động'}
                  </span>
                  <Building2 className="size-5 shrink-0 text-primary" strokeWidth={1.5} />
                </div>
                <h2 className="break-words text-xl font-semibold">{restaurant.name}</h2>
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  {restaurant.slug}
                </p>
                <dl className="my-6 space-y-3 text-xs">
                  <div className="flex gap-3">
                    <dt className="flex shrink-0 items-center gap-2 text-muted-foreground">
                      <Globe2 className="size-3.5" />
                      Múi giờ
                    </dt>
                    <dd className="min-w-0 break-all">{restaurant.timezone}</dd>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <dt className="text-muted-foreground">Vai trò của bạn</dt>
                    <dd className="font-medium">{roleLabels[restaurant.role]}</dd>
                  </div>
                </dl>
                <Button
                  className="mt-auto w-full"
                  variant={current ? 'outline' : 'default'}
                  disabled={current || suspended || switching}
                  onClick={() => {
                    setError('');
                    setTarget(restaurant);
                  }}
                >
                  {current ? (
                    <>
                      <Check />
                      Đang ở nhà hàng này
                    </>
                  ) : suspended ? (
                    'Tạm ngừng'
                  ) : (
                    <>
                      Chuyển nhà hàng
                      <ArrowRight />
                    </>
                  )}
                </Button>
                {suspended && (
                  <p className="mt-3 text-xs leading-6 text-muted-foreground">
                    Liên hệ quản trị nền tảng để được hỗ trợ mở lại.
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      </QueryState>
      <section className="flex gap-4 rounded-2xl border bg-secondary/50 p-6">
        <ShieldCheck className="mt-1 size-6 shrink-0 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">Bắt đầu từ không gian trống</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
            Nhà hàng mới được tạo miễn phí với cùng tài khoản của bạn. Thiết lập thực đơn, bàn
            và đội ngũ riêng cho nhà hàng đó.
          </p>
        </div>
      </section>
      <Editor
        open={creating}
        onOpenChange={setCreating}
        title="Tạo nhà hàng"
        description="Tạo miễn phí một nhà hàng mới với tài khoản hiện tại."
      >
        <CreateForm
          onSaved={async (name) => {
            setCreating(false);
            setCreated(name);
            await client.invalidateQueries({ queryKey: ['auth', 'restaurants'] });
          }}
        />
      </Editor>
      <Editor
        open={!!target}
        onOpenChange={(open) => {
          if (!switching && !open) setTarget(null);
        }}
        title="Chuyển nhà hàng"
        description="Không gian làm việc sẽ tải lại với dữ liệu và quyền của nhà hàng được chọn."
      >
        <p className="break-words text-xl font-semibold">{target?.name}</p>
        <p className="my-5 text-sm leading-7 text-muted-foreground">
          Giỏ gọi món chưa gửi sẽ được xóa. Các đơn đã gửi và phiên bàn vẫn được giữ tại nhà
          hàng ban đầu.
        </p>
        {error && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button className="w-full" disabled={switching} onClick={() => void switchTo()}>
          {switching ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}Xác nhận
          chuyển
        </Button>
      </Editor>
    </div>
  );
}

function CreateForm({ onSaved }: { onSaved: (name: string) => Promise<void> }) {
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof createRestaurantSchema>, unknown, CreateRestaurantInput>({
    resolver: zodResolver(createRestaurantSchema),
    defaultValues: { restaurantName: '', slug: '', timezone: 'Asia/Ho_Chi_Minh' },
  });
  async function submit(input: CreateRestaurantInput) {
    setError('');
    try {
      const saved = await api('/auth/restaurants', restaurantChoiceSchema, {
        method: 'POST',
        body: input,
        refresh: false,
      });
      await onSaved(saved.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tạo nhà hàng');
    }
  }
  return (
    <form className="space-y-5" onSubmit={handleSubmit(submit)} noValidate>
      <Field label="Tên nhà hàng" error={errors.restaurantName?.message}>
        <Input
          {...register('restaurantName')}
          disabled={isSubmitting}
          autoComplete="organization"
        />
      </Field>
      <Field label="Mã nhà hàng" error={errors.slug?.message}>
        <Input {...register('slug')} disabled={isSubmitting} placeholder="bep-nha-co-so-hai" />
      </Field>
      <p className="text-xs leading-6 text-muted-foreground">
        Mã gồm chữ thường, số và dấu gạch nối; phải khác các nhà hàng đã có.
      </p>
      <Field label="Múi giờ" error={errors.timezone?.message}>
        <select className={selectClass} {...register('timezone')} disabled={isSubmitting}>
          <option value="Asia/Ho_Chi_Minh">Việt Nam</option>
          <option value="Asia/Bangkok">Bangkok</option>
          <option value="Asia/Singapore">Singapore</option>
          <option value="UTC">UTC</option>
        </select>
      </Field>
      <p className="rounded-xl bg-secondary p-4 text-xs leading-6">
        Nhà hàng mới bắt đầu trống. Dữ liệu từ nhà hàng hiện tại sẽ không được sao chép.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <LoaderCircle className="animate-spin" /> : <Plus />}Tạo nhà hàng
      </Button>
    </form>
  );
}
