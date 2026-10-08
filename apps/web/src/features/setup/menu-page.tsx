'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Search, UtensilsCrossed, Pencil } from 'lucide-react';
import {
  categorySchema,
  menuSchema,
  modifierSchema,
  menuInputSchema,
  formatVnd,
  type Menu,
  type MenuInput,
  type Category,
  type Modifier,
} from '@dineflow/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  ConfirmAction,
  Editor,
  EmptyState,
  Field,
  FormActions,
  PageHeader,
  QueryState,
  selectClass,
  textareaClass,
  useSetupMutation,
  useSetupQuery,
} from './shared';
import { ImageUpload } from './image-upload';

function MenuForm({
  item,
  categories,
  modifiers,
  close,
}: {
  item: Menu | null;
  categories: Category[];
  modifiers: Modifier[];
  close: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const form = useForm<MenuInput>({
    resolver: zodResolver(menuInputSchema),
    defaultValues: item
      ? {
          name: item.name,
          description: item.description,
          categoryId: item.categoryId,
          basePrice: item.basePrice,
          imageUrl: item.imageUrl,
          isAvailable: item.isAvailable,
          position: item.position,
          modifierGroupIds: item.modifierGroupIds,
        }
      : {
          name: '',
          description: '',
          categoryId: categories[0]?.id ?? '',
          basePrice: 0,
          imageUrl: null,
          isAvailable: true,
          position: 0,
          modifierGroupIds: [],
        },
  });
  const save = useSetupMutation(
    `/menu/items${item ? `/${item.id}` : ''}`,
    item ? 'PATCH' : 'POST',
    close,
  );
  const {
    register,
    control,
    formState: { errors },
  } = form;
  return (
    <form onSubmit={form.handleSubmit((data) => save.mutate(data))} className="space-y-5">
      <Field label="Tên món" error={errors.name?.message}>
        <Input {...register('name')} maxLength={120} placeholder="Ví dụ: Cơm chiên hải sản" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Danh mục" error={errors.categoryId?.message}>
          <select {...register('categoryId')} className={selectClass}>
            <option value="">Chọn danh mục</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {!category.isActive ? ' (Tạm ẩn)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Giá bán (VND)" error={errors.basePrice?.message}>
          <Input
            {...register('basePrice', { valueAsNumber: true })}
            type="number"
            min={0}
            max={100000000}
            step={1}
          />
        </Field>
      </div>
      <Field label="Mô tả" error={errors.description?.message}>
        <textarea
          {...register('description')}
          maxLength={2000}
          className={textareaClass}
          placeholder="Hương vị, nguyên liệu và thông tin món"
        />
      </Field>
      <Controller
        control={control}
        name="imageUrl"
        render={({ field }) => (
          <ImageUpload value={field.value} onChange={field.onChange} onBusyChange={setUploading} />
        )}
      />
      <fieldset className="space-y-3 rounded-xl border bg-white p-4">
        <legend className="px-2 text-xs font-semibold">Size & topping áp dụng</legend>
        {modifiers.length ? (
          modifiers.map((group) => (
            <label key={group.id} className="flex min-h-10 items-center gap-3 text-sm">
              <input
                type="checkbox"
                value={group.id}
                {...register('modifierGroupIds')}
                className="size-4 accent-primary"
              />
              <span className="flex-1">{group.name}</span>
              <span className="text-[10px] text-muted-foreground">
                Chọn {group.minSelections}–{group.maxSelections}
              </span>
            </label>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">
            Chưa có nhóm tùy chọn. Bạn có thể bổ sung sau.
          </p>
        )}
      </fieldset>
      <div className="grid items-end gap-4 sm:grid-cols-2">
        <Field label="Thứ tự hiển thị" error={errors.position?.message}>
          <Input
            type="number"
            min={0}
            max={10000}
            {...register('position', { valueAsNumber: true })}
          />
        </Field>
        <label className="flex min-h-12 items-center gap-3 text-sm">
          <input type="checkbox" {...register('isAvailable')} className="size-4 accent-primary" />
          Đang bán
        </label>
      </div>
      <FormActions pending={save.isPending || uploading} error={save.error} cancel={close} />
    </form>
  );
}
export function MenuPage() {
  const items = useSetupQuery('/menu/items', z.array(menuSchema));
  const categories = useSetupQuery('/menu/categories', z.array(categorySchema));
  const modifiers = useSetupQuery('/menu/modifiers', z.array(modifierSchema));
  const [search, setSearch] = useState(''),
    [category, setCategory] = useState(''),
    [availability, setAvailability] = useState('');
  const [editing, setEditing] = useState<Menu | null>(null),
    [open, setOpen] = useState(false);
  const rows = items.data ?? [],
    groups = categories.data ?? [];
  const available = rows.filter((item) => item.isAvailable && item.categoryActive).length;
  const filtered = rows.filter(
    (item) =>
      item.name.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')) &&
      (!category || item.categoryId === category) &&
      (!availability ||
        (availability === 'available') === (item.isAvailable && item.categoryActive)),
  );
  return (
    <div className="space-y-7">
      <PageHeader
        title="Thực đơn của nhà hàng"
        description="Chăm chút từng món ăn, từ giá bán đến lựa chọn của thực khách."
        action={
          <Button
            disabled={!groups.length || modifiers.isPending || !!modifiers.error}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus />
            Thêm món
          </Button>
        }
      />
      <QueryState
        pending={items.isPending || categories.isPending || modifiers.isPending}
        error={items.error ?? categories.error ?? modifiers.error}
        retry={() => Promise.all([items.refetch(), categories.refetch(), modifiers.refetch()])}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Tổng món', value: rows.length },
            { label: 'Đang bán', value: available },
            { label: 'Tạm ngưng bán', value: rows.length - available },
            { label: 'Danh mục', value: groups.length },
          ].map(({ label, value }, index) => (
            <Card
              key={label}
              className={cn('p-4 sm:p-5', index === 1 && 'border-primary/10 bg-[#edf3e5]')}
            >
              <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
              <p className="editorial mt-3 text-3xl text-primary">{value}</p>
            </Card>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-4 size-4 text-muted-foreground" />
            <Input
              aria-label="Tìm món"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-10"
              placeholder="Tìm món ăn…"
            />
          </div>
          <select
            aria-label="Lọc danh mục"
            className={cn(selectClass, 'w-full sm:w-48')}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">Tất cả danh mục</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Lọc trạng thái bán"
            className={cn(selectClass, 'w-full sm:w-44')}
            value={availability}
            onChange={(event) => setAvailability(event.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="available">Đang bán</option>
            <option value="unavailable">Tạm ngưng bán</option>
          </select>
        </div>
        {!groups.length ? (
          <EmptyState>
            Hãy{' '}
            <Link className="font-semibold text-primary underline" href="/admin/categories">
              thêm danh mục
            </Link>{' '}
            để bắt đầu xây dựng thực đơn.
          </EmptyState>
        ) : !filtered.length ? (
          <EmptyState>
            {rows.length
              ? 'Không có món phù hợp bộ lọc.'
              : 'Chưa có món ăn. Thêm món đầu tiên cho nhà hàng.'}
          </EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <div className="hidden grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_150px] gap-4 border-b bg-background px-5 py-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground lg:grid">
              <span>Món ăn</span>
              <span>Danh mục</span>
              <span>Giá bán</span>
              <span>Trạng thái</span>
              <span className="text-right">Thao tác</span>
            </div>
            <ul className="divide-y">
              {filtered.map((item) => (
                <li
                  key={item.id}
                  className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_150px] lg:items-center lg:gap-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {item.imageUrl ? (
                      <Image
                        unoptimized
                        src={item.imageUrl}
                        alt={item.name}
                        width={56}
                        height={56}
                        className="size-14 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-secondary text-primary/60">
                        <UtensilsCrossed className="size-5" strokeWidth={1.5} />
                      </span>
                    )}
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold">{item.name}</h2>
                      <p className="mt-1 truncate text-[10px] text-muted-foreground">
                        {item.modifierGroupIds.length
                          ? `${item.modifierGroupIds.length} nhóm size & topping`
                          : 'Không có tùy chọn thêm'}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{item.categoryName}</span>
                  <span className="text-sm font-semibold">{formatVnd(item.basePrice)}</span>
                  <span
                    className={cn(
                      'w-fit rounded-full px-2.5 py-1 text-[10px] font-medium',
                      item.isAvailable && item.categoryActive
                        ? 'bg-[#edf3e5] text-primary'
                        : 'bg-amber-50 text-amber-800',
                    )}
                  >
                    {!item.categoryActive
                      ? 'Danh mục tạm ẩn'
                      : item.isAvailable
                        ? 'Đang bán'
                        : 'Tạm hết'}
                  </span>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Sửa ${item.name}`}
                      onClick={() => {
                        setEditing(item);
                        setOpen(true);
                      }}
                    >
                      <Pencil />
                    </Button>
                    <ConfirmAction
                      path={`/menu/items/${item.id}`}
                      message={`Lưu trữ “${item.name}”? Món sẽ rời thực đơn; lịch sử đơn hàng được giữ nguyên.`}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t bg-background px-5 py-3 text-[10px] text-muted-foreground">
              Hiển thị {filtered.length} / {rows.length} món
            </div>
          </Card>
        )}
      </QueryState>
      <Editor open={open} onOpenChange={setOpen} title={editing ? 'Chỉnh sửa món' : 'Thêm món mới'}>
        {open && (
          <MenuForm
            key={editing?.id ?? 'new'}
            item={editing}
            categories={groups}
            modifiers={modifiers.data ?? []}
            close={() => setOpen(false)}
          />
        )}
      </Editor>
    </div>
  );
}
