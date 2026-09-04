import { zodResolver } from '@hookform/resolvers/zod';
import * as Dialog from '@radix-ui/react-dialog';
import { CalendarPlus, X } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { useBranchOptions } from '@/features/branches/hooks/useBranches';
import { useDepartmentOptions } from '@/features/departments/hooks/useDepartments';
import { useEmployees } from '@/features/employees/hooks/useEmployees';
import { usePositionOptions } from '@/features/positions/hooks/usePositions';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { ShiftTemplate } from '@/types/shift-template';

import { useCreateShiftFromTemplate, useRosterOptions } from '../hooks/useShiftTemplates';
import { useTemplateFormSchema, type UseTemplateFormInput, type UseTemplateFormValues } from '../schemas';
import { formatTimeLabel } from '../lib/shift-time';

interface UseTemplateModalProps {
    /** The template being turned into a real shift. */
    template: ShiftTemplate | null;
    /** Notifies the parent to change `template`. */
    onOpenChange: (template: ShiftTemplate | null) => void;
}

/** Shared field styling (mirrors the app's form controls). */
const fieldClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);

/** Format a roster week as a compact `d MMM – d MMM yyyy` label. */
function formatRosterRange(weekStart: string | null, weekEnd: string | null): string {
    if (!weekStart || !weekEnd) {
        return 'Untitled roster';
    }
    return `${weekStart} → ${weekEnd}`;
}

/**
 * Drawer for turning a shift template into a real shift.
 *
 * The roster and date identify where the shift lands; the times and break
 * default to the template's values but stay editable for a one-off adjustment.
 * Assigning an employee, role, department and branch is optional. Persistence
 * flows through `useCreateShiftFromTemplate` (POST /shifts) which invalidates
 * the roster + shift caches on success.
 */
export function UseTemplateModal({ template, onOpenChange }: UseTemplateModalProps): JSX.Element {
    const open = template !== null;
    const rosterOptionsQuery = useRosterOptions(open);
    const employeesQuery = useEmployees({ status: 'active', perPage: 100 });
    const branchOptions = useBranchOptions();
    const departmentOptions = useDepartmentOptions();
    const positionOptions = usePositionOptions();

    const createShiftFromTemplate = useCreateShiftFromTemplate();

    const {
        register,
        handleSubmit,
        reset,
        control,
        formState: { errors, isSubmitting },
    } = useForm<UseTemplateFormInput, unknown, UseTemplateFormValues>({
        resolver: zodResolver(useTemplateFormSchema),
        defaultValues: {
            rosterId: '',
            date: new Date().toISOString().slice(0, 10),
            startTime: '09:00',
            endTime: '17:00',
            breakMinutes: '30',
            isPaidBreak: false,
            employeeId: '',
            positionId: '',
            departmentId: '',
            branchId: '',
            notes: '',
        },
    });

    // Seed defaults from the template each time the drawer opens.
    useEffect(() => {
        if (template) {
            reset({
                rosterId: '',
                date: new Date().toISOString().slice(0, 10),
                startTime: template.startTime,
                endTime: template.endTime,
                breakMinutes: String(template.breakMinutes),
                isPaidBreak: template.isPaidBreak,
                employeeId: template.positionId !== null ? '' : '',
                positionId: template.positionId !== null ? String(template.positionId) : '',
                departmentId: template.departmentId !== null ? String(template.departmentId) : '',
                branchId: template.branchId !== null ? String(template.branchId) : '',
                notes: '',
            });
        }
    }, [template, reset]);

    const rosterOptions = useMemo(() => rosterOptionsQuery.data ?? [], [rosterOptionsQuery.data]);
    const employees = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data]);

    const submit = handleSubmit(async (values) => {
        if (!template) {
            return;
        }

        try {
            await createShiftFromTemplate.mutateAsync(values);
            toast.success('Shift created from template', {
                description: `${template.name} has been added to the roster.`,
            });
            onOpenChange(null);
        } catch (error) {
            toast.error('Unable to create shift', {
                description: getApiErrorMessage(error, 'Please review the details and try again.'),
            });
        }
    });

    return (
        <Dialog.Root open={open} onOpenChange={(value) => onOpenChange(value ? template : null)}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                <Dialog.Content
                    className={cn(
                        'fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-border bg-card shadow-xl focus:outline-none',
                        'data-[state=open]:animate-in data-[state=closed]:animate-out',
                        'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
                    )}
                >
                    {/* Header */}
                    <div className="flex items-start justify-between border-b border-border p-6">
                        <div className="space-y-1">
                            <Dialog.Title className="text-lg font-semibold tracking-tight text-foreground">
                                Use “{template?.name}”
                            </Dialog.Title>
                            <Dialog.Description className="text-sm text-muted-foreground">
                                {template
                                    ? `Place this shift into a roster. ${formatTimeLabel(template.startTime)} – ${formatTimeLabel(template.endTime)} by default.`
                                    : 'Create a shift from this template.'}
                            </Dialog.Description>
                        </div>
                        <Dialog.Close
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label="Close"
                        >
                            <X className="h-5 w-5" aria-hidden="true" />
                        </Dialog.Close>
                    </div>

                    {/* Body */}
                    <form onSubmit={submit} noValidate className="flex flex-1 flex-col overflow-y-auto">
                        <div className="flex-1 space-y-5 p-6">
                            {/* Target roster (required) */}
                            <div className="space-y-1.5">
                                <label htmlFor="use-roster" className="block text-sm font-medium text-foreground">
                                    Roster week <span className="text-danger">*</span>
                                </label>
                                <select
                                    id="use-roster"
                                    disabled={rosterOptionsQuery.isLoading}
                                    aria-invalid={Boolean(errors.rosterId)}
                                    className={fieldClasses}
                                    {...register('rosterId')}
                                >
                                    <option value="">
                                        {rosterOptionsQuery.isLoading
                                            ? 'Loading rosters…'
                                            : rosterOptions.length === 0
                                                ? 'No rosters available'
                                                : 'Select a roster week…'}
                                    </option>
                                    {rosterOptions.map((option) => (
                                        <option key={option.id} value={option.id}>
                                            {formatRosterRange(option.weekStart, option.weekEnd)}
                                            {option.branchName ? ` · ${option.branchName}` : ''}
                                        </option>
                                    ))}
                                </select>
                                {errors.rosterId ? (
                                    <p className="text-sm text-danger">{errors.rosterId.message}</p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        The roster that determines the branch and week for this shift.
                                    </p>
                                )}
                            </div>

                            {/* Date */}
                            <div className="space-y-1.5">
                                <label htmlFor="use-date" className="block text-sm font-medium text-foreground">
                                    Shift date <span className="text-danger">*</span>
                                </label>
                                <input
                                    id="use-date"
                                    type="date"
                                    aria-invalid={Boolean(errors.date)}
                                    className={fieldClasses}
                                    {...register('date')}
                                />
                                {errors.date && <p className="text-sm text-danger">{errors.date.message}</p>}
                            </div>

                            {/* Times */}
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <label htmlFor="use-start" className="block text-sm font-medium text-foreground">
                                        Start time <span className="text-danger">*</span>
                                    </label>
                                    <input
                                        id="use-start"
                                        type="time"
                                        aria-invalid={Boolean(errors.startTime)}
                                        className={fieldClasses}
                                        {...register('startTime')}
                                    />
                                    {errors.startTime && (
                                        <p className="text-sm text-danger">{errors.startTime.message}</p>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="use-end" className="block text-sm font-medium text-foreground">
                                        End time <span className="text-danger">*</span>
                                    </label>
                                    <input
                                        id="use-end"
                                        type="time"
                                        aria-invalid={Boolean(errors.endTime)}
                                        className={fieldClasses}
                                        {...register('endTime')}
                                    />
                                    {errors.endTime && (
                                        <p className="text-sm text-danger">{errors.endTime.message}</p>
                                    )}
                                </div>
                            </div>

                            {/* Break */}
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <label htmlFor="use-break" className="block text-sm font-medium text-foreground">
                                        Break (minutes)
                                    </label>
                                    <input
                                        id="use-break"
                                        type="number"
                                        inputMode="numeric"
                                        min={0}
                                        max={1440}
                                        step={5}
                                        aria-invalid={Boolean(errors.breakMinutes)}
                                        className={fieldClasses}
                                        {...register('breakMinutes')}
                                    />
                                    {errors.breakMinutes && (
                                        <p className="text-sm text-danger">{errors.breakMinutes.message}</p>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    <span className="block text-sm font-medium text-foreground">Break type</span>
                                    <Controller
                                        control={control}
                                        name="isPaidBreak"
                                        render={({ field }) => (
                                            <div className="flex gap-2 pt-2">
                                                {[false, true].map((paid) => (
                                                    <button
                                                        key={String(paid)}
                                                        type="button"
                                                        onClick={() => field.onChange(paid)}
                                                        aria-pressed={field.value === paid}
                                                        className={cn(
                                                            'flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors',
                                                            'hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                                            field.value === paid &&
                                                            'border-primary bg-primary/10 text-primary',
                                                        )}
                                                    >
                                                        {paid ? 'Paid' : 'Unpaid'}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    />
                                    {errors.isPaidBreak && (
                                        <p className="text-sm text-danger">{errors.isPaidBreak.message}</p>
                                    )}
                                </div>
                            </div>

                            {/* Assignee (optional) */}
                            <div className="space-y-1.5">
                                <label htmlFor="use-employee" className="block text-sm font-medium text-foreground">
                                    Assign employee
                                </label>
                                <select
                                    id="use-employee"
                                    disabled={employeesQuery.isLoading}
                                    aria-invalid={Boolean(errors.employeeId)}
                                    className={fieldClasses}
                                    {...register('employeeId')}
                                >
                                    <option value="">
                                        {employeesQuery.isLoading ? 'Loading employees…' : 'Unassigned (open shift)'}
                                    </option>
                                    {employees.map((employee) => (
                                        <option key={employee.id} value={employee.id}>
                                            {employee.name}
                                        </option>
                                    ))}
                                </select>
                                {errors.employeeId && (
                                    <p className="text-sm text-danger">{errors.employeeId.message}</p>
                                )}
                            </div>

                            {/* Scope (defaults from template, editable) */}
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                <div className="space-y-1.5">
                                    <label htmlFor="use-branch" className="block text-sm font-medium text-foreground">
                                        Branch
                                    </label>
                                    <select
                                        id="use-branch"
                                        disabled={branchOptions.isLoading}
                                        aria-invalid={Boolean(errors.branchId)}
                                        className={fieldClasses}
                                        {...register('branchId')}
                                    >
                                        <option value="">
                                            {branchOptions.isLoading ? 'Loading branches…' : 'No branch'}
                                        </option>
                                        {(branchOptions.data ?? []).map((option) => (
                                            <option key={option.id} value={option.id}>
                                                {option.name}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.branchId && (
                                        <p className="text-sm text-danger">{errors.branchId.message}</p>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    <label
                                        htmlFor="use-department"
                                        className="block text-sm font-medium text-foreground"
                                    >
                                        Department
                                    </label>
                                    <select
                                        id="use-department"
                                        disabled={departmentOptions.isLoading}
                                        aria-invalid={Boolean(errors.departmentId)}
                                        className={fieldClasses}
                                        {...register('departmentId')}
                                    >
                                        <option value="">
                                            {departmentOptions.isLoading
                                                ? 'Loading departments…'
                                                : 'No department'}
                                        </option>
                                        {(departmentOptions.data ?? []).map((option) => (
                                            <option key={option.id} value={option.id}>
                                                {option.name}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.departmentId && (
                                        <p className="text-sm text-danger">{errors.departmentId.message}</p>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="use-position" className="block text-sm font-medium text-foreground">
                                        Role
                                    </label>
                                    <select
                                        id="use-position"
                                        disabled={positionOptions.isLoading}
                                        aria-invalid={Boolean(errors.positionId)}
                                        className={fieldClasses}
                                        {...register('positionId')}
                                    >
                                        <option value="">
                                            {positionOptions.isLoading ? 'Loading roles…' : 'No role'}
                                        </option>
                                        {(positionOptions.data ?? []).map((option) => (
                                            <option key={option.id} value={option.id}>
                                                {option.name}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.positionId && (
                                        <p className="text-sm text-danger">{errors.positionId.message}</p>
                                    )}
                                </div>
                            </div>

                            {/* Notes */}
                            <div className="space-y-1.5">
                                <label htmlFor="use-notes" className="block text-sm font-medium text-foreground">
                                    Notes
                                </label>
                                <textarea
                                    id="use-notes"
                                    rows={3}
                                    placeholder="Optional notes for this shift"
                                    aria-invalid={Boolean(errors.notes)}
                                    className={cn(
                                        'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground',
                                        'placeholder:text-muted-foreground transition-colors duration-200',
                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
                                        'disabled:cursor-not-allowed disabled:opacity-60',
                                    )}
                                    {...register('notes')}
                                />
                                {errors.notes && <p className="text-sm text-danger">{errors.notes.message}</p>}
                            </div>
                        </div>

                        {/* Footer actions */}
                        <div className="flex items-center justify-end gap-3 border-t border-border p-6">
                            <Dialog.Close asChild>
                                <button
                                    type="button"
                                    className={cn(
                                        'inline-flex h-11 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors',
                                        'hover:bg-secondary hover:text-secondary-foreground',
                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    )}
                                >
                                    Cancel
                                </button>
                            </Dialog.Close>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className={cn(
                                    'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors',
                                    'hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                                    'disabled:cursor-not-allowed disabled:opacity-70',
                                )}
                            >
                                {isSubmitting ? (
                                    <>
                                        <LoadingSpinner className="text-primary-foreground" label="Creating" />
                                        Creating…
                                    </>
                                ) : (
                                    <>
                                        <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                                        Create shift
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
