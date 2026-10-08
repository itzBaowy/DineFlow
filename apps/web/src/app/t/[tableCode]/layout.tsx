import { CustomerProvider } from '@/features/ordering/customer-provider';
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tableCode: string }>;
}) {
  const { tableCode } = await params;
  return <CustomerProvider code={tableCode}>{children}</CustomerProvider>;
}
