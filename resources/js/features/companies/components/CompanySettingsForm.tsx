import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { cn } from '@/lib/utils';
import {
    CURRENCY_OPTIONS,
    DATE_FORMAT_OPTIONS,
    LANGUAGE_OPTIONS,
    TIMEZONE_LABELS,
    TIMEZONE_OPTIONS,
    WEEK_START_DAYS,
    type CompanySettings,
} from '@/types/company';

import {
    companySettingsSchema,
    type CompanySettingsFormInput,
    type CompanySettingsFormValues,
} from '../schemas';
import { LogoUpload } from './LogoUpload';

interface CompanySettingsFormProps {
    /** Current persisted settings used to seed the form. */
    settings: CompanySettings;
    /** Persists the validated settings; should resolve on success. */
    onSubmit: (values: CompanySettingsFormValues) => Promise<void>;
    /** Whether a save request is in flight (drives the loading button). */
    isSaving?: boolean;
}

/** Shared field styling (mirrors the app's form controls). */
const fieldClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);

/** Maps persisted settings into the RHF input shape. */
function toDefaults(settings: CompanySettings): CompanySettingsFormInput {
    return {
        timezone: settings.timezone,
        dateFormat: settings.dateFormat,
        timeFormat: settings.timeFormat,
        weekStartDay: settings.weekStartDay,
        defaultShiftDuration: settings.defaultShiftDuration,
        defaultBreakMinutes: settings.defaultBreakMinutes,
        currency: settings.currency,
        language: settings.language,
        allowShiftSwap: settings.allowShiftSwap,
        allowEmployeeAvailability: settings.allowEmployeeAvailability,
        allowLeaveRequests: settings.allowLeaveRequests,
        allowPushNotifications: settings.allowPushNotifications,
        logo: settings.logo ?? '',
        primaryColor: settings.primaryColor ?? '',
        secondaryColor: settings.secondaryColor ?? '',
    };
}

/** A labelled toggle row for a boolean policy setting. */
function ToggleRow({
    id,
    label,
    description,
    checked,
    disabled,
    onChange,
}: {
    id: string;
    label: string;
    description: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (value: boolean) => void;
}): JSX.Element {
    return (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background/40 p-4">
            <div className="min-w-0 space-y-0.5">
                <label htmlFor={id} className="block text-sm font-medium text-foreground">
                    {label}
                </label>
                <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <button
                type="button"
                id={id}
                role="switch"
                aria-checked={checked}
                disabled={disabled}
                onClick={() => onChange(!checked)}
                className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                    checked ? 'bg-primary' : 'bg-muted',
                )}
            >
                <span
                    className={cn(
                        'inline-block h-5 w-5 transform rounded-full bg-card shadow-sm transition-transform',
                        checked ? 'translate-x-5' : 'translate-x-0.5',
                    )}
                    aria-hidden="true"
                />
            </button>
        </div>
    );
}

/** A colour field pairing a native colour picker with a hex text input. */
function ColorField({
    id,
    label,
    value,
    error,
    disabled,
    onChange,
}: {
    id: string;
    label: string;
    value: string;
    error?: string;
    disabled?: boolean;
    onChange: (value: string) => void;
}): JSX.Element {
    // The native colour input needs a valid hex; fall back to a neutral default.
    const swatch = /^#([A-Fa-f0-9]{6})$/.test(value) ? value : '#2563EB';

    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className="block text-sm font-medium text-foreground">
                {label}
            </label>
            <div className="flex items-center gap-2">
                <input
                    type="color"
                    aria-label={`${label} colour picker`}
                    value={swatch}
                    disabled={disabled}
                    onChange={(event) => onChange(event.target.value.toUpperCase())}
                    className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-input bg-background p-1 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <input
                    id={id}
                    type="text"
                    inputMode="text"
                    placeholder="#2563EB"
                    aria-invalid={Boolean(error)}
                    value={value}
                    disabled={disabled}
                    onChange={(event) => onChange(event.target.value)}
                    className={fieldClasses}
                />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
        </div>
    );
}

/** Small section heading + optional supporting copy. */
function SectionHeading({ title, description }: { title: string; description: string }): JSX.Element {
    return (
        <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">{description}</p>
        </div>
    );
}

/**
 * Company operational + localisation settings form.
 *
 * Presentational and self-contained: it seeds React Hook Form from the passed
 * `settings`, validates against the shared Zod schema (inline errors), and calls
 * `onSubmit` with the transformed values. Reset restores the last saved values;
 * the save button is disabled until the form is dirty and shows a spinner while
 * saving. Success feedback (toast) is owned by the parent page.
 */
export function CompanySettingsForm({
    settings,
    onSubmit,
    isSaving = false,
}: CompanySettingsFormProps): JSX.Element {
    const {
        register,
        handleSubmit,
        control,
        reset,
        formState: { errors, isDirty },
    } = useForm<CompanySettingsFormInput, unknown, CompanySettingsFormValues>({
        resolver: zodResolver(companySettingsSchema),
        defaultValues: toDefaults(settings),
    });

    // Re-seed whenever the persisted settings change (e.g. after a save).
    useEffect(() => {
        reset(toDefaults(settings));
    }, [settings, reset]);

    const submit = handleSubmit(async (values) => {
        await onSubmit(values);
    });

    return (
        <form onSubmit={submit} noValidate className="space-y-8">
            {/* Localisation */}
            <section className="space-y-4">
                <SectionHeading
                    title="Localisation"
                    description="Regional formats used across schedules, exports and notifications."
                />
                <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <label
                            htmlFor="settings-timezone"
                            className="block text-sm font-medium text-foreground"
                        >
                            Timezone
                        </label>
                        <select
                            id="settings-timezone"
                            aria-invalid={Boolean(errors.timezone)}
                            className={fieldClasses}
                            disabled={isSaving}
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

                    <div className="space-y-1.5">
                        <label
                            htmlFor="settings-language"
                            className="block text-sm font-medium text-foreground"
                        >
                            Language
                        </label>
                        <select
                            id="settings-language"
                            aria-invalid={Boolean(errors.language)}
                            className={fieldClasses}
                            disabled={isSaving}
                            {...register('language')}
                        >
                            {LANGUAGE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                        {errors.language && (
                            <p className="text-sm text-danger">{errors.language.message}</p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <label
                            htmlFor="settings-dateFormat"
                            className="block text-sm font-medium text-foreground"
                        >
                            Date format
                        </label>
                        <select
                            id="settings-dateFormat"
                            aria-invalid={Boolean(errors.dateFormat)}
                            className={fieldClasses}
                            disabled={isSaving}
                            {...register('dateFormat')}
                        >
                            {DATE_FORMAT_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                        {errors.dateFormat && (
                            <p className="text-sm text-danger">{errors.dateFormat.message}</p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <label
                            htmlFor="settings-timeFormat"
                            className="block text-sm font-medium text-foreground"
                        >
                            Time format
                        </label>
                        <select
                            id="settings-timeFormat"
                            aria-invalid={Boolean(errors.timeFormat)}
                            className={fieldClasses}
                            disabled={isSaving}
                            {...register('timeFormat')}
                        >
                            <option value="24h">24-hour (14:30)</option>
                            <option value="12h">12-hour (2:30 PM)</option>
                        </select>
                        {errors.timeFormat && (
                            <p className="text-sm text-danger">{errors.timeFormat.message}</p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <label
                            htmlFor="settings-weekStartDay"
                            className="block text-sm font-medium text-foreground"
                        >
                            Week starts on
                        </label>
                        <select
                            id="settings-weekStartDay"
                            aria-invalid={Boolean(errors.weekStartDay)}
                            className={fieldClasses}
                            disabled={isSaving}
                            {...register('weekStartDay')}
                        >
                            {WEEK_START_DAYS.map((day) => (
                                <option key={day} value={day}>
                                    {day}
                                </option>
                            ))}
                        </select>
                        {errors.weekStartDay && (
                            <p className="text-sm text-danger">{errors.weekStartDay.message}</p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <label
                            htmlFor="settings-currency"
                            className="block text-sm font-medium text-foreground"
                        >
                            Currency
                        </label>
                        <select
                            id="settings-currency"
                            aria-invalid={Boolean(errors.currency)}
                            className={fieldClasses}
                            disabled={isSaving}
                            {...register('currency')}
                        >
                            {CURRENCY_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                        </select>
                        {errors.currency && (
                            <p className="text-sm text-danger">{errors.currency.message}</p>
                        )}
                    </div>
                </div>
            </section>

            {/* Scheduling defaults */}
            <section className="space-y-4">
                <SectionHeading
                    title="Scheduling defaults"
                    description="Baseline values applied when creating new shifts."
                />
                <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <label
                            htmlFor="settings-shiftDuration"
                            className="block text-sm font-medium text-foreground"
                        >
                            Default shift duration (minutes)
                        </label>
                        <input
                            id="settings-shiftDuration"
                            type="number"
                            min={0}
                            max={1440}
                            step={15}
                            aria-invalid={Boolean(errors.defaultShiftDuration)}
                            className={fieldClasses}
                            disabled={isSaving}
                            {...register('defaultShiftDuration')}
                        />
                        {errors.defaultShiftDuration && (
                            <p className="text-sm text-danger">
                                {errors.defaultShiftDuration.message}
                            </p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <label
                            htmlFor="settings-breakMinutes"
                            className="block text-sm font-medium text-foreground"
                        >
                            Default break (minutes)
                        </label>
                        <input
                            id="settings-breakMinutes"
                            type="number"
                            min={0}
                            max={480}
                            step={5}
                            aria-invalid={Boolean(errors.defaultBreakMinutes)}
                            className={fieldClasses}
                            disabled={isSaving}
                            {...register('defaultBreakMinutes')}
                        />
                        {errors.defaultBreakMinutes && (
                            <p className="text-sm text-danger">
                                {errors.defaultBreakMinutes.message}
                            </p>
                        )}
                    </div>
                </div>
            </section>

            {/* Employee permissions */}
            <section className="space-y-4">
                <SectionHeading
                    title="Employee permissions"
                    description="Control which self-service actions employees can perform."
                />
                <div className="space-y-3">
                    <Controller
                        control={control}
                        name="allowShiftSwap"
                        render={({ field }) => (
                            <ToggleRow
                                id="settings-allowShiftSwap"
                                label="Allow shift swaps"
                                description="Employees can request to swap assigned shifts."
                                checked={field.value}
                                disabled={isSaving}
                                onChange={field.onChange}
                            />
                        )}
                    />
                    <Controller
                        control={control}
                        name="allowEmployeeAvailability"
                        render={({ field }) => (
                            <ToggleRow
                                id="settings-allowEmployeeAvailability"
                                label="Allow availability submissions"
                                description="Employees can set their weekly availability."
                                checked={field.value}
                                disabled={isSaving}
                                onChange={field.onChange}
                            />
                        )}
                    />
                    <Controller
                        control={control}
                        name="allowLeaveRequests"
                        render={({ field }) => (
                            <ToggleRow
                                id="settings-allowLeaveRequests"
                                label="Allow leave requests"
                                description="Employees can submit leave for approval."
                                checked={field.value}
                                disabled={isSaving}
                                onChange={field.onChange}
                            />
                        )}
                    />
                    <Controller
                        control={control}
                        name="allowPushNotifications"
                        render={({ field }) => (
                            <ToggleRow
                                id="settings-allowPushNotifications"
                                label="Push notifications"
                                description="Send push notifications for scheduling events."
                                checked={field.value}
                                disabled={isSaving}
                                onChange={field.onChange}
                            />
                        )}
                    />
                </div>
            </section>

            {/* Branding */}
            <section className="space-y-4">
                <SectionHeading
                    title="Branding"
                    description="Optional logo and brand colours used across employee-facing views."
                />
                <div className="space-y-1.5">
                    <span className="block text-sm font-medium text-foreground">Company logo</span>
                    <Controller
                        control={control}
                        name="logo"
                        render={({ field }) => (
                            <LogoUpload
                                value={field.value ?? ''}
                                onChange={(next) => field.onChange(next ?? '')}
                                error={errors.logo?.message}
                                disabled={isSaving}
                            />
                        )}
                    />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                    <Controller
                        control={control}
                        name="primaryColor"
                        render={({ field }) => (
                            <ColorField
                                id="settings-primaryColor"
                                label="Primary colour"
                                value={field.value ?? ''}
                                error={errors.primaryColor?.message}
                                disabled={isSaving}
                                onChange={field.onChange}
                            />
                        )}
                    />
                    <Controller
                        control={control}
                        name="secondaryColor"
                        render={({ field }) => (
                            <ColorField
                                id="settings-secondaryColor"
                                label="Secondary colour"
                                value={field.value ?? ''}
                                error={errors.secondaryColor?.message}
                                disabled={isSaving}
                                onChange={field.onChange}
                            />
                        )}
                    />
                </div>
            </section>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
                <button
                    type="button"
                    onClick={() => reset(toDefaults(settings))}
                    disabled={isSaving || !isDirty}
                    className={cn(
                        'inline-flex h-11 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors',
                        'hover:bg-secondary hover:text-secondary-foreground',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        'disabled:cursor-not-allowed disabled:opacity-60',
                    )}
                >
                    Reset
                </button>
                <button
                    type="submit"
                    disabled={isSaving || !isDirty}
                    className={cn(
                        'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors',
                        'hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        'disabled:cursor-not-allowed disabled:opacity-70',
                    )}
                >
                    {isSaving ? (
                        <>
                            <LoadingSpinner className="text-primary-foreground" label="Saving" />
                            Saving…
                        </>
                    ) : (
                        'Save settings'
                    )}
                </button>
            </div>
        </form>
    );
}
