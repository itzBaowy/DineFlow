import * as React from 'react';
import { cn } from '@/lib/utils';
export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card" className={cn('rounded-2xl border bg-card text-card-foreground shadow-[0_2px_8px_#20362a03]', className)} {...props} />;
}
