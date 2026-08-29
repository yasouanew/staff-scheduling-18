import { CalendarX2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { WEEKDAYS, type AvailabilityBlock, type WeeklyAvailability } from '@/types/availability';

interface WeeklyAvailabilityGridProps {
    /** The recurring weekly availability to render (null when none configured). */
    availability: WeeklyAvailability | null;
    /** Renders skeleton placeholders while data is being fetched. */
    isLoading?: boolean;
}

/** Short 3-letter labels for compact column headers. */
const SHORT_DAY: Record<string, string> = {
    Monday: 'Mon',
    Tuesday: 'Tue',
    Wednesday: 'Wed',
    Thursday: 'Thu',
    Friday: 'Fri',
    Saturday: 'Sat',
    Sunday: 'Sun',
};

/** Renders a single availability block chip using semantic status tokens. */
function BlockChip({ block }: { block: AvailabilityBlock }): JSX.Element {
    return (
        <span
            className={cn(
                'flex flex-col items-center rounded-lg px-2 py-1.5 text-xs font-medium',
                block.available ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
            )}
        >
            {block.available ? (
                <span className="tabular-nums">
                    {block.startTime}–{block.endTime}
                </span>
            ) : (
                <span>Unavailable</span>
            )}
        </span>
    );
}

/** Skeleton column shown while loading. */
function SkeletonColumn(): JSX.Element {
    return (
        <div className="space-y-2">
            <div className="h-4 w-10 animate-pulse rounded bg-muted" />
            <div className="h-10 animate-pulse rounded-lg bg-muted" />
        </div>
    );
}

/**
 * Pure presentational 7-day (Mon–Sun) grid visualising an employee's recurring
 * availability blocks. Available windows render in success tokens, unavailable
 * ones in danger tokens. Fully responsive: horizontally scrollable on mobile.
 */
export function WeeklyAvailabilityGrid({
    availability,
    isLoading = false,
}: WeeklyAvailabilityGridProps): JSX.Element {
    if (isLoading) {
        return (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {WEEKDAYS.map((day) => (
                    <SkeletonColumn key={day} />
                ))}
            </div>
        );
    }

    if (!availability) {
        return (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-12 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <CalendarX2 className="h-6 w-6" aria-hidden="true" />
                </span>
                <p className="text-sm font-semibold text-foreground">No availability set</p>
                <p className="text-sm text-muted-foreground">
                    This employee hasn&apos;t configured a weekly availability pattern yet.
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {WEEKDAYS.map((day) => {
                const blocks = availability[day];

                return (
                    <div
                        key={day}
                        className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-foreground">
                                {SHORT_DAY[day]}
                            </span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            {blocks.length > 0 ? (
                                blocks.map((block, index) => (
                                    <BlockChip key={`${day}-${index}`} block={block} />
                                ))
                            ) : (
                                <span className="rounded-lg bg-muted px-2 py-1.5 text-center text-xs text-muted-foreground">
                                    No hours
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
