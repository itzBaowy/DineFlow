'use client';
import { cloneElement, isValidElement, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog } from 'radix-ui';
import { z } from 'zod';
import { Archive, LoaderCircle, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useStaff } from '@/features/auth/use-staff';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export const selectClass =
  'h-12 w-full rounded-xl border bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';
export const textareaClass =
  'min-h-24 w-full rounded-xl border bg-white p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';
const savedSchema = z.object({ id: z.uuid() });
export function useSetupQuery<T>(path: string, schema: z.ZodType<T>) {
  const { data: staff } = useStaff();
  return useQuery({
    queryKey: ['setup', staff?.restaurantId, path],
    queryFn: ({ signal }) => api(path, schema, { signal }),
    enabled: !!staff,
  });
}
export function useSetupMutation(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  onSaved?: () => void,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api(path, savedSchema, { method, body }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['setup'] }),
        client.invalidateQueries({ queryKey: ['restaurant'] }),
        client.invalidateQueries({ queryKey: ['auth', 'me'] }),
      ]);
      onSaved?.();
    },
  });
}
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="mb-2 text-[10px] font-semibold tracking-[0.16em] text-primary">
          THIẾT LẬP NHÀ HÀNG
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
export function QueryState({
  pending,
  error,
  retry,
  children,
}: {
  pending: boolean;
  error: Error | null;
  retry: () => unknown;
  children: React.ReactNode;
}) {
  if (pending)
    return (
      <div className="space-y-4" role="status" aria-label="Đang tải">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (error)
    return (
      <Card className="p-6">
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
        <Button className="mt-4" variant="outline" onClick={() => void retry()}>
          Thử lại
        </Button>
      </Card>
    );
  return children;
}
export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm leading-7 text-muted-foreground">
      {children}
    </div>
  );
}
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const control = isValidElement(children)
    ? cloneElement(
        children as React.ReactElement<{
          'aria-label'?: string;
          'aria-invalid'?: boolean;
          'aria-describedby'?: string;
        }>,
        {
          'aria-label': label,
          'aria-invalid': !!error,
          'aria-describedby': error ? id : undefined,
        },
      )
    : children;
  return (
    <label className="block space-y-2 text-xs font-medium">
      <span>{label}</span>
      {control}
      {error && (
        <span id={id} role="alert" className="block text-xs text-destructive">
          {error}
        </span>
      )}
    </label>
  );
}
export function Editor({
  open,
  onOpenChange,
  title,
  children,
  description = 'Cập nhật cấu hình phục vụ của nhà hàng.',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  description?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-primary/30 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b bg-white px-6 py-5">
            <div>
              <Dialog.Title className="text-xl font-semibold">{title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                {description}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" aria-label="Đóng chỉnh sửa">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <div className="overflow-y-auto p-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function FormActions({
  pending,
  error,
  cancel,
  success,
}: {
  pending: boolean;
  error: Error | null;
  cancel?: () => void;
  success?: boolean;
}) {
  return (
    <div className="space-y-4 border-t pt-5">
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-destructive">
          {error.message}
        </p>
      )}
      {success && (
        <p role="status" className="text-sm text-primary">
          Đã lưu thay đổi.
        </p>
      )}
      <div className="flex justify-end gap-3">
        {cancel && (
          <Button type="button" variant="outline" onClick={cancel} disabled={pending}>
            Hủy
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" />}Lưu thay đổi
        </Button>
      </div>
    </div>
  );
}
export function ConfirmAction({
  path,
  method = 'DELETE',
  title = 'Lưu trữ',
  message,
  variant = 'ghost',
}: {
  path: string;
  method?: 'DELETE' | 'POST';
  title?: string;
  message: string;
  variant?: 'ghost' | 'outline';
}) {
  const [open, setOpen] = useState(false);
  const mutation = useSetupMutation(path, method, () => setOpen(false));
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="sm"
        onClick={() => {
          mutation.reset();
          setOpen(true);
        }}
      >
        {method === 'DELETE' && <Archive className="size-4" />}
        {title}
      </Button>
      <Dialog.Root
        open={open}
        onOpenChange={(value) => {
          if (!mutation.isPending) setOpen(value);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-primary/30 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
            <Dialog.Title className="text-xl font-semibold">{title}?</Dialog.Title>
            <Dialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">
              {message}
            </Dialog.Description>
            {mutation.isError && (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {mutation.error.message}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close asChild>
                <Button variant="outline" disabled={mutation.isPending}>
                  Hủy
                </Button>
              </Dialog.Close>
              <Button disabled={mutation.isPending} onClick={() => mutation.mutate({})}>
                {mutation.isPending && <LoaderCircle className="animate-spin" />}Xác nhận
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
