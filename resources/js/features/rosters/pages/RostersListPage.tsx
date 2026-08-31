import {
    AlertTriangle,
    CalendarCheck,
    CalendarRange,
    CopyPlus,
    LayoutList,
    PencilRuler,
    Plus,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { StatCard } from '@/Components/common/StatCard';
import { useBranches } from '@/features/branches/hooks/useBranches';
import { schedulingErrorMessage } from '@/lib/scheduling-errors';
import { cn } from '@/lib/utils';
import {
    ROSTER_STATUS_LABELS,
    ROSTER_STATUSES,
    type Roster,
    type RosterStatus,
} from '@/types/roster-management';

import { CopyPreviousWeekModal } from '../components/CopyPreviousWeekModal';
import { RosterFormModal } from '../components/RosterFormModal';
import { RostersTable } from '../components/RostersTable';
import {
    deriveRosterStats,
    useDeleteRoster,
    usePublishRoster,
    useRosters,
} from '../hooks/useRosters';
import { formatWeekRange } from '../lib/roster-week';

/** Sentinel representing "no filter applied" in the select controls. */
const ALL_VALUE = 'all';

/** Shared select styling for the filter toolbar. */
const selectClasses = cn(
    'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground sm:w-44',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

/** Secondary (outline) button styling for the toolbar actions. */
const secondaryButtonClasses = cn(
    'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground shadow-sm transition-colors',
    'hover:bg-secondary hover:text-secondary-foreground',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
);

/**
 * Rosters list page (`/rosters`).
 *
 * Owns the server-side status and branch filters that drive the
 * {@link useRosters} query, and delegates search / sorting / pagination / column
 * visibility to the reusable {@link RostersTable}. Creating and editing flow
 * through {@link RosterFormModal}, cloning a week through
 * {@link CopyPreviousWeekModal}, and publish/delete run through their dedicated
 * mutations behind confirmation dialogs with toast feedback. Every state
 * (loading, empty, error) is represented.
 */
export function RostersListPage(): JSX.Element {
    const navigate = useNavigate();

    const [status, setStatus] = useState<RosterStatus | typeof ALL_VALUE>(ALL_VALUE);
    const [branchId, setBranchId] = useState<string>(ALL_VALUE);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isCopyOpen, setIsCopyOpen] = useState(false);
    const [editing, setEditing] = useState<Roster | null>(null);

    const { data, isLoading, isError, refetch, isFetching } = useRosters({
        status: status === ALL_VALUE ? undefined : status,
        branchId: branchId === ALL_VALUE ? undefined : branchId,
        perPage: 100,
    });

    // Branch options power both the filter toolbar and the form selects.
    const { data: branchPage } = useBranches({ perPage: 100 });
    const branchOptions = useMemo(
        () => (branchPage?.data ?? []).map((branch) => ({ id: branch.id, name: branch.name })),
        [branchPage],
    );

    const deleteRoster = useDeleteRoster();
    const publishRoster = usePublishRoster();

    const rosters = useMemo(() => data?.data ?? [], [data]);
    const total = data?.meta?.total ?? rosters.length;
    const stats = useMemo(() => deriveRosterStats(rosters), [rosters]);

    const handleDelete = (roster: Roster): void => {
        const label = formatWeekRange(roster.weekStart, roster.weekEnd);

        deleteRoster.mutate(roster.id, {
            onSuccess: () =>
                toast.success('Roster deleted', {
                    description: `The week of ${label} has been removed.`,
                }),
            onError: (error) =>
                toast.error('Unable to delete roster', {
                    description: schedulingErrorMessage(error, 'Please try again.'),
                }),
        });
    };

    const handlePublish = (roster: Roster): void => {
        const label = formatWeekRange(roster.weekStart, roster.weekEnd);

        publishRoster.mutate(roster.id, {
            onSuccess: () =>
                toast.success('Roster published', {
                    description: `${label} is now visible to employees.`,
                }),
            onError: (error) =>
                toast.error('Unable to publish roster', {
                    description: schedulingErrorMessage(error, 'Please try again.'),
                }),
        });
    };

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        Rosters
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Plan weekly schedules, then publish them to your team.
                    </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                        type="button"
                        onClick={() => setIsCopyOpen(true)}
                        className={secondaryButtonClasses}
                    >
                        <CopyPlus className="h-4 w-4" aria-hidden="true" />
                        Copy previous week
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsCreateOpen(true)}
                        className={cn(
                            'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors',
                            'hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        )}
                    >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        New roster
                    </button>
                </div>
            </div>

            {/* KPI summary row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    title="Total Rosters"
                    value={total}
                    icon={CalendarRange}
                    tone="primary"
                    description="Weeks planned"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Drafts"
                    value={stats.draft}
                    icon={PencilRuler}
                    tone="warning"
                    description="Awaiting publication"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Published"
                    value={stats.published}
                    icon={CalendarCheck}
                    tone="success"
                    description="Visible to staff"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Scheduled Shifts"
                    value={stats.shifts}
                    icon={LayoutList}
                    tone="info"
                    description="Across listed weeks"
                    isLoading={isLoading}
                />
            </div>

            {isError ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-sm">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                            Unable to load rosters
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Something went wrong while fetching your roster weeks.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void refetch()}
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Try again
                    </button>
                </div>
            ) : (
                <>
                    {/* Filter toolbar (server-side status + branch) */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                        <select
                            value={branchId}
                            onChange={(event) => setBranchId(event.target.value)}
                            aria-label="Filter by branch"
                            className={selectClasses}
                        >
                            <option value={ALL_VALUE}>All branches</option>
                            {branchOptions.map((branch) => (
                                <option key={branch.id} value={branch.id}>
                                    {branch.name}
                                </option>
                            ))}
                        </select>

                        <select
                            value={status}
                            onChange={(event) =>
                                setStatus(event.target.value as RosterStatus | typeof ALL_VALUE)
                            }
                            aria-label="Filter by status"
                            className={selectClasses}
                        >
                            <option value={ALL_VALUE}>All statuses</option>
                            {ROSTER_STATUSES.map((option) => (
                                <option key={option} value={option}>
                                    {ROSTER_STATUS_LABELS[option]}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Rosters table */}
                    <RostersTable
                        rosters={rosters}
                        isLoading={isLoading || (isFetching && rosters.length === 0)}
                        onView={(roster) => navigate(`/rosters/${roster.id}`)}
                        onEdit={(roster) => setEditing(roster)}
                        onPublish={handlePublish}
                        onDelete={handleDelete}
                    />
                </>
            )}

            {/* Create drawer */}
            <RosterFormModal
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                branches={branchOptions}
            />

            {/* Edit drawer */}
            <RosterFormModal
                open={editing !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setEditing(null);
                    }
                }}
                roster={editing}
                branches={branchOptions}
            />

            {/* Copy previous week dialog */}
            <CopyPreviousWeekModal
                open={isCopyOpen}
                onOpenChange={setIsCopyOpen}
                branches={branchOptions}
                sourceRosters={rosters}
                onCopied={(roster) => navigate(`/rosters/${roster.id}`)}
            />
        </div>
    );
}

export default RostersListPage;
