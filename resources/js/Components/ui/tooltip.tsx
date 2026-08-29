import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';

import { cn } from '@/lib/utils';

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = forwardRef<ElementRef<typeof TooltipPrimitive.Content>, ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>>(function TooltipContent(
    { className, sideOffset = 6, ...props },
    ref,
) {
    return <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
            ref={ref}
            sideOffset={sideOffset}
            className={cn('z-50 max-w-xs rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-lg', className)}
            {...props}
        >
            {props.children}
            <TooltipPrimitive.Arrow className="fill-foreground" />
        </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>;
});
