import { AlertTriangle, CalendarDays, PencilRuler, Send } from 'lucide-react';

import { StatCard } from '@/Components/common/StatCard';

import type { CalendarPublicationStats } from '../lib/month-grid';

interface CalendarPublicationSummaryProps {
    stats: CalendarPublicationStats;
    /** True while the shifts query is loading, so values render as skeletons. */
    isLoading: boolean;
}

/**
 * Publication analysis for the visible calendar period.
 *
 * A month grid shows *where* shifts are but not *how much of the plan is real*.
 * The two failure modes of rostering are answered here instead of by counting
 * chips:
 *
 * - **Draft work nobody can see.** A fully planned week that was never published
 *   is the single most expensive scheduling mistake, so it is called out as a
 *   warning with the number of weeks still to publish, not a neutral count.
 * - **Unfilled shifts.** Open shifts are surfaced as danger because they are
 *   coverage the business has promised but not staffed.
 *
 * Published work is shown in success tone so a healthy period reads green at a
 * glance and needs no interpretation.
 */
export function CalendarPublicationSummary({
    stats,
    isLoading,
}: CalendarPublicationSummaryProps): JSX.Element {
    const publishedShare =
        stats.totalShifts > 0
            ? Math.round((stats.publishedShifts / stats.totalShifts) * 100)
            : 0;

    return (
        <section aria-label="Roster publication summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
                title="Shifts in view"
                value={stats.totalShifts}
                icon={CalendarDays}
                tone="info"
                description={
                    stats.archivedShifts > 0
                        ? `${stats.archivedShifts} on archived weeks`
                        : 'Across every branch in scope'
                }
                isLoading={isLoading}
            />

            <StatCard
                title="Draft — not sent"
                value={stats.draftShifts}
                icon={PencilRuler}
                // Draft work is a pending obligation, not a neutral fact.
                tone={stats.draftShifts > 0 ? 'warning' : 'success'}
                description={
                    stats.draftShifts > 0
                        ? `${stats.draftRosters} week${stats.draftRosters === 1 ? '' : 's'} still to publish`
                        : 'Everything planned has been sent'
                }
                isLoading={isLoading}
            />

            <StatCard
                title="Published to staff"
                value={stats.publishedShifts}
                icon={Send}
                tone="success"
                description={`${publishedShare}% of shifts in view`}
                isLoading={isLoading}
            />

            <StatCard
                title="Unfilled shifts"
                value={stats.openShifts}
                icon={AlertTriangle}
                tone={stats.openShifts > 0 ? 'danger' : 'success'}
                description={
                    stats.openShifts > 0
                        ? 'Nobody is assigned to these yet'
                        : 'Every shift has someone rostered'
                }
                isLoading={isLoading}
            />
        </section>
    );
}
