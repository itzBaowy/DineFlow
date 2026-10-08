'use client';
import Image from 'next/image';
import { useState } from 'react';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Download, Printer, ExternalLink } from 'lucide-react';
import { tableSchema } from '@dineflow/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useStaff } from '@/features/auth/use-staff';
import { downloadFile } from '@/lib/api';
import { ConfirmAction, EmptyState, PageHeader, QueryState, useSetupQuery } from './shared';

export function QrPage({ initialTable }: { initialTable?: string }) {
  const query = useSetupQuery('/tables', z.array(tableSchema));
  const { data: staff } = useStaff();
  const [selected, setSelected] = useState<string[] | null>(initialTable ? [initialTable] : null);
  const [imageErrors, setImageErrors] = useState<string[]>([]);
  const [loadedCodes, setLoadedCodes] = useState<string[]>([]);
  const rows = query.data ?? [];
  const selectedRows = rows.filter((table) => selected === null || selected.includes(table.id));
  const download = useMutation({
    mutationFn: ({ id, format }: { id: string; format: 'png' | 'svg' }) =>
      downloadFile(`/tables/${id}/qr.${format}`, `dineflow-${id}.${format}`),
  });
  return (
    <div className="space-y-7">
      <div className="print:hidden">
        <PageHeader
          title="Mã QR tại bàn"
          description="In mã cố định cho từng bàn. Mỗi lượt phục vụ được quản lý bằng một phiên riêng."
          action={
            <Button
              disabled={
                !selectedRows.length ||
                !!query.error ||
                imageErrors.length > 0 ||
                !selectedRows.every((table) => loadedCodes.includes(table.publicCode))
              }
              onClick={() => window.print()}
            >
              <Printer />
              In nhãn đã chọn
            </Button>
          }
        />
      </div>
      <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
        {rows.length ? (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4 print:hidden">
              <p className="mr-auto text-xs text-muted-foreground">
                Đã chọn {selectedRows.length} / {rows.length} bàn
              </p>
              <Button size="sm" variant="outline" onClick={() => setSelected(null)}>
                Chọn tất cả
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                Bỏ chọn
              </Button>
            </div>
            {download.isError && (
              <p role="alert" className="text-sm text-destructive print:hidden">
                {download.error.message}
              </p>
            )}
            {imageErrors.length > 0 && (
              <p role="alert" className="text-sm text-destructive print:hidden">
                Không tải được một số mã QR. Vui lòng tải lại trang trước khi in.
              </p>
            )}
            <div data-print-sheet className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((table) => {
                const checked = selected === null || selected.includes(table.id);
                return (
                  <Card
                    key={table.id}
                    data-print-label
                    data-print-selected={checked}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center justify-between border-b px-5 py-3 print:hidden">
                      <label className="flex min-h-10 items-center gap-3 text-xs font-medium">
                        <input
                          type="checkbox"
                          aria-label={`Chọn in ${table.name}`}
                          className="size-4 accent-primary"
                          checked={checked}
                          onChange={(event) =>
                            setSelected(
                              event.target.checked
                                ? [...(selected ?? rows.map((row) => row.id)), table.id]
                                : (selected ?? rows.map((row) => row.id)).filter(
                                    (id) => id !== table.id,
                                  ),
                            )
                          }
                        />
                        In nhãn bàn này
                      </label>
                      <span className="text-[9px] text-muted-foreground">
                        {table.status === 'OUT_OF_SERVICE' ? 'Tạm ngưng' : 'QR cố định'}
                      </span>
                    </div>
                    <div className="p-6 text-center">
                      <p className="mb-2 text-xs font-semibold tracking-wide text-primary">
                        {staff?.restaurant.name}
                      </p>
                      <h2 className="editorial text-3xl text-primary">{table.name}</h2>
                      <Image
                        key={table.publicCode}
                        unoptimized
                        loading="eager"
                        src={`/api/v1/tables/${table.id}/qr.png?code=${table.publicCode}`}
                        alt={`Mã QR ${table.name}`}
                        width={220}
                        height={220}
                        className="mx-auto my-4 aspect-square max-w-full"
                        onError={() =>
                          setImageErrors((current) =>
                            current.includes(table.id) ? current : [...current, table.id],
                          )
                        }
                        onLoad={() => {
                          setImageErrors((current) => current.filter((id) => id !== table.id));
                          setLoadedCodes((current) =>
                            current.includes(table.publicCode)
                              ? current
                              : [...current, table.publicCode],
                          );
                        }}
                      />
                      <p className="text-xs font-medium text-primary">
                        Quét mã để đến trang của bàn
                      </p>
                      <p className="mt-2 break-all text-[9px] leading-5 text-muted-foreground">
                        {table.url}
                      </p>
                      <p className="editorial mt-4 text-sm italic text-muted-foreground">
                        Nhịp phục vụ, cùng một nơi.
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2 border-t p-4 print:hidden">
                      {(['png', 'svg'] as const).map((format) => (
                        <Button
                          key={format}
                          variant="outline"
                          size="sm"
                          disabled={download.isPending}
                          onClick={() => download.mutate({ id: table.id, format })}
                        >
                          <Download />
                          {format.toUpperCase()}
                        </Button>
                      ))}
                      <Button variant="ghost" size="sm" asChild>
                        <a href={table.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink />
                          Xem trang bàn
                        </a>
                      </Button>
                      <ConfirmAction
                        method="POST"
                        path={`/tables/${table.id}/regenerate-qr`}
                        title="Đổi mã QR"
                        message={`Đổi mã QR của ${table.name}? Mã đã in sẽ ngừng hoạt động ngay. Bạn cần tải và in lại nhãn mới. Chỉ đổi khi bàn không có phiên phục vụ.`}
                      />
                    </div>
                  </Card>
                );
              })}
            </div>
            <p className="rounded-xl border bg-background p-4 text-xs leading-6 text-muted-foreground print:hidden">
              Mã QR chỉ chứa địa chỉ công khai của bàn. Đổi mã hoặc lưu trữ bàn sẽ vô hiệu hóa mã
              cũ. Chọn “Lưu thành PDF” trong hộp thoại in để tải bố cục nhãn A4.
            </p>
          </>
        ) : (
          <EmptyState>Chưa có bàn. Thêm bàn phục vụ để tạo mã QR.</EmptyState>
        )}
      </QueryState>
    </div>
  );
}
