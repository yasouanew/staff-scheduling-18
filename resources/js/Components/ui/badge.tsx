import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/**
 * Canonical status-pill styling for the whole application.
 *
 * Every variant is a *soft* treatment: a 10%-opacity semantic tint behind the
 * matching semantic text colour, plus a 20%-opacity inset ring to define the
 * edge. Fully saturated fills are deliberately avoided — on a dark slate canvas
 * they read as loud alert blocks and pull attention away from page content,
 * whereas the desaturated tint keeps meaning obvious without shouting.
 *
 * Because the colours come from semantic tokens (not hardcoded hues), each
 * variant automatically re-maps between light and dark mode.
 */
export const badgeVariants = cva(
    'inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium leading-none ring-1 ring-inset',
    {
        variants: {
            variant: {
                neutral: 'bg-muted text-muted-foreground ring-border',
                primary: 'bg-primary/10 text-primary ring-primary/20',
                success: 'bg-success/10 text-success ring-success/20',
                warning: 'bg-warning/10 text-warning ring-warning/20',
                danger: 'bg-danger/10 text-danger ring-danger/20',
                info: 'bg-info/10 text-info ring-info/20',
                outline: 'bg-transparent text-foreground ring-border',
            },
        },
        defaultVariants: {
            variant: 'neutral',
        },
    },
);

/** Semantic tone shared by every status badge across the app. */
export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> { }

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
    { className, variant, ...props },
    ref,
) {
    return <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />;
});
