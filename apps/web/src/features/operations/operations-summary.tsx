'use client';
import Link from 'next/link';
import { useStaff } from '@/features/auth/use-staff';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { QueryState } from '@/features/setup/shared';
import { useOperations } from './boards';

export function OperationsSummary() {
  const query = useOperations(),
    { data: staff } = useStaff();
  const kitchen = staff?.role === 'KITCHEN';
  return (
    <section aria-labelledby="operations-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="operations-heading" className="text-sm font-semibold">
            Nhịp phục vụ hiện tại
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">Các phiên đang mở tại nhà hàng.</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={kitchen ? '/staff/kitchen' : '/staff/orders'}>
            {kitchen ? 'Vào màn hình bếp' : 'Xử lý đơn gọi món'}
          </Link>
        </Button>
      </div>
      <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
        {query.data && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['Đơn chờ xác nhận', query.data.counts.PENDING_CONFIRMATION],
              ['Đang chế biến', query.data.counts.PREPARING],
              ['Món sẵn sàng', query.data.counts.READY],
              ['Bàn đang phục vụ', query.data.occupiedTables],
            ].map(([label, count]) => (
              <Card key={label} className="p-5">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p
                  className="editorial mt-3 text-4xl text-primary"
                  data-testid={`operation-${label}`}
                >
                  {count}
                </p>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
    </section>
  );
}
