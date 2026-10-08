'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { receiptSchema, formatVnd } from '@dineflow/shared';
import { Printer, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useStaff } from '@/features/auth/use-staff';
import { Button } from '@/components/ui/button';
import { EmptyState, QueryState } from '@/features/setup/shared';
import { BillOrders, BillTotals } from './bill-display';

export function PaymentReceipt({ paymentId }: { paymentId: string }) {
  const { data: staff } = useStaff(),
    allowed = !!staff && ['OWNER', 'MANAGER', 'WAITER', 'CASHIER'].includes(staff.role);
  const query = useQuery({
    queryKey: ['billing', staff?.restaurantId, 'receipt', paymentId],
    queryFn: ({ signal }) => api(`/billing/receipts/${paymentId}`, receiptSchema, { signal }),
    enabled: allowed,
  });
  if (!allowed) return <EmptyState>Vai trò của bạn không được xem biên nhận.</EmptyState>;
  return (
    <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
      {query.data && (
        <div className="mx-auto max-w-2xl space-y-6">
          <div data-print-hide className="flex flex-wrap items-center justify-between gap-3">
            <Button asChild variant="outline">
              <Link href="/staff/cashier">Về thu ngân</Link>
            </Button>
            <Button onClick={() => window.print()}>
              <Printer />
              In biên nhận
            </Button>
          </div>
          <article data-receipt className="space-y-6 rounded-2xl border bg-white p-5 sm:p-8">
            <header className="space-y-3 border-b pb-5 text-center">
              <p className="editorial text-3xl text-primary">
                {query.data.bill.restaurant.name}
              </p>
              {query.data.bill.restaurant.address && (
                <p className="text-xs leading-6 text-muted-foreground">
                  {query.data.bill.restaurant.address}
                </p>
              )}
              {query.data.bill.restaurant.phone && (
                <p className="text-xs">{query.data.bill.restaurant.phone}</p>
              )}
              <h1 className="text-lg font-semibold">Biên nhận thanh toán</h1>
              <p className="flex items-center justify-center gap-2 text-xs text-primary">
                <CheckCircle2 className="size-4" />
                Đã ghi nhận thanh toán · Phiên đã đóng
              </p>
            </header>
            <dl className="space-y-3 text-xs">
              <div className="flex justify-between gap-3">
                <dt>Bàn</dt>
                <dd>{query.data.bill.table.name}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-muted-foreground">Mã biên nhận</dt>
                <dd className="break-all font-mono">{query.data.id}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt>Đã nhận lúc</dt>
                <dd>
                  {new Intl.DateTimeFormat('vi-VN', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: query.data.bill.restaurant.timezone,
                  }).format(new Date(query.data.completedAt))}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Phương thức</dt>
                <dd>
                  {query.data.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản xác nhận thủ công'}
                </dd>
              </div>
              {query.data.reference && (
                <div className="space-y-1">
                  <dt>Mã giao dịch</dt>
                  <dd className="break-all">{query.data.reference}</dd>
                </div>
              )}
            </dl>
            <BillOrders orders={query.data.bill.orders} />
            <BillTotals totals={query.data.bill.totals} />
            {query.data.bill.totals.discountReason && (
              <p className="text-xs leading-6">
                Lý do giảm giá: {query.data.bill.totals.discountReason}
              </p>
            )}
            <p className="flex justify-between border-t pt-4 text-sm font-semibold">
              <span>Đã nhận đủ</span>
              <span>{formatVnd(query.data.paidAmount)}</span>
            </p>
            <p className="border-t pt-4 text-center text-[11px] leading-6 text-muted-foreground">
              Biên nhận của nhà hàng, không thay thế hóa đơn điện tử. Cảm ơn bạn đã dùng bữa.
            </p>
          </article>
        </div>
      )}
    </QueryState>
  );
}
