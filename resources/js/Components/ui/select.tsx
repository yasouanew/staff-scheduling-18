import { ChevronDown } from 'lucide-react';
import { forwardRef, type SelectHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    hasError?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
    { className, children, hasError = false, ...props },
    ref,
) {
    return <span className="relative block">
        <select
            ref={ref}
            data-invalid={hasError || undefined}
            className={cn(
                'flex h-10 w-full appearance-none rounded-lg border border-input bg-background px-3 py-2 pr-9 text-sm text-foreground shadow-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                'disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70',
                'data-[invalid=true]:border-destructive data-[invalid=true]:focus-visible:ring-destructive',
                className,
            )}
            {...props}
        >
            {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    </span>;
});
