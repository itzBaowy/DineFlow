'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { HandPlatter, Receipt } from 'lucide-react';
import { serviceRequestSchema, type ServiceRequestInput } from '@dineflow/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Editor, QueryState } from '@/features/setup/shared';

export const requestLabels = { CALL_STAFF: 'Gọi nhân viên', REQUEST_PAYMENT: 'Yêu cầu thanh toán' };
export const requestStatusLabels = {
  PENDING: 'Chờ phản hồi',
  ACKNOWLEDGED: 'Nhân viên đã tiếp nhận',
  RESOLVED: 'Đã xử lý',
};
export function TableService({ code, sessionId }: { code: string; sessionId: string }) {
  const client = useQueryClient(),
    [confirmPayment, setConfirmPayment] = useState(false);
  const path = `/public/tables/${encodeURIComponent(code)}/service-requests`;
  const query = useQuery({
    queryKey: ['guest-service-requests', code, sessionId],
    queryFn: ({ signal }) => api(path, z.array(serviceRequestSchema), { signal, refresh: false }),
  });
  const mutation = useMutation({
    mutationFn: (type: ServiceRequestInput['type']) =>
      api(path, serviceRequestSchema, {
        method: 'POST',
        body: { type, diningSessionId: sessionId },
        refresh: false,
      }),
    onSuccess: () => setConfirmPayment(false),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['guest-service-requests', code] }),
        client.invalidateQueries({ queryKey: ['customer-menu', code] }),
      ]);
    },
  });
  return (
    <section
      className="my-6 rounded-2xl border bg-white p-5"
      aria-labelledby="table-service-heading"
    >
      <h2 id="table-service-heading" className="text-sm font-semibold">
        Dịch vụ tại bàn
      </h2>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">
        Các yêu cầu hỗ trợ chung cho bàn trong lượt phục vụ này.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(['CALL_STAFF', 'REQUEST_PAYMENT'] as const).map((type) => {
          const active = query.data?.some(
            (request) => request.type === type && request.status !== 'RESOLVED',
          );
          const Icon = type === 'CALL_STAFF' ? HandPlatter : Receipt;
          return (
            <Button
              key={type}
              variant={type === 'CALL_STAFF' ? 'default' : 'outline'}
              disabled={mutation.isPending || query.isPending || !!query.error || active}
              onClick={() =>
                type === 'REQUEST_PAYMENT' ? setConfirmPayment(true) : mutation.mutate(type)
              }
            >
              <Icon />
              {requestLabels[type]}
            </Button>
          );
        })}
      </div>
      {mutation.error && !confirmPayment && (
        <p role="alert" className="mt-4 text-xs leading-6 text-destructive">
          {mutation.error.message}
        </p>
      )}
      <div className="mt-4">
        <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
          <ul className="space-y-3">
            {query.data?.slice(0, 4).map((request) => (
              <li key={request.id} className="rounded-xl bg-background px-4 py-3 text-xs">
                <p className="font-medium">
                  {requestLabels[request.type]} · {requestStatusLabels[request.status]}
                </p>
                <p className="mt-2 text-muted-foreground">
                  {new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(
                    new Date(request.createdAt),
                  )}
                </p>
              </li>
            ))}
          </ul>
        </QueryState>
      </div>
      <p className="mt-4 text-[11px] leading-6 text-muted-foreground">
        Yêu cầu thanh toán báo nhân viên và tạm ngừng nhận món mới. Tiền chưa được ghi nhận thanh
        toán.
      </p>
      {confirmPayment && (
        <Editor
          open
          onOpenChange={(open) => {
            if (!mutation.isPending) setConfirmPayment(open);
          }}
          title="Yêu cầu thanh toán?"
          description="Nhân viên sẽ đến hỗ trợ tại bàn; yêu cầu này chưa ghi nhận thanh toán."
        >
          <p className="text-sm leading-7 text-muted-foreground">
            Bàn sẽ tạm ngừng nhận thêm món. Kiểm tra giỏ hàng trước khi gửi yêu cầu.
          </p>
          {mutation.error && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {mutation.error.message}
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setConfirmPayment(false)}
            >
              Gọi món tiếp
            </Button>
            <Button
              disabled={mutation.isPending}
              onClick={() => mutation.mutate('REQUEST_PAYMENT')}
            >
              {mutation.isPending ? 'Đang gửi…' : 'Gửi yêu cầu thanh toán'}
            </Button>
          </div>
        </Editor>
      )}
    </section>
  );
}
