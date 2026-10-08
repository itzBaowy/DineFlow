'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { overviewSchema, roleLabels } from '@dineflow/shared';
import { OperationsSummary } from '@/features/operations/operations-summary';
import { z } from 'zod';
import { ArrowRight, Armchair, Layers3, UtensilsCrossed, Users, CircleCheck, Building2, CalendarDays, Leaf, ShieldCheck, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useStaff } from '@/features/auth/use-staff';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LocalDate } from '@/components/local-date';

export default function DashboardPage() {
  const { data: staff } = useStaff();
  const overview = useQuery({ queryKey: ['restaurant', staff?.restaurantId, 'overview'], queryFn: ({ signal }) => api('/restaurant/overview', overviewSchema, { signal }), enabled: !!staff });
  const health = useQuery({ queryKey: ['health'], queryFn: ({ signal }) => api('/health/ready', z.object({ status: z.literal('ok'), database: z.literal('up') }), { signal, refresh: false }), refetchInterval: 30000 });
  const counts = overview.data?.counts;
  const admin = staff?.role === 'OWNER' || staff?.role === 'MANAGER';
  const metrics = [
    { label: 'Bàn phục vụ', value: counts?.tables, caption: 'Bàn đã cấu hình', icon: Armchair },
    { label: 'Danh mục món', value: counts?.categories, caption: 'Danh mục đang hoạt động', icon: Layers3 },
    { label: 'Món trong thực đơn', value: counts?.menuItems, caption: counts ? `${counts.availableMenuItems} món đang bật bán` : 'Đang tải thực đơn', icon: UtensilsCrossed },
    { label: 'Đội ngũ nhân viên', value: counts?.staff, caption: 'Tài khoản đang hoạt động', icon: Users },
  ];
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="mb-3 text-[9px] font-semibold tracking-[0.16em] text-muted-foreground">KHÔNG GIAN NHÂN VIÊN / TỔNG QUAN</p><h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">Chào mừng trở lại.</h1><p className="mt-3 text-xs leading-6 text-muted-foreground">Thông tin nhà hàng và không gian làm việc của bạn, cùng một nơi.</p></div>
        <span className="flex items-center gap-2 rounded-lg border bg-white/60 px-3 py-2 text-[10px] text-muted-foreground"><CalendarDays className="size-3.5" /><LocalDate timezone={staff?.restaurant.timezone ?? 'Asia/Ho_Chi_Minh'} /></span>
      </div>

      <section className="relative overflow-hidden rounded-2xl bg-primary text-white">
        <div className="absolute inset-y-0 right-0 w-full sm:w-[44%]"><Image src="/images/dining-editorial.png" alt="" fill sizes="(min-width: 1024px) 35vw, 100vw" className="object-cover object-center" /></div>
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#173e32_35%,rgba(23,62,50,0.90)_65%,rgba(23,62,50,0.35)_100%)]" />
        <div className="relative max-w-xl px-6 py-8 sm:px-8 sm:py-9">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1.5 text-[9px] font-medium tracking-wide text-accent"><span className={`size-1.5 rounded-full ${health.isSuccess ? 'bg-accent' : 'bg-amber-300'}`} />{health.isSuccess ? 'Kết nối nhà hàng ổn định' : health.isPending ? 'Đang kiểm tra kết nối…' : 'Kết nối tạm gián đoạn'}</div>
          <h2 className="editorial text-[36px] leading-[1.08] sm:text-[42px]">Một đội ngũ.<br /><span className="italic text-accent">Một nhịp phục vụ.</span></h2>
          <p className="mt-4 max-w-sm text-[11px] leading-6 text-white/75">Cùng {staff?.restaurant.name}, chăm chút từng trải nghiệm và giữ nhịp vận hành của đội ngũ.</p>
          {admin && <Button asChild variant="outline" className="mt-5 h-10 border-accent/25 bg-accent text-xs text-primary hover:bg-accent/90"><Link href="/admin/settings">Thông tin nhà hàng<ArrowRight /></Link></Button>}
        </div>
      </section>

      <OperationsSummary />
      <section aria-labelledby="setup-heading">
        <div className="mb-4 flex items-center justify-between gap-3"><h2 id="setup-heading" className="text-sm font-semibold">Cấu hình nhà hàng</h2><Button variant="ghost" size="sm" className="h-9 px-2 text-[10px]" onClick={() => void overview.refetch()} disabled={overview.isFetching}><RefreshCw className={overview.isFetching ? 'animate-spin' : ''} />{overview.isFetching ? 'Đang cập nhật…' : 'Làm mới'}</Button></div>
        {overview.isError ? <Card className="p-6"><p role="alert" className="text-sm text-destructive">{overview.error.message}</p><Button className="mt-4" variant="outline" onClick={() => void overview.refetch()}>Thử lại</Button></Card> : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">{metrics.map(({ label, value, caption, icon: Icon }) => <Card key={label} className="p-4 sm:p-5"><div className="flex min-h-8 items-start justify-between gap-2"><p className="pt-1 text-[10px] font-medium text-muted-foreground">{label}</p><span className="hidden size-8 shrink-0 place-items-center rounded-lg border bg-background sm:grid"><Icon className="size-3.5 text-muted-foreground" strokeWidth={1.5} /></span></div>{value === undefined ? <Skeleton className="my-4 h-10 w-14" /> : <p className="my-4 text-[40px] font-medium leading-none tracking-tight text-primary" data-testid={`metric-${label}`}>{value}</p>}<p className="flex items-center gap-1.5 border-t pt-3 text-[9px] leading-4 text-muted-foreground"><span className="size-1 shrink-0 rounded-full bg-primary/60" />{caption}</p></Card>)}</div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card className="p-6"><div className="mb-6 flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Không gian của bạn</h2><p className="mt-1.5 text-[10px] text-muted-foreground">Thông tin dùng chung cho đội ngũ nhà hàng</p></div><Building2 className="size-5 text-primary" strokeWidth={1.5} /></div>
          <dl className="grid gap-3 sm:grid-cols-2">
            {[['Nhà hàng', staff?.restaurant.name], ['Đơn vị tiền tệ', 'VND — Việt Nam Đồng'], ['Múi giờ', staff?.restaurant.timezone], ['Quyền truy cập', staff ? roleLabels[staff.role] : '']].map(([label, value]) => <div key={label} className="rounded-xl border border-border/60 bg-background/70 p-4"><dt className="mb-2 text-[8px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{label}</dt><dd className="text-[11px] font-medium leading-5">{value}</dd></div>)}
          </dl>
        </Card>
        <Card className="bg-[#f0f2e9] p-6"><div className="mb-5 flex items-center justify-between"><h2 className="text-sm font-semibold">Phiên làm việc</h2><ShieldCheck className="size-5 text-primary" strokeWidth={1.5} /></div><p className="text-[11px] leading-6 text-muted-foreground">Bạn đã đăng nhập vào không gian của nhà hàng với quyền <span className="font-medium text-foreground">{staff ? roleLabels[staff.role].toLowerCase() : ''}</span>.</p><div className="mt-5 flex items-center gap-2 rounded-xl border border-primary/10 bg-white/40 p-3 text-[10px] font-medium text-primary"><CircleCheck className="size-4" />Tài khoản đang hoạt động</div><p className="mt-5 text-[10px] leading-6 text-muted-foreground">Đăng xuất khi sử dụng xong trên thiết bị dùng chung để giữ an toàn cho tài khoản.</p></Card>
      </div>
      <footer className="flex items-center gap-2 border-t pt-5 text-[9px] text-muted-foreground"><Leaf className="size-3" />DineFlow · Nhịp phục vụ, cùng một nơi</footer>
    </div>
  );
}
