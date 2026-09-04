import * as Dialog from '@radix-ui/react-dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { Camera, ShieldOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { Avatar, AvatarFallback, AvatarImage } from '@/Components/ui/avatar';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/Components/ui/alert-dialog';

import { useBranchOptions } from '@/features/branches/hooks/useBranches';
import { useDepartmentOptions } from '@/features/departments/hooks/useDepartments';
import { usePositionOptions } from '@/features/positions/hooks/usePositions';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
    EMPLOYEE_STATUS_LABELS,
    EMPLOYEE_STATUSES,
    EMPLOYMENT_TYPE_LABELS,
    EMPLOYMENT_TYPES,
    type Employee,
    type UpdateEmployeeInput,
} from '@/types/employee';

import { useUpdateEmployee, useUploadEmployeePhoto } from '../hooks/useEmployees';

interface EditEmployeeModalProps {
    /**
     * Employee being edited, or `null` when the dialog is closed. Passing the
     * record (rather than just an id) lets the form hydrate instantly from the
     * row already in the table, with no extra request.
     */
    employee: Employee | null;
    /** Notifies the parent to clear the selected employee / close the dialog. */
    onOpenChange: (open: boolean) => void;
}

/**
 * Validation schema mirroring {@link UpdateEmployeeInput}.
 *
 * Department and position stay optional here (unlike the add form) because
 * historical records may predate those lists, and forcing a value would block an
 * unrelated edit such as a name correction.
 */
const editEmployeeSchema = z.object({
    firstName: z.string().trim().min(1, 'First name is required.'),
    lastName: z.string().trim().min(1, 'Last name is required.'),
    departmentId: z.string(),
    positionId: z.string(),
    branchId: z.string(),
    // Mirrors UpdateEmployeeRequest's `in:full_time,part_time,casual,contract,contractor`.
    employmentType: z.enum(['full_time', 'part_time', 'casual', 'contract', 'contractor']),
    hourlyRate: z
        .string()
        .trim()
        .refine(
            (value) => value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0),
            'Enter a valid hourly rate.',
        ),
    // Mirrors UpdateEmployeeRequest's `in:active,pending,inactive,terminated`.
    status: z.enum(['active', 'pending', 'inactive', 'terminated']),
    // Optional profile fields accepted by the update endpoint.
    employeeNumber: z.string(),
    dob: z.string(),
    gender: z.string(),
    address: z.string(),
    emergencyContact: z.string(),
    emergencyPhone: z.string(),
    hireDate: z.string(),
    terminationDate: z.string(),
});

type EditEmployeeFormValues = z.infer<typeof editEmployeeSchema>;

/** Gender options accepted by `UpdateEmployeeRequest` (`in:male,female,other,prefer_not_to_say`). */
const GENDERS: readonly { value: string; label: string }[] = [
    { value: '', label: 'Not specified' },
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
    { value: 'other', label: 'Other' },
    { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

/** Shared field styling, matching the add-employee drawer. */
const fieldClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);

/** Splits a stored display name into first/last parts for the form. */
function splitName(fullName: string): { firstName: string; lastName: string } {
    const [first, ...rest] = fullName.trim().split(/\s+/);

    return { firstName: first ?? '', lastName: rest.join(' ') };
}

/** Derives the two-letter initials shown while no photo is uploaded. */
function getInitials(name: string): string {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('');
}

/**
 * Slide-over form for editing an existing team member, opened from the table's
 * three-dot row menu.
 *
 * All persistence is delegated to `useUpdateEmployee`; this component owns only
 * form state, so the same mutation can be reused by any other screen that needs
 * to edit an employee.
 */
export function EditEmployeeModal({
    employee,
    onOpenChange,
}: EditEmployeeModalProps): JSX.Element {
    const updateEmployee = useUpdateEmployee();
    const uploadPhoto = useUploadEmployeePhoto();
    const { data: branchOptions = [], isLoading: isLoadingBranches } = useBranchOptions();
    const { data: departmentOptions = [], isLoading: isLoadingDepartments } = useDepartmentOptions();
    const photoInputRef = useRef<HTMLInputElement>(null);

    const {
        register,
        handleSubmit,
        reset,
        watch,
        setValue,
        formState: { errors, isSubmitting },
    } = useForm<EditEmployeeFormValues>({
        resolver: zodResolver(editEmployeeSchema),
        defaultValues: {
            firstName: '',
            lastName: '',
            departmentId: '',
            positionId: '',
            branchId: '',
            employmentType: 'full_time',
            hourlyRate: '',
            status: 'active',
            employeeNumber: '',
            dob: '',
            gender: '',
            address: '',
            emergencyContact: '',
            emergencyPhone: '',
            hireDate: '',
            terminationDate: '',
        },
    });

    /*
     * Values held back awaiting confirmation of a status change that revokes
     * access. Non-null means the confirmation dialog is open.
     */
    const [pendingValues, setPendingValues] = useState<EditEmployeeFormValues | null>(null);

    // Positions belong to a department, so only offer titles from the chosen one.
    const selectedDepartmentId = watch('departmentId');

    /*
     * True when saving would cut off this person's access: they can currently
     * sign in, and the form has moved them off `active`. Anyone who has not
     * accepted their invitation has no access to lose, so no warning is shown.
     */
    const selectedStatus = watch('status');
    const revokesAccess =
        selectedStatus !== 'active' &&
        employee?.status === 'active' &&
        employee?.invitation?.status === 'accepted';


    const { data: positionOptions = [], isLoading: isLoadingPositions } = usePositionOptions(
        selectedDepartmentId ? Number(selectedDepartmentId) : undefined,
    );

    /*
     * Hydrate the form from the selected row each time the dialog opens. Keying
     * the effect on the employee id (rather than the object) avoids resetting
     * mid-edit when the directory refetches in the background and hands us a new
     * object with identical values.
     */
    useEffect(() => {
        if (!employee) return;

        const { firstName, lastName } = splitName(employee.name);

        reset({
            firstName,
            lastName,
            departmentId: employee.departmentId ?? '',
            positionId: employee.positionId ?? '',
            branchId: employee.branchId ?? '',
            employmentType: employee.employmentType,
            hourlyRate: employee.hourlyRate ?? '',
            status: employee.status,
            employeeNumber: employee.employeeNumber ?? '',
            dob: employee.dob ?? '',
            gender: employee.gender ?? '',
            address: employee.address ?? '',
            emergencyContact: employee.emergencyContact ?? '',
            emergencyPhone: employee.emergencyPhone ?? '',
            hireDate: employee.hireDate ?? '',
            terminationDate: employee.terminationDate ?? '',
        });
    }, [employee?.id, reset]); // eslint-disable-line react-hooks/exhaustive-deps

    /** Upload a profile photo (or replace an existing one) via the photo endpoint. */
    const handlePhotoChange = async (
        event: React.ChangeEvent<HTMLInputElement>,
    ): Promise<void> => {
        const file = event.target.files?.[0];
        // Reset the input so selecting the same file again still fires onChange.
        event.target.value = '';

        if (!file || !employee) return;

        try {
            await uploadPhoto.mutateAsync({ employeeId: employee.id, file });
            toast.success('Photo updated', {
                description: `${employee.name}'s profile photo was updated.`,
            });
        } catch (error) {
            toast.error('Unable to upload photo', {
                description: getApiErrorMessage(
                    error,
                    'The photo must be a JPG, PNG or WebP under 2 MB.',
                ),
            });
        }
    };

    /** Persist the form, then close on success. */
    async function save(values: EditEmployeeFormValues): Promise<void> {
        if (!employee) return;

        const payload: UpdateEmployeeInput = values;

        try {
            await updateEmployee.mutateAsync({ employeeId: employee.id, input: payload });

            // Spell out the access consequence, so an admin is never surprised
            // that "saved" also meant "signed them out of everything".
            toast.success('Employee updated', {
                description: revokesAccess
                    ? `${values.firstName} ${values.lastName} can no longer sign in and has been signed out of all devices.`
                    : `${values.firstName} ${values.lastName}'s details were saved.`,
            });
            onOpenChange(false);
        } catch (error) {
            toast.error('Unable to save changes', {
                description: getApiErrorMessage(error, 'Something went wrong. Please try again.'),
            });
        }
    }

    /*
     * Moving someone off `active` revokes their login, so it is treated as a
     * destructive action: the form defers to a confirmation step instead of
     * saving straight away. Everything else saves immediately.
     */
    const submit = handleSubmit(async (values) => {
        if (revokesAccess) {
            setPendingValues(values);

            return;
        }

        await save(values);
    });


    return (
        <>
            <Dialog.Root open={employee !== null} onOpenChange={onOpenChange}>
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
                                    Edit team member
                                </Dialog.Title>
                                <Dialog.Description className="text-sm text-muted-foreground">
                                    Update {employee?.name ?? 'this employee'}&apos;s role, department and
                                    pay details.
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
                                {/* Photo — uploads to POST /employees/{id}/photo */}
                                <div className="flex items-center gap-4">
                                    <Avatar className="size-16">
                                        {employee?.avatarUrl ? (
                                            <AvatarImage src={employee.avatarUrl} alt={employee.name} />
                                        ) : null}
                                        <AvatarFallback className="text-lg">
                                            {getInitials(employee?.name ?? '')}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="space-y-1">
                                        <button
                                            type="button"
                                            onClick={() => photoInputRef.current?.click()}
                                            disabled={uploadPhoto.isPending}
                                            className={cn(
                                                'inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors',
                                                'hover:bg-secondary hover:text-secondary-foreground',
                                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                                'disabled:cursor-not-allowed disabled:opacity-60',
                                            )}
                                        >
                                            {uploadPhoto.isPending ? (
                                                <LoadingSpinner className="size-4" label="Uploading" />
                                            ) : (
                                                <Camera className="size-4" aria-hidden="true" />
                                            )}
                                            {uploadPhoto.isPending ? 'Uploading...' : 'Change photo'}
                                        </button>
                                        <p className="text-xs text-muted-foreground">
                                            JPG, PNG or WebP under 2 MB.
                                        </p>
                                        <input
                                            ref={photoInputRef}
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            className="sr-only"
                                            onChange={(event) => {
                                                void handlePhotoChange(event);
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Name */}
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <label
                                            htmlFor="edit-firstName"
                                            className="block text-sm font-medium text-foreground"
                                        >
                                            First name
                                        </label>
                                        <input
                                            id="edit-firstName"
                                            type="text"
                                            autoComplete="given-name"
                                            aria-invalid={Boolean(errors.firstName)}
                                            className={fieldClasses}
                                            {...register('firstName')}
                                        />
                                        {errors.firstName && (
                                            <p className="text-sm text-danger">{errors.firstName.message}</p>
                                        )}
                                    </div>
                                    <div className="space-y-1.5">
                                        <label
                                            htmlFor="edit-lastName"
                                            className="block text-sm font-medium text-foreground"
                                        >
                                            Last name
                                        </label>
                                        <input
                                            id="edit-lastName"
                                            type="text"
                                            autoComplete="family-name"
                                            aria-invalid={Boolean(errors.lastName)}
                                            className={fieldClasses}
                                            {...register('lastName')}
                                        />
                                        {errors.lastName && (
                                            <p className="text-sm text-danger">{errors.lastName.message}</p>
                                        )}
                                    </div>
                                </div>

                                {/*
                              * Email is deliberately read-only here: it is the login
                              * identity, so it is changed through the invite dialog
                              * where the person is re-notified of the new address.
                              */}
                                <div className="space-y-1.5">
                                    <span className="block text-sm font-medium text-foreground">
                                        Work email
                                    </span>
                                    <p className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                                        {employee?.email || 'No login account yet'}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        Change the email from the row menu&apos;s “Send invite” action.
                                    </p>
                                </div>

                                {/* Phone — read-only: it lives on the linked user record and
                                is only settable via the invite payload. */}
                                <div className="space-y-1.5">
                                    <span className="block text-sm font-medium text-foreground">
                                        Phone
                                    </span>
                                    <p className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                                        {employee?.phone || 'Not recorded'}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        Phone is tied to the login account; update it when sending an
                                        invite.
                                    </p>
                                </div>

                                {/* Staff number */}
                                <div className="space-y-1.5">
                                    <label
                                        htmlFor="edit-employeeNumber"
                                        className="block text-sm font-medium text-foreground"
                                    >
                                        Staff number <span className="font-normal text-muted-foreground">(optional)</span>
                                    </label>
                                    <input
                                        id="edit-employeeNumber"
                                        type="text"
                                        autoComplete="off"
                                        placeholder="e.g. EMP-1024"
                                        aria-invalid={Boolean(errors.employeeNumber)}
                                        className={fieldClasses}
                                        {...register('employeeNumber')}
                                    />
                                    {errors.employeeNumber && (
                                        <p className="text-sm text-danger">{errors.employeeNumber.message}</p>
                                    )}
                                </div>

                                {/* Department */}
                                <div className="space-y-1.5">
                                    <label
                                        htmlFor="edit-departmentId"
                                        className="block text-sm font-medium text-foreground"
                                    >
                                        Department
                                    </label>
                                    <select
                                        id="edit-departmentId"
                                        disabled={isLoadingDepartments}
                                        className={fieldClasses}
                                        {...register('departmentId', {
                                            // A position from a previous department must not stay selected.
                                            onChange: () => setValue('positionId', ''),
                                        })}
                                    >
                                        <option value="">
                                            {isLoadingDepartments ? 'Loading departments...' : 'Unassigned'}
                                        </option>
                                        {departmentOptions.map((option) => (
                                            <option key={option.id} value={option.id}>
                                                {option.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Position */}
                                <div className="space-y-1.5">
                                    <label
                                        htmlFor="edit-positionId"
                                        className="block text-sm font-medium text-foreground"
                                    >
                                        Position
                                    </label>
                                    <select
                                        id="edit-positionId"
                                        disabled={!selectedDepartmentId || isLoadingPositions}
                                        className={fieldClasses}
                                        {...register('positionId')}
                                    >
                                        <option value="">
                                            {!selectedDepartmentId
                                                ? 'Select a department first'
                                                : isLoadingPositions
                                                    ? 'Loading positions...'
                                                    : 'Unassigned'}
                                        </option>
                                        {positionOptions.map((option) => (
                                            <option key={option.id} value={option.id}>
                                                {option.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Branch */}
                                <div className="space-y-1.5">
                                    <label
                                        htmlFor="edit-branchId"
                                        className="block text-sm font-medium text-foreground"
                                    >
                                        Branch
                                    </label>
                                    <select
                                        id="edit-branchId"
                                        disabled={isLoadingBranches}
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
                                </div>

                                {/* Personal details */}
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <label
                                            htmlFor="edit-dob"
                                            className="block text-sm font-medium text-foreground"
                                        >
                                            Date of birth <span className="font-normal text-muted-foreground">(optional)</span>
                                        </label>
                                        <input
                                            id="edit-dob"
                                            type="date"
                                            max={new Date().toISOString().slice(0, 10)}
                                            aria-invalid={Boolean(errors.dob)}
                                            className={fieldClasses}
                                            {...register('dob')}
                                        />
                                        {errors.dob && (
                                            <p className="text-sm text-danger">{errors.dob.message}</p>
                                        )}
                                    </div>
                                    <div className="space-y-1.5">
                                        <label
                                            htmlFor="edit-gender"
                                            className="block text-sm font-medium text-foreground"
                                        >
                                            Gender
                                        </label>
                                        <select
                                            id="edit-gender"
                                            className={fieldClasses}
                                            {...register('gender')}
                                        >
                                            {GENDERS.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label
                                        htmlFor="edit-address"
                                        className="block text-sm font-medium text-foreground"
                                    >
                                        Address <span className="font-normal text-muted-foreground">(optional)</span>
                                    </label>
                                    <textarea
                                        id="edit-address"
                                        rows={2}
                                        autoComplete="street-address"
                                        placeholder="e.g. 12 Harbour St, Sydney NSW 2000"
                                        aria-invalid={Boolean(errors.address)}
                                        className={cn(fieldClasses, 'h-auto min-h-16 resize-y py-2')}
                                        {...register('address')}
                                    />
                                    {errors.address && (
                                        <p className="text-sm text-danger">{errors.address.message}</p>
                                    )}
                                </div>

                                {/* Emergency contact */}
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <label
                                            htmlFor="edit-emergencyContact"
                                            className="block text-sm font-medium text-foreground"
                                        >
                                            Emergency contact <span className="font-normal text-muted-foreground">(optional)</span>
                                        </label>
                                        <input
                                            id="edit-emergencyContact"
                                            type="text"
                                            autoComplete="off"
                                            placeholder="e.g. Jordan Bennett"
                                            aria-invalid={Boolean(errors.emergencyContact)}
                                            className={fieldClasses}
                                            {...register('emergencyContact')}
                                        />
                                        {errors.emergencyContact && (
                                            <p className="text-sm text-danger">{errors.emergencyContact.message}</p>
                                        )}
                                    </div>
                                    <div className="space-y-1.5">
                                        <label
                                            htmlFor="edit-emergencyPhone"
                                            className="block text-sm font-medium text-foreground"
                                        >
                                            Emergency phone <span className="font-normal text-muted-foreground">(optional)</span>
                                        </label>
                                        <input
                                            id="edit-emergencyPhone"
                                            type="tel"
                                            autoComplete="off"
                                            placeholder="e.g. 0412 345 678"
                                            aria-invalid={Boolean(errors.emergencyPhone)}
                                            className={fieldClasses}
                                            {...register('emergencyPhone')}
                                        />
                                        {errors.emergencyPhone && (
                                            <p className="text-sm text-danger">{errors.emergencyPhone.message}</p>
                                        )}
                                    </div>
                                </div>

                                {/* Employment dates */}
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <label
                                            htmlFor="edit-hireDate"
                                            className="block text-sm font-medium text-foreground"
                                        >
                                            Hire date <span className="font-normal text-muted-foreground">(optional)</span>
                                        </label>
                                        <input
                                            id="edit-hireDate"
                                            type="date"
                                            aria-invalid={Boolean(errors.hireDate)}
                                            className={fieldClasses}
                                            {...register('hireDate')}
                                        />
                                        {errors.hireDate && (
                                            <p className="text-sm text-danger">{errors.hireDate.message}</p>
                                        )}
                                    </div>
                                    <div className="space-y-1.5">
                                        <label
                                            htmlFor="edit-terminationDate"
                                            className="block text-sm font-medium text-foreground"
                                        >
                                            Termination date <span className="font-normal text-muted-foreground">(optional)</span>
                                        </label>
                                        <input
                                            id="edit-terminationDate"
                                            type="date"
                                            aria-invalid={Boolean(errors.terminationDate)}
                                            className={fieldClasses}
                                            {...register('terminationDate')}
                                        />
                                        {errors.terminationDate && (
                                            <p className="text-sm text-danger">{errors.terminationDate.message}</p>
                                        )}
                                    </div>
                                </div>

                                {/* Employment type + hourly rate */}
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="space-y-1.5">
                                        <label
                                            htmlFor="edit-employmentType"
                                            className="block text-sm font-medium text-foreground"
                                        >
                                            Employment type
                                        </label>
                                        <select
                                            id="edit-employmentType"
                                            className={fieldClasses}
                                            {...register('employmentType')}
                                        >
                                            {EMPLOYMENT_TYPES.map((option) => (
                                                <option key={option} value={option}>
                                                    {EMPLOYMENT_TYPE_LABELS[option]}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label
                                            htmlFor="edit-hourlyRate"
                                            className="block text-sm font-medium text-foreground"
                                        >
                                            Hourly rate{' '}
                                            <span className="font-normal text-muted-foreground">(AUD)</span>
                                        </label>
                                        <input
                                            id="edit-hourlyRate"
                                            type="number"
                                            inputMode="decimal"
                                            min="0"
                                            step="0.01"
                                            placeholder="e.g. 32.50"
                                            aria-invalid={Boolean(errors.hourlyRate)}
                                            className={fieldClasses}
                                            {...register('hourlyRate')}
                                        />
                                        {errors.hourlyRate && (
                                            <p className="text-sm text-danger">{errors.hourlyRate.message}</p>
                                        )}
                                    </div>
                                </div>

                                {/* Status */}
                                <div className="space-y-1.5">
                                    <label
                                        htmlFor="edit-status"
                                        className="block text-sm font-medium text-foreground"
                                    >
                                        Employment status
                                    </label>
                                    <select id="edit-status" className={fieldClasses} {...register('status')}>
                                        {EMPLOYEE_STATUSES.map((option) => (
                                            <option key={option} value={option}>
                                                {EMPLOYEE_STATUS_LABELS[option]}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-sm text-muted-foreground">
                                        Inactive employees stay in your records but cannot be rostered.
                                    </p>

                                    {/* Warn up front, not only in the confirm step. */}
                                    {revokesAccess && (
                                        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3">
                                            <ShieldOff
                                                aria-hidden="true"
                                                className="mt-0.5 size-4 shrink-0 text-warning"
                                            />
                                            <p className="text-sm text-foreground">
                                                This also revokes their access — they will be signed out of
                                                the web and mobile apps, and cannot sign in again until you
                                                set them back to Active.
                                            </p>
                                        </div>
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
                                            Saving...
                                        </>
                                    ) : (
                                        'Save changes'
                                    )}
                                </button>
                            </div>
                        </form>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>

            {/*
          * Revoking access is destructive, so it is confirmed separately. The
          * pending values are replayed on confirm, so nothing the admin typed is
          * lost if they back out.
          */}
            <AlertDialog
                open={pendingValues !== null}
                onOpenChange={(open) => {
                    if (!open) setPendingValues(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Revoke {employee?.name ?? 'this employee'}&apos;s access?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Setting them to{' '}
                            {pendingValues ? EMPLOYEE_STATUS_LABELS[pendingValues.status] : 'inactive'}{' '}
                            signs them out of every device immediately, cancels any pending invitation
                            or password reset, and stops all shift notifications. Their records and
                            history are kept, and you can restore access by setting them back to Active.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            className={cn(
                                'inline-flex h-11 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors',
                                'hover:bg-secondary hover:text-secondary-foreground',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            )}
                        >
                            Keep access
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                const values = pendingValues;
                                setPendingValues(null);

                                if (values) void save(values);
                            }}
                            className={cn(
                                'inline-flex h-11 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground shadow-sm transition-colors',
                                'hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                            )}
                        >
                            Revoke access
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}


