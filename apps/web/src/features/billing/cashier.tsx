'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  billSchema,
  receiptPreviewSchema,
  sessionTableSchema,
  discountInputSchema,
  formatVnd,
  type Bill,
  type BillingSessionInput,
} from '@dineflow/shared';
import { RefreshCw, ReceiptText, ArrowLeft } from 'lucide-react';
import { useStaff } from '@/features/auth/use-staff';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QueryState, EmptyState, Editor, Field } from '@/features/setup/shared';
import { BillOrders, BillTotals } from './bill-display';
import { PaymentPanel } from './payment-panel';

export function Cashier() {
  const { data: staff } = useStaff();
  const allowed = !!staff && ['OWNER', 'MANAGER', 'CASHIER', 'WAITER'].includes(staff.role);
  const tables = useQuery({
    queryKey: ['billing', staff?.restaurantId, 'tables'],
    queryFn: ({ signal }) =>
      api('/dining-sessions/tables', z.array(sessionTableSchema), { signal }),
    enabled: allowed,
  });
  const receipts = useQuery({
    queryKey: ['billing', staff?.restaurantId, 'receipts'],
    queryFn: ({ signal }) =>
      api('/billing/receipts', z.array(receiptPreviewSchema), { signal }),
    enabled: allowed,
  });
  if (!allowed) return <EmptyState>Vai trò của bạn không được xem hóa đơn.</EmptyState>;
  const active = tables.data?.filter((table) => table.session);
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-widest text-primary">
            THU NGÂN · TRỌN LƯỢT PHỤC VỤ
          </p>
          <h1 className="editorial text-4xl text-primary">Trọn bữa ngon, gọn thanh toán.</h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            Kiểm tra mọi đơn trong lượt phục vụ trước khi xác nhận đã nhận tiền.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={tables.isFetching}
          onClick={() => void tables.refetch()}
        >
          <RefreshCw />
          Cập nhật bàn
        </Button>
      </div>
      <QueryState pending={tables.isPending} error={tables.error} retry={tables.refetch}>
        {active?.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {active.map((table) => (
              <Link
                key={table.id}
                href={`/staff/cashier/${table.session!.id}`}
                className="space-y-3 rounded-2xl border bg-white p-5 transition hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"
              >
                <p className="text-xl font-semibold">{table.name}</p>
                <p className="text-xs text-primary">
                  {table.session!.status === 'PAYMENT_REQUESTED'
                    ? 'Chờ thanh toán'
                    : 'Đang phục vụ'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {table.session!.orderCount} đơn · Tiền món{' '}
                  {formatVnd(table.session!.totalAmount)}
                </p>
                <span className="block text-sm font-semibold text-primary">Xem hóa đơn →</span>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState>Chưa có phiên bàn đang phục vụ.</EmptyState>
        )}
      </QueryState>
      <section className="space-y-4">
        <h2 className="editorial text-2xl text-primary">Biên nhận gần đây</h2>
        <p className="text-xs text-muted-foreground">
          20 giao dịch gần nhất của nhà hàng, gồm tiền mặt và chuyển khoản đã được nhân viên xác
          nhận.
        </p>
        <QueryState
          pending={receipts.isPending}
          error={receipts.error}
          retry={receipts.refetch}
        >
          {receipts.data?.length ? (
            <ul className="space-y-3">
              {receipts.data.map((receipt) => (
                <li key={receipt.id}>
                  <Link
                    href={`/staff/cashier/receipts/${receipt.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 text-sm"
                  >
                    <span className="flex items-center gap-3">
                      <ReceiptText className="size-4" />
                      {receipt.tableName} ·{' '}
                      {receipt.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'}
                    </span>
                    <span className="font-semibold">{formatVnd(receipt.paidAmount)}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat('vi-VN', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                        timeZone: staff!.restaurant.timezone,
                      }).format(new Date(receipt.completedAt))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Chưa có giao dịch thanh toán được ghi nhận.</EmptyState>
          )}
        </QueryState>
      </section>
    </div>
  );
}
export function CashierBill({ sessionId }: { sessionId: string }) {
  const { data: staff } = useStaff(),
    client = useQueryClient();
  const allowed = !!staff && ['OWNER', 'MANAGER', 'CASHIER', 'WAITER'].includes(staff.role);
  const query = useQuery({
    queryKey: ['billing', staff?.restaurantId, 'bill', sessionId],
    queryFn: ({ signal }) => api(`/billing/sessions/${sessionId}/bill`, billSchema, { signal }),
    enabled: allowed,
  });
  const canPay = !!staff && ['OWNER', 'MANAGER', 'CASHIER'].includes(staff.role);
  if (!allowed) return <EmptyState>Vai trò của bạn không được xem hóa đơn.</EmptyState>;
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/staff/cashier">
          <ArrowLeft />
          Về thu ngân
        </Link>
      </Button>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-widest text-primary">
            KIỂM TRA TRƯỚC KHI THU TIỀN
          </p>
          <h1 className="editorial text-4xl text-primary">
            {query.data?.table.name ?? 'Hóa đơn lượt bàn'}
          </h1>
        </div>
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void client.invalidateQueries({ queryKey: ['billing'] })}
        >
          <RefreshCw />
          Cập nhật hóa đơn
        </Button>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
            {query.data && (
              <>
                <SessionActions bill={query.data} canClose={canPay} />
                <div
                  className={`rounded-xl p-4 text-sm leading-7 ${query.data.canPay ? 'bg-secondary text-primary' : 'bg-amber-50 text-amber-900'}`}
                >
                  {query.data.canPay
                    ? `Tất cả ${query.data.validOrderCount} đơn hợp lệ đã phục vụ · Có thể thanh toán.`
                    : query.data.validOrderCount === 0
                      ? 'Phiên chưa có đơn tính tiền; đóng không thu tiền cần lý do.'
                      : `${query.data.blockingOrderCount} đơn chưa phục vụ xong. Hoàn tất hoặc hủy đúng quyền trước khi thanh toán.`}
                </div>
                <BillOrders orders={query.data.orders} />
                {!query.data.orders.length && <EmptyState>Phiên chưa có đơn.</EmptyState>}
              </>
            )}
          </QueryState>
        </div>
        <aside className="space-y-5 xl:sticky xl:top-5">
          {query.data && (
            <section className="rounded-2xl border bg-white p-5">
              <h2 className="mb-5 text-lg font-semibold">Hóa đơn tạm tính</h2>
              <BillTotals totals={query.data.totals} />
              <p className="mt-4 text-[11px] leading-6 text-muted-foreground">
                Phí tính sau giảm giá; thuế tính trên số tiền sau giảm giá cộng phí dịch vụ. Mỗi
                khoản làm tròn đến đồng.
              </p>
              {canPay && (
                <DiscountForm
                  key={query.data.revision}
                  bill={query.data}
                  cashier={staff!.role === 'CASHIER'}
                />
              )}
            </section>
          )}
          <PaymentPanel sessionId={sessionId} bill={query.isError ? undefined : query.data} canPay={canPay} />
        </aside>
      </div>
    </div>
  );
}
function DiscountForm({ bill, cashier }: { bill: Bill; cashier: boolean }) {
  const client = useQueryClient(),
    [amount, setAmount] = useState(String(bill.totals.discount)),
    [reason, setReason] = useState(bill.totals.discountReason ?? ''),
    [error, setError] = useState('');
  const save = useMutation({
    mutationFn: (body: unknown) =>
      api(`/billing/sessions/${bill.diningSessionId}/discount`, billSchema, {
        method: 'PATCH',
        body,
      }),
    onSettled: () => client.invalidateQueries({ queryKey: ['billing'] }),
  });
  const cap = cashier
    ? Math.floor((bill.totals.subtotal * bill.cashierMaxDiscountBps) / 10000)
    : bill.totals.subtotal;
  return (
    <form
      className="mt-6 space-y-4 border-t pt-5"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = discountInputSchema.safeParse({
          amount: amount === '' ? NaN : Number(amount),
          reason: Number(amount) > 0 ? reason : null,
          revision: bill.revision,
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]!.message);
          return;
        }
        setError('');
        save.mutate(parsed.data);
      }}
    >
      <h3 className="text-sm font-semibold">Giảm giá được phân quyền</h3>
      <p className="text-xs leading-6 text-muted-foreground">
        Hạn mức: {formatVnd(cap)}
        {cashier ? ` (${bill.cashierMaxDiscountBps / 100}% tiền món)` : ''}. Chỉ áp dụng sau khi
        phục vụ xong.
      </p>
      <Field label="Giảm giá (VND)">
        <Input
          type="number"
          min={0}
          max={cap}
          step={1}
          value={amount}
          disabled={!bill.canPay || save.isPending}
          onChange={(event) => setAmount(event.target.value)}
        />
      </Field>
      <Field label="Lý do giảm giá">
        <Input
          value={reason}
          maxLength={500}
          disabled={!bill.canPay || save.isPending}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      {(error || save.error) && (
        <p role="alert" className="text-xs text-destructive">
          {error || save.error?.message}
        </p>
      )}
      <Button className="w-full" variant="outline" disabled={!bill.canPay || save.isPending}>
        Lưu giảm giá
      </Button>
    </form>
  );
}
function SessionActions({ bill, canClose }: { bill: Bill; canClose: boolean }) {
  const client = useQueryClient(), router = useRouter(),
    [dialog, setDialog] = useState<'reopen' | 'close' | null>(null),
    [reason, setReason] = useState('');
  const transition = useMutation({
    mutationFn: (body: BillingSessionInput) =>
      api(`/billing/sessions/${bill.diningSessionId}/status`, billSchema, {
        method: 'POST',
        body,
      }),
    onSuccess: () => setDialog(null),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['billing'] }),
        client.invalidateQueries({ queryKey: ['setup'] }),
      ]),
  });
  const close = useMutation({
    mutationFn: () =>
      api(`/dining-sessions/tables/${bill.table.id}/close-empty`, z.object({ id: z.uuid() }), {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: () => { setDialog(null); router.push('/staff/cashier'); },
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['billing'] }),
        client.invalidateQueries({ queryKey: ['setup'] }),
      ]),
  });
  return (
    <section className="space-y-4 rounded-2xl border bg-white p-5">
      <p className="text-sm font-semibold">
        {bill.status === 'PAYMENT_REQUESTED'
          ? 'Chờ thanh toán · Tạm ngừng món mới'
          : 'Đang phục vụ · Có thể gọi thêm món'}
      </p>
      <div className="flex flex-wrap gap-3">
        {bill.status === 'OPEN' ? (
          <Button
            variant="outline"
            disabled={transition.isPending}
            onClick={() =>
              transition.mutate({ from: 'OPEN', to: 'PAYMENT_REQUESTED', reason: null })
            }
          >
            Tạm ngừng món để thanh toán
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => {
              setReason('');
              setDialog('reopen');
            }}
          >
            Mở lại để gọi thêm
          </Button>
        )}
        {canClose && bill.validOrderCount === 0 && (
          <Button
            variant="outline"
            onClick={() => {
              setReason('');
              setDialog('close');
            }}
          >
            Đóng phiên không thu tiền
          </Button>
        )}
      </div>
      {transition.error && !dialog && (
        <p role="alert" className="text-xs text-destructive">
          {transition.error.message}
        </p>
      )}
      {dialog && (
        <Editor
          open
          onOpenChange={(open) => {
            if (!open && !transition.isPending && !close.isPending) setDialog(null);
          }}
          title={dialog === 'reopen' ? 'Mở lại phiên gọi món' : 'Đóng phiên không thu tiền'}
          description={
            dialog === 'reopen'
              ? 'Khách có thể gọi thêm; yêu cầu thanh toán đang chờ sẽ được hoàn tất.'
              : 'Chỉ áp dụng khi không có đơn tính tiền. Lịch sử vẫn được giữ.'
          }
        >
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (dialog === 'reopen')
                transition.mutate({ from: 'PAYMENT_REQUESTED', to: 'OPEN', reason });
              else close.mutate();
            }}
          >
            <Field label="Lý do">
              <Input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={3}
                maxLength={500}
                required
              />
            </Field>
            {(transition.error || close.error) && (
              <p role="alert" className="text-sm text-destructive">
                {transition.error?.message || close.error?.message}
              </p>
            )}
            <Button disabled={transition.isPending || close.isPending}>
              Xác nhận {dialog === 'reopen' ? 'mở lại' : 'đóng phiên'}
            </Button>
          </form>
        </Editor>
      )}
    </section>
  );
}
