'use client';
import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="flex min-h-screen flex-col items-center justify-center gap-5 p-6 text-center"><h1 className="text-2xl font-bold">Không thể tải trang</h1><p className="text-muted-foreground">Vui lòng thử lại sau ít phút.</p><Button onClick={reset}>Thử lại</Button></main>; }
