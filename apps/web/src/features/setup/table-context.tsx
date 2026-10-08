'use client';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { QrCode, UtensilsCrossed } from 'lucide-react';
import { tableContextSchema } from '@dineflow/shared';
import { Brand } from '@/components/brand';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { QueryState } from './shared';

export function TableContext({ code }: { code: string }) {
  const query = useQuery({
    queryKey: ['public-table', code],
    queryFn: ({ signal }) =>
      api(`/public/tables/${encodeURIComponent(code)}`, tableContextSchema, {
        signal,
        refresh: false,
      }),
  });
  return (
    <main className="mx-auto min-h-screen max-w-lg px-5 py-8">
      <Brand />
      <div className="mt-8">
        <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
          {query.data && (
            <>
              <div className="relative h-48 overflow-hidden rounded-t-2xl bg-primary">
                <Image
                  src="/images/dining-editorial.png"
                  alt=""
                  fill
                  sizes="512px"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-primary/35" />
                <span className="absolute bottom-5 left-5 flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs text-primary">
                  <QrCode className="size-4" />
                  {query.data.table.name}
                </span>
              </div>
              <Card className="rounded-t-none border-t-0 p-6">
                {query.data.restaurant.logoUrl && (
                  <Image
                    unoptimized
                    src={query.data.restaurant.logoUrl}
                    alt="Logo nhà hàng"
                    width={56}
                    height={56}
                    className="mb-4 rounded-xl"
                  />
                )}
                <h1 className="editorial text-3xl text-primary">{query.data.restaurant.name}</h1>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  {query.data.restaurant.address}
                </p>
                <div className="mt-6 rounded-xl bg-secondary p-5">
                  <UtensilsCrossed className="mb-3 size-5 text-primary" />
                  <h2 className="text-sm font-semibold">Chào mừng bạn đến bàn</h2>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    Nhà hàng chưa bật đặt món trực tuyến. Vui lòng liên hệ nhân viên để được phục
                    vụ.
                  </p>
                </div>
              </Card>
            </>
          )}
        </QueryState>
      </div>
      <p className="editorial mt-8 text-center text-sm italic text-muted-foreground">
        DineFlow · Những bữa ăn trọn vẹn.
      </p>
    </main>
  );
}
