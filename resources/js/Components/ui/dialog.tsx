import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = forwardRef<ElementRef<typeof DialogPrimitive.Overlay>, ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(function DialogOverlay(
    { className, ...props },
    ref,
) {
    return <DialogPrimitive.Overlay
        ref={ref}
        className={cn('fixed inset-0 z-50 bg-overlay backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out', className)}
        {...props}
    />;
});

export const DialogContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, ComponentPropsWithoutRef<typeof DialogPrimitive.Content>>(function DialogContent(
    { className, children, ...props },
    ref,
) {
    return <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
            ref={ref}
            className={cn(
                'fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-xl outline-none',
                'max-h-[calc(100vh-2rem)] overflow-y-auto data-[state=open]:animate-in data-[state=closed]:animate-out',
                className,
            )}
            {...props}
        >
            {children}
            <DialogPrimitive.Close className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                <X className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Close dialog</span>
            </DialogPrimitive.Close>
        </DialogPrimitive.Content>
    </DialogPortal>;
});

export const DialogHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function DialogHeader(
    { className, ...props },
    ref,
) {
    return <div ref={ref} className={cn('flex flex-col gap-1.5 pr-8 text-left', className)} {...props} />;
});

export const DialogFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function DialogFooter(
    { className, ...props },
    ref,
) {
    return <div ref={ref} className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
});

export const DialogTitle = forwardRef<ElementRef<typeof DialogPrimitive.Title>, ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(function DialogTitle(
    { className, ...props },
    ref,
) {
    return <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold tracking-tight text-foreground', className)} {...props} />;
});

export const DialogDescription = forwardRef<ElementRef<typeof DialogPrimitive.Description>, ComponentPropsWithoutRef<typeof DialogPrimitive.Description>>(function DialogDescription(
    { className, ...props },
    ref,
) {
    return <DialogPrimitive.Description ref={ref} className={cn('text-sm leading-6 text-muted-foreground', className)} {...props} />;
});
