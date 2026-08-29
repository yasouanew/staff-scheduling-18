import type { AuthUser } from '@/features/auth/hooks/useAuth';
import { normalizeWebRole, type WebRole } from '@/features/auth/hooks/useWebSession';

/**
 * Permission-based visibility for the management Billing UI.
 *
 * Employees and schedulers must never see billing. Only users holding the
 * `subscription.view` permission (company admins and super admins in the
 * seeder) are offered the management subscription surface. Mutation actions
 * additionally check `subscription.manage` — present for super admins and any
 * admin granted it — so an admin can view usage without being able to change
 * the plan if that permission was revoked.
 */

/** Whether a user may view the management subscription/billing dashboard. */
export function canViewBilling(user: AuthUser | undefined): boolean {
    if (!user) return false;

    const role = normalizeWebRole(user);
    if (!role || role === 'employee') return false;

    const permissions = user.permissions ?? [];
    return permissions.includes('subscription.view') || role === 'super_admin';
}

/** Whether a user may perform billing mutations (upgrade/downgrade/cancel). */
export function canManageBilling(user: AuthUser | undefined): boolean {
    if (!user) return false;

    const role = normalizeWebRole(user);
    if (!role || role === 'employee') return false;

    const permissions = user.permissions ?? [];
    return permissions.includes('subscription.manage') || role === 'super_admin';
}

/** Whether a user may activate/deactivate branches and edit their capacity. */
export function canManageBranchBilling(user: AuthUser | undefined): boolean {
    if (!user) return false;

    const role = normalizeWebRole(user);
    if (!role || role === 'employee') return false;

    const permissions = user.permissions ?? [];
    return permissions.includes('branch.edit') || role === 'super_admin';
}

export type { WebRole };
