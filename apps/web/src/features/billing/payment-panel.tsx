'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  paymentInputSchema,
  receiptSchema,
  formatVnd,
  type Bill,
  type PaymentInput,
  type Receipt,
} from '@dineflow/shared';
import { useStaff } from '@/features/auth/use-staff';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Editor, Field } from '@/features/setup/shared';

const storedSchema = z.object({ sessionId: z.uuid(), payload: paymentInputSchema });
export function PaymentPanel({
  sessionId,
  bill,
  canPay,
}: {
  sessionId: string;
  bill?: Bill;
  canPay: boolean;
}) {
  const { data: staff } = useStaff(),
    client = useQueryClient(),
    router = useRouter();
  const key = staff ? `dineflow.payment.v1:${staff.userId}:${sessionId}` : '';
  const [pending, setPending] = useState<PaymentInput | null>(null),
    [ready, setReady] = useState(false),
    [draft, setDraft] = useState<PaymentInput | null>(null),
    [localError, setLocalError] = useState('');
  const retrying = useRef(false);
  useEffect(() => {
    if (!key) return;
    let disposed = false;
    queueMicrotask(() => {
      if (disposed) return;
      try {
        const stored = sessionStorage.getItem(key);
        if (stored) {
          const parsed = storedSchema.safeParse(JSON.parse(stored));
          if (parsed.success && parsed.data.sessionId === sessionId)
            setPending(parsed.data.payload);
          else
            setLocalError(
              'Trạng thái gửi tiền lưu trong trình duyệt không hợp lệ. Kiểm tra giao dịch đã ghi nhận trước khi tiếp tục.',
            );
        }
        setReady(true);
      } catch {
        setLocalError(
          'Không đọc được trạng thái gửi. Kiểm tra giao dịch đã ghi nhận trước khi tiếp tục.',
        );
      }
    });
    return () => {
      disposed = true;
    };
  }, [key, sessionId]);
  function clear() {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* A successful receipt is still authoritative. */
    }
    setPending(null);
  }
  function received(receipt: Receipt) {
    clear();
    client.setQueryData(['billing', staff?.restaurantId, 'receipt', receipt.id], receipt);
    router.push(`/staff/cashier/receipts/${receipt.id}`);
  }
  const payment = useMutation({
    mutationFn: (payload: PaymentInput) =>
      api(`/billing/sessions/${sessionId}/payments`, receiptSchema, {
        method: 'POST',
        body: payload,
      }),
    retry: false,
    onSuccess: received,
    onError: (error) => {
      if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        !retrying.current
      )
        clear();
    },
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['billing'] }),
        client.invalidateQueries({ queryKey: ['setup'] }),
        client.invalidateQueries({ queryKey: ['operations'] }),
      ]),
  });
  const check = useMutation({
    mutationFn: () => api(`/billing/sessions/${sessionId}/receipt`, receiptSchema),
    onSuccess: received,
  });
  return (
    <section className="space-y-5 rounded-2xl border bg-white p-5">
      <h2 className="text-lg font-semibold">Ghi nhận đã nhận tiền</h2>
      <p className="text-xs leading-6 text-muted-foreground">
        Một lần thanh toán toàn bộ phiên. Chuyển khoản do nhân viên kiểm tra thủ công; hệ thống
        không xác minh tiền về tài khoản.
      </p>
      {pending ? (
        <div className="space-y-4 rounded-xl bg-amber-50 p-4">
          <p className="text-sm font-semibold">
            {payment.isPending
              ? 'Đang ghi nhận thanh toán…'
              : 'Yêu cầu thanh toán cần được kiểm tra'}
          </p>
          <p className="text-xs leading-6">
            {pending.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'} ·{' '}
            {formatVnd(pending.paidAmount)}. Khi mất phản hồi, kiểm tra biên nhận hoặc gửi lại
            đúng yêu cầu này.
          </p>
          {canPay && (
            <Button
              className="w-full"
              disabled={payment.isPending || check.isPending}
              onClick={() => {
                retrying.current = true;
                payment.mutate(pending);
              }}
            >
              Thử lại cùng mã thanh toán
            </Button>
          )}
        </div>
      ) : canPay && ready && bill ? (
        <NewPayment
          key={bill.revision}
          bill={bill}
          disabled={!bill.canPay || payment.isPending}
          review={setDraft}
        />
      ) : (
        <p className="text-sm leading-7 text-muted-foreground">
          {!canPay
            ? 'Vai trò của bạn chỉ xem hóa đơn và biên nhận.'
            : 'Cần hóa đơn hiện tại và tất cả đơn hợp lệ đã phục vụ để xác nhận.'}
        </p>
      )}
      {(localError || payment.error) && (
        <p role="alert" className="text-sm leading-6 text-destructive">
          {localError || payment.error?.message}
        </p>
      )}
      <Button
        className="w-full"
        variant="outline"
        disabled={payment.isPending || check.isPending}
        onClick={() => check.mutate()}
      >
        Kiểm tra giao dịch đã ghi nhận
      </Button>
      {check.error && (
        <p role="alert" className="text-xs leading-6 text-destructive">
          {check.error.message}
        </p>
      )}
      {draft && (
        <Editor
          open
          onOpenChange={(open) => {
            if (!open) setDraft(null);
          }}
          title="Xác nhận đã nhận đủ tiền"
          description="Kiểm tra số tiền thực tế trước khi ghi nhận và đóng phiên bàn."
        >
          <div className="space-y-5">
            <p className="text-lg font-semibold">
              {bill?.table.name} · {formatVnd(draft.paidAmount)}
            </p>
            <p className="text-sm">
              {draft.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản xác nhận thủ công'}
              {draft.reference && ` · ${draft.reference}`}
            </p>
            <p className="text-sm leading-7 text-muted-foreground">
              Sau xác nhận, phiên đóng và bàn chuyển Cần dọn. Các đơn và biên nhận được giữ
              nguyên.
            </p>
            {bill?.revision !== draft.revision && (
              <p role="alert" className="text-sm text-destructive">
                Hóa đơn đã thay đổi. Đóng hộp thoại rồi kiểm tra lại.
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="outline" onClick={() => setDraft(null)}>
                Kiểm tra lại
              </Button>
              <Button
                disabled={!canPay || bill?.revision !== draft.revision}
                onClick={() => {
                  try {
                    sessionStorage.setItem(key, JSON.stringify({ sessionId, payload: draft }));
                  } catch {
                    setLocalError(
                      'Không lưu được mã gửi trong trình duyệt. Chưa gửi yêu cầu thanh toán.',
                    );
                    setDraft(null);
                    return;
                  }
                  setLocalError('');
                  setPending(draft);
                  setDraft(null);
                  retrying.current = false;
                  payment.mutate(draft);
                }}
              >
                Xác nhận thanh toán & đóng phiên
              </Button>
            </div>
          </div>
        </Editor>
      )}
    </section>
  );
}
function NewPayment({
  bill,
  disabled,
  review,
}: {
  bill: Bill;
  disabled: boolean;
  review: (payload: PaymentInput) => void;
}) {
  const [method, setMethod] = useState<PaymentInput['method']>('CASH'),
    [paid, setPaid] = useState(String(bill.totals.total)),
    [reference, setReference] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState('');
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!confirmed) {
          setError('Cần xác nhận đã kiểm tra và nhận đủ tiền.');
          return;
        }
        const parsed = paymentInputSchema.safeParse({
          idempotencyKey: crypto.randomUUID(),
          revision: bill.revision,
          method,
          paidAmount: paid === '' ? NaN : Number(paid),
          reference: method === 'BANK_TRANSFER' ? reference : null,
          receivedConfirmed: confirmed,
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]!.message);
          return;
        }
        if (parsed.data.paidAmount !== bill.totals.total) {
          setError('Số tiền đã nhận phải bằng tổng hóa đơn.');
          return;
        }
        setError('');
        review(parsed.data);
      }}
    >
      <fieldset disabled={disabled} className="space-y-4">
        <legend className="mb-3 text-xs font-semibold">Phương thức thanh toán</legend>
        <div className="grid grid-cols-2 gap-3">
          {(['CASH', 'BANK_TRANSFER'] as const).map((value) => (
            <label
              key={value}
              className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs ${method === value ? 'border-primary bg-secondary' : 'bg-white'}`}
            >
              <input
                type="radio"
                name="payment-method"
                value={value}
                checked={method === value}
                onChange={() => setMethod(value)}
              />
              {value === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'}
            </label>
          ))}
        </div>
        <Field label="Số tiền đã nhận (VND)">
          <Input
            type="number"
            min={0}
            step={1}
            value={paid}
            onChange={(event) => setPaid(event.target.value)}
          />
        </Field>
        {method === 'BANK_TRANSFER' && (
          <Field label="Mã giao dịch đã kiểm tra">
            <Input
              value={reference}
              maxLength={120}
              onChange={(event) => setReference(event.target.value)}
              required
              minLength={3}
            />
          </Field>
        )}
        <label className="flex items-start gap-3 text-xs leading-6">
          <input
            type="checkbox"
            className="mt-1 size-4 shrink-0"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          Tôi đã kiểm tra và nhận đủ tiền từ khách.
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <Button className="w-full" disabled={disabled || !confirmed}>
        Kiểm tra & xác nhận thanh toán
      </Button>
    </form>
  );
}
