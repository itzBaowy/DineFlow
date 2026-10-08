import { Utensils } from 'lucide-react';
import { cn } from '@/lib/utils';
export function Brand({ light = false }: { light?: boolean }) {
  return <div className={cn('flex items-center gap-3', light && 'text-white')}><span className={cn('grid size-10 place-items-center rounded-xl border border-primary/15 bg-primary text-accent', light && 'border-accent/25 bg-[#102d24]/80')}><Utensils className="size-5" strokeWidth={1.5} /></span><div><span className="text-xl font-bold tracking-tight">Dine<span className={light ? 'text-accent' : 'text-primary'}>Flow</span><span className="ml-1 text-accent">.</span></span><p className={cn('mt-0.5 text-[8px] font-medium uppercase tracking-[0.18em] text-muted-foreground', light && 'text-accent/70')}>Nhịp phục vụ, cùng một nơi</p></div></div>;
}
