import { zodResolver } from '@hookform/resolvers/zod';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { useEmployees } from '@/features/employees/hooks/useEmployees';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
    BRANCH_STATUS_LABELS,
    BRANCH_STATUSES,
    TIMEZONE_LABELS,
    TIMEZONE_OPTIONS,
    WEEKDAYS,
    type Branch,
} from '@/types/branch';

import { useCreateBranch, useUpdateBranch } from '../hooks/useBranches';
import { EMPTY_BRANCH_FORM, toBranchFormDefaults } from '../lib/branch-form-defaults';
import { branchFormSchema, type BranchFormInput, type BranchFormValues } from '../schemas';
import { BranchAdvancedHours } from './BranchAdvancedHours';
import { BranchHoursFields } from './BranchHoursFields';


interface BranchFormModalProps {
    /** Controls drawer visibility. */
    open: boolean;
    /** Notifies the parent to change `open`. */
    onOpenChange: (open: boolean) => void;
    /** When provided, the drawer edits this branch; otherwise it creates one. */
    branch?: Branch | null;
    /** Optional callback fired with the saved branch on success. */
    onSaved?: (branch: Branch) => void;
}

/** Shared field styling (mirrors the app's form controls). */
const fieldClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);



/**
 * Slide-over drawer housing the create/edit branch form.
 *
 * Owns only form state; all persistence flows through the reusable
 * `useCreateBranch` / `useUpdateBranch` mutations. Validation is driven by the
 * shared Zod schema so inline errors, the required fields (name, timezone) and
 * phone formatting all stay consistent with the backend contract.
 */
export function BranchFormModal({
    open,
    onOpenChange,
    branch,
    onSaved,
}: BranchFormModalProps): JSX.Element {
    const isEdit = Boolean(branch);
    const createBranch = useCreateBranch();
    const updateBranch = useUpdateBranch();
    const { data: employees = [], isLoading: isLoadingEmployees } = useEmployees();

    const {
        register,
        handleSubmit,
        reset,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<BranchFormInput, unknown, BranchFormValues>({
        resolver: zodResolver(branchFormSchema),
        defaultValues: EMPTY_BRANCH_FORM,
    });

    // Re-seed the form whenever the drawer opens or the target branch changes.
    useEffect(() => {
        if (open) {
            reset(toBranchFormDefaults(branch));
        }
    }, [open, branch, reset]);

    // Expand the advanced section when the branch already has exceptions, so
    // existing configuration is never hidden from whoever is editing it.
    const hasExistingExceptions = Boolean(
        branch && WEEKDAYS.some((weekday) => branch.daySchedules[weekday]?.isCustom),
    );


    const submit = handleSubmit(async (values) => {
        try {
            const saved = isEdit
                ? await updateBranch.mutateAsync({ id: branch!.id, values })
                : await createBranch.mutateAsync(values);

            toast.success(isEdit ? 'Branch updated' : 'Branch created', {
                description: `${saved.name} has been ${isEdit ? 'updated' : 'added'} successfully.`,
            });
            onSaved?.(saved);
            onOpenChange(false);
        } catch (error) {
            toast.error(isEdit ? 'Unable to update branch' : 'Unable to create branch', {
                description: getApiErrorMessage(error, 'Please review the form and try again.'),
            });
        }
    });

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                <Dialog.Content
                    className={cn(
                        'fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-card shadow-xl focus:outline-none',
                        'data-[state=open]:animate-in data-[state=closed]:animate-out',
                        'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
                    )}
                >
                    {/* Header */}
                    <div className="flex items-start justify-between border-b border-border p-6">
                        <div className="space-y-1">
                            <Dialog.Title className="text-lg font-semibold tracking-tight text-foreground">
                                {isEdit ? 'Edit branch' : 'Create branch'}
                            </Dialog.Title>
                            <Dialog.Description className="text-sm text-muted-foreground">
                                {isEdit
                                    ? 'Update this operating location.'
                                    : 'Add a new operating location to your company.'}
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
                            {/* Name (required) */}
                            <div className="space-y-1.5">
                                <label htmlFor="name" className="block text-sm font-medium text-foreground">
                                    Branch name <span className="text-danger">*</span>
                                </label>
                                <input
                                    id="name"
                                    type="text"
                                    placeholder="e.g. Sydney CBD"
                                    aria-invalid={Boolean(errors.name)}
                                    className={fieldClasses}
                                    {...register('name')}
                                />
                                {errors.name && <p className="text-sm text-danger">{errors.name.message}</p>}
                            </div>

                            {/* Manager (optional employee reference) */}
                            <div className="space-y-1.5">
                                <label
                                    htmlFor="managerId"
                                    className="block text-sm font-medium text-foreground"
                                >
                                    Branch manager
                                </label>
                                <select
                                    id="managerId"
                                    aria-invalid={Boolean(errors.managerId)}
                                    disabled={isLoadingEmployees}
                                    className={fieldClasses}
                                    {...register('managerId')}
                                >
                                    <option value="">
                                        {isLoadingEmployees ? 'Loading employees…' : 'No manager assigned'}
                                    </option>
                                    {employees.map((employee) => (
                                        <option key={employee.id} value={employee.id}>
                                            {employee.name}
                                        </option>
                                    ))}
                                </select>
                                {errors.managerId && (
                                    <p className="text-sm text-danger">{errors.managerId.message}</p>
                                )}
                            </div>

                            {/* Phone */}
                            <div className="space-y-1.5">
                                <label htmlFor="phone" className="block text-sm font-medium text-foreground">
                                    Phone
                                </label>
                                <input
                                    id="phone"
                                    type="tel"
                                    autoComplete="tel"
                                    placeholder="e.g. (02) 9000 0000"
                                    aria-invalid={Boolean(errors.phone)}
                                    className={fieldClasses}
                                    {...register('phone')}
                                />
                                {errors.phone && <p className="text-sm text-danger">{errors.phone.message}</p>}
                            </div>

                            {/* Address */}
                            <div className="space-y-1.5">
                                <label htmlFor="address" className="block text-sm font-medium text-foreground">
                                    Address
                                </label>
                                <textarea
                                    id="address"
                                    rows={3}
                                    placeholder="e.g. 1 George St, Sydney NSW 2000"
                                    aria-invalid={Boolean(errors.address)}
                                    className={cn(
                                        'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground',
                                        'placeholder:text-muted-foreground transition-colors duration-200',
                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
                                        'disabled:cursor-not-allowed disabled:opacity-60',
                                    )}
                                    {...register('address')}
                                />
                                {errors.address && (
                                    <p className="text-sm text-danger">{errors.address.message}</p>
                                )}
                            </div>

                            {/* Timezone (required) */}
                            <div className="space-y-1.5">
                                <label htmlFor="timezone" className="block text-sm font-medium text-foreground">
                                    Timezone <span className="text-danger">*</span>
                                </label>
                                <select
                                    id="timezone"
                                    aria-invalid={Boolean(errors.timezone)}
                                    className={fieldClasses}
                                    {...register('timezone')}
                                >
                                    {TIMEZONE_OPTIONS.map((tz) => (
                                        <option key={tz} value={tz}>
                                            {TIMEZONE_LABELS[tz] ?? tz}
                                        </option>
                                    ))}
                                </select>
                                {errors.timezone && (
                                    <p className="text-sm text-danger">{errors.timezone.message}</p>
                                )}
                            </div>

                            {/* Status */}
                            <div className="space-y-1.5">
                                <label htmlFor="status" className="block text-sm font-medium text-foreground">
                                    Status
                                </label>
                                <select
                                    id="status"
                                    aria-invalid={Boolean(errors.status)}
                                    className={fieldClasses}
                                    {...register('status')}
                                >
                                    {BRANCH_STATUSES.map((option) => (
                                        <option key={option} value={option}>
                                            {BRANCH_STATUS_LABELS[option]}
                                        </option>
                                    ))}
                                </select>
                                {errors.status && (
                                    <p className="text-sm text-danger">{errors.status.message}</p>
                                )}
                            </div>

                            {/* Operating hours & breaks */}
                            <div className="space-y-4 border-t border-border pt-5">
                                <BranchHoursFields register={register} errors={errors} />
                                <BranchAdvancedHours
                                    register={register}
                                    errors={errors}
                                    watch={watch}
                                    defaultOpen={hasExistingExceptions}
                                />
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
                                        <LoadingSpinner className="text-primary-foreground" label="Saving" />
                                        Saving…
                                    </>
                                ) : isEdit ? (
                                    'Save changes'
                                ) : (
                                    'Create branch'
                                )}
                            </button>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
