'use client';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import Link from 'next/link';
import { CheckCircle2, RefreshCw, UtensilsCrossed } from 'lucide-react';
import { formatVnd, orderSchema, type CustomerOrder } from '@dineflow/shared';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { EmptyState, QueryState } from '@/features/setup/shared';
import { BackToMenu, useCustomer } from './customer-provider';

const labels: Record<CustomerOrder['status'], string> = {
  PENDING_CONFIRMATION: 'Chờ xác nhận',
  ACCEPTED: 'Đã xác nhận',
  PREPARING: 'Đang chế biến',
  READY: 'Món sẵn sàng',
  SERVED: 'Đã phục vụ',
  CANCELLED: 'Đã hủy',
};
export function OrderCards({ orders }: { orders: CustomerOrder[] }) {
  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <article key={order.id} className="overflow-hidden rounded-2xl border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-secondary/60 p-5">
            <div>
              <h2 className="text-sm font-semibold">Đơn #{order.number}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Intl.DateTimeFormat('vi-VN', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }).format(new Date(order.createdAt))}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-2 text-xs ${order.status === 'CANCELLED' ? 'bg-red-50 text-destructive' : 'bg-accent/60 text-primary'}`}
            >
              {labels[order.status]}
            </span>
          </div>
          <div className="space-y-4 p-5">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {item.quantity} × {item.name}
                  </p>
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">
                    {item.modifiers
                      .map(
                        (modifier) =>
                          `${modifier.groupName}: ${modifier.name} (+${formatVnd(modifier.priceDelta)})`,
                      )
                      .join(' · ')}
                  </p>
                  {item.note && (
                    <p className="text-xs leading-6 text-muted-foreground">Ghi chú: {item.note}</p>
                  )}
                </div>
                <span className="shrink-0 text-sm font-medium">{formatVnd(item.totalAmount)}</span>
              </div>
            ))}
            {order.note && (
              <p className="rounded-xl bg-background p-3 text-xs leading-6 text-muted-foreground">
                Ghi chú đơn: {order.note}
              </p>
            )}
            <div className="flex justify-between border-t pt-4 text-sm font-semibold text-primary">
              <span>Tổng tiền món</span>
              <span>{formatVnd(order.totalAmount)}</span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
export function OrderHistory() {
  const { code, menu, guest, cart } = useCustomer();
  const query = useQuery({
    queryKey: ['customer-orders', code, menu.diningSessionId, guest?.id],
    queryFn: ({ signal }) =>
      api(`/public/tables/${encodeURIComponent(code)}/orders`, z.array(orderSchema), {
        signal,
        refresh: false,
      }),
    enabled: !!guest,
  });
  return (
    <section className="mt-5">
      <BackToMenu />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="editorial text-4xl text-primary">Đơn bạn đã đặt</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Các đơn do bạn gửi trong lượt phục vụ này.
          </p>
        </div>
        {guest && (
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw />
            Cập nhật
          </Button>
        )}
      </div>
      {cart.pending && (
        <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm leading-6">
          Một yêu cầu gửi đơn chưa có kết quả.{' '}
          <Link className="font-semibold text-primary underline" href={`/t/${code}/cart`}>
            Kiểm tra đơn đang gửi
          </Link>
        </div>
      )}
      <div className="mt-6">
        {!guest ? (
          <EmptyState>Bắt đầu gọi món tại bàn để xem đơn của bạn.</EmptyState>
        ) : (
          <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
            {query.data?.length ? (
              <>
                <div className="mb-5 flex gap-3 rounded-xl bg-secondary p-4 text-xs leading-6 text-primary">
                  <CheckCircle2 className="mt-1 size-4 shrink-0" />
                  Đơn đã được lưu. Nhân viên sẽ kiểm tra và xác nhận trước khi chế biến.
                </div>
                <OrderCards orders={query.data} />
              </>
            ) : (
              <EmptyState>
                <UtensilsCrossed className="mx-auto mb-4 size-8 text-primary/40" />
                Bạn chưa gửi đơn nào trong lượt phục vụ này.
              </EmptyState>
            )}
          </QueryState>
        )}
      </div>
      <Button asChild className="mt-6 w-full">
        <Link href={`/t/${code}`}>Gọi thêm món</Link>
      </Button>
    </section>
  );
}
