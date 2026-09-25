import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils.ts';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c65d33] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-[#1a1a1a] text-[#faf8f5] shadow-sm hover:bg-[#2c2c2c] active:bg-[#111111]',
        primary:
          'bg-[#c65d33] text-white font-semibold shadow-xs hover:bg-[#b04f29] active:bg-[#994220]',
        destructive:
          'bg-[#dc2626] text-white shadow-xs hover:bg-[#b91c1c] active:bg-[#991b1b]',
        outline:
          'border border-[#ded9d2] bg-[#faf8f5] hover:bg-[#f2ede6] text-[#1f1f1f] hover:text-[#000000]',
        secondary:
          'bg-[#242424] text-[#e0deda] border border-[#383838] hover:bg-[#2c2c2c] hover:text-white',
        ghost:
          'hover:bg-[#f2ede6] text-[#403c37] hover:text-[#1a1a1a]',
        link: 'text-[#c65d33] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-7 rounded-md px-2.5 text-xs',
        xs: 'h-6 rounded px-2 text-[10px]',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-10 w-10 p-0',
        'icon-sm': 'h-7 w-7 p-0',
        'icon-xs': 'h-6 w-6 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
