'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { Building2, ArrowLeft, Leaf, MapPin, Phone, Wallet, Globe, Percent } from 'lucide-react';
import { api } from '@/lib/api';
import { useStaff } from '@/features/auth/use-staff';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

const settingsSchema = z.object({ id: z.uuid(), name: z.string(), address: z.string().nullable(), phone: z.string().nullable(), currency: z.literal('VND'), timezone: z.string(), serviceChargeBps: z.number().int(), taxBps: z.number().int() });

export default function SettingsPage() {
  const { data: staff } = useStaff();
  const settings = useQuery({ queryKey: ['restaurant', staff?.restaurantId, 'settings'], queryFn: ({ signal }) => api('/restaurant/settings', settingsSchema, { signal }), enabled: !!staff });
  const restaurant = settings.data;
  const basic = [
    { label: 'Tên nhà hàng', value: restaurant?.name, icon: Building2 },
    { label: 'Địa chỉ', value: restaurant?.address ?? 'Chưa cập nhật', icon: MapPin },
    { label: 'Số điện thoại', value: restaurant?.phone ?? 'Chưa cập nhật', icon: Phone },
  ];
  const billing = [
    { label: 'Đơn vị tiền tệ', value: 'VND — Việt Nam Đồng', icon: Wallet },
    { label: 'Múi giờ', value: restaurant?.timezone, icon: Globe },
    { label: 'Phí dịch vụ', value: `${(restaurant?.serviceChargeBps ?? 0) / 100}%`, icon: Percent },
    { label: 'Thuế', value: `${(restaurant?.taxBps ?? 0) / 100}%`, icon: Percent },
  ];
  return (
    <div className="space-y-6">
      <Link href="/staff/dashboard" className="inline-flex min-h-10 items-center gap-2 text-[10px] text-muted-foreground hover:text-primary"><ArrowLeft className="size-3.5" />Về tổng quan</Link>
      <div><p className="mb-3 text-[9px] font-semibold tracking-[0.16em] text-primary">THIẾT LẬP NHÀ HÀNG</p><h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">Thông tin nhà hàng</h1><p className="mt-3 text-xs text-muted-foreground">Thông tin dùng chung cho đội ngũ.</p></div>
      <div className="grid items-start gap-6 xl:grid-cols-[1.65fr_0.85fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-4 border-b px-6 py-6 sm:px-7"><span className="editorial grid size-12 place-items-center rounded-xl bg-primary text-xl text-accent">Df.</span><div><h2 className="text-sm font-semibold">{staff?.restaurant.name}</h2><p className="mt-1 text-[10px] text-muted-foreground">Không gian trải nghiệm ẩm thực của đội ngũ</p></div></div>
          <div className="px-6 py-7 sm:px-7">
            {settings.isPending ? <div className="space-y-5"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-48 w-full" /></div> : settings.isError ? <div role="alert"><p className="text-sm text-destructive">{settings.error.message}</p><Button className="mt-4" variant="outline" onClick={() => void settings.refetch()}>Thử lại</Button></div> : (
              <div className="space-y-8">
                {[{ title: 'Thông tin cơ bản', rows: basic }, { title: 'Định dạng & thanh toán', rows: billing }].map(group => <section key={group.title}><h3 className="mb-4 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.1em]"><span className="size-1 rounded-full bg-primary" />{group.title}</h3><dl>{group.rows.map(({ label, value, icon: Icon }) => <div key={label} className="grid gap-2 border-b border-border/60 py-4 text-[11px] last:border-0 sm:grid-cols-[1fr_1.1fr]"><dt className="flex items-center gap-2 text-muted-foreground"><Icon className="size-3.5" strokeWidth={1.5} />{label}</dt><dd className="font-medium leading-5">{value}</dd></div>)}</dl></section>)}
                <p className="rounded-xl border bg-background p-4 text-[10px] leading-6 text-muted-foreground">Phí dịch vụ và thuế được áp dụng theo cấu hình của nhà hàng.</p>
              </div>
            )}
          </div>
        </Card>
        <aside className="relative overflow-hidden rounded-2xl bg-primary text-white">
          <div className="relative h-44"><Image src="/images/dining-editorial.png" alt="" fill sizes="(min-width: 1280px) 25vw, 100vw" className="object-cover object-[center_35%]" /><div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-primary" /></div>
          <div className="relative px-6 pb-8"><div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1.5 text-[9px] text-accent"><Leaf className="size-3" />Nhịp phục vụ DineFlow</div><h2 className="editorial text-[34px] leading-[1.1]">Một không gian.<br /><span className="italic text-accent">Cùng một nhịp.</span></h2><p className="mt-5 text-[11px] leading-6 text-white/75">Một thông tin thống nhất giúp đội ngũ cùng chăm chút trải nghiệm của thực khách, từ bàn ăn đến căn bếp.</p><div className="mt-8 border-t border-white/15 pt-4 text-[9px] text-white/60">DineFlow · Những bữa ăn trọn vẹn.</div></div>
        </aside>
      </div>
    </div>
  );
}
