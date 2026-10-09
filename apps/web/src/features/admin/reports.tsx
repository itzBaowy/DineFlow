'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportSchema, formatVnd, type RevenueReport } from '@dineflow/shared';
import { RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { QueryState, EmptyState, Field, selectClass } from '@/features/setup/shared';
import {
  AdminHeader,
  AdminDenied,
  PeriodFilter,
  Pagination,
  useAdminPeriod,
  params,
  dateTime,
  tableClass,
  type Period,
} from './shared';

export function Reports() {
  const { staff, allowed, period, setPeriod } = useAdminPeriod();
  const [groupBy, setGroupBy] = useState<'day' | 'month'>('day'),
    [method, setMethod] = useState('');
  const [applied, setApplied] = useState<{
    groupBy: 'day' | 'month';
    method?: 'CASH' | 'BANK_TRANSFER';
  }>({ groupBy: 'day' });
  const query = useQuery({
    queryKey: ['admin-reports', staff?.restaurantId, period, applied],
    enabled: allowed && !!period,
    queryFn: ({ signal }) =>
      api(`/reports/revenue?${params({ ...period!, ...applied })}`, reportSchema, { signal }),
  });
  if (!allowed) return <AdminDenied />;
  return (
    <div className="space-y-7">
      <AdminHeader
        title="Hiểu nhịp quán, rõ từng ngày."
        description="Doanh thu từ các giao dịch đã hoàn tất. Đơn chưa thanh toán và đơn hủy không làm tăng tiền đã thu."
      />
      {period && (
        <PeriodFilter
          period={period}
          timezone={staff!.restaurant.timezone}
          disabled={query.isFetching}
          onApply={(value: Period) => {
            setPeriod(value);
            setApplied({
              groupBy,
              method: method ? (method as 'CASH' | 'BANK_TRANSFER') : undefined,
            });
          }}
        >
          <Field label="Gom nhóm">
            <select
              className={selectClass}
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as 'day' | 'month')}
            >
              <option value="day">Theo ngày</option>
              <option value="month">Theo tháng</option>
            </select>
          </Field>
          <Field label="Phương thức thanh toán">
            <select
              className={selectClass}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="">Tất cả</option>
              <option value="CASH">Tiền mặt</option>
              <option value="BANK_TRANSFER">Chuyển khoản</option>
            </select>
          </Field>
        </PeriodFilter>
      )}
      <div className="flex justify-end">
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw />
          Cập nhật báo cáo
        </Button>
      </div>
      <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
        {query.data && (
          <ReportContent key={params({ ...period!, ...applied })} report={query.data} />
        )}
      </QueryState>
    </div>
  );
}
function ReportContent({ report }: { report: RevenueReport }) {
  const [page, setPage] = useState(Math.max(1, Math.ceil(report.buckets.length / 20))),
    totals = report.totals;
  const metrics = [
    ['Tiền đã thu', formatVnd(totals.collected)],
    ['Hóa đơn đã thanh toán', String(totals.paymentCount)],
    ['Giá trị trung bình', formatVnd(totals.averagePayment)],
    ['Tiền món trước giảm giá', formatVnd(totals.subtotal)],
  ];
  const peak = Math.max(1, ...report.buckets.map((row) => row.collected));
  return (
    <div className="space-y-6">
      <p className="text-xs leading-6 text-muted-foreground">
        Kỳ {report.from} → {report.to} · {report.timezone} · Dữ liệu lúc{' '}
        {dateTime(report.generatedAt, report.timezone)}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value]) => (
          <section key={label} className="min-w-0 rounded-2xl border bg-white p-5">
            <h2 className="text-xs leading-6 text-muted-foreground">{label}</h2>
            <p
              data-report-metric={label}
              className="mt-4 break-words text-2xl font-semibold tracking-tight text-primary tabular-nums"
            >
              {value}
            </p>
          </section>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-7 gap-y-3 rounded-xl bg-secondary p-4 text-xs leading-6">
        <span>
          Giảm giá: <strong>{formatVnd(totals.discount)}</strong>
        </span>
        <span>
          Phí dịch vụ: <strong>{formatVnd(totals.serviceCharge)}</strong>
        </span>
        <span>
          Thuế: <strong>{formatVnd(totals.tax)}</strong>
        </span>
      </div>
      {!totals.paymentCount && (
        <EmptyState>Chưa có giao dịch hoàn tất trong kỳ đã chọn.</EmptyState>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[2fr_1fr]">
        <section className="min-w-0 space-y-5 rounded-2xl border bg-white p-5">
          <h2 className="editorial text-2xl text-primary">
            Tiền đã thu theo {report.groupBy === 'day' ? 'ngày' : 'tháng'}
          </h2>
          <p className="text-xs leading-6 text-muted-foreground">
            Ngày/tháng không phát sinh vẫn hiện 0. Số liệu chi tiết trong bảng bên dưới.
          </p>
          <div className="overflow-x-auto" aria-hidden="true">
            <div
              className="flex h-56 items-end gap-0.5 border-b pb-7 pt-4"
              style={{ minWidth: report.buckets.length * 6 }}
            >
              {report.buckets.map((row, index) => (
                <div
                  className="relative flex h-full flex-1 items-end"
                  key={row.period}
                  title={`${row.period}: ${formatVnd(row.collected)}`}
                >
                  <div
                    className="w-full rounded-t bg-primary"
                    style={{
                      height: `${Math.max(row.collected ? 2 : 0, (row.collected / peak) * 100)}%`,
                    }}
                  />
                  {index % Math.max(1, Math.ceil(report.buckets.length / 6)) === 0 && (
                    <span className="absolute -bottom-6 left-0 whitespace-nowrap text-[9px] text-muted-foreground">
                      {report.groupBy === 'month'
                        ? row.period.slice(0, 7)
                        : row.period.slice(5)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <caption className="sr-only">Chi tiết tiền đã thu, giảm giá, phí và thuế</caption>
              <thead>
                <tr>
                  {['Kỳ', 'Hóa đơn', 'Tiền món', 'Giảm giá', 'Phí', 'Thuế', 'Đã thu'].map(
                    (label) => (
                      <th scope="col" key={label}>
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {report.buckets.slice((page - 1) * 20, page * 20).map((row) => (
                  <tr key={row.period}>
                    <th scope="row">
                      {report.groupBy === 'month' ? row.period.slice(0, 7) : row.period}
                    </th>
                    <td>{row.paymentCount}</td>
                    {[
                      row.subtotal,
                      row.discount,
                      row.serviceCharge,
                      row.tax,
                      row.collected,
                    ].map((value, index) => (
                      <td className="whitespace-nowrap tabular-nums" key={index}>
                        {formatVnd(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            total={report.buckets.length}
            pageSize={20}
            onPage={setPage}
          />
        </section>
        <aside className="space-y-5">
          <section className="space-y-4 rounded-2xl border bg-white p-5">
            <h2 className="editorial text-2xl text-primary">Phân bổ phương thức</h2>
            {report.methods.map((row) => (
              <div key={row.method} className="space-y-2 border-t pt-4">
                <h3 className="text-sm font-semibold">
                  {row.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản xác nhận thủ công'}
                </h3>
                <p className="text-lg font-semibold text-primary">{formatVnd(row.collected)}</p>
                <p className="text-xs text-muted-foreground">{row.paymentCount} hóa đơn</p>
              </div>
            ))}
          </section>
          <section className="space-y-4 rounded-2xl border bg-white p-5">
            <h2 className="editorial text-2xl text-primary">Món bán chạy</h2>
            <p className="text-xs leading-6 text-muted-foreground">
              10 nhóm tên món snapshot từ phiên đã thanh toán. Tiền món gồm tùy chọn, trước giảm
              giá/phí/thuế của bill.
            </p>
            {!report.bestSellers.length ? (
              <p className="text-sm text-muted-foreground">Chưa có món đã thanh toán.</p>
            ) : (
              <ol className="space-y-4">
                {report.bestSellers.map((row, index) => (
                  <li
                    key={`${row.menuItemId}:${row.name}`}
                    className="flex gap-3 border-t pt-4"
                  >
                    <span className="text-sm text-muted-foreground">{index + 1}.</span>
                    <div className="min-w-0 space-y-2">
                      <p className="break-words text-sm font-semibold">{row.name}</p>
                      <p className="text-xs">
                        {row.quantity} phần · {row.orderCount} đơn đã thanh toán
                      </p>
                      <p className="text-xs font-semibold text-primary">
                        {formatVnd(row.lineAmount)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
