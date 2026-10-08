'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  serviceRequestPageSchema,
  serviceRequestSchema,
  serviceRequestStatuses,
  type ServiceRequestTransition,
} from '@dineflow/shared';
import { api } from '@/lib/api';
import { useStaff } from '@/features/auth/use-staff';
import { Button } from '@/components/ui/button';
import { EmptyState, QueryState } from '@/features/setup/shared';
import { requestLabels, requestStatusLabels } from './table-service';

type RequestCard = ReturnType<typeof serviceRequestPageSchema.parse>['requests'][number];
function RequestCard({ request }: { request: RequestCard }) {
  const { data: staff } = useStaff(),
    client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: ServiceRequestTransition) =>
      api(`/service-requests/${request.id}/status`, serviceRequestSchema, {
        method: 'PATCH',
        body: input,
      }),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ['service-requests'] });
    },
  });
  const canAct =
    request.status !== 'RESOLVED' &&
    (staff?.role !== 'CASHIER' || request.type === 'REQUEST_PAYMENT');
  return (
    <article data-request-id={request.id} className="space-y-4 rounded-2xl border bg-white p-5">
      <div>
        <h2 className="text-lg font-semibold">{request.table.name}</h2>
        <p className="mt-2 text-sm text-primary">{requestLabels[request.type]}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(
            new Date(request.createdAt),
          )}
        </p>
      </div>
      <p className="rounded-xl bg-secondary p-3 text-xs text-primary">
        {requestStatusLabels[request.status]}
      </p>
      {request.type === 'REQUEST_PAYMENT' && (
        <p className="text-xs leading-6 text-muted-foreground">
          Đây là yêu cầu hỗ trợ thanh toán; hoàn tất yêu cầu không ghi nhận tiền hoặc đóng bàn.
        </p>
      )}
      {canAct && (
        <Button
          className="w-full"
          disabled={mutation.isPending}
          onClick={() =>
            mutation.mutate({
              from: request.status,
              to: request.status === 'PENDING' ? 'ACKNOWLEDGED' : 'RESOLVED',
            })
          }
        >
          {mutation.isPending
            ? 'Đang cập nhật…'
            : request.status === 'PENDING'
              ? 'Tiếp nhận yêu cầu'
              : 'Đã hỗ trợ khách'}
        </Button>
      )}
      {mutation.error && (
        <p role="alert" className="text-xs text-destructive">
          {mutation.error.message}
        </p>
      )}
    </article>
  );
}
export function ServiceRequests() {
  const { data: staff } = useStaff(),
    [status, setStatus] = useState<(typeof serviceRequestStatuses)[number]>('PENDING'),
    [page, setPage] = useState(1);
  const allowed = !!staff && ['OWNER', 'MANAGER', 'WAITER', 'CASHIER'].includes(staff.role);
  const query = useQuery({
    queryKey: ['service-requests', staff?.restaurantId, status, page],
    queryFn: ({ signal }) =>
      api(`/service-requests?status=${status}&page=${page}&pageSize=12`, serviceRequestPageSchema, {
        signal,
      }),
    enabled: allowed,
  });
  if (!allowed) return <EmptyState>Vai trò của bạn không được xem yêu cầu phục vụ.</EmptyState>;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-widest text-primary">
            CHĂM CHÚT TẠI BÀN
          </p>
          <h1 className="editorial text-4xl text-primary">Khách cần, mình có mặt.</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Tiếp nhận và ghi nhận hỗ trợ để cả đội cùng nắm rõ.
          </p>
        </div>
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          Cập nhật yêu cầu
        </Button>
      </div>
      <nav aria-label="Trạng thái yêu cầu" className="flex gap-2 overflow-x-auto pb-2">
        {serviceRequestStatuses.map((value) => (
          <Button
            key={value}
            variant={status === value ? 'default' : 'outline'}
            aria-pressed={status === value}
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
          >
            {requestStatusLabels[value]}
          </Button>
        ))}
      </nav>
      <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
        {query.data?.requests.length ? (
          <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {query.data.requests.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
          </div>
        ) : (
          <EmptyState>Chưa có yêu cầu trong trạng thái này.</EmptyState>
        )}
      </QueryState>
      {query.data && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Trước
          </Button>
          <span>
            {query.data.total} yêu cầu · Trang {page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page * 12 >= query.data.total}
            onClick={() => setPage(page + 1)}
          >
            Sau
          </Button>
        </div>
      )}
    </div>
  );
}
