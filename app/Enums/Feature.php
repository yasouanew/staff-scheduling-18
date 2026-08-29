<?php

namespace App\Enums;

/**
 * Central definition of every product feature a plan can grant.
 *
 * This is the single source of truth for feature keys. The `features` database
 * table mirrors these keys (seeded via FeatureSeeder) and the `plan_features`
 * table maps each plan to the features it enables. Code should always reference
 * a feature through this enum rather than a raw string so new features never
 * require a schema change — they are added here, seeded, and linked to plans.
 */
enum Feature: string
{
    case Roster = 'roster';
    case EmployeeManagement = 'employee_management';
    case BranchManagement = 'branch_management';
    case Leave = 'leave';
    case Availability = 'availability';
    case Notifications = 'notifications';
    case ShiftSwap = 'shift_swap';
    case AdvancedReporting = 'advanced_reporting';
    case Analytics = 'analytics';
    case AuditLog = 'audit_log';
    case MultiBranch = 'multi_branch';
    case ApiAccess = 'api_access';
    case AdvancedPermissions = 'advanced_permissions';
    case PayrollIntegration = 'payroll_integration';

    /**
     * Human-readable label for UI rendering and the `features` table.
     */
    public function label(): string
    {
        return match ($this) {
            self::Roster => 'Roster management',
            self::EmployeeManagement => 'Employee management',
            self::BranchManagement => 'Branch management',
            self::Leave => 'Leave management',
            self::Availability => 'Availability',
            self::Notifications => 'Notifications',
            self::ShiftSwap => 'Shift swap',
            self::AdvancedReporting => 'Advanced reporting',
            self::Analytics => 'Analytics',
            self::AuditLog => 'Audit log',
            self::MultiBranch => 'Multi-branch',
            self::ApiAccess => 'API access',
            self::AdvancedPermissions => 'Advanced permissions',
            self::PayrollIntegration => 'Payroll integration',
        };
    }

    /**
     * Features whose use also requires the specific branch to carry an active
     * (paid) branch subscription. Company-level features (analytics, API access,
     * audit log, ...) are granted by the business subscription alone.
     */
    public function isBranchScoped(): bool
    {
        return in_array($this, [
            self::Roster,
            self::EmployeeManagement,
            self::BranchManagement,
            self::Leave,
            self::Availability,
            self::Notifications,
            self::ShiftSwap,
        ], true);
    }
}
