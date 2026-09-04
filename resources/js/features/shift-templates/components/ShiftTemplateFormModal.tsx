import { zodResolver } from '@hookform/resolvers/zod';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, X } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { useBranchOptions } from '@/features/branches/hooks/useBranches';
import { useDepartmentOptions } from '@/features/departments/hooks/useDepartments';
import { usePositionOptions } from '@/features/positions/hooks/usePositions';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
    BREAK_MINUTE_PRESETS,
    DEFAULT_SHIFT_TEMPLATE_COLOR,
    SHIFT_TEMPLATE_COLOR_OPTIONS,
    SHIFT_TEMPLATE_STATUS_LABELS,
    SHIFT_TEMPLATE_STATUSES,
    type ShiftTemplate,
} from '@/types/shift-template';

import { useCreateShiftTemplate, useUpdateShiftTemplate } from '../hooks/useShiftTemplates';
import { shiftTemplateFormSchema, type ShiftTemplateFormInput, type ShiftTemplateFormValues } from '../schemas';
import { ShiftTemplatePreview } from './ShiftTemplatePreview';

interface ShiftTemplateFormModalProps {
    /** Controls drawer visibility. */
    open: boolean;
    /** Notifies the parent to change `open`. */
    onOpenChange: (open: boolean) => void;
    /** When provided, the drawer edits this template; otherwise it creates one. */
    template?: ShiftTemplate | null;
    /** When provided, pre-fills a new template from an existing one (duplicate). */
    duplicateFrom?: ShiftTemplate | null;
}

/** Shared field styling (mirrors the app's form controls). */
const fieldClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);

/** Sensible defaults for a brand-new shift template. */
const EMPTY_DEFAULTS: ShiftTemplateFormInput = {
    name: '',
    description: '',
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: '30',
    isPaidBreak: false,
    defaultPositionId: '',
    branchId: '',
    departmentId: '',
    color: DEFAULT_SHIFT_TEMPLATE_COLOR,
    status: 'active',
};

/** Builds RHF default values from an existing template (edit/duplicate mode). */
function toDefaults(
    template: ShiftTemplate | null | undefined,
    duplicateFrom: ShiftTemplate | null | undefined,
): ShiftTemplateFormInput {
    const source = template ?? duplicateFrom;

    if (!source) {
        return EMPTY_DEFAULTS;
    }

    return {
        name: template ? source.name : `${source.name} (copy)`,
        description: source.description ?? '',
        startTime: source.startTime,
        endTime: source.endTime,
        breakMinutes: String(source.breakMinutes),
        isPaidBreak: source.isPaidBreak,
        defaultPositionId: source.positionId !== null ? String(source.positionId) : '',
        branchId: source.branchId !== null ? String(source.branchId) : '',
        departmentId: source.departmentId !== null ? String(source.departmentId) : '',
        color: source.color ?? DEFAULT_SHIFT_TEMPLATE_COLOR,
        status: 'active',
    };
}

/**
 * Slide-over drawer housing the create / edit / duplicate shift-template form.
 *
 * Owns only form state; all persistence flows through the reusable
 * `useCreateShiftTemplate` / `useUpdateShiftTemplate` mutations. Validation is
 * driven by the shared Zod schema so inline errors and rules stay consistent
 * with the backend contract (name required; `HH:mm` times; break 0–1440; hex
 * colour; status active/inactive). The live {@link ShiftTemplatePreview} renders
 * the derived duration/break/payable metrics without inventing a `duration`
 * field the backend does not have.
 */
export function ShiftTemplateFormModal({
    open,
    onOpenChange,
    template,
    duplicateFrom,
}: ShiftTemplateFormModalProps): JSX.Element {
    const isEdit = Boolean(template);
    const isDuplicate = Boolean(duplicateFrom) && !template;
    const createTemplate = useCreateShiftTemplate();
    const updateTemplate = useUpdateShiftTemplate();
    // Real branches / departments / positions for this company; never hardcoded.
    const branchOptions = useBranchOptions();
    const departmentOptions = useDepartmentOptions();
    const positionOptions = usePositionOptions();

    const {
        register,
        control,
        handleSubmit,
        reset,
        watch,
        setValue,
        formState: { errors, isSubmitting },
    } = useForm<ShiftTemplateFormInput, unknown, ShiftTemplateFormValues>({
        resolver: zodResolver(shiftTemplateFormSchema),
        defaultValues: EMPTY_DEFAULTS,
    });

    const values = watch();

    // Re-seed the form whenever the drawer opens or the target changes.
    useEffect(() => {
        if (open) {
            reset(toDefaults(template, duplicateFrom));
        }
    }, [open, template, duplicateFrom, reset]);

    const submit = handleSubmit(async (formValues) => {
        try {
            if (isEdit && template) {
                const saved = await updateTemplate.mutateAsync({
                    id: template.id,
                    values: formValues,
                });
                toast.success('Shift template updated', {
                    description: `${saved.name} has been updated.`,
                });
            } else {
                const saved = await createTemplate.mutateAsync(formValues);
                toast.success('Shift template created', {
                    description: `${saved.name} is ready to reuse.`,
                });
            }
            onOpenChange(false);
        } catch (error) {
            toast.error(isEdit ? 'Unable to update template' : 'Unable to create template', {
                description: getApiErrorMessage(error, 'Please review the form and try again.'),
            });
        }
    });

    const title = isEdit ? 'Edit shift template' : isDuplicate ? 'Duplicate shift template' : 'Create shift template';
    const descriptionText = isEdit
        ? 'Update this reusable shift template.'
        : isDuplicate
            ? 'Pre-fill a new template from an existing one.'
            : 'Define a reusable shift that can be dropped into any roster.';

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
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
                                {title}
                            </Dialog.Title>
                            <Dialog.Description className="text-sm text-muted-foreground">
                                {descriptionText}
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
                            {/* Live timing preview */}
                            <ShiftTemplatePreview
                                startTime={values.startTime || ''}
                                endTime={values.endTime || ''}
                                breakMinutes={Number(values.breakMinutes) || 0}
                                isPaidBreak={values.isPaidBreak}
                                color={values.color}
                            />

                            {/* Name (required) */}
                            <div className="space-y-1.5">
                                <label htmlFor="template-name" className="block text-sm font-medium text-foreground">
                                    Template name <span className="text-danger">*</span>
                                </label>
                                <input
                                    id="template-name"
                                    type="text"
                                    placeholder="e.g. Morning Open"
                                    aria-invalid={Boolean(errors.name)}
                                    className={fieldClasses}
                                    {...register('name')}
                                />
                                {errors.name && <p className="text-sm text-danger">{errors.name.message}</p>}
                            </div>

                            {/* Description */}
                            <div className="space-y-1.5">
                                <label
                                    htmlFor="template-description"
                                    className="block text-sm font-medium text-foreground"
                                >
                                    Description
                                </label>
                                <textarea
                                    id="template-description"
                                    rows={3}
                                    placeholder="Optional notes about this shift pattern"
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

                            {/* Times */}
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <label
                                        htmlFor="template-start"
                                        className="block text-sm font-medium text-foreground"
                                    >
                                        Start time <span className="text-danger">*</span>
                                    </label>
                                    <input
                                        id="template-start"
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
                                    <label
                                        htmlFor="template-end"
                                        className="block text-sm font-medium text-foreground"
                                    >
                                        End time <span className="text-danger">*</span>
                                    </label>
                                    <input
                                        id="template-end"
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
                                    <label
                                        htmlFor="template-break"
                                        className="block text-sm font-medium text-foreground"
                                    >
                                        Break (minutes)
                                    </label>
                                    <input
                                        id="template-break"
                                        type="number"
                                        inputMode="numeric"
                                        min={0}
                                        max={1440}
                                        step={5}
                                        placeholder="e.g. 30"
                                        aria-invalid={Boolean(errors.breakMinutes)}
                                        className={fieldClasses}
                                        {...register('breakMinutes')}
                                    />
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                        {BREAK_MINUTE_PRESETS.map((preset) => (
                                            <button
                                                key={preset}
                                                type="button"
                                                onClick={() => setValue('breakMinutes', String(preset))}
                                                aria-pressed={values.breakMinutes === String(preset)}
                                                className={cn(
                                                    'rounded-full border border-input px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors',
                                                    'hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                                    values.breakMinutes === String(preset) &&
                                                    'border-primary bg-primary/10 text-primary',
                                                )}
                                            >
                                                {preset === 0 ? 'None' : `${preset}m`}
                                            </button>
                                        ))}
                                    </div>
                                    {errors.breakMinutes ? (
                                        <p className="text-sm text-danger">{errors.breakMinutes.message}</p>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">
                                            Unpaid break length; must be shorter than the shift.
                                        </p>
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
                                    <p className="text-xs text-muted-foreground">
                                        Paid breaks are not deducted from payable hours.
                                    </p>
                                </div>
                            </div>

                            {/* Scope: branch / department / default position */}
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                <div className="space-y-1.5">
                                    <label
                                        htmlFor="template-branch"
                                        className="block text-sm font-medium text-foreground"
                                    >
                                        Branch
                                    </label>
                                    <select
                                        id="template-branch"
                                        disabled={branchOptions.isLoading}
                                        aria-invalid={Boolean(errors.branchId)}
                                        className={fieldClasses}
                                        {...register('branchId')}
                                    >
                                        <option value="">
                                            {branchOptions.isLoading ? 'Loading branches…' : 'All branches'}
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
                                        htmlFor="template-department"
                                        className="block text-sm font-medium text-foreground"
                                    >
                                        Department
                                    </label>
                                    <select
                                        id="template-department"
                                        disabled={departmentOptions.isLoading}
                                        aria-invalid={Boolean(errors.departmentId)}
                                        className={fieldClasses}
                                        {...register('departmentId')}
                                    >
                                        <option value="">
                                            {departmentOptions.isLoading
                                                ? 'Loading departments…'
                                                : 'All departments'}
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
                                    <label
                                        htmlFor="template-position"
                                        className="block text-sm font-medium text-foreground"
                                    >
                                        Default role
                                    </label>
                                    <select
                                        id="template-position"
                                        disabled={positionOptions.isLoading}
                                        aria-invalid={Boolean(errors.defaultPositionId)}
                                        className={fieldClasses}
                                        {...register('defaultPositionId')}
                                    >
                                        <option value="">
                                            {positionOptions.isLoading ? 'Loading roles…' : 'No default role'}
                                        </option>
                                        {(positionOptions.data ?? []).map((option) => (
                                            <option key={option.id} value={option.id}>
                                                {option.name}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.defaultPositionId ? (
                                        <p className="text-sm text-danger">
                                            {errors.defaultPositionId.message}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">
                                            Role filled by shifts built from this template.
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Colour picker */}
                            <div className="space-y-1.5">
                                <span className="block text-sm font-medium text-foreground">Colour</span>
                                <p className="text-xs text-muted-foreground">
                                    Used to tint this template on the roster calendar.
                                </p>
                                <Controller
                                    control={control}
                                    name="color"
                                    render={({ field }) => (
                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {SHIFT_TEMPLATE_COLOR_OPTIONS.map((swatch) => {
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
                                {errors.color && <p className="text-sm text-danger">{errors.color.message}</p>}
                            </div>

                            {/* Status */}
                            <div className="space-y-1.5">
                                <label
                                    htmlFor="template-status"
                                    className="block text-sm font-medium text-foreground"
                                >
                                    Status
                                </label>
                                <select
                                    id="template-status"
                                    aria-invalid={Boolean(errors.status)}
                                    className={fieldClasses}
                                    {...register('status')}
                                >
                                    {SHIFT_TEMPLATE_STATUSES.map((option) => (
                                        <option key={option} value={option}>
                                            {SHIFT_TEMPLATE_STATUS_LABELS[option]}
                                        </option>
                                    ))}
                                </select>
                                {errors.status && <p className="text-sm text-danger">{errors.status.message}</p>}
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
                                    'Create template'
                                )}
                            </button>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
