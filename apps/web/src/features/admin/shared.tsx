'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { reportQuerySchema, recentDateRange } from '@dineflow/shared';
import { useStaff } from '@/features/auth/use-staff';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/features/setup/shared';

export type Period = { from: string; to: string };
export function useAdminPeriod() {
  const { data: staff } = useStaff();
  const allowed = !!staff && ['OWNER', 'MANAGER'].includes(staff.role);
  const [period, setPeriod] = useState<Period | null>(null);
  const timezone = staff?.restaurant.timezone;
  const restaurantId = staff?.restaurantId;
  useEffect(() => {
    let disposed = false;
    if (timezone)
      queueMicrotask(() => {
        if (!disposed) setPeriod(recentDateRange(new Date(), timezone));
      });
    return () => {
      disposed = true;
    };
  }, [timezone, restaurantId]);
  return { staff, allowed, period, setPeriod };
}
export function params(input: Record<string, string | number | undefined>) {
  return new URLSearchParams(
    Object.entries(input)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => [key, String(value)]),
  ).toString();
}
export function AdminHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-4">
      <p className="text-[10px] font-semibold tracking-widest text-primary">
        QUẢN TRỊ · DỮ LIỆU NHÀ HÀNG
      </p>
      <h1 className="editorial text-3xl text-primary sm:text-4xl">{title}</h1>
      <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{description}</p>
      <nav
        aria-label="Quản trị"
        className="flex flex-wrap gap-x-5 gap-y-3 text-xs font-semibold text-primary"
      >
        <Link href="/admin/reports">Báo cáo</Link>
        <Link href="/admin/orders">Lịch sử đơn</Link>
        <Link href="/admin/activity">Nhật ký hoạt động</Link>
        <Link href="/admin/staff">Nhân viên</Link>
      </nav>
    </div>
  );
}
export function AdminDenied() {
  return (
    <p role="alert" className="rounded-xl border bg-white p-6 text-sm">
      Bạn không có quyền quản trị. Chỉ chủ nhà hàng và quản lý được truy cập.
    </p>
  );
}
export function PeriodFilter({
  period,
  timezone,
  onApply,
  children,
  disabled = false,
}: {
  period: Period;
  timezone: string;
  onApply: (value: Period) => void;
  children?: React.ReactNode;
  disabled?: boolean;
}) {
  const [from, setFrom] = useState(period.from),
    [to, setTo] = useState(period.to),
    [error, setError] = useState('');
  return (
    <form
      className="space-y-4 rounded-2xl border bg-white p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = reportQuerySchema.safeParse({ from, to });
        if (!parsed.success) {
          setError(parsed.error.issues[0]!.message);
          return;
        }
        setError('');
        onApply({ from: parsed.data.from, to: parsed.data.to });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Từ ngày">
          <Input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Đến ngày">
          <Input type="date" required value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        {children}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs leading-6 text-muted-foreground">
          Múi giờ: {timezone}. Gồm cả hai ngày đã chọn, tối đa 366 ngày.
        </p>
        <Button disabled={disabled}>Áp dụng bộ lọc</Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
export function Pagination({
  page,
  total,
  pageSize,
  onPage,
  disabled = false,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  disabled?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
      <p>
        {total} kết quả · Trang {page}/{pages}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1 || disabled}
          onClick={() => onPage(page - 1)}
        >
          Trang trước
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages || disabled}
          onClick={() => onPage(page + 1)}
        >
          Trang sau
        </Button>
      </div>
    </div>
  );
}
export function dateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: timezone,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}
export const tableClass =
  'w-full min-w-[680px] text-left text-xs [&_th]:px-4 [&_th]:py-4 [&_th]:font-semibold [&_td]:px-4 [&_td]:py-4 [&_tbody_tr]:border-t';
export const statusLabels: Record<string, string> = {
  PENDING_CONFIRMATION: 'Chờ xác nhận',
  ACCEPTED: 'Đã nhận',
  PREPARING: 'Đang chế biến',
  READY: 'Sẵn sàng',
  SERVED: 'Đã phục vụ',
  CANCELLED: 'Đã hủy',
  OPEN: 'Đang phục vụ',
  PAYMENT_REQUESTED: 'Chờ thanh toán',
  CLOSED: 'Đã đóng',
};
