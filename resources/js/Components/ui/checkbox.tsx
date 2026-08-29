import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';

import { cn } from '@/lib/utils';

export type CheckboxProps = ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> & {
    hasError?: boolean;
};

export const Checkbox = forwardRef<ElementRef<typeof CheckboxPrimitive.Root>, CheckboxProps>(function Checkbox(
    { className, hasError = false, ...props },
    ref,
) {
    return <CheckboxPrimitive.Root
        ref={ref}
        data-invalid={hasError || undefined}
        className={cn(
            'peer flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input bg-background text-primary-foreground shadow-sm transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary',
            'data-[invalid=true]:border-destructive data-[invalid=true]:focus-visible:ring-destructive',
            className,
        )}
        {...props}
    >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center">
            <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
        </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>;
});
