'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { publicMenuSchema } from '@dineflow/shared';
import { useStaff } from '@/features/auth/use-staff';
import { CartProvider } from '@/features/ordering/customer-provider';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EmptyState, QueryState } from '@/features/setup/shared';

export function ManualProvider({
  sessionId,
  children,
}: {
  sessionId: string;
  children: React.ReactNode;
}) {
  const { data: staff } = useStaff();
  const allowed = !!staff && ['OWNER', 'MANAGER', 'WAITER'].includes(staff.role);
  const query = useQuery({
    queryKey: ['setup', staff?.restaurantId, 'manual-menu', sessionId],
    queryFn: ({ signal }) =>
      api(`/dining-sessions/${sessionId}/menu`, publicMenuSchema, { signal }),
    enabled: allowed,
  });
  if (!allowed) return <EmptyState>Vai trò của bạn không được tạo đơn thủ công.</EmptyState>;
  return (
    <div className="mx-auto max-w-3xl pb-28">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/staff/tables"
          className="flex min-h-12 items-center gap-2 text-xs text-primary"
        >
          <ArrowLeft className="size-4" />
          Về phiên bàn
        </Link>
        <Button asChild variant="outline" size="sm">
          <Link href="/staff/orders">
            <ClipboardList />
            Danh sách đơn
          </Link>
        </Button>
      </div>
      <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
        {query.data && (
          <>
            <div className="rounded-2xl border bg-secondary p-5">
              <p className="text-sm font-semibold text-primary">
                Ghi đơn cho {query.data.table.name}
              </p>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                Chọn món thay khách. Sau khi ghi nhận, xác nhận đơn trong danh sách để chuyển đến
                bếp.
              </p>
            </div>
            <CartProvider
              key={`${sessionId}:${staff!.userId}`}
              code=""
              menu={query.data}
              guest={null}
              manual={{ sessionId, userId: staff!.userId }}
              reload={() => void query.refetch()}
            >
              {children}
            </CartProvider>
          </>
        )}
      </QueryState>
    </div>
  );
}
