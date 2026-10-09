'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { LogOut, RefreshCw, Server, ShieldCheck, Building2 } from 'lucide-react';
import {
  platformPrincipalSchema,
  platformOverviewSchema,
  platformTenantListSchema,
  platformTenantSchema,
  platformSettingsSchema,
  platformAuditSchema,
  tenantStatusInputSchema,
  platformSettingsInputSchema,
  type PlatformTenant,
} from '@dineflow/shared';
import { api, ApiError } from '@/lib/api';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Editor as EditorDialog,
  Field,
  QueryState,
  EmptyState,
  selectClass,
  textareaClass,
} from '@/features/setup/shared';
import { Pagination, dateTime, params } from '@/features/admin/shared';

export function PlatformConsole() {
  const principal = useQuery({
    queryKey: ['platform', 'me'],
    queryFn: ({ signal }) =>
      api('/platform/auth/me', platformPrincipalSchema, { signal, refresh: false }),
    retry: false,
  });
  const client = useQueryClient(),
    router = useRouter();
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [filter, setFilter] = useState({ search: '', status: '' }),
    [page, setPage] = useState(1),
    [auditPage, setAuditPage] = useState(1),
    [editing, setEditing] = useState<PlatformTenant | null>(null),
    [registrationEdit, setRegistrationEdit] = useState(false);
  const overview = useQuery({
    queryKey: ['platform', 'overview'],
    queryFn: ({ signal }) =>
      api('/platform/overview', platformOverviewSchema, { signal, refresh: false }),
    enabled: !!principal.data,
  });
  const tenants = useQuery({
    queryKey: ['platform', 'tenants', filter, page],
    queryFn: ({ signal }) =>
      api(`/platform/tenants?${params({ ...filter, page })}`, platformTenantListSchema, {
        signal,
        refresh: false,
      }),
    enabled: !!principal.data,
  });
  const audit = useQuery({
    queryKey: ['platform', 'audit', auditPage],
    queryFn: ({ signal }) =>
      api(`/platform/audit?page=${auditPage}`, platformAuditSchema, { signal, refresh: false }),
    enabled: !!principal.data,
  });
  const logout = useMutation({
    mutationFn: () =>
      api('/platform/auth/logout', z.undefined(), { method: 'POST', refresh: false }),
    onSuccess: () => {
      client.removeQueries({ queryKey: ['platform'] });
      router.replace('/platform/login');
    },
  });
  if (principal.error instanceof ApiError && principal.error.status === 401)
    return (
      <main className="mx-auto max-w-lg space-y-5 p-8">
        <Brand />
        <h1 className="editorial text-3xl text-primary">Đăng nhập quản trị nền tảng</h1>
        <p className="text-sm leading-7">Phiên quản trị đã hết hạn hoặc bạn chưa đăng nhập.</p>
        <Link href="/platform/login" className="text-sm font-semibold text-primary underline">
          Mở trang đăng nhập
        </Link>
      </main>
    );
  return (
    <QueryState pending={principal.isPending} error={principal.error} retry={principal.refetch}>
      <div className="mx-auto min-h-svh max-w-7xl space-y-8 p-5 sm:p-8">
        <header className="flex flex-wrap items-center justify-between gap-5 border-b pb-6">
          <Brand />
          <div className="flex min-w-0 max-w-full items-center gap-3">
            <ShieldCheck className="size-4 text-primary" />
            <span className="min-w-0 break-all text-xs">{principal.data?.name}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Đăng xuất quản trị"
              disabled={logout.isPending}
              onClick={() => logout.mutate()}
            >
              <LogOut />
            </Button>
          </div>
        </header>
        <section className="flex flex-wrap items-end justify-between gap-5">
          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-widest text-primary">
              QUẢN TRỊ NỀN TẢNG · DINEFLOW
            </p>
            <h1 className="editorial text-4xl text-primary">Một nền tảng, nhiều nhịp quán.</h1>
            <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
              Quản lý nhà hàng, quyền truy cập và đăng ký mới. Mỗi nhà hàng có không gian dữ
              liệu riêng, đang sử dụng miễn phí.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void client.invalidateQueries({ queryKey: ['platform'] })}
          >
            <RefreshCw />
            Cập nhật
          </Button>
        </section>
        {logout.error && (
          <p role="alert" className="text-sm text-destructive">
            {logout.error.message}
          </p>
        )}
        <QueryState
          pending={overview.isPending}
          error={overview.error}
          retry={overview.refetch}
        >
          {overview.data && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Nhà hàng', overview.data.counts.tenants],
                  ['Đang hoạt động', overview.data.counts.activeTenants],
                  ['Tạm ngừng', overview.data.counts.suspendedTenants],
                  ['Tài khoản', overview.data.counts.users],
                ].map(([label, value]) => (
                  <section key={label} className="space-y-4 rounded-2xl border bg-white p-5">
                    <h2 className="text-xs text-muted-foreground">{label}</h2>
                    <p
                      className="text-3xl font-semibold text-primary"
                      data-platform-metric={label}
                    >
                      {value}
                    </p>
                  </section>
                ))}
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                <section className="space-y-4 rounded-2xl border bg-white p-6">
                  <h2 className="flex items-center gap-3 font-semibold">
                    <Server className="size-5 text-primary" />
                    Tình trạng API & dữ liệu
                  </h2>
                  <p className="text-sm">PostgreSQL: kết nối thành công</p>
                  <p className="text-sm">API uptime: {overview.data.uptimeSeconds} giây</p>
                  <p className="text-sm">
                    Phiên bàn chưa đóng: {overview.data.counts.openSessions}
                  </p>
                  <p className="text-xs leading-6 text-muted-foreground">
                    Kiểm tra lúc {dateTime(overview.data.generatedAt, 'Asia/Ho_Chi_Minh')}. API
                    chạy trong Docker; Redis chưa dùng làm cache/queue.
                  </p>
                </section>
                <section className="space-y-4 rounded-2xl border bg-secondary p-6">
                  <h2 className="flex items-center gap-3 font-semibold">
                    <Building2 className="size-5 text-primary" />
                    Đăng ký nhà hàng mới
                  </h2>
                  <p className="text-sm leading-7">
                    {overview.data.settings.registrationsEnabled
                      ? 'Đang mở đăng ký miễn phí.'
                      : 'Đang tạm dừng đăng ký mới.'}{' '}
                    Nhà hàng hiện có tiếp tục sử dụng bình thường.
                  </p>
                  <Button variant="outline" onClick={() => setRegistrationEdit(true)}>
                    Cấu hình đăng ký
                  </Button>
                </section>
              </div>
            </>
          )}
        </QueryState>
        <section className="space-y-5">
          <h2 className="editorial text-3xl text-primary">Các nhà hàng trên nền tảng</h2>
          <form
            className="grid items-end gap-4 rounded-2xl border bg-white p-5 sm:grid-cols-[2fr_1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              setFilter({ search, status });
              setPage(1);
            }}
          >
            <Field label="Tìm tên hoặc mã nhà hàng">
              <Input
                maxLength={120}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </Field>
            <Field label="Trạng thái nhà hàng">
              <select
                className={selectClass}
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">Tất cả</option>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="SUSPENDED">Tạm ngừng</option>
              </select>
            </Field>
            <Button disabled={tenants.isFetching}>Lọc nhà hàng</Button>
          </form>
          <QueryState pending={tenants.isPending} error={tenants.error} retry={tenants.refetch}>
            {tenants.data && (
              <div className="space-y-5">
                {tenants.data.tenants.length ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {tenants.data.tenants.map((tenant) => (
                      <article
                        key={tenant.id}
                        className="min-w-0 space-y-4 rounded-2xl border bg-white p-6"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h3 className="min-w-0 max-w-full break-words text-lg font-semibold">
                            {tenant.name}
                          </h3>
                          <span className="rounded-lg bg-secondary px-3 py-2 text-xs">
                            {tenant.status === 'ACTIVE' ? 'Đang hoạt động' : 'Tạm ngừng'}
                          </span>
                        </div>
                        <p className="break-all text-xs text-muted-foreground">
                          Mã: {tenant.slug}
                        </p>
                        <div className="space-y-2">
                          {tenant.owners.map((owner) => (
                            <p key={owner.email} className="break-all text-xs leading-6">
                              Chủ quán: {owner.name} · {owner.email}
                            </p>
                          ))}
                        </div>
                        <p className="text-xs leading-6">
                          {tenant.counts.staff} tài khoản · {tenant.counts.tables} bàn ·{' '}
                          {tenant.counts.menuItems} món (gồm bản ghi đã archive)
                        </p>
                        {tenant.suspensionReason && (
                          <p className="break-words text-sm text-destructive">
                            Lý do: {tenant.suspensionReason}
                          </p>
                        )}
                        <Button
                          variant="outline"
                          className="h-auto min-h-12 max-w-full whitespace-normal break-all text-left"
                          onClick={() => setEditing(tenant)}
                        >
                          {tenant.status === 'ACTIVE' ? 'Tạm ngừng' : 'Mở lại'} {tenant.name}
                        </Button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState>Không có nhà hàng khớp bộ lọc.</EmptyState>
                )}
                <Pagination
                  page={page}
                  total={tenants.data.total}
                  pageSize={tenants.data.pageSize}
                  onPage={setPage}
                  disabled={tenants.isFetching}
                />
              </div>
            )}
          </QueryState>
        </section>
        <section className="space-y-5">
          <h2 className="editorial text-3xl text-primary">Nhật ký quản trị nền tảng</h2>
          <QueryState pending={audit.isPending} error={audit.error} retry={audit.refetch}>
            {audit.data && (
              <div className="space-y-4">
                {!audit.data.entries.length ? (
                  <EmptyState>Chưa có hoạt động quản trị.</EmptyState>
                ) : (
                  audit.data.entries.map((entry) => (
                    <article
                      key={entry.id}
                      className="space-y-3 rounded-xl border bg-white p-5"
                    >
                      <p className="break-all text-sm font-semibold">{entry.action}</p>
                      <p className="text-xs leading-6 text-muted-foreground">
                        {entry.actor.name} · {dateTime(entry.createdAt, 'Asia/Ho_Chi_Minh')}
                      </p>
                      {entry.targetId && (
                        <p className="break-all text-xs">Đối tượng: {entry.targetId}</p>
                      )}
                      {entry.reason && (
                        <p className="break-words text-sm leading-7">{entry.reason}</p>
                      )}
                    </article>
                  ))
                )}
                <Pagination
                  page={auditPage}
                  total={audit.data.total}
                  pageSize={audit.data.pageSize}
                  onPage={setAuditPage}
                  disabled={audit.isFetching}
                />
              </div>
            )}
          </QueryState>
        </section>
        {editing && (
          <PlatformEdit key={editing.id} tenant={editing} onClose={() => setEditing(null)} />
        )}
        {registrationEdit && overview.data && (
          <PlatformEdit
            settings={overview.data.settings}
            onClose={() => setRegistrationEdit(false)}
          />
        )}
      </div>
    </QueryState>
  );
}

function PlatformEdit({
  tenant,
  settings,
  onClose,
}: {
  tenant?: PlatformTenant;
  settings?: z.infer<typeof platformSettingsSchema>;
  onClose: () => void;
}) {
  const client = useQueryClient(),
    [reason, setReason] = useState(''),
    [validation, setValidation] = useState('');
  const suspended = tenant?.status === 'ACTIVE';
  const mutation = useMutation({
    mutationFn: async (body: unknown) => {
      if (tenant)
        await api(`/platform/tenants/${tenant.id}/status`, platformTenantSchema, {
          method: 'PATCH',
          body,
          refresh: false,
        });
      else
        await api('/platform/settings', platformSettingsSchema, {
          method: 'PATCH',
          body,
          refresh: false,
        });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['platform'] });
      await client.invalidateQueries({ queryKey: ['public', 'registration-settings'] });
      onClose();
    },
    onError: () => void client.invalidateQueries({ queryKey: ['platform'] }),
  });
  const title = tenant ? `${suspended ? 'Tạm ngừng' : 'Mở lại'} nhà hàng` : 'Cấu hình đăng ký';
  return (
    <EditorDialog
      description="Thay đổi được ghi vào nhật ký quản trị nền tảng."
      title={title}
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          setValidation('');
          const body = tenant
            ? {
                status: suspended ? 'SUSPENDED' : 'ACTIVE',
                reason,
                expectedUpdatedAt: tenant.updatedAt,
              }
            : {
                registrationsEnabled: !settings!.registrationsEnabled,
                reason,
                expectedUpdatedAt: settings!.updatedAt,
              };
          const parsed = tenant
            ? tenantStatusInputSchema.safeParse(body)
            : platformSettingsInputSchema.safeParse(body);
          if (!parsed.success) {
            setValidation(parsed.error.issues[0]!.message);
            return;
          }
          mutation.mutate(parsed.data);
        }}
      >
        <p className="text-sm leading-7 text-muted-foreground">
          {tenant
            ? suspended
              ? 'Tạm ngừng quyền truy cập nhân viên và khách qua QR. Dữ liệu và các phiên bàn được giữ nguyên. Mọi người cần đăng nhập/cấp lại phiên sau khi mở lại.'
              : 'Cho phép nhà hàng hoạt động lại. Các phiên đăng nhập đã thu hồi không được khôi phục.'
            : settings!.registrationsEnabled
              ? 'Tạm dừng đăng ký nhà hàng mới; nhà hàng hiện có vẫn hoạt động.'
              : 'Mở lại đăng ký nhà hàng miễn phí.'}
        </p>
        <Field label="Lý do quản trị">
          <textarea
            className={textareaClass}
            minLength={3}
            maxLength={500}
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={mutation.isPending}
          />
        </Field>
        {(validation || mutation.error) && (
          <p role="alert" className="text-sm text-destructive">
            {validation || mutation.error?.message}{' '}
            {mutation.error instanceof ApiError && mutation.error.status === 409
              ? 'Đóng và mở lại form để lấy phiên bản hiện tại.'
              : ''}
          </p>
        )}
        <Button disabled={mutation.isPending}>
          {mutation.isPending ? 'Đang lưu…' : 'Xác nhận thay đổi'}
        </Button>
      </form>
    </EditorDialog>
  );
}
