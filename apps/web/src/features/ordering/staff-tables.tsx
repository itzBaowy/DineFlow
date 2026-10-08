'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import {
  Armchair,
  ClipboardList,
  Clock3,
  DoorOpen,
  RefreshCw,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  closeEmptyInputSchema,
  formatVnd,
  orderSchema,
  sessionTableSchema,
  type SessionTable,
} from '@dineflow/shared';
import { useStaff } from '@/features/auth/use-staff';
import {
  useSetupQuery,
  useSetupMutation,
  Editor,
  Field,
  FormActions,
  QueryState,
  EmptyState,
  textareaClass,
} from '@/features/setup/shared';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { OrderCards } from './order-history';

const labels = {
  AVAILABLE: 'Sẵn sàng',
  OCCUPIED: 'Đang phục vụ',
  NEEDS_CLEANING: 'Cần dọn',
  OUT_OF_SERVICE: 'Tạm ngưng',
};
export function StaffTables() {
  const { data: staff } = useStaff();
  const query = useSetupQuery('/dining-sessions/tables', z.array(sessionTableSchema));
  const [filter, setFilter] = useState('all'),
    [selected, setSelected] = useState<SessionTable | null>(null);
  const tables = query.data ?? [];
  const canRead = !!staff && ['OWNER', 'MANAGER', 'WAITER', 'CASHIER'].includes(staff.role);
  if (!canRead) return <EmptyState>Vai trò của bạn không có quyền quản lý phiên bàn.</EmptyState>;
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-[0.16em] text-primary">
            PHỤC VỤ TẠI BÀN
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Mỗi bàn, một bữa ngon.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Mở lượt phục vụ trước khi khách quét QR gọi món. Theo dõi các đơn trong phiên hiện tại.
          </p>
        </div>
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          <RefreshCw />
          Cập nhật bàn
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['AVAILABLE', 'OCCUPIED', 'NEEDS_CLEANING', 'OUT_OF_SERVICE'] as const).map((status) => (
          <button
            key={status}
            aria-pressed={filter === status}
            onClick={() => setFilter(filter === status ? 'all' : status)}
            className={`rounded-2xl border p-5 text-left ${filter === status ? 'border-primary bg-secondary' : 'bg-white'}`}
          >
            <p className="text-xs text-muted-foreground">{labels[status]}</p>
            <p className="editorial mt-2 text-3xl text-primary">
              {tables.filter((table) => table.status === status).length}
            </p>
          </button>
        ))}
      </div>
      <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
        {!tables.filter((table) => filter === 'all' || table.status === filter).length ? (
          <EmptyState>Không có bàn trong trạng thái này.</EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {tables
              .filter((table) => filter === 'all' || table.status === filter)
              .map((table) => (
                <TableCard key={table.id} table={table} openDetail={() => setSelected(table)} />
              ))}
          </div>
        )}
      </QueryState>
      {selected && (
        <Editor
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          title={`Các đơn · ${selected.name}`}
        >
          <CurrentOrders table={selected} />
        </Editor>
      )}
    </div>
  );
}
function TableCard({ table, openDetail }: { table: SessionTable; openDetail: () => void }) {
  const { data: staff } = useStaff();
  const [closing, setClosing] = useState(false);
  const opening = useSetupMutation(`/dining-sessions/tables/${table.id}/open`, 'POST');
  const cleaning = useSetupMutation(`/dining-sessions/tables/${table.id}/clean`, 'POST');
  const canOpen = staff && ['OWNER', 'MANAGER', 'WAITER'].includes(staff.role),
    canClose = staff && ['OWNER', 'MANAGER', 'CASHIER'].includes(staff.role);
  return (
    <article
      className={`flex flex-col rounded-2xl border p-5 ${table.status === 'OCCUPIED' ? 'border-primary/25 bg-secondary/60' : 'bg-white'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid size-11 place-items-center rounded-xl border bg-white">
          <Armchair className="size-5 text-primary" strokeWidth={1.5} />
        </div>
        <span
          className={`rounded-full px-3 py-2 text-[10px] font-medium ${table.status === 'NEEDS_CLEANING' ? 'bg-amber-50 text-amber-800' : table.status === 'OCCUPIED' ? 'bg-accent text-primary' : 'bg-background text-muted-foreground'}`}
        >
          {labels[table.status]}
        </span>
      </div>
      <h2 className="mt-5 text-lg font-semibold">{table.name}</h2>
      <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="size-3.5" />
        {table.capacity} chỗ ngồi
      </p>
      {table.session ? (
        <div className="my-5 space-y-2 border-t pt-4">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock3 className="size-3.5" />
            Mở lúc{' '}
            {new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(
              new Date(table.session.openedAt),
            )}
            {table.session.status === 'PAYMENT_REQUESTED' && ' · Chờ thanh toán'}
          </p>
          <div className="flex justify-between text-sm">
            <span>{table.session.orderCount} đơn</span>
            <strong className="text-primary">{formatVnd(table.session.totalAmount)}</strong>
          </div>
          <p className="text-[10px] leading-5 text-muted-foreground">
            Tổng tiền món gồm đơn đang chờ xác nhận, chưa gồm thuế/phí.
          </p>
        </div>
      ) : (
        <p className="my-5 text-xs leading-6 text-muted-foreground">
          {table.status === 'AVAILABLE'
            ? 'Sẵn sàng đón khách và mở lượt phục vụ mới.'
            : table.status === 'NEEDS_CLEANING'
              ? 'Dọn bàn trước khi đón lượt khách tiếp theo.'
              : 'Bàn đang tạm ngưng nhận khách.'}
        </p>
      )}
      <div className="mt-auto space-y-2">
        {table.status === 'AVAILABLE' && canOpen && (
          <Button
            className="w-full"
            disabled={opening.isPending}
            onClick={() => opening.mutate({})}
          >
            <DoorOpen />
            {opening.isPending ? 'Đang mở…' : 'Mở bàn'}
          </Button>
        )}
        {table.status === 'NEEDS_CLEANING' && canOpen && (
          <Button
            className="w-full"
            disabled={cleaning.isPending}
            onClick={() => cleaning.mutate({})}
          >
            <Sparkles />
            Xác nhận đã dọn
          </Button>
        )}
        {table.session?.status === 'OPEN' && canOpen && (
          <Button asChild className="w-full">
            <Link href={`/staff/tables/${table.session.id}/order`}>Ghi đơn cho khách</Link>
          </Button>
        )}
        {table.session && (
          <Button variant="outline" className="w-full" onClick={openDetail}>
            <ClipboardList />
            Xem đơn của phiên
          </Button>
        )}
        {table.session && (
          <Button asChild variant="outline" className="w-full"><Link href={`/staff/cashier/${table.session.id}`}>Xem hóa đơn</Link></Button>
        )}
        {table.session?.status === 'OPEN' && table.session.orderCount === 0 && canClose && (
          <Button variant="ghost" className="w-full" onClick={() => setClosing(true)}>
            Đóng phiên chưa có đơn
          </Button>
        )}
        <Button asChild variant="ghost" className="w-full" size="sm">
          <Link href={`/t/${table.publicCode}`} target="_blank" rel="noopener noreferrer">
            Xem thực đơn QR
          </Link>
        </Button>
        {(opening.error || cleaning.error) && (
          <p role="alert" className="text-xs leading-6 text-destructive">
            {(opening.error ?? cleaning.error)?.message}
          </p>
        )}
      </div>
      {closing && (
        <Editor open onOpenChange={setClosing} title={`Đóng phiên rỗng · ${table.name}`}>
          <CloseEmpty table={table} close={() => setClosing(false)} />
        </Editor>
      )}
    </article>
  );
}
function CloseEmpty({ table, close }: { table: SessionTable; close: () => void }) {
  const form = useForm<z.infer<typeof closeEmptyInputSchema>>({
    resolver: zodResolver(closeEmptyInputSchema),
    defaultValues: { reason: '' },
  });
  const mutation = useSetupMutation(
    `/dining-sessions/tables/${table.id}/close-empty`,
    'POST',
    close,
  );
  return (
    <form className="space-y-5" onSubmit={form.handleSubmit((input) => mutation.mutate(input))}>
      <p className="text-sm leading-7 text-muted-foreground">
        Chỉ đóng phiên chưa có đơn. Bàn sẽ chuyển sang cần dọn và phiên khách được thu hồi.
      </p>
      <Field label="Lý do đóng phiên" error={form.formState.errors.reason?.message}>
        <textarea className={textareaClass} maxLength={500} {...form.register('reason')} />
      </Field>
      <FormActions pending={mutation.isPending} error={mutation.error} cancel={close} />
    </form>
  );
}
function CurrentOrders({ table }: { table: SessionTable }) {
  const query = useQuery({
    queryKey: ['setup', 'current-orders', table.session?.id],
    queryFn: ({ signal }) =>
      api(`/dining-sessions/${table.session?.id}/orders`, z.array(orderSchema), { signal }),
    enabled: !!table.session,
  });
  return (
    <>
      <p className="mb-4 text-xs leading-6 text-muted-foreground">
        Đơn mới chờ nhân viên xác nhận trước khi nhà bếp chuẩn bị.
      </p>
      <Button asChild className="mb-5" variant="outline" size="sm">
        <Link href="/staff/orders">Xử lý đơn gọi món</Link>
      </Button>
      <Button
        className="mb-5"
        variant="outline"
        size="sm"
        disabled={query.isFetching}
        onClick={() => void query.refetch()}
      >
        <RefreshCw />
        Cập nhật đơn
      </Button>
      <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
        {query.data?.length ? (
          <OrderCards orders={query.data} />
        ) : (
          <EmptyState>Phiên bàn chưa có đơn.</EmptyState>
        )}
      </QueryState>
    </>
  );
}
