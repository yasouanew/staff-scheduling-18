import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, CalendarDays, Paperclip, Upload, X } from 'lucide-react';
import { format } from 'date-fns';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { cn } from '@/lib/utils';
import type { Employee } from '@/types/employee';
import { LEAVE_SESSION_LABELS, type CreateLeaveRequestInput, type LeaveRequest } from '@/types/leave-request';
import type { LeaveType } from '@/types/leave-type';

import { deriveLeaveBalance } from '../hooks/useLeaveRequests';
import { calculateRequestedDays, formatLeaveDuration } from '../lib/leave-request-utils';
import {
    LEAVE_ATTACHMENT_ACCEPTED_TYPES,
    LEAVE_ATTACHMENT_MAX_BYTES,
    LEAVE_ATTACHMENT_MAX_COUNT,
    leaveRequestFormSchema,
    type LeaveRequestFormValues,
} from '../schemas';

interface LeaveRequestFormProps {
    leaveTypes: LeaveType[];
    employees: Employee[];
    requests: LeaveRequest[];
    currentEmployeeId: string | null;
    canManageRequests: boolean;
    isSaving?: boolean;
    onSubmit: (values: CreateLeaveRequestInput) => Promise<void>;
}

const fieldClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);

function createDefaultValues(employeeId: string | null): LeaveRequestFormValues {
    return {
        employeeId: employeeId ?? '',
        leaveTypeId: '',
        startDate: format(new Date(), 'yyyy-MM-dd'),
        endDate: format(new Date(), 'yyyy-MM-dd'),
        startSession: 'full_day',
        endSession: 'full_day',
        reason: null,
        attachments: [],
    };
}

/** New leave request form used for employee self-service and manager-assisted submissions. */
export function LeaveRequestForm({
    leaveTypes,
    employees,
    requests,
    currentEmployeeId,
    canManageRequests,
    isSaving = false,
    onSubmit,
}: LeaveRequestFormProps): JSX.Element {
    const {
        register,
        handleSubmit,
        reset,
        setError,
        setValue,
        watch,
        formState: { errors },
    } = useForm<LeaveRequestFormValues>({
        resolver: zodResolver(leaveRequestFormSchema),
        defaultValues: createDefaultValues(currentEmployeeId),
    });
    const values = watch();

    useEffect(() => {
        if (currentEmployeeId && !canManageRequests) {
            setValue('employeeId', currentEmployeeId, { shouldValidate: true });
        }
    }, [canManageRequests, currentEmployeeId, setValue]);

    const activeLeaveTypes = useMemo(
        () => leaveTypes.filter((leaveType) => leaveType.status === 'active'),
        [leaveTypes],
    );
    const selectedLeaveType = useMemo(
        () => activeLeaveTypes.find((leaveType) => leaveType.id === values.leaveTypeId) ?? null,
        [activeLeaveTypes, values.leaveTypeId],
    );
    const requestedDays = useMemo(
        () =>
            calculateRequestedDays({
                startDate: values.startDate,
                endDate: values.endDate,
                startSession: values.startSession,
                endSession: values.endSession,
            }),
        [values.endDate, values.endSession, values.startDate, values.startSession],
    );
    const balance = useMemo(
        () =>
            selectedLeaveType
                ? deriveLeaveBalance({
                      allowanceDays: selectedLeaveType.allowanceDays,
                      requests: requests.filter((request) => request.employeeId === values.employeeId),
                      leaveTypeId: selectedLeaveType.id,
                  })
                : null,
        [requests, selectedLeaveType, values.employeeId],
    );
    const remainingAfterRequest =
        balance === null || balance.remainingDays === null || requestedDays === null
            ? null
            : balance.remainingDays - requestedDays;
    const wouldExceedAllowance = remainingAfterRequest !== null && remainingAfterRequest < 0;

    const submit = handleSubmit(async (formValues) => {
        if (wouldExceedAllowance) {
            setError('leaveTypeId', {
                type: 'validate',
                message: 'This request exceeds the employee’s available leave allowance.',
            });
            return;
        }

        await onSubmit({
            ...formValues,
            reason: formValues.reason?.trim() || null,
        });
    });

    const attachmentError = errors.attachments?.message ?? errors.attachments?.root?.message;

    return (
        <form onSubmit={submit} noValidate className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
                        <CalendarDays className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <h2 className="text-base font-semibold text-foreground">Request leave</h2>
                        <p className="text-sm text-muted-foreground">
                            Submit your absence for review. Approved leave automatically blocks the roster calendar.
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    <section className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm" aria-labelledby="request-details-heading">
                        <div>
                            <h2 id="request-details-heading" className="text-base font-semibold text-foreground">
                                Leave details
                            </h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Choose the employee, leave category, and the dates requested.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <label htmlFor="leave-request-employee" className="block text-sm font-medium text-foreground">
                                    Employee <span aria-hidden="true">*</span>
                                </label>
                                <select
                                    id="leave-request-employee"
                                    disabled={!canManageRequests}
                                    aria-invalid={Boolean(errors.employeeId)}
                                    className={fieldClasses}
                                    {...register('employeeId')}
                                >
                                    <option value="">Select employee…</option>
                                    {employees.map((employee) => (
                                        <option key={employee.id} value={employee.id}>
                                            {employee.name} · {employee.position}
                                        </option>
                                    ))}
                                </select>
                                {!canManageRequests ? (
                                    <p className="text-xs text-muted-foreground">
                                        Your employee profile is used automatically for this request.
                                    </p>
                                ) : null}
                                {errors.employeeId ? <p className="text-sm text-danger">{errors.employeeId.message}</p> : null}
                            </div>
                            <div className="space-y-1.5">
                                <label htmlFor="leave-request-type" className="block text-sm font-medium text-foreground">
                                    Leave type <span aria-hidden="true">*</span>
                                </label>
                                <select
                                    id="leave-request-type"
                                    aria-invalid={Boolean(errors.leaveTypeId)}
                                    className={fieldClasses}
                                    {...register('leaveTypeId')}
                                >
                                    <option value="">Select leave type…</option>
                                    {activeLeaveTypes.map((leaveType) => (
                                        <option key={leaveType.id} value={leaveType.id}>
                                            {leaveType.name} · {leaveType.isPaid ? 'Paid' : 'Unpaid'}
                                        </option>
                                    ))}
                                </select>
                                {errors.leaveTypeId ? <p className="text-sm text-danger">{errors.leaveTypeId.message}</p> : null}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <label htmlFor="leave-request-start" className="block text-sm font-medium text-foreground">
                                    Start date <span aria-hidden="true">*</span>
                                </label>
                                <input
                                    id="leave-request-start"
                                    type="date"
                                    aria-invalid={Boolean(errors.startDate)}
                                    className={fieldClasses}
                                    {...register('startDate')}
                                />
                                {errors.startDate ? <p className="text-sm text-danger">{errors.startDate.message}</p> : null}
                            </div>
                            <div className="space-y-1.5">
                                <label htmlFor="leave-request-end" className="block text-sm font-medium text-foreground">
                                    End date <span aria-hidden="true">*</span>
                                </label>
                                <input
                                    id="leave-request-end"
                                    type="date"
                                    aria-invalid={Boolean(errors.endDate)}
                                    className={fieldClasses}
                                    {...register('endDate')}
                                />
                                {errors.endDate ? <p className="text-sm text-danger">{errors.endDate.message}</p> : null}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <label htmlFor="leave-request-start-session" className="block text-sm font-medium text-foreground">
                                    Start session
                                </label>
                                <select id="leave-request-start-session" className={fieldClasses} {...register('startSession')}>
                                    {Object.entries(LEAVE_SESSION_LABELS).map(([value, label]) => (
                                        <option key={value} value={value}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label htmlFor="leave-request-end-session" className="block text-sm font-medium text-foreground">
                                    End session
                                </label>
                                <select id="leave-request-end-session" className={fieldClasses} {...register('endSession')}>
                                    {Object.entries(LEAVE_SESSION_LABELS).map(([value, label]) => (
                                        <option key={value} value={value}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </section>

                    <section className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm" aria-labelledby="request-context-heading">
                        <div>
                            <h2 id="request-context-heading" className="text-base font-semibold text-foreground">
                                Reason and documents
                            </h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Add a reason and supporting documents if your workplace policy requires them.
                            </p>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="leave-request-reason" className="block text-sm font-medium text-foreground">
                                Reason
                            </label>
                            <textarea
                                id="leave-request-reason"
                                rows={5}
                                placeholder="Provide any details that will help the reviewer assess your request."
                                aria-invalid={Boolean(errors.reason)}
                                className={cn(fieldClasses, 'h-auto resize-y py-3')}
                                {...register('reason', {
                                    setValueAs: (value: string) => value || null,
                                })}
                            />
                            {errors.reason ? <p className="text-sm text-danger">{errors.reason.message}</p> : null}
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="leave-request-attachments" className="block text-sm font-medium text-foreground">
                                Attachments
                            </label>
                            <label
                                htmlFor="leave-request-attachments"
                                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-input bg-background px-4 py-8 text-center transition-colors hover:bg-secondary focus-within:ring-2 focus-within:ring-ring"
                            >
                                <Upload className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                                <span className="text-sm font-medium text-foreground">Add supporting documents</span>
                                <span className="text-xs text-muted-foreground">
                                    PDF, JPG, PNG, DOC or DOCX · up to 5 files · 5 MB each
                                </span>
                                <input
                                    id="leave-request-attachments"
                                    type="file"
                                    multiple
                                    accept={LEAVE_ATTACHMENT_ACCEPTED_TYPES.join(',')}
                                    className="sr-only"
                                    onChange={(event) => {
                                        const nextFiles = Array.from(event.target.files ?? []);
                                        setValue('attachments', nextFiles, { shouldDirty: true, shouldValidate: true });
                                    }}
                                />
                            </label>
                            {attachmentError ? <p className="text-sm text-danger">{attachmentError}</p> : null}
                            {values.attachments.length > 0 ? (
                                <ul className="space-y-2" aria-label="Selected attachments">
                                    {values.attachments.map((attachment, index) => (
                                        <li
                                            key={`${attachment.name}-${attachment.lastModified}`}
                                            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2"
                                        >
                                            <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                                                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                                <span className="truncate">{attachment.name}</span>
                                                <span className="shrink-0 text-xs text-muted-foreground">
                                                    {(attachment.size / 1024 / 1024).toFixed(1)} MB
                                                </span>
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setValue(
                                                        'attachments',
                                                        values.attachments.filter((_, fileIndex) => fileIndex !== index),
                                                        { shouldDirty: true, shouldValidate: true },
                                                    )
                                                }
                                                aria-label={`Remove ${attachment.name}`}
                                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                <X className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </div>
                    </section>
                </div>

                <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
                    <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm" aria-labelledby="request-summary-heading">
                        <h2 id="request-summary-heading" className="text-base font-semibold text-foreground">
                            Request summary
                        </h2>
                        <dl className="space-y-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                                <dt className="text-muted-foreground">Requested duration</dt>
                                <dd className="font-semibold text-foreground">
                                    {requestedDays === null ? 'Choose valid dates' : formatLeaveDuration(requestedDays)}
                                </dd>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <dt className="text-muted-foreground">Leave category</dt>
                                <dd className="text-right font-medium text-foreground">
                                    {selectedLeaveType?.name ?? 'Not selected'}
                                </dd>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <dt className="text-muted-foreground">Payment</dt>
                                <dd className="font-medium text-foreground">
                                    {selectedLeaveType ? (selectedLeaveType.isPaid ? 'Paid' : 'Unpaid') : '—'}
                                </dd>
                            </div>
                        </dl>
                    </section>

                    {selectedLeaveType ? (
                        <section
                            className={cn(
                                'rounded-xl border p-5',
                                wouldExceedAllowance
                                    ? 'border-warning/30 bg-warning/10 text-warning'
                                    : 'border-success/20 bg-success/10 text-success',
                            )}
                            aria-live="polite"
                        >
                            <div className="flex gap-3">
                                {wouldExceedAllowance ? (
                                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                                ) : (
                                    <CalendarDays className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                                )}
                                <div className="space-y-1 text-sm">
                                    <p className="font-semibold">
                                        {balance?.allowanceDays === null
                                            ? 'No annual allowance is configured'
                                            : wouldExceedAllowance
                                              ? 'Insufficient leave balance'
                                              : 'Leave balance check'}
                                    </p>
                                    <p>
                                        {balance?.allowanceDays === null
                                            ? 'This leave type does not have an annual allowance limit.'
                                            : `${formatLeaveDuration(balance?.remainingDays ?? 0)} available before this request.`}
                                    </p>
                                    {wouldExceedAllowance ? (
                                        <p>Reduce the requested period or select a different leave type before submitting.</p>
                                    ) : null}
                                </div>
                            </div>
                        </section>
                    ) : null}

                    <div className="flex flex-col-reverse gap-3 sm:flex-row lg:flex-col-reverse">
                        <button
                            type="button"
                            onClick={() => reset(createDefaultValues(currentEmployeeId))}
                            disabled={isSaving}
                            className="inline-flex h-11 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            Reset form
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving || wouldExceedAllowance}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSaving ? <LoadingSpinner className="text-primary-foreground" label="Submitting leave request" /> : null}
                            {isSaving ? 'Submitting…' : 'Submit leave request'}
                        </button>
                    </div>
                </aside>
            </div>
        </form>
    );
}
