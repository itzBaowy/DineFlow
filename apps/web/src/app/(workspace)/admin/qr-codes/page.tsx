import { QrPage } from '@/features/setup/qr-page';
export default async function Page({ searchParams }: { searchParams: Promise<{ table?: string }> }) { const { table } = await searchParams; return <QrPage initialTable={table} />; }
