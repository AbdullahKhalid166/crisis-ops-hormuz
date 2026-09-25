import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils.ts';

const alertVariants = cva(
  'relative w-full rounded-lg border p-3.5 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-3.5 [&>svg]:top-3.5 [&>svg]:text-[#1f1f1f]',
  {
    variants: {
      variant: {
        default: 'bg-[#faf8f5] text-[#1f1f1f] border-[#ded9d2] shadow-sm',
        destructive:
          'border-l-[3px] border-l-[#dc2626] border-[#ded9d2] bg-[#faf8f5] text-[#1f1f1f] shadow-[0_8px_24px_rgba(0,0,0,0.14),0_1px_3px_rgba(0,0,0,0.06)] [&>svg]:text-[#dc2626]',
        critical:
          'border-l-[3px] border-l-[#dc2626] border-[#ded9d2] bg-[#faf8f5] text-[#1f1f1f] shadow-[0_8px_24px_rgba(0,0,0,0.14),0_1px_3px_rgba(0,0,0,0.06)] [&>svg]:text-[#dc2626]',
        warning:
          'border-l-[3px] border-l-[#c65d33] border-[#ded9d2] bg-[#faf8f5] text-[#1f1f1f] shadow-[0_8px_24px_rgba(0,0,0,0.14),0_1px_3px_rgba(0,0,0,0.06)] [&>svg]:text-[#c65d33]',
        info:
          'border-l-[3px] border-l-[#7a9471] border-[#ded9d2] bg-[#faf8f5] text-[#1f1f1f] shadow-[0_8px_24px_rgba(0,0,0,0.14),0_1px_3px_rgba(0,0,0,0.06)] [&>svg]:text-[#7a9471]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1 text-xs font-semibold leading-none tracking-tight font-display text-[#1f1f1f]', className)}
    {...props}
  />
));
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-[11px] leading-relaxed text-[#403c37]', className)}
    {...props}
  />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
