import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { Brand } from '@/components/brand';
import { RegisterForm } from '@/features/auth/register-form';

export const metadata: Metadata = { title: 'Tạo nhà hàng miễn phí' };
export default function RegisterPage() {
  return (
    <main className="mx-auto min-h-svh max-w-6xl px-5 py-7 sm:px-8">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-5">
        <Brand />
        <Link href="/staff/login" className="text-sm font-semibold text-primary">
          Đã có tài khoản? Đăng nhập →
        </Link>
      </header>
      <div className="grid items-start gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <aside className="space-y-6">
          <section className="relative overflow-hidden rounded-2xl bg-primary p-7 text-white sm:p-9">
            <Image
              src="/images/dining-editorial.png"
              alt=""
              fill
              sizes="(max-width: 1024px) 100vw, 45vw"
              className="object-cover opacity-15"
              priority
            />
            <div className="relative space-y-6">
              <p className="text-xs font-semibold tracking-widest text-accent">
                KHÔNG GIAN RIÊNG CHO NHÀ HÀNG
              </p>
              <h1 className="editorial text-4xl leading-tight sm:text-5xl">
                Quán của bạn.
                <br />
                <em className="text-accent">Nhịp phục vụ của bạn.</em>
              </h1>
              <p className="text-sm leading-7 text-white/85">
                Từ khách quét QR đến bếp và thu ngân, cùng chăm chút từng bữa ăn trong không
                gian dành riêng cho đội ngũ của bạn.
              </p>
              <p className="border-t border-white/20 pt-5 text-xs leading-6 text-accent">
                Miễn phí trong giai đoạn hiện tại · Không cần thẻ tín dụng
              </p>
            </div>
          </section>
          <section className="space-y-5 rounded-2xl border bg-white p-6">
            <h2 className="editorial text-2xl text-primary">Ba bước bắt đầu</h2>
            <ol className="space-y-5">
              {[
                'Tạo tài khoản chủ nhà hàng và không gian của quán.',
                'Thêm thực đơn, bàn và in mã QR.',
                'Tạo tài khoản quản lý, phục vụ, bếp và thu ngân.',
              ].map((step, index) => (
                <li key={step} className="flex gap-3 text-sm leading-7">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </section>
        </aside>
        <section className="min-w-0 space-y-7 rounded-2xl border bg-white p-6 sm:p-9">
          <div>
            <p className="mb-3 text-xs font-semibold tracking-widest text-primary">
              BẮT ĐẦU HÀNH TRÌNH
            </p>
            <h2 className="editorial text-3xl text-primary">Bắt đầu với nhà hàng của bạn</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Bạn sẽ là chủ nhà hàng và tự cấp tài khoản cho đội ngũ sau khi đăng nhập.
            </p>
          </div>
          <RegisterForm />
        </section>
      </div>
      <footer className="mt-10 flex flex-wrap justify-between gap-4 border-t py-6 text-xs leading-6 text-muted-foreground">
        <span>Nhân viên nhận tài khoản từ chủ nhà hàng hoặc quản lý.</span>
        <Link href="/platform/login" className="font-medium text-primary">
          Quản trị nền tảng
        </Link>
      </footer>
    </main>
  );
}
