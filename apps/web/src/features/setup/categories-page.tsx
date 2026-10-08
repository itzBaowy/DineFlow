'use client';
import { useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Layers3, Pencil } from 'lucide-react';
import { categoryInputSchema, categorySchema, type Category, type CategoryInput } from '@dineflow/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ConfirmAction, Editor, EmptyState, Field, FormActions, PageHeader, QueryState, textareaClass, useSetupMutation, useSetupQuery } from './shared';

function CategoryForm({ category, close }: { category: Category | null; close: () => void }) {
  const form = useForm<CategoryInput>({ resolver: zodResolver(categoryInputSchema), defaultValues: category ? { name: category.name, description: category.description, position: category.position, isActive: category.isActive } : { name: '', description: '', position: 0, isActive: true } });
  const save = useSetupMutation(`/menu/categories${category ? `/${category.id}` : ''}`, category ? 'PATCH' : 'POST', close);
  const { register, formState: { errors } } = form;
  return <form className="space-y-5" onSubmit={form.handleSubmit(input => save.mutate(input))}><Field label="Tên danh mục" error={errors.name?.message}><Input {...register('name')} maxLength={120} placeholder="Ví dụ: Khai vị" /></Field><Field label="Mô tả" error={errors.description?.message}><textarea {...register('description')} className={textareaClass} maxLength={2000} /></Field><Field label="Thứ tự hiển thị" error={errors.position?.message}><Input type="number" min={0} max={10000} {...register('position', { valueAsNumber: true })} /></Field><label className="flex min-h-12 items-center gap-3 text-sm"><input type="checkbox" {...register('isActive')} className="size-4 accent-primary" />Hiển thị danh mục</label><p className="text-xs leading-6 text-muted-foreground">Ẩn danh mục sẽ tạm ngưng bán toàn bộ món thuộc danh mục đó.</p><FormActions pending={save.isPending} error={save.error} cancel={close} /></form>;
}
export function CategoriesPage() {
  const query = useSetupQuery('/menu/categories', z.array(categorySchema));
  const [editing, setEditing] = useState<Category | null>(null), [open, setOpen] = useState(false);
  return <div className="space-y-7"><PageHeader title="Danh mục món ăn" description="Sắp xếp thực đơn để thực khách dễ tìm món yêu thích." action={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus />Thêm danh mục</Button>} /><QueryState pending={query.isPending} error={query.error} retry={query.refetch}>{query.data?.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{query.data.map(category => <Card key={category.id} className="flex flex-col p-5"><div className="mb-5 flex items-start justify-between"><span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary"><Layers3 className="size-5" strokeWidth={1.5} /></span><span className="rounded-full bg-background px-2.5 py-1 text-[10px] text-muted-foreground">{category.isActive ? 'Đang hiển thị' : 'Tạm ẩn'}</span></div><h2 className="text-lg font-semibold">{category.name}</h2><p className="mb-6 mt-2 flex-1 text-xs leading-6 text-muted-foreground">{category.description || 'Chưa có mô tả'}</p><div className="flex items-center justify-between border-t pt-4"><span className="text-[10px] text-muted-foreground">Thứ tự {category.position}</span><div className="flex gap-1"><Button variant="ghost" size="icon" aria-label={`Sửa ${category.name}`} onClick={() => { setEditing(category); setOpen(true); }}><Pencil /></Button><ConfirmAction path={`/menu/categories/${category.id}`} message={`Lưu trữ “${category.name}”? Chuyển hoặc lưu trữ các món thuộc danh mục trước.`} /></div></div></Card>)}</div> : <EmptyState>Chưa có danh mục. Thêm danh mục đầu tiên cho thực đơn.</EmptyState>}</QueryState><Editor open={open} onOpenChange={setOpen} title={editing ? 'Chỉnh sửa danh mục' : 'Thêm danh mục'}>{open && <CategoryForm key={editing?.id ?? 'new'} category={editing} close={() => setOpen(false)} />}</Editor></div>;
}
