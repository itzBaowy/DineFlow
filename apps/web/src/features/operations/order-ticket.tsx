'use client';
import { AlertCircle, Clock3 } from 'lucide-react';
import { formatVnd, type StaffOrder } from '@dineflow/shared';
import { OrderActions } from './order-actions';

export function OrderTicket({
  order,
  now,
  kitchen = false,
}: {
  order: StaffOrder;
  now: number;
  kitchen?: boolean;
}) {
  const timestamp =
    order.status === 'PREPARING'
      ? order.preparingAt
      : order.status === 'READY'
        ? order.readyAt
        : order.status === 'ACCEPTED'
          ? order.acceptedAt
          : order.createdAt;
  const minutes = Math.max(
    0,
    Math.floor((now - new Date(timestamp ?? order.createdAt).getTime()) / 60000),
  );
  const overdue =
    minutes >= 15 && ['PENDING_CONFIRMATION', 'ACCEPTED', 'PREPARING'].includes(order.status);
  return (
    <article
      data-order-id={order.id}
      className={`overflow-hidden rounded-2xl border bg-white ${overdue ? 'border-amber-400' : ''}`}
    >
      {overdue && (
        <p className="flex items-center gap-2 border-b bg-amber-50 px-5 py-3 text-xs font-semibold text-amber-800">
          <AlertCircle className="size-4" />
          Chờ lâu · {minutes} phút
        </p>
      )}
      <header className="border-b bg-secondary/40 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{order.table.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Đơn #{order.number} ·{' '}
              {order.source === 'GUEST' ? 'Khách gọi qua QR' : 'Nhân viên ghi nhận'}
            </p>
          </div>
          <Clock3 className="size-4 shrink-0 text-primary" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(
            new Date(timestamp ?? order.createdAt),
          )}{' '}
          · {minutes} phút
        </p>
      </header>
      <div className="space-y-4 p-5">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-start gap-3">
            <span className="grid min-h-9 min-w-9 shrink-0 place-items-center rounded-lg bg-accent/60 px-2 text-sm font-semibold text-primary">
              {item.quantity}×
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-6">{item.name}</p>
              {item.modifiers.length > 0 && (
                <p className="mt-1 text-xs leading-6 text-muted-foreground">
                  {item.modifiers
                    .map((option) => `${option.groupName}: ${option.name}`)
                    .join(' · ')}
                </p>
              )}
              {item.note && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium leading-6 text-amber-900">
                  Ghi chú: {item.note}
                </p>
              )}
            </div>
          </div>
        ))}
        {order.note && (
          <p className="rounded-xl border bg-background p-3 text-xs leading-6 text-primary">
            Lưu ý đơn: {order.note}
          </p>
        )}
        {order.cancellationReason && (
          <p className="rounded-xl bg-red-50 p-3 text-xs leading-6 text-destructive">
            Lý do hủy: {order.cancellationReason}
          </p>
        )}
        {!kitchen && (
          <div className="flex justify-between border-t pt-4 text-sm font-semibold text-primary">
            <span>Tổng tiền món</span>
            <span>{formatVnd(order.totalAmount)}</span>
          </div>
        )}
        <OrderActions order={order} kitchen={kitchen} />
      </div>
    </article>
  );
}
