import Link from 'next/link';
import { AccountSecurity } from '@/features/auth/account-security';
export default function Page(){return <main className="p-5 sm:p-10"><Link href="/platform" className="mb-8 inline-flex min-h-12 text-sm font-medium text-primary underline">Về quản trị nền tảng</Link><AccountSecurity platform /></main>;}
