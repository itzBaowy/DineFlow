'use client';
import { useState } from 'react';
import { z } from 'zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, SlidersHorizontal, Pencil, Trash2 } from 'lucide-react';
import {
  modifierInputSchema,
  modifierSchema,
  formatVnd,
  type Modifier,
  type ModifierInput,
} from '@dineflow/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  ConfirmAction,
  Editor,
  EmptyState,
  Field,
  FormActions,
  PageHeader,
  QueryState,
  useSetupMutation,
  useSetupQuery,
} from './shared';

function ModifierForm({ group, close }: { group: Modifier | null; close: () => void }) {
  const form = useForm<ModifierInput>({
    resolver: zodResolver(modifierInputSchema),
    defaultValues: group
      ? {
          name: group.name,
          minSelections: group.minSelections,
          maxSelections: group.maxSelections,
          position: group.position,
          options: group.options,
        }
      : {
          name: '',
          minSelections: 0,
          maxSelections: 1,
          position: 0,
          options: [{ name: '', priceDelta: 0, isAvailable: true, position: 0 }],
        },
  });
  const {
    register,
    control,
    formState: { errors },
  } = form;
  const options = useFieldArray({ control, name: 'options', keyName: 'fieldKey' });
  const save = useSetupMutation(
    `/menu/modifiers${group ? `/${group.id}` : ''}`,
    group ? 'PATCH' : 'POST',
    close,
  );
  return (
    <form className="space-y-5" onSubmit={form.handleSubmit((input) => save.mutate(input))}>
      <Field label="Tên nhóm tùy chọn" error={errors.name?.message}>
        <Input {...register('name')} maxLength={120} placeholder="Ví dụ: Size hoặc Topping" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Số lựa chọn tối thiểu" error={errors.minSelections?.message}>
          <Input
            type="number"
            min={0}
            max={30}
            {...register('minSelections', { valueAsNumber: true })}
          />
        </Field>
        <Field label="Số lựa chọn tối đa" error={errors.maxSelections?.message}>
          <Input
            type="number"
            min={1}
            max={30}
            {...register('maxSelections', { valueAsNumber: true })}
          />
        </Field>
      </div>
      <Field label="Thứ tự hiển thị" error={errors.position?.message}>
        <Input
          type="number"
          min={0}
          max={10000}
          {...register('position', { valueAsNumber: true })}
        />
      </Field>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Các lựa chọn</h2>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={options.fields.length >= 30}
          onClick={() =>
            options.append({
              name: '',
              priceDelta: 0,
              isAvailable: true,
              position: options.fields.length,
            })
          }
        >
          <Plus />
          Thêm lựa chọn
        </Button>
      </div>
      {errors.options?.message && (
        <p role="alert" className="text-xs text-destructive">
          {errors.options.message}
        </p>
      )}
      <div className="space-y-3">
        {options.fields.map((option, index) => (
          <fieldset key={option.fieldKey} className="space-y-3 rounded-xl border bg-white p-4">
            <legend className="px-1 text-xs text-muted-foreground">Lựa chọn {index + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={`Tên lựa chọn ${index + 1}`}
                error={errors.options?.[index]?.name?.message}
              >
                <Input maxLength={120} {...register(`options.${index}.name`)} />
              </Field>
              <Field
                label={`Giá cộng thêm ${index + 1} (VND)`}
                error={errors.options?.[index]?.priceDelta?.message}
              >
                <Input
                  type="number"
                  min={0}
                  max={100000000}
                  step={1}
                  {...register(`options.${index}.priceDelta`, { valueAsNumber: true })}
                />
              </Field>
            </div>
            <Field
              label={`Thứ tự lựa chọn ${index + 1}`}
              error={errors.options?.[index]?.position?.message}
            >
              <Input
                type="number"
                min={0}
                max={10000}
                {...register(`options.${index}.position`, { valueAsNumber: true })}
              />
            </Field>
            <div className="flex items-center justify-between">
              <label className="flex min-h-10 items-center gap-2 text-xs">
                <input
                  className="size-4 accent-primary"
                  type="checkbox"
                  {...register(`options.${index}.isAvailable`)}
                />
                Đang bán lựa chọn {index + 1}
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Gỡ lựa chọn ${index + 1}`}
                disabled={options.fields.length === 1}
                onClick={() => options.remove(index)}
              >
                <Trash2 />
              </Button>
            </div>
          </fieldset>
        ))}
      </div>
      <p className="text-xs leading-6 text-muted-foreground">
        Số lựa chọn tối thiểu phải phù hợp với số tùy chọn đang bán. Gỡ lựa chọn vẫn giữ nguyên dữ
        liệu trong lịch sử đơn hàng.
      </p>
      <FormActions pending={save.isPending} error={save.error} cancel={close} />
    </form>
  );
}
export function ModifiersPage() {
  const query = useSetupQuery('/menu/modifiers', z.array(modifierSchema));
  const [editing, setEditing] = useState<Modifier | null>(null),
    [open, setOpen] = useState(false);
  return (
    <div className="space-y-7">
      <PageHeader
        title="Size & topping"
        description="Tạo những lựa chọn vừa ý thực khách, với mức giá cộng thêm rõ ràng."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus />
            Thêm nhóm
          </Button>
        }
      />
      <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
        {query.data?.length ? (
          <div className="grid items-start gap-5 md:grid-cols-2">
            {query.data.map((group) => (
              <Card key={group.id} className="overflow-hidden">
                <div className="flex items-center gap-4 border-b bg-background p-5">
                  <span className="grid size-11 place-items-center rounded-xl bg-primary text-accent">
                    <SlidersHorizontal className="size-5" />
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold">{group.name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Chọn {group.minSelections}–{group.maxSelections} ·{' '}
                      {group.minSelections ? 'Bắt buộc chọn' : 'Không bắt buộc'}
                    </p>
                  </div>
                  <Button
                    className="ml-auto"
                    variant="ghost"
                    size="icon"
                    aria-label={`Sửa ${group.name}`}
                    onClick={() => {
                      setEditing(group);
                      setOpen(true);
                    }}
                  >
                    <Pencil />
                  </Button>
                </div>
                <ul className="divide-y px-5">
                  {group.options.map((option) => (
                    <li
                      key={option.id}
                      className="flex items-center justify-between gap-3 py-4 text-sm"
                    >
                      <div>
                        <span className="font-medium">{option.name}</span>
                        {!option.isAvailable && (
                          <span className="ml-2 text-[10px] text-amber-800">Tạm hết</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        +{formatVnd(option.priceDelta)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-end border-t px-4 py-2">
                  <ConfirmAction
                    path={`/menu/modifiers/${group.id}`}
                    message={`Lưu trữ nhóm “${group.name}”? Gỡ nhóm khỏi các món đang sử dụng trước.`}
                  />
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState>
            Chưa có nhóm size hoặc topping. Thêm một nhóm để tùy chỉnh món ăn.
          </EmptyState>
        )}
      </QueryState>
      <Editor
        open={open}
        onOpenChange={setOpen}
        title={editing ? 'Chỉnh sửa nhóm tùy chọn' : 'Thêm nhóm tùy chọn'}
      >
        {open && (
          <ModifierForm key={editing?.id ?? 'new'} group={editing} close={() => setOpen(false)} />
        )}
      </Editor>
    </div>
  );
}
