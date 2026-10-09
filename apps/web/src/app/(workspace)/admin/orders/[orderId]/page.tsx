import { OrderHistoryDetail } from '@/features/admin/history';
export default async function Page({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <OrderHistoryDetail orderId={orderId} />;
}
