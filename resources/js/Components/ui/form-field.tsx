import { forwardRef, type HTMLAttributes, type LabelHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export const Field = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Field(
    { className, ...props },
    ref,
) {
    return <div ref={ref} className={cn('grid gap-2', className)} {...props} />;
});

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(function Label(
    { className, ...props },
    ref,
) {
    return <label
        ref={ref}
        className={cn('text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)}
        {...props}
    />;
});

export const FieldDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(function FieldDescription(
    { className, ...props },
    ref,
) {
    return <p ref={ref} className={cn('text-sm leading-5 text-muted-foreground', className)} {...props} />;
});

export const FieldError = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(function FieldError(
    { className, role = 'alert', ...props },
    ref,
) {
    return <p ref={ref} role={role} className={cn('text-sm font-medium text-destructive', className)} {...props} />;
});
