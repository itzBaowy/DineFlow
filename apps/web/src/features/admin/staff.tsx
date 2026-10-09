'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  staffPageSchema,
  staffMemberSchema,
  staffCreateSchema,
  staffUpdateSchema,
  staffPasswordSchema,
  staffRoles,
  roleLabels,
  type StaffMember,
  type Role,
} from '@dineflow/shared';
import { api } from '@/lib/api';
import { useStaff } from '@/features/auth/use-staff';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QueryState, EmptyState, Field, Editor, selectClass } from '@/features/setup/shared';
import { AdminHeader, AdminDenied, Pagination, params } from './shared';

type Edit = { mode: 'create' | 'edit' | 'password'; member?: StaffMember };
export function StaffAdmin() {
  const { data: actor } = useStaff(),
    allowed = !!actor && ['OWNER', 'MANAGER'].includes(actor.role);
  const [draft, setDraft] = useState({ search: '', role: '', active: '' }),
    [filters, setFilters] = useState(draft),
    [page, setPage] = useState(1),
    [edit, setEdit] = useState<Edit | null>(null);
  const query = useQuery({
    queryKey: ['admin-staff', actor?.restaurantId, filters, page],
    enabled: allowed,
    queryFn: ({ signal }) =>
      api(`/staff?${params({ ...filters, page })}`, staffPageSchema, { signal }),
  });
  if (!allowed) return <AdminDenied />;
  return (
    <div className="space-y-7">
      <AdminHeader
        title="Đúng người, đúng quyền."
        description="Tạo tài khoản, phân quyền và ngừng truy cập bằng membership của nhà hàng. Giữ lịch sử đơn và hoạt động khi khóa nhân viên; đổi quyền hoặc mật khẩu sẽ thu hồi các phiên đăng nhập cũ."
      />
      <div className="flex justify-end">
        <Button onClick={() => setEdit({ mode: 'create' })}>Thêm nhân viên</Button>
      </div>
      <form
        className="grid items-end gap-4 rounded-2xl border bg-white p-5 sm:grid-cols-2 xl:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters(draft);
          setPage(1);
        }}
      >
        <Field label="Tìm nhân viên">
          <Input
            value={draft.search}
            maxLength={120}
            placeholder="Tên hoặc email"
            onChange={(e) => setDraft({ ...draft, search: e.target.value })}
          />
        </Field>
        <Field label="Vai trò">
          <select
            className={selectClass}
            value={draft.role}
            onChange={(e) => setDraft({ ...draft, role: e.target.value })}
          >
            <option value="">Tất cả</option>
            {staffRoles.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quyền truy cập">
          <select
            className={selectClass}
            value={draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.value })}
          >
            <option value="">Tất cả</option>
            <option value="true">Đang hoạt động</option>
            <option value="false">Đã khóa</option>
          </select>
        </Field>
        <Button disabled={query.isFetching}>Lọc nhân viên</Button>
      </form>
      <div className="flex justify-end">
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Cập nhật nhân viên
        </Button>
      </div>
      <QueryState pending={query.isPending} error={query.error} retry={query.refetch}>
        {query.data && (
          <div className="space-y-5">
            {query.data.members.length ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {query.data.members.map((member) => {
                  const mayManage = actor!.role === 'OWNER' || member.role !== 'OWNER',
                    self = member.id === actor!.membershipId;
                  return (
                    <article
                      key={member.id}
                      className="min-w-0 space-y-4 rounded-2xl border bg-white p-5"
                    >
                      <div className="flex flex-wrap justify-between gap-3">
                        <div className="min-w-0 space-y-2">
                          <h2 className="break-words text-lg font-semibold">
                            {member.name}
                            {self ? ' · Bạn' : ''}
                          </h2>
                          <p className="break-all text-xs text-muted-foreground">
                            {member.email}
                          </p>
                        </div>
                        <span className="h-fit rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-primary">
                          {roleLabels[member.role]}
                        </span>
                      </div>
                      <p className="text-xs">
                        {member.userActive
                          ? member.isActive
                            ? 'Đang hoạt động'
                            : 'Đã khóa quyền truy cập'
                          : 'Tài khoản đã ngừng hoạt động'}
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!mayManage}
                          onClick={() => setEdit({ mode: 'edit', member })}
                        >
                          Chỉnh sửa {member.name}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!mayManage || self}
                          onClick={() => setEdit({ mode: 'password', member })}
                        >
                          Đặt lại mật khẩu {member.name}
                        </Button>
                      </div>
                      {!mayManage && (
                        <p className="text-xs text-muted-foreground">
                          Chỉ chủ nhà hàng được thay đổi tài khoản OWNER.
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState>Không có nhân viên khớp bộ lọc.</EmptyState>
            )}
            <Pagination
              page={query.data.page}
              total={query.data.total}
              pageSize={query.data.pageSize}
              onPage={setPage}
              disabled={query.isFetching}
            />
          </div>
        )}
      </QueryState>
      {edit && (
        <StaffEditor
          key={`${edit.mode}:${edit.member?.id}`}
          edit={edit}
          owner={actor!.role === 'OWNER'}
          self={edit.member?.id === actor!.membershipId}
          close={() => setEdit(null)}
        />
      )}
    </div>
  );
}
function StaffEditor({
  edit,
  owner,
  self,
  close,
}: {
  edit: Edit;
  owner: boolean;
  self: boolean;
  close: () => void;
}) {
  const client = useQueryClient(),
    member = edit.member;
  const [name, setName] = useState(member?.name ?? ''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [role, setRole] = useState<Role>(member?.role ?? 'WAITER'),
    [isActive, setActive] = useState(member?.isActive ?? true),
    [reason, setReason] = useState(''),
    [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: (body: unknown) =>
      api(
        edit.mode === 'create'
          ? '/staff'
          : `/staff/${member!.id}${edit.mode === 'password' ? '/password' : ''}`,
        staffMemberSchema,
        { method: edit.mode === 'edit' ? 'PATCH' : 'POST', body },
      ),
    retry: false,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin-staff'] }),
        client.invalidateQueries({ queryKey: ['admin-activity'] }),
        client.invalidateQueries({ queryKey: ['restaurant'] }),
        client.invalidateQueries({ queryKey: ['auth', 'me'] }),
      ]);
      close();
    },
    onError: () => void client.invalidateQueries({ queryKey: ['admin-staff'] }),
  });
  const titles = {
    create: 'Thêm nhân viên',
    edit: 'Chỉnh sửa nhân viên',
    password: 'Đặt lại mật khẩu nhân viên',
  };
  return (
    <Editor
      open
      title={titles[edit.mode]}
      description={
        edit.mode === 'password'
          ? 'Mật khẩu mới thay mật khẩu cũ và đăng xuất các phiên của nhân viên.'
          : 'Quyền được kiểm tra ở máy chủ; không xóa lịch sử nhân viên.'
      }
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) close();
      }}
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          const input =
            edit.mode === 'create'
              ? staffCreateSchema.safeParse({ name, email, password, role })
              : edit.mode === 'edit'
                ? staffUpdateSchema.safeParse({
                    name,
                    role,
                    isActive,
                    expectedUpdatedAt: member!.updatedAt,
                  })
                : staffPasswordSchema.safeParse({
                    password,
                    reason,
                    expectedUpdatedAt: member!.updatedAt,
                  });
          if (!input.success) {
            setError(input.error.issues[0]!.message);
            return;
          }
          setError('');
          mutation.mutate(input.data);
        }}
      >
        {edit.mode !== 'password' && (
          <Field label="Tên nhân viên">
            <Input
              value={name}
              required
              minLength={2}
              maxLength={120}
              disabled={mutation.isPending}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        )}
        {edit.mode === 'create' && (
          <Field label="Email đăng nhập">
            <Input
              type="email"
              value={email}
              required
              maxLength={254}
              disabled={mutation.isPending}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        )}
        {edit.mode !== 'edit' && (
          <Field label="Mật khẩu mới">
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              required
              minLength={12}
              maxLength={128}
              disabled={mutation.isPending}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        )}
        {edit.mode !== 'password' && (
          <Field label="Vai trò nhân viên">
            <select
              className={selectClass}
              value={role}
              disabled={mutation.isPending || self}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {staffRoles
                .filter((value) => owner || value !== 'OWNER')
                .map((value) => (
                  <option key={value} value={value}>
                    {roleLabels[value]}
                  </option>
                ))}
            </select>
          </Field>
        )}
        {edit.mode === 'edit' && (
          <label className="flex items-start gap-3 text-sm leading-6">
            <input
              className="mt-1 size-4 shrink-0"
              type="checkbox"
              checked={isActive}
              disabled={mutation.isPending || self}
              onChange={(e) => setActive(e.target.checked)}
            />
            Cho phép nhân viên đăng nhập vào nhà hàng
          </label>
        )}
        {edit.mode === 'password' && (
          <>
            <p className="break-words text-sm">
              Nhân viên: <strong>{member!.name}</strong>
            </p>
            <Field label="Lý do đặt lại mật khẩu">
              <Input
                value={reason}
                required
                minLength={3}
                maxLength={500}
                disabled={mutation.isPending}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </>
        )}
        {edit.mode === 'edit' && (
          <p className="text-xs leading-6 text-muted-foreground">
            Đổi quyền hoặc khóa truy cập sẽ đăng xuất phiên cũ. Không tự thay quyền/khóa chính
            mình và phải giữ một OWNER đang hoạt động.
          </p>
        )}
        {(error || mutation.error) && (
          <p role="alert" className="text-sm leading-7 text-destructive">
            {error || mutation.error?.message}
            {mutation.error && ' Nếu dữ liệu đã đổi, đóng hộp thoại rồi mở lại để kiểm tra.'}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={close}>
            Hủy
          </Button>
          <Button disabled={mutation.isPending}>
            {mutation.isPending
              ? 'Đang lưu…'
              : edit.mode === 'password'
                ? 'Xác nhận đặt lại mật khẩu'
                : 'Lưu nhân viên'}
          </Button>
        </div>
      </form>
    </Editor>
  );
}
