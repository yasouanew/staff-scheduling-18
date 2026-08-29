import { zodResolver } from '@hookform/resolvers/zod';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, X } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
    DEFAULT_POSITION_COLOR,
    POSITION_COLOR_OPTIONS,
    POSITION_STATUS_LABELS,
    POSITION_STATUSES,
    type Position,
} from '@/types/position';

import { useDepartmentOptions } from '@/features/departments/hooks/useDepartments';

import { useCreatePosition, useUpdatePosition } from '../hooks/usePositions';

import { positionFormSchema, type PositionFormInput, type PositionFormValues } from '../schemas';

interface PositionFormModalProps {
    /** Controls drawer visibility. */
    open: boolean;
    /** Notifies the parent to change `open`. */
    onOpenChange: (open: boolean) => void;
    /** When provided, the drawer edits this position; otherwise it creates one. */
    position?: Position | null;
    /** Optional callback fired with the saved position on success. */
    onSaved?: (position: Position) => void;
}

/** Shared field styling (mirrors the app's form controls). */
const fieldClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);

/** Sensible defaults for a brand-new position. */
const EMPTY_DEFAULTS: PositionFormInput = {
    name: '',
    departmentId: '',
    code: '',

    description: '',
    payScale: '',
    color: DEFAULT_POSITION_COLOR,
    status: 'active',
};

/** Builds RHF default values from an existing position (edit mode). */
function toDefaults(position: Position | null | undefined): PositionFormInput {
    if (!position) {
        return EMPTY_DEFAULTS;
    }

    return {
        name: position.name,
        departmentId: position.departmentId !== null ? String(position.departmentId) : '',
        code: position.code ?? '',

        description: position.description ?? '',
        payScale: position.defaultHourlyRate !== null ? String(position.defaultHourlyRate) : '',
        color: position.color ?? DEFAULT_POSITION_COLOR,
        status: position.status,
    };
}

/**
 * Slide-over drawer housing the create/edit position form.
 *
 * Owns only form state; all persistence flows through the reusable
 * `useCreatePosition` / `useUpdatePosition` mutations. Validation is driven by
 * the shared Zod schema so inline errors, the required `name`/title field and
 * the numeric pay-scale rule stay consistent with the backend contract. The
 * colour picker writes a 6-digit hex value that satisfies the backend's colour
 * rule.
 */
export function PositionFormModal({
    open,
    onOpenChange,
    position,
    onSaved,
}: PositionFormModalProps): JSX.Element {
    const isEdit = Boolean(position);
    const createPosition = useCreatePosition();
    const updatePosition = useUpdatePosition();
    // Real departments for this company; never a hardcoded list.
    const departmentOptions = useDepartmentOptions();


    const {
        register,
        control,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<PositionFormInput, unknown, PositionFormValues>({
        resolver: zodResolver(positionFormSchema),
        defaultValues: EMPTY_DEFAULTS,
    });

    // Re-seed the form whenever the drawer opens or the target position changes.
    useEffect(() => {
        if (open) {
            reset(toDefaults(position));
        }
    }, [open, position, reset]);

    const submit = handleSubmit(async (values) => {
        try {
            const saved = isEdit
                ? await updatePosition.mutateAsync({ id: position!.id, values })
                : await createPosition.mutateAsync(values);

            toast.success(isEdit ? 'Position updated' : 'Position created', {
                description: `${saved.name} has been ${isEdit ? 'updated' : 'added'} successfully.`,
            });
            onSaved?.(saved);
            onOpenChange(false);
        } catch (error) {
            toast.error(isEdit ? 'Unable to update position' : 'Unable to create position', {
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
                                {isEdit ? 'Edit position' : 'Create position'}
                            </Dialog.Title>
                            <Dialog.Description className="text-sm text-muted-foreground">
                                {isEdit
                                    ? 'Update this job position and its pay scale.'
                                    : 'Add a new job position (role) with an optional pay scale.'}
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
                            {/* Title (required) */}
                            <div className="space-y-1.5">
                                <label htmlFor="name" className="block text-sm font-medium text-foreground">
                                    Position title <span className="text-danger">*</span>
                                </label>
                                <input
                                    id="name"
                                    type="text"
                                    placeholder="e.g. Barista"
                                    aria-invalid={Boolean(errors.name)}
                                    className={fieldClasses}
                                    {...register('name')}
                                />
                                {errors.name && <p className="text-sm text-danger">{errors.name.message}</p>}
                            </div>

                            {/* Department (optional link to a real department) */}
                            <div className="space-y-1.5">
                                <label
                                    htmlFor="departmentId"
                                    className="block text-sm font-medium text-foreground"
                                >
                                    Department
                                </label>
                                <select
                                    id="departmentId"
                                    disabled={departmentOptions.isLoading}
                                    aria-invalid={Boolean(errors.departmentId)}
                                    className={fieldClasses}
                                    {...register('departmentId')}
                                >
                                    <option value="">
                                        {departmentOptions.isLoading
                                            ? 'Loading departments…'
                                            : 'No department (company-wide)'}
                                    </option>
                                    {(departmentOptions.data ?? []).map((option) => (
                                        <option key={option.id} value={option.id}>
                                            {option.name}
                                        </option>
                                    ))}
                                </select>
                                {errors.departmentId ? (
                                    <p className="text-sm text-danger">{errors.departmentId.message}</p>
                                ) : departmentOptions.isError ? (
                                    <p className="text-sm text-danger">
                                        Unable to load departments. You can still save without one.
                                    </p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        Group this position under a department, or leave it company-wide.
                                    </p>
                                )}
                            </div>

                            {/* Code */}
                            <div className="space-y-1.5">
                                <label htmlFor="code" className="block text-sm font-medium text-foreground">
                                    Code
                                </label>

                                <input
                                    id="code"
                                    type="text"
                                    placeholder="e.g. BAR"
                                    aria-invalid={Boolean(errors.code)}
                                    className={fieldClasses}
                                    {...register('code')}
                                />
                                {errors.code && <p className="text-sm text-danger">{errors.code.message}</p>}
                            </div>

                            {/* Pay scale (default hourly rate) */}
                            <div className="space-y-1.5">
                                <label
                                    htmlFor="payScale"
                                    className="block text-sm font-medium text-foreground"
                                >
                                    Pay scale (hourly rate)
                                </label>
                                <div className="relative">
                                    <span
                                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                                        aria-hidden="true"
                                    >
                                        $
                                    </span>
                                    <input
                                        id="payScale"
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        step="0.01"
                                        placeholder="e.g. 28.50"
                                        aria-invalid={Boolean(errors.payScale)}
                                        className={cn(fieldClasses, 'pl-7')}
                                        {...register('payScale')}
                                    />
                                </div>
                                {errors.payScale ? (
                                    <p className="text-sm text-danger">{errors.payScale.message}</p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        Default hourly rate used when scheduling this role.
                                    </p>
                                )}
                            </div>

                            {/* Description */}
                            <div className="space-y-1.5">
                                <label
                                    htmlFor="description"
                                    className="block text-sm font-medium text-foreground"
                                >
                                    Description
                                </label>
                                <textarea
                                    id="description"
                                    rows={3}
                                    placeholder="What does this position do?"
                                    aria-invalid={Boolean(errors.description)}
                                    className={cn(
                                        'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground',
                                        'placeholder:text-muted-foreground transition-colors duration-200',
                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
                                        'disabled:cursor-not-allowed disabled:opacity-60',
                                    )}
                                    {...register('description')}
                                />
                                {errors.description && (
                                    <p className="text-sm text-danger">{errors.description.message}</p>
                                )}
                            </div>

                            {/* Colour picker */}
                            <div className="space-y-1.5">
                                <span className="block text-sm font-medium text-foreground">Colour</span>
                                <p className="text-xs text-muted-foreground">
                                    Used to tint this position on the roster calendar.
                                </p>
                                <Controller
                                    control={control}
                                    name="color"
                                    render={({ field }) => (
                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {POSITION_COLOR_OPTIONS.map((swatch) => {
                                                const selected = field.value === swatch;
                                                return (
                                                    <button
                                                        key={swatch}
                                                        type="button"
                                                        onClick={() => field.onChange(swatch)}
                                                        aria-label={`Select colour ${swatch}`}
                                                        aria-pressed={selected}
                                                        className={cn(
                                                            'flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                                            selected && 'ring-2 ring-ring',
                                                        )}
                                                        style={{ backgroundColor: swatch }}
                                                    >
                                                        {selected && (
                                                            <Check
                                                                className="h-4 w-4 text-white"
                                                                aria-hidden="true"
                                                            />
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                />
                                {errors.color && (
                                    <p className="text-sm text-danger">{errors.color.message}</p>
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
                                    {POSITION_STATUSES.map((option) => (
                                        <option key={option} value={option}>
                                            {POSITION_STATUS_LABELS[option]}
                                        </option>
                                    ))}
                                </select>
                                {errors.status && (
                                    <p className="text-sm text-danger">{errors.status.message}</p>
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
                                        Saving…
                                    </>
                                ) : isEdit ? (
                                    'Save changes'
                                ) : (
                                    'Create position'
                                )}
                            </button>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
