import Link from 'next/link';
import type { Metadata } from 'next';
import { Brand } from '@/components/brand';
import { PlatformLogin } from '@/features/platform/login';
export const metadata: Metadata = { title: 'Đăng nhập quản trị nền tảng' };
export default function Page() {
  return (
    <main className="grid min-h-svh place-items-center p-5">
      <section className="w-full max-w-md space-y-7 rounded-2xl border bg-white p-7 sm:p-9">
        <Brand />
        <div className="space-y-3">
          <p className="text-xs font-semibold tracking-widest text-primary">
            QUẢN TRỊ NỀN TẢNG
          </p>
          <h1 className="editorial text-3xl text-primary">Chăm chút hệ thống chung.</h1>
          <p className="text-sm leading-7 text-muted-foreground">
            Tài khoản quản trị được cấp riêng bởi người vận hành nền tảng. Chủ nhà hàng và nhân
            viên đăng nhập tại không gian nhà hàng.
          </p>
        </div>
        <PlatformLogin />
        <Link
          href="/staff/login"
          className="block text-center text-xs font-semibold text-primary underline"
        >
          Đăng nhập nhà hàng
        </Link>
      </section>
    </main>
  );
}
