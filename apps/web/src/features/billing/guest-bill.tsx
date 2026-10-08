'use client';
import { useQuery } from '@tanstack/react-query';
import { guestBillSchema } from '@dineflow/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EmptyState, QueryState } from '@/features/setup/shared';
import { BackToMenu, useCustomer } from '@/features/ordering/customer-provider';
import { BillTotals } from './bill-display';
export function GuestBill() {
  const { code, guest, menu } = useCustomer();
  const query = useQuery({
    queryKey: ['guest-bill', code, menu.diningSessionId, guest?.id],
    queryFn: ({ signal }) =>
      api(`/public/tables/${encodeURIComponent(code)}/bill`, guestBillSchema, {
        signal,
        refresh: false,
      }),
    enabled: !!guest,
  });
  return (
    <section className="mt-5 space-y-6">
      <BackToMenu />
      <h1 className="editorial text-4xl text-primary">Hóa đơn tạm tính của bàn</h1>
      <p className="text-sm leading-7 text-muted-foreground">
        Tổng tiền mọi đơn hợp lệ trong lượt phục vụ này. Chi tiết đơn riêng nằm trong Đơn đã
        đặt; nhân viên sẽ kiểm tra hóa đơn trước khi thu tiền.
      </p>
      {!guest ? (
        <EmptyState>Bắt đầu gọi món trong phiên bàn để xem tạm tính.</EmptyState>
      ) : (
        <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
          {query.data && (
            <div className="space-y-5 rounded-2xl border bg-white p-5">
              <h2 className="text-lg font-semibold">{query.data.tableName}</h2>
              <p className="text-xs leading-6 text-muted-foreground">
                {query.data.validOrderCount} đơn tính tiền
                {query.data.blockingOrderCount > 0
                  ? ` · ${query.data.blockingOrderCount} đơn chưa phục vụ xong`
                  : ''}
                . Đơn đã hủy không tính tiền.
              </p>
              <BillTotals totals={query.data.totals} />
              <p className="text-xs leading-6 text-muted-foreground">
                Đây là tạm tính, chưa ghi nhận thanh toán. Giảm giá, phí và thuế theo xác
                nhận/cấu hình của nhà hàng.
              </p>
              <Button
                variant="outline"
                className="w-full"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                Cập nhật tạm tính
              </Button>
            </div>
          )}
        </QueryState>
      )}
    </section>
  );
}
