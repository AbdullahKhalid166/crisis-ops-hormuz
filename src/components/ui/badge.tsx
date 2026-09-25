import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils.ts';

const badgeVariants = cva(
  'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#c65d33] focus:ring-offset-2 select-none uppercase tracking-wider',
  {
    variants: {
      variant: {
        default:
          'bg-[#1a1a1a] text-[#faf8f5] shadow-xs',
        secondary:
          'bg-[#f0ebe3] text-[#403c37] border border-[#ded9d2]',
        destructive:
          'bg-[#dc2626] text-white shadow-xs',
        outline:
          'text-[#403c37] border border-[#ded9d2] bg-[#faf8f5]',
        critical:
          'bg-[#fef2f2] text-[#991b1b] border border-[#fecaca] font-bold',
        distressed:
          'bg-[#dc2626] text-white shadow-xs font-bold animate-pulse',
        warning:
          'bg-[#faeee8] text-[#9a3412] border border-[#f5cfbd]',
        rerouting:
          'bg-[#faeee8] text-[#9a3412] border border-[#f5cfbd]',
        success:
          'bg-[#eef3ed] text-[#3d5238] border border-[#c4d6c0] font-semibold',
        normal:
          'bg-[#eef3ed] text-[#3d5238] border border-[#c4d6c0] font-semibold',
        assigned:
          'bg-[#faeee8] text-[#c65d33] border border-[#f5cfbd] font-bold',
        traffic:
          'bg-[#ebe7e0] text-[#5e5852] border border-[#ded9d2] font-medium',
        live:
          'bg-[#c65d33]/15 text-[#c65d33] border border-[#c65d33]/30 font-bold',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
