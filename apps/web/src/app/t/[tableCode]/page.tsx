import { TableContext } from '@/features/setup/table-context';
export default async function Page({ params }: { params: Promise<{ tableCode: string }> }) {
  const { tableCode } = await params;
  return <TableContext code={tableCode} />;
}
