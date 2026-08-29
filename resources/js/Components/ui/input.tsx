import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    hasError?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
    { className, hasError = false, type = 'text', ...props },
    ref,
) {
    return <input
        ref={ref}
        type={type}
        data-invalid={hasError || undefined}
        className={cn(
            'flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70',
            'data-[invalid=true]:border-destructive data-[invalid=true]:focus-visible:ring-destructive',
            'file:mr-3 file:rounded-md file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
            className,
        )}
        {...props}
    />;
});
