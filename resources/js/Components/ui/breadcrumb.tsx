import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { forwardRef, type ComponentPropsWithoutRef, type HTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

import { cn } from '@/lib/utils';

export const Breadcrumb = forwardRef<HTMLElement, ComponentPropsWithoutRef<'nav'>>(function Breadcrumb(
    { className, ...props },
    ref,
) {
    return <nav ref={ref} aria-label="Breadcrumb" className={cn('min-w-0', className)} {...props} />;
});

export const BreadcrumbList = forwardRef<HTMLOListElement, HTMLAttributes<HTMLOListElement>>(function BreadcrumbList(
    { className, ...props },
    ref,
) {
    return <ol ref={ref} className={cn('flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground sm:gap-2.5', className)} {...props} />;
});

export const BreadcrumbItem = forwardRef<HTMLLIElement, HTMLAttributes<HTMLLIElement>>(function BreadcrumbItem(
    { className, ...props },
    ref,
) {
    return <li ref={ref} className={cn('inline-flex items-center gap-1.5', className)} {...props} />;
});

export const BreadcrumbLink = forwardRef<HTMLAnchorElement, LinkProps>(function BreadcrumbLink(
    { className, ...props },
    ref,
) {
    return <Link ref={ref} className={cn('truncate transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background', className)} {...props} />;
});

export const BreadcrumbPage = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(function BreadcrumbPage(
    { className, ...props },
    ref,
) {
    return <span ref={ref} aria-current="page" className={cn('max-w-40 truncate font-medium text-foreground sm:max-w-none', className)} {...props} />;
});

export function BreadcrumbSeparator({ className, children }: HTMLAttributes<HTMLLIElement>): JSX.Element {
    return <li role="presentation" aria-hidden="true" className={cn('[&>svg]:h-3.5 [&>svg]:w-3.5', className)}>
        {children ?? <ChevronRight />}
    </li>;
}

export function BreadcrumbEllipsis({ className, ...props }: HTMLAttributes<HTMLSpanElement>): JSX.Element {
    return <span role="presentation" aria-hidden="true" className={cn('flex h-9 w-9 items-center justify-center', className)} {...props}>
        <MoreHorizontal className="h-4 w-4" />
        <span className="sr-only">More</span>
    </span>;
}
