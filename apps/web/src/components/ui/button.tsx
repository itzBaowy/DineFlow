import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring [&_svg]:size-4', {
  variants: {
    variant: { default: 'bg-primary text-primary-foreground hover:bg-[#0d5946]', outline: 'border bg-white hover:bg-secondary', ghost: 'hover:bg-secondary text-muted-foreground' },
    size: { default: 'h-12 px-5', sm: 'h-10 px-3 text-xs', icon: 'size-12' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});
export function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
