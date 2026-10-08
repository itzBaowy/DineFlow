import type { Metadata } from 'next';
import Image from 'next/image';
import { ChefHat, Leaf, QrCode, BellRing } from 'lucide-react';
import { Brand } from '@/components/brand';
import { LoginForm } from '@/features/auth/login-form';

export const metadata: Metadata = { title: 'Đăng nhập nhân viên' };

export default function LoginPage() {
  return (
    <main className="min-h-svh lg:grid lg:grid-cols-[0.96fr_1.04fr]">
      <section className="relative hidden min-h-svh flex-col overflow-hidden bg-primary px-10 py-10 text-white lg:flex xl:px-14 xl:py-12">
        <Image src="/images/dining-editorial.png" alt="" fill priority sizes="48vw" className="object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(23,62,50,0.77)_0%,rgba(23,62,50,0.82)_45%,rgba(16,45,36,0.96)_100%)]" />
        <header className="relative flex items-center justify-between gap-4"><Brand light /><Leaf className="size-5 text-accent/70" strokeWidth={1.5} /></header>
        <div className="relative my-auto max-w-xl py-16">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-accent"><Leaf className="size-3" />Được xây dựng cho những bữa ăn trọn vẹn</div>
          <h1 className="editorial text-[clamp(2.7rem,4.2vw,4.25rem)] leading-[1.08] text-[#f8f7f3]">Mỗi bữa ăn ngon,<br />bắt đầu từ một<br /><span className="italic text-accent">nhịp phục vụ.</span></h1>
          <p className="mt-7 max-w-sm text-sm leading-7 text-white/75">Kết nối bàn ăn, đội ngũ phục vụ và căn bếp. Cùng chăm chút từng khoảnh khắc của thực khách.</p>
          <div className="mt-10 border-t border-white/15 pt-6">
            <p className="mb-4 text-[9px] font-semibold uppercase tracking-[0.2em] text-accent/80">HÀNH TRÌNH TRẢI NGHIỆM DINEFLOW</p>
            <div className="grid grid-cols-3 gap-3">{[{ icon: QrCode, text: 'Quét & gọi món' }, { icon: ChefHat, text: 'Bếp chuẩn bị' }, { icon: BellRing, text: 'Phục vụ tận bàn' }].map(({ icon: Icon, text }, index) => <div key={text} className="rounded-xl border border-white/10 bg-[#102d24]/45 p-3.5 backdrop-blur-xs"><Icon className="mb-4 size-5 text-accent" strokeWidth={1.5} /><p className="mb-1 text-[8px] uppercase tracking-[0.12em] text-white/50">Bước 0{index + 1}</p><p className="text-[11px] font-medium leading-5 text-white/90">{text}</p></div>)}</div>
          </div>
        </div>
        <footer className="relative border-t border-white/10 pt-5 text-[10px] text-white/50">DineFlow · Được xây dựng cho đội ngũ nhà hàng.</footer>
      </section>
      <section className="flex min-h-svh flex-col bg-background px-6 py-7 sm:px-12 lg:px-16 lg:py-10 xl:px-20 xl:py-12">
        <header className="flex items-center justify-between gap-4"><div className="lg:invisible"><Brand /></div><span className="inline-flex items-center gap-2 rounded-md border bg-secondary/60 px-2.5 py-1.5 text-[10px] text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" />Tiếng Việt</span></header>
        <div className="my-auto w-full max-w-[400px] self-center py-14 lg:py-16">
          <div className="mb-4 flex items-center gap-2"><span className="size-1.5 rounded-full bg-primary" /><span className="text-[10px] font-semibold tracking-[0.15em] text-primary">KHÔNG GIAN NHÂN VIÊN</span></div>
          <h2 className="text-[29px] font-bold tracking-tight sm:text-[32px]">Chào mừng trở lại</h2>
          <p className="mb-8 mt-3 text-[13px] leading-6 text-muted-foreground">Đăng nhập để vào không gian làm việc<br className="hidden sm:block" /> của nhà hàng.</p>
          <LoginForm />
          <div className="relative mb-5 mt-8 flex items-center justify-center"><div className="absolute inset-x-0 h-px bg-border" /><span className="relative bg-background px-3 text-[8px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Hỗ trợ tài khoản</span></div>
          <div className="rounded-xl border bg-secondary/50 px-4 py-4 text-center text-[11px] leading-6 text-muted-foreground">Bạn chưa có tài khoản hoặc quên mật khẩu?<br /><span className="font-medium text-foreground">Liên hệ quản lý nhà hàng để được hỗ trợ.</span></div>
        </div>
        <footer className="mx-auto w-full max-w-[400px] border-t pt-5 text-center text-[10px] text-muted-foreground">DineFlow — Không gian dành cho đội ngũ nhà hàng</footer>
      </section>
    </main>
  );
}
