import * as TabsPrimitive from '@radix-ui/react-tabs';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';

import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<ElementRef<typeof TabsPrimitive.List>, ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(function TabsList(
    { className, ...props },
    ref,
) {
    return <TabsPrimitive.List ref={ref} className={cn('inline-flex h-10 items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground', className)} {...props} />;
});

export const TabsTrigger = forwardRef<ElementRef<typeof TabsPrimitive.Trigger>, ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(function TabsTrigger(
    { className, ...props },
    ref,
) {
    return <TabsPrimitive.Trigger
        ref={ref}
        className={cn('inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm', className)}
        {...props}
    />;
});

export const TabsContent = forwardRef<ElementRef<typeof TabsPrimitive.Content>, ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(function TabsContent(
    { className, ...props },
    ref,
) {
    return <TabsPrimitive.Content ref={ref} className={cn('mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)} {...props} />;
});
