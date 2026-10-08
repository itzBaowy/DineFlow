import { PaymentReceipt } from '@/features/billing/receipt';
export default async function Page({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  return <PaymentReceipt paymentId={paymentId} />;
}
