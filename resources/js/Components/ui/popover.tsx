import * as PopoverPrimitive from '@radix-ui/react-popover';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';

import { cn } from '@/lib/utils';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export const PopoverContent = forwardRef<ElementRef<typeof PopoverPrimitive.Content>, ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>>(function PopoverContent(
    { className, align = 'center', sideOffset = 8, ...props },
    ref,
) {
    return <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
            ref={ref}
            align={align}
            sideOffset={sideOffset}
            className={cn('z-50 w-72 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg outline-none', className)}
            {...props}
        />
    </PopoverPrimitive.Portal>;
});
