import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface PageHeaderProps {
    /** Primary page title. Rendered as the page's single `h1`. */
    title: string;
    /** Optional supporting sentence shown beneath the title. */
    description?: string;
    /** Optional eyebrow label rendered above the title (e.g. a section name). */
    eyebrow?: string;
    /** Optional trailing actions such as primary buttons or filters. */
    actions?: ReactNode;
    /** Extra classes from the parent layout. */
    className?: string;
}

/**
 * Canonical page header establishing the application-wide typography scale.
 *
 * The hierarchy is deliberately only three steps deep so that every page reads
 * the same way:
 *
 * 1. `eyebrow`     — small, uppercase, muted; orients the user in the section.
 * 2. `title`       — bold and crisp (`text-foreground`, which resolves to a
 *                    near-white slate-50 in dark mode); the loudest element.
 * 3. `description` — muted slate-400 (`text-muted-foreground`) so meta text
 *                    recedes instead of competing with the title.
 *
 * Purely presentational: it holds no data-fetching or state logic.
 */
export function PageHeader({
    title,
    description,
    eyebrow,
    actions,
    className,
}: PageHeaderProps): JSX.Element {
    return (
        <div
            className={cn(
                'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
                className,
            )}
        >
            <div className="min-w-0">
                {eyebrow ? (
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {eyebrow}
                    </p>
                ) : null}

                <h1
                    className={cn(
                        'truncate text-2xl font-bold tracking-tight text-foreground sm:text-3xl',
                        eyebrow && 'mt-1',
                    )}
                >
                    {title}
                </h1>

                {description ? (
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                        {description}
                    </p>
                ) : null}
            </div>

            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
    );
}
