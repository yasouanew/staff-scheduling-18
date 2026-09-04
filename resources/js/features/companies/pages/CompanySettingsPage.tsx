import { AlertTriangle, ChevronRight, Settings2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { getApiErrorMessage } from '@/lib/api-client';
import type { Company, CompanySettings } from '@/types/company';

import { CompanySettingsForm } from '../components/CompanySettingsForm';
import type { CompanySettingsFormValues } from '../schemas';
import {
    useCompany,
    useCompanySettings,
    useUpdateCompanySettings,
} from '../hooks/useCompanies';

/** Breadcrumb trail: Companies › {name} › Settings. */
function Breadcrumb({
    id,
    name,
    basePath,
}: {
    id: string;
    name: string;
    basePath: string;
}): JSX.Element {
    return (
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm">
            <Link
                to={basePath}
                className="rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                Companies
            </Link>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Link
                to={`${basePath}/${id}`}
                className="max-w-[12rem] truncate rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                {name}
            </Link>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="font-medium text-foreground" aria-current="page">
                Settings
            </span>
        </nav>
    );
}

/** Full-page skeleton shown while the company + settings load. */
function SettingsSkeleton(): JSX.Element {
    return (
        <div className="space-y-6" aria-hidden="true">
            <div className="h-4 w-56 animate-pulse rounded bg-muted" />
            <div className="h-8 w-48 animate-pulse rounded bg-muted" />
            <div className="space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="h-5 w-40 animate-pulse rounded bg-muted" />
                <div className="grid gap-5 sm:grid-cols-2">
                    {Array.from({ length: 6 }).map((_, index) => (
                        <div key={index} className="space-y-2">
                            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                            <div className="h-11 w-full animate-pulse rounded-lg bg-muted" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** The resolved settings content once both queries have loaded. */
function SettingsContent({
    id,
    company,
    settings,
    basePath,
}: {
    id: string;
    company: Company;
    settings: CompanySettings;
    basePath: string;
}): JSX.Element {
    const updateSettings = useUpdateCompanySettings();

    const handleSubmit = async (values: CompanySettingsFormValues): Promise<void> => {
        try {
            await updateSettings.mutateAsync({ id, values });
            toast.success('Settings saved', {
                description: `${company.name}'s settings have been updated.`,
            });
        } catch (error) {
            toast.error('Unable to save settings', {
                description: getApiErrorMessage(error, 'Please review the form and try again.'),
            });
        }
    };

    return (
        <div className="space-y-6">
            <Breadcrumb id={id} name={company.name} basePath={basePath} />

            <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Settings2 className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="space-y-0.5">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        Company settings
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Localisation, scheduling defaults, permissions and branding for{' '}
                        {company.name}.
                    </p>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <CompanySettingsForm
                    settings={settings}
                    onSubmit={handleSubmit}
                    isSaving={updateSettings.isPending}
                />
            </div>
        </div>
    );
}

/**
 * Company settings page (`/companies/:id/settings`).
 *
 * Loads the company (for the header/breadcrumb) and its operational settings,
 * then renders the {@link CompanySettingsForm}. Persistence flows through
 * {@link useUpdateCompanySettings} with success/error toast feedback. Handles
 * loading (skeleton) and error/not-found states explicitly.
 */
export function CompanySettingsPage({
    basePath = '/companies',
    companyId,
}: {
    /** Base path for breadcrumb/back links (`/companies` or `/super-admin/companies`). */
    basePath?: string;
    /**
     * Explicit company id. When provided (e.g. the top-level `/settings` route,
     * where there is no `:id` route param), it overrides `useParams`. Without
     * it the page falls back to the `/companies/:id/settings` route param.
     */
    companyId?: string;
}): JSX.Element {
    const { id: paramId = '' } = useParams<{ id: string }>();
    const id = companyId ?? paramId;
    const companyQuery = useCompany(id);
    const settingsQuery = useCompanySettings(id);

    if (companyQuery.isLoading || settingsQuery.isLoading) {
        return <SettingsSkeleton />;
    }

    if (
        companyQuery.isError ||
        settingsQuery.isError ||
        !companyQuery.data ||
        !settingsQuery.data
    ) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-12 text-center shadow-sm">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
                    <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                </span>
                <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                        Unable to load company settings
                    </p>
                    <p className="text-sm text-muted-foreground">
                        The company may have been removed, or you may not have access.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => {
                            void companyQuery.refetch();
                            void settingsQuery.refetch();
                        }}
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Try again
                    </button>
                    <Link
                        to={basePath}
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Back to companies
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <SettingsContent
            id={id}
            company={companyQuery.data}
            settings={settingsQuery.data}
            basePath={basePath}
        />
    );
}

export default CompanySettingsPage;
