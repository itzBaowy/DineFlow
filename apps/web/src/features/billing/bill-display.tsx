'use client';
import { formatVnd, type Bill, type Receipt } from '@dineflow/shared';

export function BillTotals({
  totals,
}: {
  totals: Bill['totals'] | Omit<Bill['totals'], 'discountReason'>;
}) {
  return (
    <dl className="space-y-3 text-sm" data-bill-totals>
      {[
        ['Tiền món', formatVnd(totals.subtotal)],
        ['Giảm giá', `−${formatVnd(totals.discount)}`],
        [`Phí dịch vụ (${totals.serviceChargeBps / 100}%)`, formatVnd(totals.serviceCharge)],
        [`Thuế (${totals.taxBps / 100}%)`, formatVnd(totals.tax)],
      ].map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="shrink-0 font-medium">{value}</dd>
        </div>
      ))}
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t pt-4 text-primary">
        <dt className="font-semibold">Tổng thanh toán</dt>
        <dd className="editorial text-3xl" data-bill-total>
          {formatVnd(totals.total)}
        </dd>
      </div>
    </dl>
  );
}
export function BillOrders({ orders }: { orders: Bill['orders'] | Receipt['bill']['orders'] }) {
  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <article
          key={order.id}
          className="rounded-2xl border bg-white p-5"
          data-bill-order={order.id}
        >
          <div className="mb-4 flex flex-wrap justify-between gap-2">
            <h3 className="text-sm font-semibold">Đơn #{order.number}</h3>
            <span
              className={`text-xs ${order.status === 'CANCELLED' ? 'text-destructive' : 'text-primary'}`}
            >
              {order.status === 'CANCELLED'
                ? 'Đã hủy · Không tính tiền'
                : order.status === 'SERVED'
                  ? 'Đã phục vụ'
                  : 'Chưa phục vụ xong'}
            </span>
          </div>
          <ul className="space-y-3">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p>
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
                </div>
                <span className="shrink-0 font-medium">{formatVnd(item.totalAmount)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t pt-3 text-right text-sm font-semibold">
            {order.status === 'CANCELLED'
              ? 'Không cộng vào hóa đơn'
              : formatVnd(order.totalAmount)}
          </p>
        </article>
      ))}
    </div>
  );
}
