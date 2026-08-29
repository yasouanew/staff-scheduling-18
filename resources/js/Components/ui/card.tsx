import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card(
    { className, ...props },
    ref,
) {
    return <section ref={ref} className={cn('rounded-xl border border-border bg-card text-card-foreground shadow-sm', className)} {...props} />;
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardHeader(
    { className, ...props },
    ref,
) {
    return <div ref={ref} className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />;
});

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(function CardTitle(
    { className, ...props },
    ref,
) {
    return <h3 ref={ref} className={cn('text-lg font-semibold tracking-tight text-card-foreground', className)} {...props} />;
});

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(function CardDescription(
    { className, ...props },
    ref,
) {
    return <p ref={ref} className={cn('text-sm leading-6 text-muted-foreground', className)} {...props} />;
});

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardContent(
    { className, ...props },
    ref,
) {
    return <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />;
});

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardFooter(
    { className, ...props },
    ref,
) {
    return <div ref={ref} className={cn('flex items-center gap-3 p-6 pt-0', className)} {...props} />;
});
