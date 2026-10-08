import Link from 'next/link';
import { Button } from '@/components/ui/button';
export default function NotFound() { return <main className="flex min-h-screen flex-col items-center justify-center gap-5 p-6 text-center"><p className="text-sm font-semibold text-primary">DINEFLOW / 404</p><h1 className="text-3xl font-bold">Không tìm thấy trang</h1><p className="text-muted-foreground">Đường dẫn có thể đã thay đổi hoặc chưa được mở.</p><Button asChild><Link href="/staff/dashboard">Về không gian làm việc</Link></Button></main>; }
