import { forwardRef, type TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    hasError?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
    { className, hasError = false, ...props },
    ref,
) {
    return <textarea
        ref={ref}
        data-invalid={hasError || undefined}
        className={cn(
            'flex min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70',
            'data-[invalid=true]:border-destructive data-[invalid=true]:focus-visible:ring-destructive',
            className,
        )}
        {...props}
    />;
});
