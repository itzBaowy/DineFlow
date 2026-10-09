import type { Metadata } from 'next';
import { Be_Vietnam_Pro, Newsreader } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { Analytics } from '@vercel/analytics/next';
export const metadata: Metadata = { title: { default: 'DineFlow — Quản lý nhà hàng', template: '%s | DineFlow' }, description: 'Không gian làm việc dành cho đội ngũ nhà hàng.' };
const vietnam = Be_Vietnam_Pro({ subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '700'], variable: '--font-vietnam', display: 'swap' });
const editorial = Newsreader({ subsets: ['latin', 'vietnamese'], variable: '--font-editorial', display: 'swap' });
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="vi" className={`${vietnam.variable} ${editorial.variable}`}><body className="min-h-screen antialiased"><Providers>{children}</Providers><Analytics /></body></html>; }
