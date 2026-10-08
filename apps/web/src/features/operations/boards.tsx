'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ChefHat, ClipboardList, RefreshCw } from 'lucide-react';
import {
  operationsSchema,
  orderPageSchema,
  orderStatuses,
  sessionTableSchema,
  type OrderStatus,
} from '@dineflow/shared';
import { api } from '@/lib/api';
import { useStaff } from '@/features/auth/use-staff';
import { Button } from '@/components/ui/button';
import { EmptyState, QueryState, selectClass } from '@/features/setup/shared';
import { OrderTicket } from './order-ticket';

export const statusLabels: Record<OrderStatus, string> = {
  PENDING_CONFIRMATION: 'Chờ xác nhận',
  ACCEPTED: 'Đã nhận',
  PREPARING: 'Đang chế biến',
  READY: 'Sẵn sàng',
  SERVED: 'Đã phục vụ',
  CANCELLED: 'Đã hủy',
};
function useClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
export function useOperations() {
  const { data: staff } = useStaff();
  return useQuery({
    queryKey: ['operations', staff?.restaurantId, 'overview'],
    queryFn: ({ signal }) => api('/orders/overview', operationsSchema, { signal }),
    enabled: !!staff,
  });
}
function Pager({
  page,
  total,
  size,
  change,
}: {
  page: number;
  total: number;
  size: number;
  change: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => change(page - 1)}>
        Trước
      </Button>
      <span>
        Trang {page}/{pages} · {total} đơn
      </span>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => change(page + 1)}>
        Sau
      </Button>
    </div>
  );
}
export function StaffOrders() {
  const { data: staff } = useStaff(),
    client = useQueryClient(),
    overview = useOperations();
  const [status, setStatus] = useState<OrderStatus>('PENDING_CONFIRMATION'),
    [table, setTable] = useState('all'),
    [page, setPage] = useState(1);
  const allowed = !!staff && ['OWNER', 'MANAGER', 'WAITER', 'CASHIER'].includes(staff.role),
    now = useClock();
  const tables = useQuery({
    queryKey: ['setup', staff?.restaurantId, 'session-tables'],
    queryFn: ({ signal }) =>
      api('/dining-sessions/tables', z.array(sessionTableSchema), { signal }),
    enabled: allowed,
  });
  const query = useQuery({
    queryKey: ['operations', staff?.restaurantId, 'orders', status, table, page],
    queryFn: ({ signal }) =>
      api(
        `/orders?status=${status}&page=${page}&pageSize=12${table === 'all' ? '' : `&tableId=${table}`}`,
        orderPageSchema,
        { signal },
      ),
    enabled: allowed,
  });
  if (!allowed)
    return <EmptyState>Vai trò của bạn không có quyền xem danh sách đơn phục vụ.</EmptyState>;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-[0.16em] text-primary">
            NHẬN ĐƠN & PHỤC VỤ
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Từng đơn, từng chăm chút.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Kiểm tra món khách gọi, xác nhận trước khi chuyển bếp và ghi nhận khi đã phục vụ.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={query.isFetching || overview.isFetching}
          onClick={() => void client.invalidateQueries({ queryKey: ['operations'] })}
        >
          <RefreshCw />
          Cập nhật đơn
        </Button>
      </div>
      <nav aria-label="Trạng thái đơn" className="flex gap-2 overflow-x-auto pb-2">
        {orderStatuses.map((item) => (
          <button
            key={item}
            className={`min-h-12 shrink-0 rounded-xl border px-4 text-xs font-semibold ${status === item ? 'bg-primary text-white' : 'bg-white text-muted-foreground'}`}
            aria-pressed={status === item}
            onClick={() => {
              setStatus(item);
              setPage(1);
            }}
          >
            {statusLabels[item]}{' '}
            <span className="ml-2 opacity-70">{overview.data?.counts[item] ?? '–'}</span>
          </button>
        ))}
      </nav>
      {overview.error && (
        <p role="alert" className="text-xs text-destructive">
          {overview.error.message}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-3 text-xs font-medium">
          Bàn
          <select
            aria-label="Lọc theo bàn"
            className={`${selectClass} max-w-52`}
            value={table}
            onChange={(event) => {
              setTable(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">Tất cả bàn</option>
            {tables.data
              ?.filter((table) => table.session)
              .map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name}
                </option>
              ))}
          </select>
        </label>
        <Button asChild size="sm" variant="outline">
          <Link href="/staff/tables">
            <ClipboardList />
            {staff.role === 'CASHIER' ? 'Xem phiên bàn' : 'Chọn bàn để ghi đơn'}
          </Link>
        </Button>
      </div>
      {tables.error && (
        <p role="alert" className="text-xs text-destructive">
          {tables.error.message}
        </p>
      )}
      <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
        {query.data?.orders.length ? (
          <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {query.data.orders.map((order) => (
              <OrderTicket key={order.id} order={order} now={now} />
            ))}
          </div>
        ) : (
          <EmptyState>
            Không có đơn {statusLabels[status].toLowerCase()} trong phiên bàn hiện tại.
          </EmptyState>
        )}
      </QueryState>
      {query.data && (
        <Pager page={page} total={query.data.total} size={query.data.pageSize} change={setPage} />
      )}
    </div>
  );
}
export function KitchenBoard() {
  const { data: staff } = useStaff(),
    client = useQueryClient(),
    overview = useOperations();
  const now = useClock(),
    allowed = !!staff && ['OWNER', 'MANAGER', 'KITCHEN'].includes(staff.role);
  if (!allowed)
    return <EmptyState>Vai trò của bạn không có quyền thao tác màn hình bếp.</EmptyState>;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold tracking-[0.16em] text-primary">
            <ChefHat className="size-4" />
            KHÔNG GIAN NHÀ BẾP
          </p>
          <h1 className="editorial text-4xl text-primary sm:text-5xl">
            Giữ nhịp bếp, trọn vị ngon.
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Các đơn đã xác nhận. Ghi chú và tùy chọn được giữ nguyên khi khách đặt.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={overview.isFetching}
          onClick={() => void client.invalidateQueries({ queryKey: ['operations'] })}
        >
          <RefreshCw />
          Cập nhật bếp
        </Button>
      </div>
      <div className="flex flex-wrap gap-3">
        {(['ACCEPTED', 'PREPARING', 'READY'] as const).map((status) => (
          <p key={status} className="rounded-full border bg-white px-4 py-3 text-xs">
            <span className="font-semibold text-primary">
              {overview.data?.counts[status] ?? '–'}
            </span>{' '}
            · {status === 'ACCEPTED' ? 'Chờ chế biến' : statusLabels[status]}
          </p>
        ))}
      </div>
      {overview.error && (
        <p role="alert" className="text-sm text-destructive">
          {overview.error.message}
        </p>
      )}
      <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
        {(['ACCEPTED', 'PREPARING', 'READY'] as const).map((status) => (
          <KitchenColumn
            key={status}
            status={status}
            restaurantId={staff!.restaurantId}
            now={now}
          />
        ))}
      </div>
    </div>
  );
}
function KitchenColumn({
  status,
  restaurantId,
  now,
}: {
  status: 'ACCEPTED' | 'PREPARING' | 'READY';
  restaurantId: string;
  now: number;
}) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['operations', restaurantId, 'kitchen', status, page],
    queryFn: ({ signal }) =>
      api(`/kitchen/orders?status=${status}&page=${page}&pageSize=12`, orderPageSchema, { signal }),
  });
  return (
    <section className="min-w-0 rounded-2xl border bg-[#efeee9]/70 p-3 sm:p-4">
      <header className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          {status === 'ACCEPTED' ? 'Chờ chế biến' : statusLabels[status]}
        </h2>
        <span className="grid min-w-8 place-items-center rounded-full bg-white px-2 py-1 text-xs text-primary">
          {query.data?.total ?? '–'}
        </span>
      </header>
      <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
        {query.data?.orders.length ? (
          <div className="space-y-4">
            {query.data.orders.map((order) => (
              <OrderTicket key={order.id} order={order} kitchen now={now} />
            ))}
          </div>
        ) : (
          <EmptyState>Chưa có đơn trong hàng đợi này.</EmptyState>
        )}
      </QueryState>
      {query.data && query.data.total > query.data.pageSize && (
        <Pager page={page} total={query.data.total} size={query.data.pageSize} change={setPage} />
      )}
      {query.dataUpdatedAt > 0 && (
        <p className="mt-4 text-center text-[10px] text-muted-foreground">
          Cập nhật lúc{' '}
          {new Intl.DateTimeFormat('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }).format(new Date(query.dataUpdatedAt))}
        </p>
      )}
    </section>
  );
}
