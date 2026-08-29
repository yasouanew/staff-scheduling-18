import * as Dialog from '@radix-ui/react-dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { BadgeCheck, RotateCcw, X } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { cn } from '@/lib/utils';
import type { LeaveType, LeaveTypeMutationInput } from '@/types/leave-type';

import { leaveTypeFormSchema, type LeaveTypeFormValues } from '../schemas';

interface LeaveTypeFormProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    leaveType?: LeaveType;
    isSaving?: boolean;
    onSubmit: (values: LeaveTypeMutationInput) => Promise<void>;
}

const fieldClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);

function createDefaultValues(): LeaveTypeFormValues {
    return {
        name: '',
        code: null,
        description: null,
        allowanceDays: 20,
        isPaid: true,
        allowsRollover: false,
        maxRolloverDays: null,
        requiresApproval: true,
        allowsHalfDay: true,
        maxDaysPerRequest: null,
        status: 'active',
    };
}

function toFormValues(leaveType: LeaveType): LeaveTypeFormValues {
    return {
        name: leaveType.name,
        code: leaveType.code,
        description: leaveType.description,
        allowanceDays: leaveType.allowanceDays,
        isPaid: leaveType.isPaid,
        allowsRollover: leaveType.allowsRollover,
        maxRolloverDays: leaveType.maxRolloverDays,
        requiresApproval: leaveType.requiresApproval,
        allowsHalfDay: leaveType.allowsHalfDay,
        maxDaysPerRequest: leaveType.maxDaysPerRequest,
        status: leaveType.status,
    };
}

/** Shared layout for a labelled toggle and its supporting operational guidance. */
function ToggleField({
    id,
    label,
    description,
    checked,
    onChange,
}: {
    id: string;
    label: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}): JSX.Element {
    return (
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-background p-4">
            <div className="space-y-1">
                <label htmlFor={id} className="text-sm font-medium text-foreground">
                    {label}
                </label>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <input
                id={id}
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
        </div>
    );
}

/**
 * Stateful, transport-free leave type editor. The owning page handles every API
 * mutation, keeping this reusable form focused only on accessible policy input.
 */
export function LeaveTypeForm({
    open,
    onOpenChange,
    leaveType,
    isSaving = false,
    onSubmit,
}: LeaveTypeFormProps): JSX.Element {
    const isEditMode = Boolean(leaveType);
    const {
        register,
        handleSubmit,
        reset,
        setValue,
        watch,
        formState: { errors },
    } = useForm<LeaveTypeFormValues>({
        resolver: zodResolver(leaveTypeFormSchema),
        defaultValues: createDefaultValues(),
    });
    const allowsRollover = watch('allowsRollover');
    const isPaid = watch('isPaid');
    const requiresApproval = watch('requiresApproval');
    const allowsHalfDay = watch('allowsHalfDay');

    useEffect(() => {
        if (open) {
            reset(leaveType ? toFormValues(leaveType) : createDefaultValues());
        }
    }, [leaveType, open, reset]);

    const submit = handleSubmit(async (values) => {
        await onSubmit({
            ...values,
            code: values.code?.trim() || null,
            description: values.description?.trim() || null,
            maxRolloverDays: values.allowsRollover ? values.maxRolloverDays : null,
        });
    });

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
                <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-border bg-card shadow-xl focus:outline-none">
                    <div className="flex items-start justify-between border-b border-border p-6">
                        <div className="space-y-1">
                            <Dialog.Title className="text-lg font-semibold tracking-tight text-foreground">
                                {isEditMode ? 'Edit leave type' : 'Create leave type'}
                            </Dialog.Title>
                            <Dialog.Description className="text-sm text-muted-foreground">
                                Configure the leave policy employees will see when they create a leave request.
                            </Dialog.Description>
                        </div>
                        <Dialog.Close
                            aria-label="Close leave type form"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <X className="h-5 w-5" aria-hidden="true" />
                        </Dialog.Close>
                    </div>

                    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
                        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
                            <div className="rounded-lg border border-info/20 bg-info/10 p-4 text-sm text-info">
                                <div className="flex gap-3">
                                    <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                                    <p>
                                        Only active leave types are available for new employee leave requests. Existing
                                        leave history is retained when a type becomes inactive.
                                    </p>
                                </div>
                            </div>

                            <section className="space-y-4" aria-labelledby="leave-type-details-heading">
                                <div>
                                    <h3 id="leave-type-details-heading" className="text-sm font-semibold text-foreground">
                                        Leave type details
                                    </h3>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Name the category so employees can identify it quickly.
                                    </p>
                                </div>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                    <div className="space-y-1.5 sm:col-span-2">
                                        <label htmlFor="leave-type-name" className="block text-sm font-medium text-foreground">
                                            Name <span aria-hidden="true">*</span>
                                        </label>
                                        <input
                                            id="leave-type-name"
                                            type="text"
                                            placeholder="e.g. Annual leave"
                                            aria-invalid={Boolean(errors.name)}
                                            className={fieldClasses}
                                            {...register('name')}
                                        />
                                        {errors.name ? <p className="text-sm text-danger">{errors.name.message}</p> : null}
                                    </div>
                                    <div className="space-y-1.5">
                                        <label htmlFor="leave-type-code" className="block text-sm font-medium text-foreground">
                                            Code
                                        </label>
                                        <input
                                            id="leave-type-code"
                                            type="text"
                                            placeholder="e.g. AL"
                                            aria-invalid={Boolean(errors.code)}
                                            className={fieldClasses}
                                            {...register('code', {
                                                setValueAs: (value: string) => value || null,
                                            })}
                                        />
                                        {errors.code ? <p className="text-sm text-danger">{errors.code.message}</p> : null}
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="leave-type-description" className="block text-sm font-medium text-foreground">
                                        Employee guidance
                                    </label>
                                    <textarea
                                        id="leave-type-description"
                                        rows={3}
                                        placeholder="Explain when employees should select this leave type."
                                        aria-invalid={Boolean(errors.description)}
                                        className={cn(fieldClasses, 'h-auto resize-y py-3')}
                                        {...register('description', {
                                            setValueAs: (value: string) => value || null,
                                        })}
                                    />
                                    {errors.description ? <p className="text-sm text-danger">{errors.description.message}</p> : null}
                                </div>
                            </section>

                            <section className="space-y-4" aria-labelledby="leave-type-entitlement-heading">
                                <div>
                                    <h3 id="leave-type-entitlement-heading" className="text-sm font-semibold text-foreground">
                                        Entitlement and payment
                                    </h3>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Define annual entitlement and whether approved leave is paid.
                                    </p>
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="leave-type-allowance" className="block text-sm font-medium text-foreground">
                                        Annual allowance (days)
                                    </label>
                                    <input
                                        id="leave-type-allowance"
                                        type="number"
                                        min="0"
                                        max="365"
                                        step="0.5"
                                        placeholder="Leave blank when no annual allowance applies"
                                        aria-invalid={Boolean(errors.allowanceDays)}
                                        className={fieldClasses}
                                        {...register('allowanceDays', {
                                            setValueAs: (value: string) => (value === '' ? null : Number(value)),
                                        })}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        This is the yearly balance employees can request for this leave type.
                                    </p>
                                    {errors.allowanceDays ? <p className="text-sm text-danger">{errors.allowanceDays.message}</p> : null}
                                </div>
                                <ToggleField
                                    id="leave-type-paid"
                                    label="Paid leave"
                                    description="Mark this type as paid when approved leave should be included in payroll."
                                    checked={isPaid}
                                    onChange={(checked) => setValue('isPaid', checked, { shouldDirty: true })}
                                />
                            </section>

                            <section className="space-y-4" aria-labelledby="leave-type-rollover-heading">
                                <div>
                                    <h3 id="leave-type-rollover-heading" className="text-sm font-semibold text-foreground">
                                        Rollover rules
                                    </h3>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Control whether unused balance carries into the following leave year.
                                    </p>
                                </div>
                                <ToggleField
                                    id="leave-type-rollover"
                                    label="Allow unused leave to roll over"
                                    description="Employees may carry an eligible balance into the next leave year."
                                    checked={allowsRollover}
                                    onChange={(checked) => {
                                        setValue('allowsRollover', checked, { shouldDirty: true, shouldValidate: true });
                                        if (!checked) {
                                            setValue('maxRolloverDays', null, {
                                                shouldDirty: true,
                                                shouldValidate: true,
                                            });
                                        }
                                    }}
                                />
                                <div className="space-y-1.5">
                                    <label htmlFor="leave-type-rollover-limit" className="block text-sm font-medium text-foreground">
                                        Maximum rollover (days)
                                    </label>
                                    <input
                                        id="leave-type-rollover-limit"
                                        type="number"
                                        min="0"
                                        max="365"
                                        step="0.5"
                                        disabled={!allowsRollover}
                                        placeholder={allowsRollover ? 'e.g. 5' : 'Enable rollover to set a limit'}
                                        aria-invalid={Boolean(errors.maxRolloverDays)}
                                        className={fieldClasses}
                                        {...register('maxRolloverDays', {
                                            setValueAs: (value: string) => (value === '' ? null : Number(value)),
                                        })}
                                    />
                                    {errors.maxRolloverDays ? <p className="text-sm text-danger">{errors.maxRolloverDays.message}</p> : null}
                                </div>
                            </section>

                            <section className="space-y-4" aria-labelledby="leave-type-request-rules-heading">
                                <div>
                                    <h3 id="leave-type-request-rules-heading" className="text-sm font-semibold text-foreground">
                                        Employee request rules
                                    </h3>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Set how employees use this leave type in their request workflow.
                                    </p>
                                </div>
                                <ToggleField
                                    id="leave-type-approval"
                                    label="Requires approval"
                                    description="Requests using this leave type need manager review before they are confirmed."
                                    checked={requiresApproval}
                                    onChange={(checked) => setValue('requiresApproval', checked, { shouldDirty: true })}
                                />
                                <ToggleField
                                    id="leave-type-half-day"
                                    label="Allow half-day requests"
                                    description="Employees can submit this type of leave for a partial working day."
                                    checked={allowsHalfDay}
                                    onChange={(checked) => setValue('allowsHalfDay', checked, { shouldDirty: true })}
                                />
                                <div className="space-y-1.5">
                                    <label htmlFor="leave-type-max-request" className="block text-sm font-medium text-foreground">
                                        Maximum days per request
                                    </label>
                                    <input
                                        id="leave-type-max-request"
                                        type="number"
                                        min="1"
                                        max="365"
                                        step="1"
                                        placeholder="Leave blank for no per-request limit"
                                        aria-invalid={Boolean(errors.maxDaysPerRequest)}
                                        className={fieldClasses}
                                        {...register('maxDaysPerRequest', {
                                            setValueAs: (value: string) => (value === '' ? null : Number(value)),
                                        })}
                                    />
                                    {errors.maxDaysPerRequest ? <p className="text-sm text-danger">{errors.maxDaysPerRequest.message}</p> : null}
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="leave-type-status" className="block text-sm font-medium text-foreground">
                                        Availability
                                    </label>
                                    <select id="leave-type-status" className={fieldClasses} {...register('status')}>
                                        <option value="active">Active — available in new employee requests</option>
                                        <option value="inactive">Inactive — unavailable for new requests</option>
                                    </select>
                                </div>
                            </section>
                        </div>

                        <div className="flex flex-col-reverse gap-3 border-t border-border p-6 sm:flex-row sm:items-center sm:justify-between">
                            <button
                                type="button"
                                onClick={() => reset(leaveType ? toFormValues(leaveType) : createDefaultValues())}
                                disabled={isSaving}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                Reset
                            </button>
                            <div className="flex flex-col-reverse gap-3 sm:flex-row">
                                <Dialog.Close asChild>
                                    <button
                                        type="button"
                                        disabled={isSaving}
                                        className="inline-flex h-11 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        Cancel
                                    </button>
                                </Dialog.Close>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isSaving ? <LoadingSpinner className="text-primary-foreground" label="Saving leave type" /> : null}
                                    {isSaving ? 'Saving…' : isEditMode ? 'Save changes' : 'Create leave type'}
                                </button>
                            </div>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
