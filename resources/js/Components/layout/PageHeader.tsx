import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface PageHeaderProps {
    title: string;
    description?: string;
    eyebrow?: string;
    actions?: ReactNode;
    className?: string;
}

/**
 * Shared presentational page header. It is intentionally not mounted globally:
 * feature pages retain their existing titles until they are individually migrated.
 */
export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps): JSX.Element {
    return <div className={cn('flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between', className)}>
        <div className="min-w-0">
            {eyebrow ? <p className="mb-1 text-sm font-medium text-primary">{eyebrow}</p> : null}
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
            {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>;
}
