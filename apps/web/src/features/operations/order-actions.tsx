'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  canTransitionOrder,
  orderSchema,
  orderStatusInputSchema,
  type CustomerOrder,
  type OrderStatusInput,
} from '@dineflow/shared';
import { Check, ChefHat, CircleCheck, HandPlatter, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useStaff } from '@/features/auth/use-staff';
import { Editor, Field, textareaClass } from '@/features/setup/shared';
import { Button } from '@/components/ui/button';

export function OrderActions({
  order,
  kitchen = false,
}: {
  order: CustomerOrder;
  kitchen?: boolean;
}) {
  const { data: staff } = useStaff(),
    client = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const form = useForm<OrderStatusInput>({
    resolver: zodResolver(orderStatusInputSchema),
    defaultValues: { from: order.status, to: 'CANCELLED', reason: '' },
  });
  const mutation = useMutation({
    mutationFn: (input: OrderStatusInput) =>
      api(`/orders/${order.id}/status`, orderSchema, { method: 'PATCH', body: input }),
    onSuccess: () => setCancelling(false),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['operations'] }),
        client.invalidateQueries({ queryKey: ['setup'] }),
        client.invalidateQueries({ queryKey: ['customer-orders'] }),
      ]);
    },
  });
  const targets = kitchen
    ? (['PREPARING', 'READY'] as const)
    : (['ACCEPTED', 'SERVED', 'CANCELLED'] as const);
  const labels = {
    ACCEPTED: 'Xác nhận đơn',
    PREPARING: 'Bắt đầu chế biến',
    READY: 'Món đã sẵn sàng',
    SERVED: 'Đã phục vụ',
    CANCELLED: order.status === 'PENDING_CONFIRMATION' ? 'Từ chối đơn' : 'Hủy đơn đã nhận',
  };
  const icons = {
    ACCEPTED: Check,
    PREPARING: ChefHat,
    READY: CircleCheck,
    SERVED: HandPlatter,
    CANCELLED: X,
  };
  const allowed = targets.filter(
    (target) => staff && canTransitionOrder(order.status, target, staff.role),
  );
  if (!allowed.length)
    return kitchen && order.status === 'READY' ? (
      <p className="rounded-xl bg-secondary p-4 text-center text-sm text-primary">
        Chờ nhân viên phục vụ
      </p>
    ) : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {allowed.map((target) => {
          const Icon = icons[target];
          return (
            <Button
              key={target}
              className={kitchen ? 'h-14 w-full text-sm' : 'flex-1'}
              variant={target === 'CANCELLED' ? 'outline' : 'default'}
              disabled={mutation.isPending}
              onClick={() =>
                target === 'CANCELLED'
                  ? setCancelling(true)
                  : mutation.mutate({ from: order.status, to: target, reason: null })
              }
            >
              <Icon />
              {mutation.isPending ? 'Đang cập nhật…' : labels[target]}
            </Button>
          );
        })}
      </div>
      {mutation.error && !cancelling && (
        <p role="alert" className="text-xs leading-6 text-destructive">
          {mutation.error.message}
        </p>
      )}
      {cancelling && (
        <Editor
          open
          onOpenChange={(open) => {
            if (!mutation.isPending) setCancelling(open);
          }}
          title={labels.CANCELLED}
          description={`Đơn #${order.number}. Lý do được lưu trong lịch sử đơn.`}
        >
          <form
            className="space-y-5"
            onSubmit={form.handleSubmit((input) =>
              mutation.mutate({ ...input, from: order.status }),
            )}
          >
            <Field label="Lý do hủy đơn" error={form.formState.errors.reason?.message}>
              <textarea
                autoFocus
                maxLength={500}
                className={textareaClass}
                {...form.register('reason')}
              />
            </Field>
            {mutation.error && (
              <p role="alert" className="text-sm text-destructive">
                {mutation.error.message}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                type="button"
                disabled={mutation.isPending}
                onClick={() => setCancelling(false)}
              >
                Quay lại
              </Button>
              <Button disabled={mutation.isPending} type="submit">
                {mutation.isPending ? 'Đang hủy…' : 'Xác nhận hủy đơn'}
              </Button>
            </div>
          </form>
        </Editor>
      )}
    </div>
  );
}
