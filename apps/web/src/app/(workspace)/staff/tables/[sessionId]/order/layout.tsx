import { ManualProvider } from '@/features/operations/manual-provider';
export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <ManualProvider sessionId={sessionId}>{children}</ManualProvider>;
}
