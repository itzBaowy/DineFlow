'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { activityPageSchema, staffPageSchema } from '@dineflow/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QueryState, EmptyState, Field, selectClass } from '@/features/setup/shared';
import {
  AdminHeader,
  AdminDenied,
  PeriodFilter,
  Pagination,
  useAdminPeriod,
  params,
  dateTime,
} from './shared';

const labels: Record<string, string> = {
  'auth.login': 'Đăng nhập',
  'auth.logout': 'Đăng xuất',
  'auth.refresh_replay': 'Thu hồi phiên do token bị dùng lại',
  'order.created': 'Gửi đơn',
  'order.status_changed': 'Chuyển trạng thái đơn',
  'payment.completed': 'Ghi nhận thanh toán',
  'billing.discount_updated': 'Cập nhật giảm giá',
  'dining_session.opened': 'Mở phiên bàn',
  'dining_session.closed': 'Đóng phiên đã thanh toán',
  'dining_session.closed_empty': 'Đóng không thu tiền',
  'dining_session.reopened': 'Mở lại để gọi thêm',
  'dining_session.payment_requested': 'Yêu cầu thanh toán',
  'staff.created': 'Tạo nhân viên',
  'staff.updated': 'Cập nhật nhân viên',
  'staff.password_reset': 'Đặt lại mật khẩu',
};
export function Activity() {
  const { staff, allowed, period, setPeriod } = useAdminPeriod();
  const [draft, setDraft] = useState({ action: '', actorUserId: '' }),
    [filters, setFilters] = useState(draft),
    [page, setPage] = useState(1);
  const members = useQuery({
    queryKey: ['admin-staff', staff?.restaurantId, 'actors'],
    enabled: allowed,
    queryFn: ({ signal }) => api('/staff?pageSize=50', staffPageSchema, { signal }),
  });
  const query = useQuery({
    queryKey: ['admin-activity', staff?.restaurantId, period, filters, page],
    enabled: allowed && !!period,
    queryFn: ({ signal }) =>
      api(`/reports/activity?${params({ ...period!, ...filters, page })}`, activityPageSchema, {
        signal,
      }),
  });
  if (!allowed) return <AdminDenied />;
  return (
    <div className="space-y-7">
      <AdminHeader
        title="Rõ từng thao tác, giữ từng dấu mốc."
        description="Nhật ký chỉ đọc theo nhà hàng. Hoạt động khách/hệ thống không có tên nhân viên; dữ liệu đăng nhập, mật khẩu và token không hiển thị."
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
          <Field label="Mã hành động">
            <Input
              placeholder="Ví dụ: payment.completed"
              value={draft.action}
              maxLength={120}
              onChange={(e) => setDraft({ ...draft, action: e.target.value })}
            />
          </Field>
          <Field label="Nhân viên thực hiện">
            <select
              className={selectClass}
              value={draft.actorUserId}
              onChange={(e) => setDraft({ ...draft, actorUserId: e.target.value })}
            >
              <option value="">Tất cả</option>
              {members.data?.members.map((member) => (
                <option key={member.id} value={member.userId}>
                  {member.name}
                  {!member.isActive ? ' · Đã khóa' : ''}
                </option>
              ))}
            </select>
          </Field>
        </PeriodFilter>
      )}
      {members.error && (
        <p role="alert" className="text-xs text-destructive">
          Không tải được bộ lọc nhân viên: {members.error.message}
        </p>
      )}
      {!!members.data && members.data.total > 50 && (
        <p className="text-xs text-muted-foreground">
          Bộ chọn hiển thị 50 nhân viên đầu tiên; dùng mã hành động và khoảng ngày để lọc các
          hoạt động còn lại.
        </p>
      )}
      <div className="flex justify-end">
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Cập nhật nhật ký
        </Button>
      </div>
      <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
        {query.data && (
          <div className="space-y-5">
            {query.data.entries.length ? (
              <ol className="space-y-4">
                {query.data.entries.map((entry) => (
                  <li key={entry.id} className="space-y-4 rounded-2xl border bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="break-words text-sm font-semibold">
                          {labels[entry.action] ?? entry.action}
                        </h2>
                        <p className="mt-2 break-all text-xs text-muted-foreground">
                          {entry.action} · {entry.actor?.name ?? 'Khách / hệ thống'}
                        </p>
                      </div>
                      <time
                        className="text-xs text-muted-foreground"
                        dateTime={entry.createdAt}
                      >
                        {dateTime(entry.createdAt, query.data.timezone)}
                      </time>
                    </div>
                    <p className="break-all text-xs leading-6 text-muted-foreground">
                      {entry.entityType}
                      {entry.entityId && ` · ${entry.entityId}`}
                    </p>
                    {Object.keys(entry.details).length > 0 && (
                      <dl className="grid gap-3 rounded-xl bg-background p-4 text-xs sm:grid-cols-2">
                        {Object.entries(entry.details).map(([key, value]) => (
                          <div className="min-w-0" key={key}>
                            <dt className="text-muted-foreground">
                              {key === 'reason'
                                ? 'Lý do'
                                : key === 'from'
                                  ? 'Trước'
                                  : key === 'to'
                                    ? 'Sau'
                                    : key}
                            </dt>
                            <dd className="mt-1 break-words leading-6">
                              {value === null ? '—' : String(value)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState>Không có hoạt động khớp bộ lọc.</EmptyState>
            )}
            <Pagination
              page={query.data.page}
              total={query.data.total}
              pageSize={query.data.pageSize}
              onPage={setPage}
              disabled={query.isFetching}
            />
          </div>
        )}
      </QueryState>
    </div>
  );
}
