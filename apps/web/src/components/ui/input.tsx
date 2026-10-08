import * as React from 'react';
import { cn } from '@/lib/utils';
export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input data-slot="input" className={cn('flex h-12 w-full rounded-xl border border-input bg-white px-4 text-sm shadow-xs outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/15 disabled:opacity-50 aria-invalid:border-destructive', className)} {...props} />;
}
