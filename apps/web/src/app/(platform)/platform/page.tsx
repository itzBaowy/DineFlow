import type { Metadata } from 'next';
import { PlatformConsole } from '@/features/platform/console';
export const metadata: Metadata = { title: 'Quản trị nền tảng' };
export default function Page() {
  return <PlatformConsole />;
}
