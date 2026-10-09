'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  historyPageSchema,
  historyDetailSchema,
  orderStatuses,
  formatVnd,
} from '@dineflow/shared';
import { api } from '@/lib/api';
import { useStaff } from '@/features/auth/use-staff';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QueryState, EmptyState, Field, selectClass } from '@/features/setup/shared';
import { BillOrders } from '@/features/billing/bill-display';
import {
  AdminHeader,
  AdminDenied,
  PeriodFilter,
  Pagination,
  useAdminPeriod,
  params,
  dateTime,
  tableClass,
  statusLabels,
} from './shared';

export function OrderHistory() {
  const { staff, allowed, period, setPeriod } = useAdminPeriod();
  const [draft, setDraft] = useState({ status: '', source: '', sessionStatus: '', number: '' });
  const [filters, setFilters] = useState(draft),
    [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['admin-history', staff?.restaurantId, period, filters, page],
    enabled: allowed && !!period,
    queryFn: ({ signal }) =>
      api(`/reports/orders?${params({ ...period!, ...filters, page })}`, historyPageSchema, {
        signal,
      }),
  });
  if (!allowed) return <AdminDenied />;
  return (
    <div className="space-y-7">
      <AdminHeader
        title="Lịch sử từng lượt gọi món."
        description="Đọc cả phiên đang phục vụ và đã đóng. Khoảng ngày lọc theo lúc tạo đơn; tiền món của đơn chưa phản ánh giảm giá, phí và thuế của bill."
      />
      {period && (
        <PeriodFilter
          period={period}
          timezone={staff!.restaurant.timezone}
          disabled={query.isFetching}
          onApply={(value) => {
            setPeriod(value);
            setFilters(draft);
            setPage(1);
          }}
        >
          <Field label="Trạng thái đơn">
            <select
              className={selectClass}
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value })}
            >
              <option value="">Tất cả</option>
              {orderStatuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nguồn đơn">
            <select
              className={selectClass}
              value={draft.source}
              onChange={(e) => setDraft({ ...draft, source: e.target.value })}
            >
              <option value="">Tất cả</option>
              <option value="GUEST">Khách QR</option>
              <option value="STAFF">Nhân viên ghi</option>
            </select>
          </Field>
          <Field label="Trạng thái phiên">
            <select
              className={selectClass}
              value={draft.sessionStatus}
              onChange={(e) => setDraft({ ...draft, sessionStatus: e.target.value })}
            >
              <option value="">Tất cả</option>
              {['OPEN', 'PAYMENT_REQUESTED', 'CLOSED'].map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Số đơn">
            <Input
              type="number"
              min={1}
              step={1}
              max={2147483647}
              placeholder="Tất cả số đơn"
              value={draft.number}
              onChange={(e) => setDraft({ ...draft, number: e.target.value })}
            />
          </Field>
        </PeriodFilter>
      )}
      <div className="flex justify-end">
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Cập nhật lịch sử
        </Button>
      </div>
      <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
        {query.data && (
          <div className="space-y-5">
            {!query.data.orders.length ? (
              <EmptyState>Không có đơn khớp bộ lọc.</EmptyState>
            ) : (
              <div className="overflow-x-auto rounded-2xl border bg-white">
                <table className={tableClass}>
                  <caption className="sr-only">Lịch sử các đơn của nhà hàng</caption>
                  <thead>
                    <tr>
                      {[
                        'Đơn',
                        'Bàn hiện tại',
                        'Tạo lúc',
                        'Trạng thái',
                        'Nguồn',
                        'Tiền món',
                        'Phiên',
                      ].map((label) => (
                        <th scope="col" key={label}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.orders.map((row) => (
                      <tr key={row.id}>
                        <th scope="row">
                          <Link
                            className="font-semibold text-primary underline underline-offset-4"
                            href={`/admin/orders/${row.id}`}
                          >
                            #{row.number}
                          </Link>
                        </th>
                        <td>{row.session.tableName}</td>
                        <td className="whitespace-nowrap">
                          {dateTime(row.createdAt, query.data.timezone)}
                        </td>
                        <td>{statusLabels[row.status]}</td>
                        <td>{row.source === 'GUEST' ? 'Khách QR' : 'Nhân viên'}</td>
                        <td className="whitespace-nowrap tabular-nums">
                          {formatVnd(row.totalAmount)}
                        </td>
                        <td>{statusLabels[row.session.status]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination
              page={query.data.page}
              total={query.data.total}
              pageSize={query.data.pageSize}
              disabled={query.isFetching}
              onPage={setPage}
            />
          </div>
        )}
      </QueryState>
    </div>
  );
}
export function OrderHistoryDetail({ orderId }: { orderId: string }) {
  const { data: staff } = useStaff(),
    allowed = !!staff && ['OWNER', 'MANAGER'].includes(staff.role);
  const query = useQuery({
    queryKey: ['admin-history', staff?.restaurantId, 'detail', orderId],
    enabled: allowed,
    queryFn: ({ signal }) => api(`/reports/orders/${orderId}`, historyDetailSchema, { signal }),
  });
  if (!allowed) return <AdminDenied />;
  const data = query.data;
  return (
    <div className="space-y-7">
      <Button asChild variant="ghost">
        <Link href="/admin/orders">← Về lịch sử đơn</Link>
      </Button>
      <AdminHeader
        title={data ? `Đơn #${data.number}` : 'Chi tiết đơn'}
        description="Tên món, giá và tùy chọn giữ theo snapshot khi gửi đơn. Biên nhận thanh toán giữ riêng snapshot tại thời điểm đã thu tiền."
      />
      <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
        {data && (
          <div className="space-y-6">
            <section className="space-y-4 rounded-2xl border bg-white p-5">
              <div className="flex flex-wrap gap-5 text-sm">
                <span>
                  Bàn hiện tại: <strong>{data.session.tableName}</strong>
                </span>
                <span>{statusLabels[data.session.status]}</span>
                <span>{data.source === 'GUEST' ? 'Khách QR' : 'Nhân viên ghi đơn'}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Mở phiên {dateTime(data.session.openedAt, staff!.restaurant.timezone)}
                {data.session.closedAt &&
                  ` · Đóng ${dateTime(data.session.closedAt, staff!.restaurant.timezone)}`}
              </p>
              {data.paymentId ? (
                <Button asChild variant="outline">
                  <Link href={`/staff/cashier/receipts/${data.paymentId}`}>
                    Xem biên nhận của phiên
                  </Link>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Phiên chưa có giao dịch thanh toán; đóng không thu tiền sẽ không có biên nhận.
                </p>
              )}
              {data.order.note && (
                <p className="break-words text-sm leading-7">Ghi chú đơn: {data.order.note}</p>
              )}
              {data.order.cancellationReason && (
                <p className="break-words text-sm leading-7 text-destructive">
                  Lý do hủy: {data.order.cancellationReason}
                </p>
              )}
            </section>
            <BillOrders orders={[data.order]} />
            <section className="rounded-2xl border bg-white p-5">
              <h2 className="mb-4 text-lg font-semibold">Mốc xử lý đã ghi nhận</h2>
              <dl className="grid gap-4 text-xs sm:grid-cols-2">
                {[
                  ['Tạo đơn', data.createdAt],
                  ['Xác nhận', data.order.acceptedAt],
                  ['Chế biến', data.order.preparingAt],
                  ['Sẵn sàng', data.order.readyAt],
                  ['Phục vụ', data.order.servedAt],
                  ['Hủy', data.order.cancelledAt],
                ]
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="mt-2">{dateTime(value!, staff!.restaurant.timezone)}</dd>
                    </div>
                  ))}
              </dl>
            </section>
            {data.order.items.some((item) => item.note) && (
              <section className="space-y-3 rounded-2xl border bg-white p-5">
                <h2 className="font-semibold">Ghi chú món</h2>
                {data.order.items
                  .filter((item) => item.note)
                  .map((item) => (
                    <p className="break-words text-sm leading-7" key={item.id}>
                      {item.name}: {item.note}
                    </p>
                  ))}
              </section>
            )}
          </div>
        )}
      </QueryState>
    </div>
  );
}
