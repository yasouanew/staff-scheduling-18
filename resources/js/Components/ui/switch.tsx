import * as SwitchPrimitive from '@radix-ui/react-switch';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';

import { cn } from '@/lib/utils';

export type SwitchProps = ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>;

export const Switch = forwardRef<ElementRef<typeof SwitchPrimitive.Root>, SwitchProps>(function Switch(
    { className, ...props },
    ref,
) {
    return <SwitchPrimitive.Root
        ref={ref}
        className={cn(
            'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-muted p-0.5 shadow-sm transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary',
            className,
        )}
        {...props}
    >
        <SwitchPrimitive.Thumb className="pointer-events-none block h-5 w-5 rounded-full bg-card shadow-md transition-transform data-[state=checked]:translate-x-5" />
    </SwitchPrimitive.Root>;
});
