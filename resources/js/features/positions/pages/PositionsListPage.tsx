import { AlertTriangle, BriefcaseBusiness, CheckCircle2, Coins, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { StatCard } from '@/Components/common/StatCard';
import { useDepartmentOptions } from '@/features/departments/hooks/useDepartments';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
    POSITION_STATUS_LABELS,
    POSITION_STATUSES,
    type Position,
    type PositionStatus,
} from '@/types/position';

import { PositionFormModal } from '../components/PositionFormModal';
import { PositionsTable } from '../components/PositionsTable';
import { useDeletePosition, usePositions } from '../hooks/usePositions';

/** Sentinel representing "no filter applied" in the select controls. */
const ALL_VALUE = 'all';

/** Shared select styling for the filter toolbar. */
const selectClasses = cn(
    'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground sm:w-44',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

/** AUD currency formatter used for the average pay-scale KPI. */
const currencyFormatter = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

/**
 * Positions list page (`/positions`).
 *
 * Owns the server-side status + department filters that drive the
 * {@link usePositions} query (the backend's `PositionService::paginate` supports
 * `search`, `status`, `company_id` and `department_id`), and delegates search /
 * sorting / pagination / column visibility to the reusable {@link PositionsTable}.
 * Creating and editing flow through the {@link PositionFormModal}; deletion runs
 * through the dedicated mutation with a confirmation dialog (in the table) and
 * toast feedback. Relies on the app-level QueryClient.
 */
export function PositionsListPage(): JSX.Element {
    const [status, setStatus] = useState<PositionStatus | typeof ALL_VALUE>(ALL_VALUE);
    const [departmentId, setDepartmentId] = useState<string>(ALL_VALUE);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editing, setEditing] = useState<Position | null>(null);

    const { data: departmentOptions = [], isLoading: isLoadingDepartments } = useDepartmentOptions();

    const { data, isLoading, isError, refetch, isFetching } = usePositions({
        status: status === ALL_VALUE ? undefined : status,
        departmentId: departmentId === ALL_VALUE ? undefined : Number(departmentId),
        perPage: 100,
    });

    const deletePosition = useDeletePosition();

    const positions = useMemo(() => data?.data ?? [], [data]);
    const total = data?.meta?.total ?? positions.length;

    const stats = useMemo(() => {
        const active = positions.filter((position) => position.status === 'active').length;
        const rated = positions.filter((position) => position.defaultHourlyRate !== null);
        const averageRate =
            rated.length > 0
                ? rated.reduce((sum, position) => sum + (position.defaultHourlyRate ?? 0), 0) /
                rated.length
                : null;

        return { active, averageRate };
    }, [positions]);

    const handleDelete = (position: Position): void => {
        deletePosition.mutate(position.id, {
            onSuccess: () =>
                toast.success('Position deleted', {
                    description: `${position.name} has been removed.`,
                }),
            onError: (error) =>
                toast.error('Unable to delete position', {
                    description: getApiErrorMessage(error, 'Please try again.'),
                }),
        });
    };

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        Positions
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Define the job roles and pay scales used across your rosters.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setIsCreateOpen(true)}
                    className={cn(
                        'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors',
                        'hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    )}
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    New position
                </button>
            </div>

            {/* KPI summary row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                    title="Total Positions"
                    value={total}
                    icon={BriefcaseBusiness}
                    tone="primary"
                    description="Job roles defined"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Active"
                    value={stats.active}
                    icon={CheckCircle2}
                    tone="success"
                    description="Currently active"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Average Pay Scale"
                    value={
                        stats.averageRate !== null
                            ? `${currencyFormatter.format(stats.averageRate)}/hr`
                            : '—'
                    }
                    icon={Coins}
                    tone="info"
                    description="Mean hourly rate"
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
                            Unable to load positions
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Something went wrong while fetching your positions.
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
                    {/* Filter toolbar (server-side status + department) */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                        <select
                            value={departmentId}
                            onChange={(event) => setDepartmentId(event.target.value)}
                            disabled={isLoadingDepartments}
                            aria-label="Filter by department"
                            className={cn(selectClasses, 'disabled:opacity-60')}
                        >
                            <option value={ALL_VALUE}>
                                {isLoadingDepartments ? 'Loading departments...' : 'All departments'}
                            </option>
                            {departmentOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                    {option.name}
                                </option>
                            ))}
                        </select>
                        <select
                            value={status}
                            onChange={(event) =>
                                setStatus(event.target.value as PositionStatus | typeof ALL_VALUE)
                            }
                            aria-label="Filter by status"
                            className={selectClasses}
                        >
                            <option value={ALL_VALUE}>All statuses</option>
                            {POSITION_STATUSES.map((option) => (
                                <option key={option} value={option}>
                                    {POSITION_STATUS_LABELS[option]}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Positions table */}
                    <PositionsTable
                        positions={positions}
                        isLoading={isLoading || (isFetching && positions.length === 0)}
                        onEdit={(position) => setEditing(position)}
                        onDelete={handleDelete}
                    />
                </>
            )}

            {/* Create drawer */}
            <PositionFormModal open={isCreateOpen} onOpenChange={setIsCreateOpen} />

            {/* Edit drawer */}
            <PositionFormModal
                open={editing !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setEditing(null);
                    }
                }}
                position={editing}
            />
        </div>
    );
}

export default PositionsListPage;
