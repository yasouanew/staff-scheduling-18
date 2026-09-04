import { CircleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/Components/ui/popover';
import type { BillingPlan, PlanInput } from '@/types/billing';

const field = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Info icon (circle + !) that opens a small explanatory popover on click. */
function FieldInfo({ text }: { text: string }): JSX.Element {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label="Field information"
                    className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <CircleAlert className="h-3 w-3" aria-hidden="true" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 text-sm leading-5 text-muted-foreground">
                {text}
            </PopoverContent>
        </Popover>
    );
}

/**
 * Known product feature keys, mirroring `App\Enums\Feature` (the backend source
 * of truth). A plan's `features` column stores these keys as display strings.
 */
const FEATURE_KEYS: { key: string; label: string }[] = [
    { key: 'roster', label: 'Roster management' },
    { key: 'employee_management', label: 'Employee management' },
    { key: 'branch_management', label: 'Branch management' },
    { key: 'leave', label: 'Leave management' },
    { key: 'availability', label: 'Availability' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'shift_swap', label: 'Shift swap' },
    { key: 'advanced_reporting', label: 'Advanced reporting' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'audit_log', label: 'Audit log' },
    { key: 'multi_branch', label: 'Multi-branch' },
    { key: 'api_access', label: 'API access' },
    { key: 'advanced_permissions', label: 'Advanced permissions' },
    { key: 'payroll_integration', label: 'Payroll integration' },
];

const empty: PlanInput = { name: '', slug: undefined, priceMonthly: 0, priceSixMonthly: null, priceYearly: 0, maxEmployees: null, maxBranches: null, features: [], isActive: true, stripeMonthlyPriceId: null, stripeSixMonthlyPriceId: null, stripeYearlyPriceId: null, stripeProductId: null };

export function PlanForm({ plan, isSaving, onSubmit, onCancel }: { plan?: BillingPlan; isSaving?: boolean; onSubmit: (input: PlanInput) => Promise<void>; onCancel: () => void }): JSX.Element {
    const [value, setValue] = useState<PlanInput>(empty);
    useEffect(() => setValue(plan ? {
        name: plan.name,
        slug: plan.slug,
        priceMonthly: plan.priceMonthly,
        priceSixMonthly: plan.priceSixMonthly,
        priceYearly: plan.priceYearly,
        maxEmployees: plan.maxEmployees,
        maxBranches: plan.maxBranches,
        features: plan.features,
        isActive: plan.isActive,
        stripeMonthlyPriceId: plan.stripeMonthlyPriceId,
        stripeSixMonthlyPriceId: plan.stripeSixMonthlyPriceId,
        stripeYearlyPriceId: plan.stripeYearlyPriceId,
        stripeProductId: plan.stripeProductId,
    } : empty), [plan]);
    const change = (key: keyof PlanInput, next: unknown) => setValue(current => ({ ...current, [key]: next }));

    const knownKeys = new Set(FEATURE_KEYS.map(item => item.key));
    const knownFeatures = value.features.filter(item => knownKeys.has(item));
    const customFeatures = value.features.filter(item => !knownKeys.has(item));

    const toggleFeature = (key: string, enabled: boolean) => {
        const next = enabled
            ? Array.from(new Set([...value.features, key]))
            : value.features.filter(item => item !== key);
        change('features', next);
    };

    return (
        <form onSubmit={event => { event.preventDefault(); void onSubmit(value); }} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-foreground">Name
                    <input required value={value.name} onChange={e => change('name', e.target.value)} className={field} />
                </label>
                <label className="text-sm font-medium text-foreground">
                    <span className="mb-1 flex items-center gap-1.5">
                        Slug
                        <FieldInfo text="A unique URL-safe identifier for this plan, used in API routes and links. Leave blank to auto-generate from the name." />
                    </span>
                    <input value={value.slug ?? ''} onChange={e => change('slug', e.target.value || undefined)} className={field} />
                </label>
                <label className="text-sm font-medium text-foreground">Monthly AUD
                    <input required type="number" min="0" step="0.01" value={value.priceMonthly} onChange={e => change('priceMonthly', Number(e.target.value))} className={field} />
                </label>
                <label className="text-sm font-medium text-foreground">6-month AUD
                    <input type="number" min="0" step="0.01" value={value.priceSixMonthly ?? ''} onChange={e => change('priceSixMonthly', e.target.value === '' ? null : Number(e.target.value))} className={field} />
                </label>
                <label className="text-sm font-medium text-foreground">Yearly AUD
                    <input required type="number" min="0" step="0.01" value={value.priceYearly} onChange={e => change('priceYearly', Number(e.target.value))} className={field} />
                </label>
                <label className="text-sm font-medium text-foreground">Max employees
                    <span className="block text-xs text-muted-foreground">Leave empty for unlimited</span>
                    <input type="number" min="1" step="1" value={value.maxEmployees ?? ''} onChange={e => change('maxEmployees', e.target.value === '' ? null : Number(e.target.value))} className={field} />
                </label>
                <label className="text-sm font-medium text-foreground">Max branches
                    <span className="block text-xs text-muted-foreground">Leave empty for unlimited</span>
                    <input type="number" min="1" step="1" value={value.maxBranches ?? ''} onChange={e => change('maxBranches', e.target.value === '' ? null : Number(e.target.value))} className={field} />
                </label>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-foreground">Monthly Stripe price ID
                    <input value={value.stripeMonthlyPriceId ?? ''} onChange={e => change('stripeMonthlyPriceId', e.target.value || null)} className={field} />
                </label>
                <label className="text-sm font-medium text-foreground">6-month Stripe price ID
                    <input value={value.stripeSixMonthlyPriceId ?? ''} onChange={e => change('stripeSixMonthlyPriceId', e.target.value || null)} className={field} />
                </label>
                <label className="text-sm font-medium text-foreground">Yearly Stripe price ID
                    <input value={value.stripeYearlyPriceId ?? ''} onChange={e => change('stripeYearlyPriceId', e.target.value || null)} className={field} />
                </label>
                <label className="text-sm font-medium text-foreground">
                    <span className="mb-1 flex items-center gap-1.5">
                        Stripe product ID
                        <FieldInfo text="The Stripe product ID that groups this plan's prices in Stripe. Required to enable checkout." />
                    </span>
                    <input value={value.stripeProductId ?? ''} onChange={e => change('stripeProductId', e.target.value || null)} className={field} />
                </label>
            </div>

            <fieldset className="rounded-lg border border-border p-4">
                <legend className="px-1 text-sm font-medium text-foreground">Features</legend>
                <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                    {FEATURE_KEYS.map(item => {
                        const enabled = knownFeatures.includes(item.key);
                        return (
                            <label key={item.key} className="flex items-center gap-2 text-sm text-foreground">
                                <input type="checkbox" checked={enabled} onChange={e => toggleFeature(item.key, e.target.checked)} />
                                {item.label}
                            </label>
                        );
                    })}
                </div>
                <div className="mt-3">
                    <label className="text-xs font-medium text-muted-foreground">Custom feature keys <span>(one per line, optional)</span>
                        <textarea rows={3} value={customFeatures.join('\n')} onChange={e => change('features', [...knownFeatures, ...e.target.value.split('\n').map(item => item.trim()).filter(Boolean)])} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                    </label>
                </div>
            </fieldset>

            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <input type="checkbox" checked={value.isActive} onChange={e => change('isActive', e.target.checked)} /> Available for subscription
            </label>
            <div className="flex justify-end gap-3">
                <button type="button" onClick={onCancel} className="h-10 rounded-lg border border-input px-4 text-sm font-medium text-foreground hover:bg-secondary">Cancel</button>
                <button disabled={isSaving} className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{isSaving ? 'Saving…' : plan ? 'Save plan' : 'Create plan'}</button>
            </div>
        </form>
    );
}
