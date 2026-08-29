import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;
export const AlertDialogAction = AlertDialogPrimitive.Action;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;

export const AlertDialogOverlay = forwardRef<ElementRef<typeof AlertDialogPrimitive.Overlay>, ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>>(function AlertDialogOverlay(
    { className, ...props },
    ref,
) {
    return <AlertDialogPrimitive.Overlay ref={ref} className={cn('fixed inset-0 z-50 bg-overlay backdrop-blur-sm', className)} {...props} />;
});

export const AlertDialogContent = forwardRef<ElementRef<typeof AlertDialogPrimitive.Content>, ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>>(function AlertDialogContent(
    { className, ...props },
    ref,
) {
    return <AlertDialogPortal>
        <AlertDialogOverlay />
        <AlertDialogPrimitive.Content
            ref={ref}
            className={cn('fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-xl outline-none', className)}
            {...props}
        />
    </AlertDialogPortal>;
});

export const AlertDialogHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function AlertDialogHeader(
    { className, ...props },
    ref,
) {
    return <div ref={ref} className={cn('flex flex-col gap-1.5 text-left', className)} {...props} />;
});

export const AlertDialogFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function AlertDialogFooter(
    { className, ...props },
    ref,
) {
    return <div ref={ref} className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
});

export const AlertDialogTitle = forwardRef<ElementRef<typeof AlertDialogPrimitive.Title>, ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>>(function AlertDialogTitle(
    { className, ...props },
    ref,
) {
    return <AlertDialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold tracking-tight text-foreground', className)} {...props} />;
});

export const AlertDialogDescription = forwardRef<ElementRef<typeof AlertDialogPrimitive.Description>, ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>>(function AlertDialogDescription(
    { className, ...props },
    ref,
) {
    return <AlertDialogPrimitive.Description ref={ref} className={cn('text-sm leading-6 text-muted-foreground', className)} {...props} />;
});
