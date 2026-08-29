import * as Dialog from '@radix-ui/react-dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { LoadingSpinner } from '@/Components/common/LoadingSpinner';
import { getApiErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
    AUSTRALIAN_STATES,
    BUSINESS_TYPE_OPTIONS,
    COMPANY_STATUSES,
    COMPANY_STATUS_LABELS,
    COUNTRY_OPTIONS,
    TIMEZONE_LABELS,
    TIMEZONE_OPTIONS,
    type Company,
} from '@/types/company';

import { useCreateCompany, useUpdateCompany } from '../hooks/useCompanies';
import { companyFormSchema, type CompanyFormInput, type CompanyFormValues } from '../schemas';
import { LogoUpload } from './LogoUpload';

interface CompanyFormModalProps {
    /** Controls drawer visibility. */
    open: boolean;
    /** Notifies the parent to change `open`. */
    onOpenChange: (open: boolean) => void;
    /** When provided, the drawer edits this company; otherwise it creates one. */
    company?: Company | null;
    /** Optional callback fired with the saved company on success. */
    onSaved?: (company: Company) => void;
}

/** Shared field styling (mirrors the app's form controls). */
const fieldClasses = cn(
    'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground',
    'placeholder:text-muted-foreground transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
    'disabled:cursor-not-allowed disabled:opacity-60',
);

/** Sensible defaults for a brand-new company. */
const EMPTY_DEFAULTS: CompanyFormInput = {
    name: '',
    abn: '',
    email: '',
    phone: '',
    logo: '',
    timezone: 'Australia/Sydney',
    country: 'Australia',
    state: '',
    businessType: '',
    status: 'active',
};

/** Builds RHF default values from an existing company (edit mode). */
function toDefaults(company: Company | null | undefined): CompanyFormInput {
    if (!company) {
        return EMPTY_DEFAULTS;
    }

    return {
        name: company.name,
        abn: company.abn ?? '',
        email: company.email ?? '',
        phone: company.phone ?? '',
        logo: company.logo ?? '',
        timezone: company.timezone ?? 'Australia/Sydney',
        country: company.country ?? '',
        state: company.state ?? '',
        businessType: company.businessType ?? '',
        status: company.status,
    };
}

/**
 * Slide-over drawer housing the create/edit company form.
 *
 * Owns only form state; all persistence flows through the reusable
 * `useCreateCompany` / `useUpdateCompany` mutations. Validation is driven by the
 * shared Zod schema so inline errors, required fields (name, timezone) and email
 * formatting all stay consistent with the backend contract.
 */
export function CompanyFormModal({
    open,
    onOpenChange,
    company,
    onSaved,
}: CompanyFormModalProps): JSX.Element {
    const isEdit = Boolean(company);
    const createCompany = useCreateCompany();
    const updateCompany = useUpdateCompany();

    const {
        register,
        handleSubmit,
        control,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<CompanyFormInput, unknown, CompanyFormValues>({
        resolver: zodResolver(companyFormSchema),
        defaultValues: EMPTY_DEFAULTS,
    });

    // Re-seed the form whenever the drawer opens or the target company changes.
    useEffect(() => {
        if (open) {
            reset(toDefaults(company));
        }
    }, [open, company, reset]);

    const submit = handleSubmit(async (values) => {
        try {
            const saved = isEdit
                ? await updateCompany.mutateAsync({ id: company!.id, values })
                : await createCompany.mutateAsync(values);

            toast.success(isEdit ? 'Company updated' : 'Company created', {
                description: `${saved.name} has been ${isEdit ? 'updated' : 'added'} successfully.`,
            });
            onSaved?.(saved);
            onOpenChange(false);
        } catch (error) {
            toast.error(isEdit ? 'Unable to update company' : 'Unable to create company', {
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
                                {isEdit ? 'Edit company' : 'Create company'}
                            </Dialog.Title>
                            <Dialog.Description className="text-sm text-muted-foreground">
                                {isEdit
                                    ? 'Update the organisation profile and status.'
                                    : 'Add a new organisation to the platform.'}
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
                            {/* Logo */}
                            <div className="space-y-1.5">
                                <span className="block text-sm font-medium text-foreground">
                                    Company logo
                                </span>
                                <Controller
                                    control={control}
                                    name="logo"
                                    render={({ field }) => (
                                        <LogoUpload
                                            value={field.value}
                                            onChange={(next) => field.onChange(next ?? '')}
                                            error={errors.logo?.message}
                                            disabled={isSubmitting}
                                        />
                                    )}
                                />
                            </div>

                            {/* Name (required) */}
                            <div className="space-y-1.5">
                                <label htmlFor="name" className="block text-sm font-medium text-foreground">
                                    Company name <span className="text-danger">*</span>
                                </label>
                                <input
                                    id="name"
                                    type="text"
                                    placeholder="e.g. Coastal Care Group"
                                    aria-invalid={Boolean(errors.name)}
                                    className={fieldClasses}
                                    {...register('name')}
                                />
                                {errors.name && <p className="text-sm text-danger">{errors.name.message}</p>}
                            </div>

                            {/* ABN + Business type */}
                            <div className="grid gap-5 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <label htmlFor="abn" className="block text-sm font-medium text-foreground">
                                        ABN
                                    </label>
                                    <input
                                        id="abn"
                                        type="text"
                                        inputMode="numeric"
                                        placeholder="e.g. 51 824 753 556"
                                        aria-invalid={Boolean(errors.abn)}
                                        className={fieldClasses}
                                        {...register('abn')}
                                    />
                                    {errors.abn && <p className="text-sm text-danger">{errors.abn.message}</p>}
                                </div>

                                <div className="space-y-1.5">
                                    <label
                                        htmlFor="businessType"
                                        className="block text-sm font-medium text-foreground"
                                    >
                                        Business type
                                    </label>
                                    <select
                                        id="businessType"
                                        aria-invalid={Boolean(errors.businessType)}
                                        className={fieldClasses}
                                        {...register('businessType')}
                                    >
                                        <option value="">Select…</option>
                                        {BUSINESS_TYPE_OPTIONS.map((option) => (
                                            <option key={option} value={option}>
                                                {option}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.businessType && (
                                        <p className="text-sm text-danger">{errors.businessType.message}</p>
                                    )}
                                </div>
                            </div>

                            {/* Email + Phone */}
                            <div className="grid gap-5 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <label htmlFor="email" className="block text-sm font-medium text-foreground">
                                        Email
                                    </label>
                                    <input
                                        id="email"
                                        type="email"
                                        autoComplete="email"
                                        placeholder="admin@company.com.au"
                                        aria-invalid={Boolean(errors.email)}
                                        className={fieldClasses}
                                        {...register('email')}
                                    />
                                    {errors.email && (
                                        <p className="text-sm text-danger">{errors.email.message}</p>
                                    )}
                                </div>

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
                                    {errors.phone && (
                                        <p className="text-sm text-danger">{errors.phone.message}</p>
                                    )}
                                </div>
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

                            {/* Country + State */}
                            <div className="grid gap-5 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <label htmlFor="country" className="block text-sm font-medium text-foreground">
                                        Country
                                    </label>
                                    <select
                                        id="country"
                                        aria-invalid={Boolean(errors.country)}
                                        className={fieldClasses}
                                        {...register('country')}
                                    >
                                        <option value="">Select…</option>
                                        {COUNTRY_OPTIONS.map((option) => (
                                            <option key={option} value={option}>
                                                {option}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.country && (
                                        <p className="text-sm text-danger">{errors.country.message}</p>
                                    )}
                                </div>

                                <div className="space-y-1.5">
                                    <label htmlFor="state" className="block text-sm font-medium text-foreground">
                                        State / Territory
                                    </label>
                                    <select
                                        id="state"
                                        aria-invalid={Boolean(errors.state)}
                                        className={fieldClasses}
                                        {...register('state')}
                                    >
                                        <option value="">Select…</option>
                                        {AUSTRALIAN_STATES.map((option) => (
                                            <option key={option} value={option}>
                                                {option}
                                            </option>
                                        ))}
                                    </select>
                                    {errors.state && (
                                        <p className="text-sm text-danger">{errors.state.message}</p>
                                    )}
                                </div>
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
                                    {COMPANY_STATUSES.map((option) => (
                                        <option key={option} value={option}>
                                            {COMPANY_STATUS_LABELS[option]}
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
                                    'Create company'
                                )}
                            </button>
                        </div>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
