<?php

namespace Database\Seeders;

use App\Enums\Feature;
use App\Models\Feature as FeatureModel;
use App\Models\Plan;
use App\Models\PlanFeature;
use Illuminate\Database\Seeder;

class PlanFeatureSeeder extends Seeder
{
    /**
     * Attach feature entitlements to the plans created by PlanSeeder.
     *
     * Each entry maps a plan slug to the features it enables. Optional limits
     * are expressed through `limit_value` so feature capacity can differ per
     * plan without schema changes.
     */
    public function run(): void
    {
        $assignments = [
            'free' => [
                Feature::Roster,
                Feature::Leave,
                Feature::Availability,
            ],
            'starter' => [
                Feature::Roster,
                Feature::Leave,
                Feature::Availability,
                Feature::EmployeeManagement,
                Feature::Notifications,
                Feature::ShiftSwap,
            ],
            'professional' => [
                Feature::Roster,
                Feature::Leave,
                Feature::Availability,
                Feature::EmployeeManagement,
                Feature::Notifications,
                Feature::ShiftSwap,
                Feature::BranchManagement,
                Feature::MultiBranch,
                Feature::AdvancedReporting,
                Feature::Analytics,
                Feature::AuditLog,
                Feature::AdvancedPermissions,
            ],
            'enterprise' => [
                Feature::Roster,
                Feature::Leave,
                Feature::Availability,
                Feature::EmployeeManagement,
                Feature::Notifications,
                Feature::ShiftSwap,
                Feature::BranchManagement,
                Feature::MultiBranch,
                Feature::AdvancedReporting,
                Feature::Analytics,
                Feature::AuditLog,
                Feature::AdvancedPermissions,
                Feature::ApiAccess,
                Feature::PayrollIntegration,
            ],
        ];

        foreach ($assignments as $slug => $features) {
            $plan = Plan::where('slug', $slug)->first();

            if (! $plan) {
                continue;
            }

            foreach ($features as $feature) {
                $featureModel = FeatureModel::where('key', $feature->value)->first();

                if (! $featureModel) {
                    continue;
                }

                PlanFeature::updateOrCreate(
                    ['plan_id' => $plan->id, 'feature_id' => $featureModel->id],
                    ['is_enabled' => true, 'limit_value' => null, 'configuration' => null]
                );
            }
        }
    }
}
