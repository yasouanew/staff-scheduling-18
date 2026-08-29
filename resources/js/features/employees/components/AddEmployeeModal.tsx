import * as Dialog from '@radix-ui/react-dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { BranchCapacityDialog } from '@/features/billing/components/BranchCapacityDialog';
import { CapacityWarning, IncreaseCapacityButton } from '@/features/billing/components/CapacityWarning';
import { useUpdateBranchCapacity } from '@/features/billing/hooks/useBranchBilling';
import { useUsageOverview } from '@/features/billing/hooks/useSubscription';
import type { BranchUsageItem } from '@/features/billing/types';
import { useBranchOptions } from '@/features/branches/hooks/useBranches';
import { useDepartmentOptions } from '@/features/departments/hooks/useDepartments';
import { usePositionOptions } from '@/features/positions/hooks/usePositions';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

import {
    DEFAULT_EMPLOYEE_ROLE,
    EMPLOYEE_ROLE_DESCRIPTIONS,
    EMPLOYEE_ROLE_LABELS,
    EMPLOYEE_ROLES,
    type CreateEmployeeInput,
} from '@/types/employee';


import { useCreateEmployee } from '../hooks/useEmployees';

interface AddEmployeeModalProps {
    /** Controls drawer visibility. */
    open: boolean;
    /** Notifies the parent to change `open`. */
    onOpenChange: (open: boolean) => void;
}

/**
 * Validation schema mirroring {@link CreateEmployeeInput}.
 *
 * Department and position reference real records by id. Branch is optional
 * because a new starter is often onboarded before their location is decided.
 */
const addEmployeeSchema = z.object({
    name: z.string().trim().min(2, 'Please enter the full name.'),
    email: z.string().trim().min(1, 'Email is required.').email('Enter a valid email address.'),
    // Constrained to the same three values the backend accepts.
    role: z.enum(['company_admin', 'scheduler', 'employee']),
    departmentId: z.string().min(1, 'Select a department.'),

    positionId: z.string().min(1, 'Select a position.'),
    branchId: z.string(),
});

type AddEmployeeFormValues = z.infer<typeof addEmployeeSchema>;

/** Shared field styling. */
const fieldClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);

/**
 * Slide-over drawer form for adding a new team member. Composes the reusable
 * `useCreateEmployee` mutation; the drawer itself owns only form state and
 * closes with a success toast once the mutation resolves.
 *
 * Departments, positions and branches are all read live from the API so the
 * options always reflect records the company has actually created.
 */
export function AddEmployeeModal({ open, onOpenChange }: AddEmployeeModalProps): JSX.Element {
    const createEmployee = useCreateEmployee();
    const { data: branchOptions = [], isLoading: isLoadingBranches } = useBranchOptions();
    const { data: departmentOptions = [], isLoading: isLoadingDepartments } = useDepartmentOptions();
    const usageQuery = useUsageOverview();
    const updateCapacity = useUpdateBranchCapacity();
    const [capacityBranch, setCapacityBranch] = useState<BranchUsageItem | null>(null);
    const [capacityOpen, setCapacityOpen] = useState(false);

    const {
        register,
        handleSubmit,
        reset,
        watch,
        setValue,
        formState: { errors, isSubmitting },
    } = useForm<AddEmployeeFormValues>({
        resolver: zodResolver(addEmployeeSchema),
        defaultValues: {
            name: '',
            email: '',
            role: DEFAULT_EMPLOYEE_ROLE,
            departmentId: '',

            positionId: '',
            branchId: '',
        },
    });

    // Drives the helper text so the consequence of each role is explicit.
    const selectedRole = watch('role');

    // Positions belong to a department, so only offer titles from the chosen one.
    const selectedDepartmentId = watch('departmentId');

    // Tracks the chosen branch so capacity guidance can be shown for it.
    const selectedBranchId = watch('branchId');

    const selectedBranchUsage = useMemo(() => {
        if (!selectedBranchId) return undefined;
        return usageQuery.data?.branchesUsage.find(
            (item) => String(item.id) === String(selectedBranchId),
        );
    }, [selectedBranchId, usageQuery.data]);

    /** True when the selected branch has filled every employee position. */
    const isBranchAtCapacity =
        selectedBranchUsage !== undefined &&
        selectedBranchUsage.employeeCapacity !== null &&
        selectedBranchUsage.remaining !== null &&
        selectedBranchUsage.remaining <= 0;

    const { data: positionOptions = [], isLoading: isLoadingPositions } = usePositionOptions(
        selectedDepartmentId ? Number(selectedDepartmentId) : undefined,
    );

    // Reset the form whenever the drawer is freshly opened.
    useEffect(() => {
        if (open) reset();
    }, [open, reset]);

    // A position from a previous department must not stay selected.
    useEffect(() => {
        setValue('positionId', '');
    }, [selectedDepartmentId, setValue]);

    const submit = handleSubmit(async (values) => {
        const payload: CreateEmployeeInput = values;

        try {
            await createEmployee.mutateAsync(payload);
            toast.success('Invitation sent', {
                description: `${values.name} was added as ${EMPLOYEE_ROLE_LABELS[values.role]} and emailed a link to set their password.`,
            });
            onOpenChange(false);
        } catch (error) {
            // Surface the real reason (e.g. duplicate email) instead of a generic message.
            toast.error('Unable to add employee', {
                description: getApiErrorMessage(error, 'Something went wrong. Please try again.'),
            });
        }

    });

    /** Increase the selected branch's employee capacity via the billing API. */
    const handleCapacityConfirm = async (employeeCapacity: number): Promise<void> => {
        if (!capacityBranch) return;
        try {
            await updateCapacity.mutateAsync({
                branchId: capacityBranch.id,
                employeeCapacity,
            });
            toast.success('Capacity updated', {
                description: `${capacityBranch.name} now holds up to ${employeeCapacity} employees.`,
            });
            setCapacityOpen(false);
            setCapacityBranch(null);
        } catch (error) {
            toast.error('Unable to update capacity', {
                description: getApiErrorMessage(error, 'Please try again.'),
            });
        }
    };

    const hasDepartments = !isLoadingDepartments && departmentOptions.length > 0;

    return (
        <>
            <Dialog.Root open={open} onOpenChange={onOpenChange}>
                <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                    <Dialog.Content
                        className={cn(
                            'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-xl focus:outline-none',
                            'data-[state=open]:animate-in data-[state=closed]:animate-out',
                            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
                        )}
                    >
                        {/* Header */}
                        <div className="flex items-start justify-between border-b border-border p-6">
                            <div className="space-y-1">
                                <Dialog.Title className="text-lg font-semibold tracking-tight text-foreground">
                                    Add team member
                                </Dialog.Title>
                                <Dialog.Description className="text-sm text-muted-foreground">
                                    Invite a new employee to your organisation.
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
                                {/* Name */}
                                <div className="space-y-1.5">
                                    <label htmlFor="name" className="block text-sm font-medium text-foreground">
                                        Full name
                                    </label>
                                    <input
                                        id="name"
                                        type="text"
                                        autoComplete="name"
                                        placeholder="e.g. Olivia Bennett"
                                        aria-invalid={Boolean(errors.name)}
                                        className={fieldClasses}
                                        {...register('name')}
                                    />
                                    {errors.name && <p className="text-sm text-danger">{errors.name.message}</p>}
                                </div>

                                {/* Email */}
                                <div className="space-y-1.5">
                                    <label htmlFor="email" className="block text-sm font-medium text-foreground">
                                        Work email
                                    </label>
                                    <input
                                        id="email"
                                        type="email"
                                        autoComplete="email"
                                        placeholder="name@company.com.au"
                                        aria-invalid={Boolean(errors.email)}
                                        className={fieldClasses}
                                        {...register('email')}
                                    />
                                    {errors.email && <p className="text-sm text-danger">{errors.email.message}</p>}
                                </div>

                                {/* Role — decides what this person can access on sign-in */}
                                <div className="space-y-1.5">
                                    <label htmlFor="role" className="block text-sm font-medium text-foreground">
                                        Role
                                    </label>
                                    <select
                                        id="role"
                                        aria-invalid={Boolean(errors.role)}
                                        aria-describedby="role-description"
                                        className={fieldClasses}
                                        {...register('role')}
                                    >
                                        {EMPLOYEE_ROLES.map((option) => (
                                            <option key={option} value={option}>
                                                {EMPLOYEE_ROLE_LABELS[option]}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.role ? (
                                        <p className="text-sm text-danger">{errors.role.message}</p>
                                    ) : (
                                        <p id="role-description" className="text-sm text-muted-foreground">
                                            {EMPLOYEE_ROLE_DESCRIPTIONS[selectedRole]}
                                        </p>
                                    )}
                                </div>

                                {/* Department */}
                                <div className="space-y-1.5">
                                    <label htmlFor="departmentId" className="block text-sm font-medium text-foreground">
                                        Department
                                    </label>

                                    <select
                                        id="departmentId"
                                        disabled={isLoadingDepartments}
                                        aria-invalid={Boolean(errors.departmentId)}
                                        className={fieldClasses}
                                        {...register('departmentId')}
                                    >
                                        <option value="">
                                            {isLoadingDepartments ? 'Loading departments...' : 'Select a department'}
                                        </option>
                                        {departmentOptions.map((option) => (
                                            <option key={option.id} value={option.id}>
                                                {option.name}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.departmentId && (
                                        <p className="text-sm text-danger">{errors.departmentId.message}</p>
                                    )}
                                    {!isLoadingDepartments && departmentOptions.length === 0 && (
                                        <p className="text-sm text-muted-foreground">
                                            No departments yet — create one under Departments first.
                                        </p>
                                    )}
                                </div>

                                {/* Position */}
                                <div className="space-y-1.5">
                                    <label htmlFor="positionId" className="block text-sm font-medium text-foreground">
                                        Position
                                    </label>
                                    <select
                                        id="positionId"
                                        disabled={!hasDepartments || !selectedDepartmentId || isLoadingPositions}
                                        aria-invalid={Boolean(errors.positionId)}
                                        className={fieldClasses}
                                        {...register('positionId')}
                                    >
                                        <option value="">
                                            {!selectedDepartmentId
                                                ? 'Select a department first'
                                                : isLoadingPositions
                                                    ? 'Loading positions...'
                                                    : 'Select a position'}
                                        </option>
                                        {positionOptions.map((option) => (
                                            <option key={option.id} value={option.id}>
                                                {option.name}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.positionId && (
                                        <p className="text-sm text-danger">{errors.positionId.message}</p>
                                    )}
                                    {Boolean(selectedDepartmentId) && !isLoadingPositions && positionOptions.length === 0 && (
                                        <p className="text-sm text-muted-foreground">
                                            No positions in this department yet — create one under Positions first.
                                        </p>
                                    )}
                                </div>

                                {/* Branch (optional) */}
                                <div className="space-y-1.5">
                                    <label htmlFor="branchId" className="block text-sm font-medium text-foreground">
                                        Branch <span className="font-normal text-muted-foreground">(optional)</span>
                                    </label>
                                    <select
                                        id="branchId"
                                        disabled={isLoadingBranches}
                                        aria-invalid={Boolean(errors.branchId)}
                                        className={fieldClasses}
                                        {...register('branchId')}
                                    >
                                        <option value="">
                                            {isLoadingBranches ? 'Loading branches...' : 'No branch assigned'}
                                        </option>
                                        {branchOptions.map((option) => (
                                            <option key={option.id} value={option.id}>
                                                {option.name}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.branchId && (
                                        <p className="text-sm text-danger">{errors.branchId.message}</p>
                                    )}
                                    <p className="text-sm text-muted-foreground">
                                        {!isLoadingBranches && branchOptions.length === 0
                                            ? 'No branches yet — you can assign one later under Branches.'
                                            : 'You can assign or change the branch at any time.'}
                                    </p>
                                    {selectedBranchUsage && (
                                        <CapacityWarning
                                            used={selectedBranchUsage.employeesUsed}
                                            capacity={selectedBranchUsage.employeeCapacity}
                                            action={
                                                <IncreaseCapacityButton
                                                    onClick={() => {
                                                        setCapacityBranch(selectedBranchUsage);
                                                        setCapacityOpen(true);
                                                    }}
                                                />
                                            }
                                        />
                                    )}
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
                                    disabled={isSubmitting || isBranchAtCapacity}
                                    className={cn(
                                        'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors',
                                        'hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                                        'disabled:cursor-not-allowed disabled:opacity-70',
                                    )}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <LoadingSpinner className="text-primary-foreground" label="Saving" />
                                            Saving...
                                        </>
                                    ) : (
                                        'Add employee'
                                    )}
                                </button>
                            </div>
                        </form>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
            <BranchCapacityDialog
                open={capacityOpen}
                branch={capacityBranch}
                currentCapacity={capacityBranch?.employeeCapacity ?? null}
                suggestedMax={null}
                isPending={updateCapacity.isPending}
                onOpenChange={(next) => {
                    setCapacityOpen(next);
                    if (!next) setCapacityBranch(null);
                }}
                onConfirm={handleCapacityConfirm}
            />
        </>
    );
}
