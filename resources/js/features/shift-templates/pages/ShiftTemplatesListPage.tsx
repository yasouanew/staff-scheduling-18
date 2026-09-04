import { AlertTriangle, CalendarClock, CheckCircle2, Clock4, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { StatCard } from '@/Components/common/StatCard';
import { normalizeWebRole, useWebSession } from '@/features/auth/hooks/useWebSession';
import { useBranchOptions } from '@/features/branches/hooks/useBranches';
import { useDepartmentOptions } from '@/features/departments/hooks/useDepartments';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
    SHIFT_TEMPLATE_STATUS_LABELS,
    SHIFT_TEMPLATE_STATUSES,
    type ShiftTemplate,
    type ShiftTemplateStatus,
} from '@/types/shift-template';

import { ShiftTemplateFormModal } from '../components/ShiftTemplateFormModal';
import { ShiftTemplatesTable } from '../components/ShiftTemplatesTable';
import { UseTemplateModal } from '../components/UseTemplateModal';
import { useDeleteShiftTemplate, useShiftTemplates } from '../hooks/useShiftTemplates';

/** Sentinel representing "no filter applied" in the select controls. */
const ALL_VALUE = 'all';

/** Shared select styling for the filter toolbar. */
const selectClasses = cn(
    'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground sm:w-44',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

/**
 * Shift Templates list page (`/shift-templates`).
 *
 * Owns the server-side status + branch + department filters that drive the
 * {@link useShiftTemplates} query (the backend's `ShiftTemplateService::paginate`
 * supports `search`, `status`, `branch_id`, `department_id` and `position_id`),
 * and delegates search / sorting / pagination / column visibility to the
 * reusable {@link ShiftTemplatesTable}. Creating, editing and duplicating flow
 * through the {@link ShiftTemplateFormModal}; turning a template into a real
 * shift uses the {@link UseTemplateModal}; deletion runs through the dedicated
 * mutation with toast feedback. The delete action is hidden for schedulers, who
 * lack the `shift_template.delete` permission (the backend would 403 it).
 */
export function ShiftTemplatesListPage(): JSX.Element {
    const [status, setStatus] = useState<ShiftTemplateStatus | typeof ALL_VALUE>(ALL_VALUE);
    const [branchId, setBranchId] = useState<string>(ALL_VALUE);
    const [departmentId, setDepartmentId] = useState<string>(ALL_VALUE);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editing, setEditing] = useState<ShiftTemplate | null>(null);
    const [duplicateFrom, setDuplicateFrom] = useState<ShiftTemplate | null>(null);
    const [usingTemplate, setUsingTemplate] = useState<ShiftTemplate | null>(null);

    const session = useWebSession();
    const canDelete = normalizeWebRole(session.data) === 'company_admin';

    const branchOptions = useBranchOptions();
    const departmentOptions = useDepartmentOptions();

    const { data, isLoading, isError, refetch, isFetching } = useShiftTemplates({
        status: status === ALL_VALUE ? undefined : status,
        branchId: branchId === ALL_VALUE ? undefined : Number(branchId),
        departmentId: departmentId === ALL_VALUE ? undefined : Number(departmentId),
        perPage: 100,
    });

    const deleteTemplate = useDeleteShiftTemplate();

    const templates = useMemo(() => data?.data ?? [], [data]);
    const total = data?.meta?.total ?? templates.length;

    const stats = useMemo(() => {
        const active = templates.filter((template) => template.status === 'active').length;
        const scoped = templates.filter(
            (template) => template.branchId !== null || template.departmentId !== null,
        ).length;

        return { active, scoped };
    }, [templates]);

    const handleDelete = (template: ShiftTemplate): void => {
        deleteTemplate.mutate(template.id, {
            onSuccess: () =>
                toast.success('Shift template deleted', {
                    description: `${template.name} has been removed.`,
                }),
            onError: (error) =>
                toast.error('Unable to delete template', {
                    description: getApiErrorMessage(error, 'Please try again.'),
                }),
        });
    };

    const handleDuplicate = (template: ShiftTemplate): void => {
        setDuplicateFrom(template);
        setIsCreateOpen(true);
    };

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        Shift Templates
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Define reusable shift patterns that can be dropped into any roster.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setDuplicateFrom(null);
                        setIsCreateOpen(true);
                    }}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    New template
                </button>
            </div>

            {/* KPI summary row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                    title="Total Templates"
                    value={total}
                    icon={Clock4}
                    tone="primary"
                    description="Reusable shift patterns"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Active"
                    value={stats.active}
                    icon={CheckCircle2}
                    tone="success"
                    description="Ready to use"
                    isLoading={isLoading}
                />
                <StatCard
                    title="Scoped"
                    value={stats.scoped}
                    icon={CalendarClock}
                    tone="info"
                    description="Branch or department specific"
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
                            Unable to load shift templates
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Something went wrong while fetching your templates.
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
                    {/* Filter toolbar (server-side status + branch + department) */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                        <select
                            value={branchId}
                            onChange={(event) => setBranchId(event.target.value)}
                            disabled={branchOptions.isLoading}
                            aria-label="Filter by branch"
                            className={cn(selectClasses, 'disabled:opacity-60')}
                        >
                            <option value={ALL_VALUE}>
                                {branchOptions.isLoading ? 'Loading branches...' : 'All branches'}
                            </option>
                            {(branchOptions.data ?? []).map((option) => (
                                <option key={option.id} value={option.id}>
                                    {option.name}
                                </option>
                            ))}
                        </select>
                        <select
                            value={departmentId}
                            onChange={(event) => setDepartmentId(event.target.value)}
                            disabled={departmentOptions.isLoading}
                            aria-label="Filter by department"
                            className={cn(selectClasses, 'disabled:opacity-60')}
                        >
                            <option value={ALL_VALUE}>
                                {departmentOptions.isLoading
                                    ? 'Loading departments...'
                                    : 'All departments'}
                            </option>
                            {(departmentOptions.data ?? []).map((option) => (
                                <option key={option.id} value={option.id}>
                                    {option.name}
                                </option>
                            ))}
                        </select>
                        <select
                            value={status}
                            onChange={(event) =>
                                setStatus(event.target.value as ShiftTemplateStatus | typeof ALL_VALUE)
                            }
                            aria-label="Filter by status"
                            className={selectClasses}
                        >
                            <option value={ALL_VALUE}>All statuses</option>
                            {SHIFT_TEMPLATE_STATUSES.map((option) => (
                                <option key={option} value={option}>
                                    {SHIFT_TEMPLATE_STATUS_LABELS[option]}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Templates table */}
                    <ShiftTemplatesTable
                        templates={templates}
                        isLoading={isLoading || (isFetching && templates.length === 0)}
                        canDelete={canDelete}
                        onEdit={(template) => setEditing(template)}
                        onDuplicate={handleDuplicate}
                        onUse={(template) => setUsingTemplate(template)}
                        onDelete={handleDelete}
                    />
                </>
            )}

            {/* Create / duplicate drawer */}
            <ShiftTemplateFormModal
                open={isCreateOpen}
                onOpenChange={(open) => {
                    if (!open) {
                        setDuplicateFrom(null);
                        setIsCreateOpen(false);
                    }
                }}
                duplicateFrom={duplicateFrom}
            />

            {/* Edit drawer */}
            <ShiftTemplateFormModal
                open={editing !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setEditing(null);
                    }
                }}
                template={editing}
            />

            {/* Use template (create shift) drawer */}
            <UseTemplateModal template={usingTemplate} onOpenChange={setUsingTemplate} />
        </div>
    );
}

export default ShiftTemplatesListPage;
