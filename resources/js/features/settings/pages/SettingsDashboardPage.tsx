import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { ArrowUpRight, Building2, CreditCard, FileText, MapPin, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';
import type {
    BranchConfiguration,
    BranchFormValues,
    OperationalPolicies,
    OrganizationProfile,
} from '@/types/settings';

import { BranchForm } from '../components/BranchForm';
import { PolicyTogglePanel } from '../components/PolicyTogglePanel';

// ---------------------------------------------------------------------------
// Mock data — replace with real API hooks in production
// ---------------------------------------------------------------------------

const MOCK_ORGANIZATION: OrganizationProfile = {
    id: 'org_001',
    legalName: 'Sunrise Healthcare Pty Ltd',
    abn: '12 345 678 901',
    contactEmail: 'hello@sunrisehealth.com.au',
    contactPhone: '+61 2 9876 5432',
    defaultTimezone: 'AEST',
    updatedAt: new Date().toISOString(),
};

const MOCK_BRANCH: BranchConfiguration = {
    id: 'branch_001',
    name: 'Melbourne HQ',
    state: 'VIC',
    timezone: 'AEST',
    baseHourlyRate: 32.5,
    rateMultipliers: {
        weekday: 1.0,
        saturday: 1.5,
        sunday: 1.75,
        publicHoliday: 2.5,
    },
    updatedAt: new Date().toISOString(),
};

const MOCK_POLICIES: OperationalPolicies = {
    preventSchedulingDuringLeave: true,
    enforceMandatoryBreaks: true,
    autoPublishRosters: false,
    notifyOnShiftSwap: true,
    restrictOvertimeWithoutApproval: false,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SettingsTab = 'company' | 'branches' | 'departments' | 'policies' | 'subscription';

interface TabDescriptor {
    id: SettingsTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
}

const TABS: readonly TabDescriptor[] = [
    { id: 'company', label: 'Company Profile', icon: Building2 },
    { id: 'branches', label: 'Branches', icon: MapPin },
    { id: 'departments', label: 'Departments', icon: FileText },
    { id: 'policies', label: 'Operational Policies', icon: ShieldCheck },
    { id: 'subscription', label: 'Subscription & Billing', icon: CreditCard },
] as const;

// ---------------------------------------------------------------------------
// SettingsDashboardPage
// ---------------------------------------------------------------------------

/**
 * Nested settings shell with a vertical tab sidebar. Each tab surfaces a
 * different configuration slice: company profile, branch parameters,
 * department scheduling settings, and global operational policies.
 *
 * Tracks dirty form state across all tabs and intercepts navigation attempts
 * to fire a Radix AlertDialog confirming the user wants to discard unsaved changes.
 */
export function SettingsDashboardPage(): JSX.Element {
    const [activeTab, setActiveTab] = useState<SettingsTab>('company');
    const [pendingTab, setPendingTab] = useState<SettingsTab | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    // API stubs — replace with real TanStack Query mutations
    const [organization] = useState(MOCK_ORGANIZATION);
    const [branch] = useState(MOCK_BRANCH);
    const [policies, setPolicies] = useState(MOCK_POLICIES);

    const handleBranchSubmit = async (values: BranchFormValues): Promise<void> => {
        // TODO: Replace with actual API call
        await new Promise((resolve) => setTimeout(resolve, 800));
        console.log('[BranchForm] Submitted:', values);
        setIsDirty(false);
    };

    const handlePolicyChange = async (next: OperationalPolicies): Promise<void> => {
        // TODO: Replace with actual API call
        await new Promise((resolve) => setTimeout(resolve, 600));
        setPolicies(next);
    };

    const handleTabClick = (tabId: SettingsTab): void => {
        if (isDirty && tabId !== activeTab) {
            setPendingTab(tabId);
        } else {
            setActiveTab(tabId);
        }
    };

    const confirmTabSwitch = (): void => {
        if (pendingTab) {
            setActiveTab(pendingTab);
            setPendingTab(null);
            setIsDirty(false);
        }
    };

    const cancelTabSwitch = (): void => {
        setPendingTab(null);
    };

    return (
        <div className="flex min-h-screen flex-col bg-background">
            {/* Page header */}
            <header className="border-b border-border bg-card">
                <div className="mx-auto max-w-screen-2xl px-6 py-6">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                        Organisation Settings
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Configure your company profile, branches, departments, and scheduling policies.
                    </p>
                </div>
            </header>

            {/* Main split layout: sidebar + content */}
            <div className="mx-auto flex w-full max-w-screen-2xl flex-1 gap-8 px-6 py-8">
                {/* Vertical tab sidebar */}
                <aside className="w-64 flex-shrink-0">
                    <nav className="sticky top-8 space-y-1" aria-label="Settings navigation">
                        {TABS.map((tab) => {
                            const isActive = activeTab === tab.id;
                            const Icon = tab.icon;

                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => {
                                        handleTabClick(tab.id);
                                    }}
                                    aria-current={isActive ? 'page' : undefined}
                                    className={cn(
                                        'flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-medium transition-colors',
                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                                        isActive
                                            ? 'bg-accent text-accent-foreground shadow-sm'
                                            : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                                    )}
                                >
                                    <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                </aside>

                {/* Content area */}
                <main className="flex-1">
                    <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
                        {activeTab === 'company' && (
                            <section aria-labelledby="company-heading">
                                <h2
                                    id="company-heading"
                                    className="mb-6 text-lg font-semibold text-foreground"
                                >
                                    Company Profile
                                </h2>
                                <div className="space-y-4 text-sm">
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div>
                                            <span className="block font-medium text-muted-foreground">
                                                Legal name
                                            </span>
                                            <span className="mt-1 block text-foreground">
                                                {organization.legalName}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="block font-medium text-muted-foreground">
                                                ABN
                                            </span>
                                            <span className="mt-1 block text-foreground">
                                                {organization.abn}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="block font-medium text-muted-foreground">
                                                Contact email
                                            </span>
                                            <span className="mt-1 block text-foreground">
                                                {organization.contactEmail}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="block font-medium text-muted-foreground">
                                                Contact phone
                                            </span>
                                            <span className="mt-1 block text-foreground">
                                                {organization.contactPhone}
                                            </span>
                                        </div>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Last updated:{' '}
                                        {new Intl.DateTimeFormat('en-AU', {
                                            dateStyle: 'medium',
                                            timeStyle: 'short',
                                        }).format(new Date(organization.updatedAt))}
                                    </p>
                                </div>
                            </section>
                        )}

                        {activeTab === 'branches' && (
                            <section aria-labelledby="branches-heading">
                                <h2
                                    id="branches-heading"
                                    className="mb-6 text-lg font-semibold text-foreground"
                                >
                                    Branch Configuration
                                </h2>
                                <BranchForm
                                    defaultValues={branch}
                                    onSubmit={handleBranchSubmit}
                                    onDirtyChange={setIsDirty}
                                />
                            </section>
                        )}

                        {activeTab === 'departments' && (
                            <section aria-labelledby="departments-heading">
                                <h2
                                    id="departments-heading"
                                    className="mb-6 text-lg font-semibold text-foreground"
                                >
                                    Department Scheduling Parameters
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    Department management interface coming soon. Configure minimum
                                    staffing levels and colour themes for each department.
                                </p>
                            </section>
                        )}

                        {activeTab === 'policies' && (
                            <section aria-labelledby="policies-heading">
                                <h2
                                    id="policies-heading"
                                    className="mb-6 text-lg font-semibold text-foreground"
                                >
                                    Global Scheduling Policies
                                </h2>
                                <PolicyTogglePanel value={policies} onChange={handlePolicyChange} />
                            </section>
                        )}

                        {activeTab === 'subscription' && (
                            <section aria-labelledby="subscription-heading">
                                <h2
                                    id="subscription-heading"
                                    className="mb-6 text-lg font-semibold text-foreground"
                                >
                                    Subscription & Billing
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    Manage your plan, branch entitlements, employee capacity and
                                    payments from the dedicated Subscription dashboard.
                                </p>
                                <div className="mt-6">
                                    <Link
                                        to="/subscription"
                                        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                    >
                                        <CreditCard className="h-4 w-4" aria-hidden="true" />
                                        Open Subscription dashboard
                                        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                                    </Link>
                                </div>
                            </section>
                        )}
                    </div>
                </main>
            </div>

            {/* Unsaved changes confirmation dialog */}
            <AlertDialog.Root open={pendingTab !== null} onOpenChange={cancelTabSwitch}>
                <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                    <AlertDialog.Content
                        className={cn(
                            'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl',
                            'data-[state=open]:animate-in data-[state=closed]:animate-out',
                            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
                            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
                            'focus:outline-none',
                        )}
                    >
                        <AlertDialog.Title className="text-lg font-semibold text-foreground">
                            You have unsaved changes
                        </AlertDialog.Title>
                        <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                            Are you sure you want to leave? Any changes you made will be lost.
                        </AlertDialog.Description>
                        <div className="mt-6 flex items-center justify-end gap-3">
                            <AlertDialog.Cancel asChild>
                                <button
                                    type="button"
                                    className={cn(
                                        'inline-flex h-10 items-center justify-center rounded-lg border border-input bg-card px-4 text-sm font-medium text-foreground transition-colors',
                                        'hover:bg-secondary hover:text-secondary-foreground',
                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    )}
                                >
                                    Cancel
                                </button>
                            </AlertDialog.Cancel>
                            <AlertDialog.Action asChild>
                                <button
                                    type="button"
                                    onClick={confirmTabSwitch}
                                    className={cn(
                                        'inline-flex h-10 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground shadow-sm transition-colors',
                                        'hover:bg-danger/90',
                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                                    )}
                                >
                                    Discard changes
                                </button>
                            </AlertDialog.Action>
                        </div>
                    </AlertDialog.Content>
                </AlertDialog.Portal>
            </AlertDialog.Root>
        </div>
    );
}
