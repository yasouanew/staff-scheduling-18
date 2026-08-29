import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, DollarSign, Save, RotateCcw } from 'lucide-react';
import { useEffect } from 'react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { cn } from '@/lib/utils';
import {
    AUSTRALIAN_STATE_LABELS,
    AUSTRALIAN_STATES,
    AUSTRALIAN_TIMEZONE_LABELS,
    AUSTRALIAN_TIMEZONES,
    type AustralianState,
    type AustralianTimezone,
    type BranchConfiguration,
    type BranchFormValues,
} from '@/types/settings';

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

/** Multiplier field validator shared across all four penalty rates. */
const multiplierSchema = z
    .number({ error: 'Enter a valid multiplier.' })
    .min(0.5, 'Multiplier must be at least 0.50.')
    .max(5, 'Multiplier must be 5.00 or less.');

const branchFormSchema = z.object({
    name: z.string().trim().min(2, 'Branch name must be at least 2 characters.'),
    state: z.enum(AUSTRALIAN_STATES, { message: 'Select an Australian state or territory.' }),
    timezone: z.enum(AUSTRALIAN_TIMEZONES, { message: 'Select a timezone.' }),
    baseHourlyRate: z
        .number({ error: 'Enter a valid hourly rate.' })
        .min(0.01, 'Rate must be greater than zero.')
        .max(999.99, 'Rate must be less than $1,000.'),
    weekdayMultiplier: multiplierSchema,
    saturdayMultiplier: multiplierSchema,
    sundayMultiplier: multiplierSchema,
    publicHolidayMultiplier: multiplierSchema,
});

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BranchFormProps {
    /** When provided, the form renders in edit mode, pre-filling all fields. */
    defaultValues?: BranchConfiguration;
    /**
     * Called with validated data on submit. Returning a promise will keep the
     * form in the loading state until it resolves or rejects.
     */
    onSubmit: (values: BranchFormValues) => Promise<void>;
    /** Fired when the user presses Cancel. */
    onCancel?: () => void;
    /** Notifies the parent whenever the form's dirty state changes. */
    onDirtyChange?: (isDirty: boolean) => void;
    /** Additional container class names. */
    className?: string;
}

// ---------------------------------------------------------------------------
// Shared Tailwind compositions
// ---------------------------------------------------------------------------

const fieldClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);

const labelClasses = 'block text-sm font-medium text-foreground';
const errorClasses = 'flex items-center gap-1.5 text-sm text-danger';

// ---------------------------------------------------------------------------
// Helper: default form values (create mode)
// ---------------------------------------------------------------------------

const EMPTY_DEFAULTS: BranchFormValues = {
    name: '',
    state: 'NSW',
    timezone: 'AEST',
    baseHourlyRate: 25.0,
    weekdayMultiplier: 1.0,
    saturdayMultiplier: 1.25,
    sundayMultiplier: 1.5,
    publicHolidayMultiplier: 2.25,
};

/** Converts a persisted {@link BranchConfiguration} back into form values. */
function configToFormValues(config: BranchConfiguration): BranchFormValues {
    return {
        name: config.name,
        state: config.state,
        timezone: config.timezone,
        baseHourlyRate: config.baseHourlyRate,
        weekdayMultiplier: config.rateMultipliers.weekday,
        saturdayMultiplier: config.rateMultipliers.saturday,
        sundayMultiplier: config.rateMultipliers.sunday,
        publicHolidayMultiplier: config.rateMultipliers.publicHoliday,
    };
}

// ---------------------------------------------------------------------------
// Multiplier field — shared sub-component
// ---------------------------------------------------------------------------

interface MultiplierFieldProps {
    id: string;
    label: string;
    description: string;
    error?: string;
    disabled: boolean;
    /** Spread of the React Hook Form `register()` return value. */
    field: UseFormRegisterReturn;
}

function MultiplierField({
    id,
    label,
    description,
    error,
    disabled,
    field,
}: MultiplierFieldProps): JSX.Element {
    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className={labelClasses}>
                {label}
                <span className="ml-1 text-xs font-normal text-muted-foreground">({description})</span>
            </label>
            <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                    ×
                </span>
                <input
                    id={id}
                    type="number"
                    step="0.05"
                    min="0.5"
                    max="5"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${id}-error` : undefined}
                    disabled={disabled}
                    className={cn(fieldClasses, 'pl-7')}
                    {...field}
                />
            </div>
            {error && (
                <p id={`${id}-error`} className={errorClasses} role="alert">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                    {error}
                </p>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// BranchForm
// ---------------------------------------------------------------------------

/**
 * Specialised form for creating or editing a branch configuration. Covers the
 * Australian-market fields: State/Territory, regional timezone, base hourly
 * rate in AUD, and all four penalty-rate multipliers.
 *
 * The component is purely presentational — all API calls are handled by the
 * parent via the `onSubmit` prop.
 */
export function BranchForm({
    defaultValues,
    onSubmit,
    onCancel,
    onDirtyChange,
    className,
}: BranchFormProps): JSX.Element {
    const initialValues = defaultValues ? configToFormValues(defaultValues) : EMPTY_DEFAULTS;

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting, isDirty },
    } = useForm<BranchFormValues>({
        resolver: zodResolver(branchFormSchema),
        defaultValues: initialValues,
    });

    // Re-sync form if the parent swaps the defaultValues (e.g. selecting a different branch).
    useEffect(() => {
        if (defaultValues) {
            reset(configToFormValues(defaultValues));
        }
    }, [defaultValues, reset]);

    // Surface dirty state to the parent so it can guard navigation.
    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    const submit = handleSubmit(async (values) => {
        try {
            await onSubmit(values);
            const timestamp = new Intl.DateTimeFormat('en-AU', {
                dateStyle: 'medium',
                timeStyle: 'short',
            }).format(new Date());
            toast.success('Configuration updated successfully.', {
                description: `Saved at ${timestamp}`,
            });
        } catch {
            toast.error('Unable to save branch configuration.', {
                description: 'Something went wrong. Please try again.',
            });
        }
    });

    const handleReset = (): void => {
        reset(initialValues);
    };

    return (
        <form onSubmit={submit} noValidate className={cn('space-y-8', className)}>
            {/* ----------------------------------------------------------------
                Section 1 — Branch Identity
             ---------------------------------------------------------------- */}
            <section aria-labelledby="section-identity">
                <h3
                    id="section-identity"
                    className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground"
                >
                    Branch Identity
                </h3>

                <div className="grid gap-5 sm:grid-cols-2">
                    {/* Branch Name */}
                    <div className="space-y-1.5 sm:col-span-2">
                        <label htmlFor="branch-name" className={labelClasses}>
                            Branch name
                        </label>
                        <input
                            id="branch-name"
                            type="text"
                            placeholder="e.g. Sydney CBD"
                            aria-invalid={Boolean(errors.name)}
                            aria-describedby={errors.name ? 'branch-name-error' : undefined}
                            disabled={isSubmitting}
                            className={fieldClasses}
                            {...register('name')}
                        />
                        {errors.name && (
                            <p id="branch-name-error" className={errorClasses} role="alert">
                                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                                {errors.name.message}
                            </p>
                        )}
                    </div>

                    {/* State / Territory */}
                    <div className="space-y-1.5">
                        <label htmlFor="branch-state" className={labelClasses}>
                            State / Territory
                        </label>
                        <select
                            id="branch-state"
                            aria-invalid={Boolean(errors.state)}
                            aria-describedby={errors.state ? 'branch-state-error' : undefined}
                            disabled={isSubmitting}
                            className={fieldClasses}
                            {...register('state')}
                        >
                            {AUSTRALIAN_STATES.map((code) => (
                                <option key={code} value={code}>
                                    {code} — {AUSTRALIAN_STATE_LABELS[code as AustralianState]}
                                </option>
                            ))}
                        </select>
                        {errors.state && (
                            <p id="branch-state-error" className={errorClasses} role="alert">
                                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                                {errors.state.message}
                            </p>
                        )}
                    </div>

                    {/* Timezone */}
                    <div className="space-y-1.5">
                        <label htmlFor="branch-timezone" className={labelClasses}>
                            Shift timezone
                        </label>
                        <select
                            id="branch-timezone"
                            aria-invalid={Boolean(errors.timezone)}
                            aria-describedby={errors.timezone ? 'branch-timezone-error' : undefined}
                            disabled={isSubmitting}
                            className={fieldClasses}
                            {...register('timezone')}
                        >
                            {AUSTRALIAN_TIMEZONES.map((tz) => (
                                <option key={tz} value={tz}>
                                    {tz} — {AUSTRALIAN_TIMEZONE_LABELS[tz as AustralianTimezone]}
                                </option>
                            ))}
                        </select>
                        {errors.timezone && (
                            <p id="branch-timezone-error" className={errorClasses} role="alert">
                                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                                {errors.timezone.message}
                            </p>
                        )}
                    </div>
                </div>
            </section>

            {/* ----------------------------------------------------------------
                Section 2 — Labour Rate Configuration
             ---------------------------------------------------------------- */}
            <section aria-labelledby="section-rates">
                <h3
                    id="section-rates"
                    className="mb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground"
                >
                    Labour Rate Configuration
                </h3>
                <p className="mb-4 text-sm text-muted-foreground">
                    Multipliers are applied on top of the base hourly rate to calculate shift costs. Set
                    penalty rates in line with your EBA or the relevant Modern Award.
                </p>

                <div className="grid gap-5 sm:grid-cols-2">
                    {/* Base hourly rate */}
                    <div className="space-y-1.5 sm:col-span-2">
                        <label htmlFor="branch-rate" className={labelClasses}>
                            Base hourly rate (AUD)
                        </label>
                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                                <DollarSign className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                            </span>
                            <input
                                id="branch-rate"
                                type="number"
                                step="0.01"
                                min="0.01"
                                max="999.99"
                                placeholder="25.00"
                                aria-invalid={Boolean(errors.baseHourlyRate)}
                                aria-describedby={
                                    errors.baseHourlyRate ? 'branch-rate-error' : undefined
                                }
                                disabled={isSubmitting}
                                className={cn(fieldClasses, 'pl-8')}
                                {...register('baseHourlyRate', { valueAsNumber: true })}
                            />
                        </div>
                        {errors.baseHourlyRate && (
                            <p id="branch-rate-error" className={errorClasses} role="alert">
                                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                                {errors.baseHourlyRate.message}
                            </p>
                        )}
                    </div>

                    <MultiplierField
                        id="multiplier-weekday"
                        label="Weekday multiplier"
                        description="Mon – Fri standard"
                        error={errors.weekdayMultiplier?.message}
                        disabled={isSubmitting}
                        field={register('weekdayMultiplier', { valueAsNumber: true })}
                    />

                    <MultiplierField
                        id="multiplier-saturday"
                        label="Saturday multiplier"
                        description="penalty rate"
                        error={errors.saturdayMultiplier?.message}
                        disabled={isSubmitting}
                        field={register('saturdayMultiplier', { valueAsNumber: true })}
                    />

                    <MultiplierField
                        id="multiplier-sunday"
                        label="Sunday multiplier"
                        description="penalty rate"
                        error={errors.sundayMultiplier?.message}
                        disabled={isSubmitting}
                        field={register('sundayMultiplier', { valueAsNumber: true })}
                    />

                    <MultiplierField
                        id="multiplier-public-holiday"
                        label="Public holiday multiplier"
                        description="penalty rate"
                        error={errors.publicHolidayMultiplier?.message}
                        disabled={isSubmitting}
                        field={register('publicHolidayMultiplier', { valueAsNumber: true })}
                    />
                </div>
            </section>

            {/* ----------------------------------------------------------------
                Footer — Actions
             ---------------------------------------------------------------- */}
            <div className="flex items-center justify-between border-t border-border pt-6">
                <div className="flex items-center gap-2">
                    {isDirty && (
                        <span className="flex items-center gap-1.5 rounded-md bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                            <span
                                className="h-1.5 w-1.5 rounded-full bg-warning"
                                aria-hidden="true"
                            />
                            Unsaved changes
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {onCancel && (
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={isSubmitting}
                            className={cn(
                                'inline-flex h-10 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors',
                                'hover:bg-secondary hover:text-secondary-foreground',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                'disabled:cursor-not-allowed disabled:opacity-60',
                            )}
                        >
                            Cancel
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={handleReset}
                        disabled={isSubmitting || !isDirty}
                        aria-label="Reset form to last saved values"
                        className={cn(
                            'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors',
                            'hover:bg-secondary hover:text-secondary-foreground',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            'disabled:cursor-not-allowed disabled:opacity-60',
                        )}
                    >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        Reset
                    </button>

                    <button
                        type="submit"
                        disabled={isSubmitting || !isDirty}
                        className={cn(
                            'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors',
                            'hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                            'disabled:cursor-not-allowed disabled:opacity-70',
                        )}
                    >
                        {isSubmitting ? (
                            <>
                                <LoadingSpinner className="text-primary-foreground" label="Saving" />
                                Saving…
                            </>
                        ) : (
                            <>
                                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                                Save branch
                            </>
                        )}
                    </button>
                </div>
            </div>
        </form>
    );
}
