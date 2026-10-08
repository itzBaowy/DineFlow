import { CashierBill } from '@/features/billing/cashier';
export default async function Page({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <CashierBill sessionId={sessionId} />;
}
