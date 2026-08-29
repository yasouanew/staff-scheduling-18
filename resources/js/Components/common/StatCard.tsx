import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/** Semantic accent applied to the icon chip and its soft background. */
export type StatCardTone = 'primary' | 'success' | 'warning' | 'danger' | 'info';

interface StatCardProps {
    /** Short metric label, e.g. "Total Employees". */
    title: string;
    /** The primary value; string or number both supported. */
    value: string | number;
    /** Leading Lucide icon rendered inside a tinted chip. */
    icon: LucideIcon;
    /** Semantic accent tone. Defaults to neutral primary. */
    tone?: StatCardTone;
    /** Optional supporting description shown beneath the value. */
    description?: string;
    /** Renders a pulsing skeleton in place of the value. */
    isLoading?: boolean;
}

/** Maps a tone to its soft-background + foreground token pair. */
const TONE_CLASSES: Record<StatCardTone, string> = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    danger: 'bg-danger/10 text-danger',
    info: 'bg-info/10 text-info',
};

/**
 * Compact KPI summary block. Pure presentational: shows an icon chip, a metric
 * title, its value and an optional description, with a built-in loading state.
 */
export function StatCard({
    title,
    value,
    icon: Icon,
    tone = 'primary',
    description,
    isLoading = false,
}: StatCardProps): JSX.Element {
    return (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium text-muted-foreground">{title}</p>

                    {isLoading ? (
                        <div className="h-8 w-16 animate-pulse rounded-md bg-muted" />
                    ) : (
                        <p className="text-2xl font-semibold tracking-tight text-foreground">
                            {value}
                        </p>
                    )}

                    {description && !isLoading && (
                        <p className="truncate text-xs text-muted-foreground">{description}</p>
                    )}
                </div>

                <span
                    className={cn(
                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
                        TONE_CLASSES[tone],
                    )}
                >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
            </div>
        </div>
    );
}
