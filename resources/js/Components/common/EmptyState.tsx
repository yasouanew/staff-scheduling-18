import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface EmptyStateProps {
    /** Optional leading Lucide icon rendered in a soft chip. */
    icon?: LucideIcon;
    /** Primary heading, e.g. "No shift history yet". */
    title: string;
    /** Supporting sentence giving the user context or a next step. */
    description?: string;
    /** Optional call-to-action (button/link) rendered beneath the copy. */
    action?: ReactNode;
    /** Extra classes for layout tuning. */
    className?: string;
}

/**
 * Reusable, structured empty-state block. Pure presentational: an optional
 * icon chip, a title, supporting copy and an optional action, centered inside
 * a dashed card so it reads clearly as "nothing here yet".
 */
export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
    className,
}: EmptyStateProps): JSX.Element {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 p-8 text-center',
                className,
            )}
        >
            {Icon && (
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
            )}

            <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">{title}</p>
                {description && (
                    <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
                )}
            </div>

            {action}
        </div>
    );
}
