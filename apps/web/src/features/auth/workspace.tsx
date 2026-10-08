'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  LayoutDashboard,
  Settings2,
  LogOut,
  LoaderCircle,
  ShieldCheck,
  Menu,
  X,
  UtensilsCrossed,
  ChefHat,
  Receipt,
  QrCode,
  Building2,
  Layers3,
  SlidersHorizontal,
  Armchair,
} from 'lucide-react';
import { Dialog } from 'radix-ui';
import { roleLabels } from '@dineflow/shared';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useStaff } from './use-staff';

export function Workspace({ children }: { children: React.ReactNode }) {
  const staffQuery = useStaff();
  const client = useQueryClient();
  const router = useRouter();
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const logout = useMutation({
    mutationFn: () => api('/auth/logout', z.undefined(), { method: 'POST', refresh: false }),
    onSuccess: () => {
      client.clear();
      router.replace('/staff/login');
    },
  });
  const unauthenticated = staffQuery.error instanceof ApiError && staffQuery.error.status === 401;
  useEffect(() => {
    if (unauthenticated) router.replace('/staff/login');
  }, [unauthenticated, router]);
  if (staffQuery.isPending || unauthenticated)
    return (
      <main className="grid min-h-screen place-items-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="size-5 animate-spin text-primary" />
          Đang mở không gian làm việc…
        </div>
      </main>
    );
  if (staffQuery.isError)
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div className="space-y-4 text-center">
          <h1 className="text-xl font-semibold">Không thể kết nối nhà hàng</h1>
          <p className="text-sm text-muted-foreground">{staffQuery.error.message}</p>
          <Button onClick={() => void staffQuery.refetch()}>Thử lại</Button>
        </div>
      </main>
    );
  const staff = staffQuery.data;
  const admin = staff.role === 'OWNER' || staff.role === 'MANAGER';
  const links = [
    { href: '/staff/dashboard', title: 'Tổng quan', icon: LayoutDashboard },
    ...(admin
      ? [
          { href: '/admin/menu', title: 'Thực đơn', icon: UtensilsCrossed },
          { href: '/admin/categories', title: 'Danh mục', icon: Layers3 },
          { href: '/admin/modifiers', title: 'Size & topping', icon: SlidersHorizontal },
          { href: '/admin/tables', title: 'Bàn phục vụ', icon: Armchair },
          { href: '/admin/qr-codes', title: 'Mã QR', icon: QrCode },
          { href: '/admin/settings', title: 'Thông tin nhà hàng', icon: Settings2 },
        ]
      : []),
  ];
  const sidebar = (
    <>
      <div className="mb-8 flex items-center justify-between px-2">
        <Brand />
        <button className="lg:hidden" onClick={() => setMenuOpen(false)} aria-label="Đóng menu">
          <X className="size-5" />
        </button>
      </div>
      <div className="mb-7 rounded-xl border bg-white/70 p-3">
        <div className="mb-2 flex items-center gap-2 text-primary">
          <Building2 className="size-3.5" />
          <p className="text-[11px] font-semibold">{staff.restaurant.name}</p>
        </div>
        <p className="text-[9px] text-muted-foreground">Không gian đội ngũ nhà hàng</p>
      </div>
      <p className="mb-3 px-3 text-[9px] font-semibold tracking-[0.15em] text-muted-foreground">
        KHÔNG GIAN LÀM VIỆC
      </p>
      <nav aria-label="Menu chính" className="space-y-1.5">
        {links.map(({ href, title, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setMenuOpen(false)}
            aria-current={path === href ? 'page' : undefined}
            className={cn(
              'flex min-h-12 items-center gap-3 rounded-xl px-3 text-xs font-medium transition-colors',
              path === href
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <Icon className="size-4" strokeWidth={1.5} />
            {title}
          </Link>
        ))}
      </nav>
      <div className="mt-6 border-t pt-5">
        <p className="mb-3 px-3 text-[9px] font-semibold tracking-[0.15em] text-muted-foreground">
          SẮP RA MẮT
        </p>
        {[
          { icon: QrCode, title: 'Bàn & gọi món' },
          { icon: ChefHat, title: 'Màn hình bếp' },
          { icon: Receipt, title: 'Thu ngân' },
        ].map(({ icon: Icon, title }) => (
          <div
            key={title}
            className="flex h-10 items-center gap-3 px-3 text-xs text-muted-foreground/70"
          >
            <Icon className="size-4" strokeWidth={1.5} />
            {title}
          </div>
        ))}
      </div>
      <div className="mt-auto border-t pt-5">
        <div className="flex items-center gap-3 rounded-xl bg-white/60 p-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-xs font-semibold text-accent">
            {staff.name.charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold">{staff.name}</p>
            <p className="mt-1 text-[9px] text-muted-foreground">{roleLabels[staff.role]}</p>
          </div>
          <ShieldCheck className="ml-auto size-4 shrink-0 text-primary" strokeWidth={1.5} />
        </div>
        <p className="mt-3 text-center text-[8px] text-muted-foreground">
          DineFlow · Nhịp phục vụ, cùng một nơi
        </p>
      </div>
    </>
  );
  return (
    <div className="min-h-screen lg:flex">
      <aside data-workspace-sidebar className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col overflow-y-auto border-r bg-[#f3f3ed] px-5 py-7 lg:flex">
        {sidebar}
      </aside>
      <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-primary/30 backdrop-blur-sm lg:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col overflow-y-auto bg-[#f3f3ed] px-5 py-7 shadow-xl lg:hidden">
            <Dialog.Title className="sr-only">Điều hướng nhà hàng</Dialog.Title>
            <Dialog.Description className="sr-only">
              Các trang trong không gian làm việc của bạn
            </Dialog.Description>
            {sidebar}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div data-workspace-content className="min-w-0 flex-1 lg:ml-64">
        <header data-workspace-header className="flex min-h-20 items-center justify-between gap-3 border-b bg-background/80 px-4 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 lg:hidden"
              onClick={() => setMenuOpen(true)}
              aria-label="Mở menu"
            >
              <Menu />
            </Button>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">{staff.restaurant.name}</p>
              <p className="mt-1 truncate text-[10px] text-muted-foreground">
                Không gian làm việc /{' '}
                {links.find((link) => link.href === path)?.title ?? 'Thiết lập'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <div className="hidden size-9 place-items-center rounded-full bg-[#eee9db] text-sm font-bold text-[#817047] sm:grid">
              {staff.name.charAt(0)}
            </div>
            <div className="hidden sm:block">
              <p className="text-[11px] font-semibold">{staff.name}</p>
              <p className="mt-1 text-[9px] text-muted-foreground">{roleLabels[staff.role]}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              aria-label="Đăng xuất"
              title="Đăng xuất"
            >
              {logout.isPending ? <LoaderCircle className="animate-spin" /> : <LogOut />}
            </Button>
          </div>
        </header>
        {logout.isError && (
          <p role="alert" className="mx-6 mt-4 rounded-xl bg-red-50 p-3 text-sm text-destructive">
            {logout.error.message}
          </p>
        )}
        <main data-workspace-main className="mx-auto max-w-7xl p-5 sm:p-8 xl:p-10">{children}</main>
      </div>
    </div>
  );
}
