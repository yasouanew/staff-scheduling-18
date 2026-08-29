<?php

namespace Tests\Unit\Services;

use App\Enums\Feature;
use App\Models\Branch;
use App\Models\BranchSubscription;
use App\Models\Company;
use App\Models\Feature as FeatureModel;
use App\Models\Plan;
use App\Models\PlanFeature;
use App\Models\Subscription;
use App\Services\EntitlementService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EntitlementServiceTest extends TestCase
{
    use RefreshDatabase;

    private EntitlementService $entitlements;

    protected function setUp(): void
    {
        parent::setUp();

        $this->entitlements = app(EntitlementService::class);
    }

    /**
     * Build a plan with the given features enabled.
     *
     * @param  array<int, Feature>  $features
     * @return Plan
     */
    private function planWithFeatures(array $features): Plan
    {
        $plan = Plan::factory()->create();

        foreach ($features as $feature) {
            // Feature keys are globally unique, so reuse an existing row when
            // the same feature appears on more than one plan in a test.
            $featureModel = FeatureModel::firstOrCreate(
                ['key' => $feature->value],
                ['label' => $feature->label(), 'is_active' => true]
            );

            PlanFeature::create([
                'plan_id' => $plan->id,
                'feature_id' => $featureModel->id,
                'is_enabled' => true,
            ]);
        }

        return $plan;
    }

    /**
     * Attach a plan to a company with an active subscription.
     */
    private function subscribe(Company $company, Plan $plan, string $status = 'active'): Subscription
    {
        return Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => $status,
            'ends_at' => $status === 'expired' ? now()->subDay() : now()->addMonth(),
            'trial_ends_at' => null,
        ]);
    }

    public function test_active_plan_grants_enabled_company_feature(): void
    {
        $company = Company::factory()->create();
        $plan = $this->planWithFeatures([Feature::Analytics, Feature::AuditLog]);
        $this->subscribe($company, $plan);

        $this->assertTrue($this->entitlements->allows($company, Feature::Analytics));
        $this->assertTrue($this->entitlements->allows($company, Feature::AuditLog));
    }

    public function test_active_plan_grants_enabled_branch_feature_with_entitled_branch(): void
    {
        $company = Company::factory()->create();
        $plan = $this->planWithFeatures([Feature::Roster, Feature::Leave]);
        $subscription = $this->subscribe($company, $plan);

        $branch = Branch::factory()->create(['company_id' => $company->id]);

        BranchSubscription::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'subscription_id' => $subscription->id,
            'status' => 'active',
        ]);

        $this->assertTrue($this->entitlements->allows($company, Feature::Roster, $branch));
        $this->assertTrue($this->entitlements->allows($company, Feature::Leave, $branch));
    }

    public function test_unavailable_feature_is_denied(): void
    {
        $company = Company::factory()->create();
        $plan = $this->planWithFeatures([Feature::Roster]);
        $this->subscribe($company, $plan);

        $this->assertFalse($this->entitlements->allows($company, Feature::Analytics));
    }

    public function test_trial_subscription_grants_access(): void
    {
        $company = Company::factory()->create();
        $plan = $this->planWithFeatures([Feature::Analytics]);
        Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'trialing',
            'trial_ends_at' => now()->addDays(7),
            'ends_at' => null,
        ]);

        $this->assertTrue($this->entitlements->allows($company, Feature::Analytics));
        $this->assertTrue($this->entitlements->hasEntitledSubscription($company));
    }

    public function test_expired_trial_does_not_grant_access(): void
    {
        $company = Company::factory()->create();
        $plan = $this->planWithFeatures([Feature::Analytics]);
        Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'trialing',
            'trial_ends_at' => now()->subDay(),
            'ends_at' => null,
        ]);

        $this->assertFalse($this->entitlements->allows($company, Feature::Analytics));
        $this->assertFalse($this->entitlements->hasEntitledSubscription($company));
    }

    public function test_expired_subscription_denies_access(): void
    {
        $company = Company::factory()->create();
        $plan = $this->planWithFeatures([Feature::Analytics]);
        $this->subscribe($company, $plan, 'expired');

        $this->assertFalse($this->entitlements->allows($company, Feature::Analytics));
    }

    public function test_past_due_subscription_denies_access(): void
    {
        $company = Company::factory()->create();
        $plan = $this->planWithFeatures([Feature::Analytics]);
        $this->subscribe($company, $plan, 'past_due');

        $this->assertFalse($this->entitlements->allows($company, Feature::Analytics));
    }

    public function test_cancelled_subscription_denies_access(): void
    {
        $company = Company::factory()->create();
        $plan = $this->planWithFeatures([Feature::Analytics]);
        $this->subscribe($company, $plan, 'cancelled');

        $this->assertFalse($this->entitlements->allows($company, Feature::Analytics));
    }

    public function test_no_subscription_denies_access(): void
    {
        $company = Company::factory()->create();

        $this->assertFalse($this->entitlements->allows($company, Feature::Analytics));
        $this->assertFalse($this->entitlements->hasEntitledSubscription($company));
        $this->assertNull($this->entitlements->entitledPlan($company));
    }

    public function test_feature_limit_is_available(): void
    {
        $company = Company::factory()->create();
        $plan = Plan::factory()->create();

        $featureModel = FeatureModel::create([
            'key' => Feature::ShiftSwap->value,
            'label' => 'Shift swap',
            'is_active' => true,
        ]);

        PlanFeature::create([
            'plan_id' => $plan->id,
            'feature_id' => $featureModel->id,
            'is_enabled' => true,
            'limit_value' => 25,
        ]);

        $this->subscribe($company, $plan);

        $this->assertSame(25, $this->entitlements->limit($company, Feature::ShiftSwap));
        $this->assertSame(
            ['enabled' => true, 'limit' => 25],
            $this->entitlements->configuration($company, Feature::ShiftSwap)
        );
    }

    public function test_feature_limit_from_configuration(): void
    {
        $company = Company::factory()->create();
        $plan = Plan::factory()->create();

        $featureModel = FeatureModel::create([
            'key' => Feature::ShiftSwap->value,
            'label' => 'Shift swap',
            'is_active' => true,
        ]);

        PlanFeature::create([
            'plan_id' => $plan->id,
            'feature_id' => $featureModel->id,
            'is_enabled' => true,
            'limit_value' => null,
            'configuration' => ['limit' => 50],
        ]);

        $this->subscribe($company, $plan);

        $this->assertSame(50, $this->entitlements->limit($company, Feature::ShiftSwap));
    }

    public function test_branch_scoped_feature_requires_active_branch_subscription(): void
    {
        $company = Company::factory()->create();
        $plan = $this->planWithFeatures([Feature::Roster]);
        $this->subscribe($company, $plan);

        $branch = Branch::factory()->create(['company_id' => $company->id]);

        // Roster is branch-scoped: without an active branch subscription the
        // branch cannot use it, even though the business plan enables it.
        $this->assertFalse($this->entitlements->allows($company, Feature::Roster, $branch));

        BranchSubscription::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'subscription_id' => $company->subscriptions()->first()->id,
            'status' => 'active',
        ]);

        $this->assertTrue($this->entitlements->allows($company, Feature::Roster, $branch));
        $this->assertTrue($this->entitlements->branchIsEntitled($branch));
    }

    public function test_branch_with_expired_branch_subscription_is_not_entitled(): void
    {
        $company = Company::factory()->create();
        $plan = $this->planWithFeatures([Feature::Roster]);
        $subscription = $this->subscribe($company, $plan);

        $branch = Branch::factory()->create(['company_id' => $company->id]);

        BranchSubscription::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'subscription_id' => $subscription->id,
            'status' => 'expired',
        ]);

        $this->assertFalse($this->entitlements->allows($company, Feature::Roster, $branch));
    }

    public function test_company_level_feature_does_not_require_branch_subscription(): void
    {
        $company = Company::factory()->create();
        $plan = $this->planWithFeatures([Feature::Analytics]);
        $this->subscribe($company, $plan);

        $branch = Branch::factory()->create(['company_id' => $company->id]);

        // Analytics is not branch-scoped: the business plan alone grants it.
        $this->assertTrue($this->entitlements->allows($company, Feature::Analytics, $branch));
    }

    public function test_branch_employee_capacity_falls_back_to_plan(): void
    {
        $company = Company::factory()->create();
        $plan = Plan::factory()->create(['max_employees' => 100]);
        $subscription = $this->subscribe($company, $plan);

        $branch = Branch::factory()->create(['company_id' => $company->id]);

        BranchSubscription::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'subscription_id' => $subscription->id,
            'status' => 'active',
            'employee_capacity' => 25,
        ]);

        // Branch-level capacity wins.
        $this->assertSame(25, $this->entitlements->branchEmployeeCapacity($branch));

        // A branch with no explicit capacity falls back to the plan limit.
        $otherBranch = Branch::factory()->create(['company_id' => $company->id]);
        $this->assertSame(100, $this->entitlements->branchEmployeeCapacity($otherBranch));
    }

    public function test_cross_business_access_is_denied(): void
    {
        $companyA = Company::factory()->create();
        $planA = $this->planWithFeatures([Feature::Analytics]);
        $this->subscribe($companyA, $planA);

        $companyB = Company::factory()->create();
        $planB = $this->planWithFeatures([Feature::Roster]);
        $this->subscribe($companyB, $planB);

        // Company A's plan enables Analytics, but only for Company A.
        $this->assertTrue($this->entitlements->allows($companyA, Feature::Analytics));
        $this->assertFalse($this->entitlements->allows($companyB, Feature::Analytics));
        $this->assertFalse($this->entitlements->allows($companyA, Feature::Roster));

        // A branch of company B must not satisfy company A's branch-scoped check.
        $branchB = Branch::factory()->create(['company_id' => $companyB->id]);
        $this->assertFalse($this->entitlements->allows($companyA, Feature::Roster, $branchB));
    }

    public function test_correct_plan_resolution_with_multiple_subscriptions(): void
    {
        $company = Company::factory()->create();

        $freePlan = $this->planWithFeatures([Feature::Analytics]);
        $growthPlan = $this->planWithFeatures([Feature::AuditLog, Feature::ApiAccess]);

        // Older expired subscription first.
        $this->subscribe($company, $freePlan, 'expired');

        // Latest active subscription on the growth plan.
        Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $growthPlan->id,
            'status' => 'active',
            'starts_at' => now()->addHour(),
            'ends_at' => now()->addMonth(),
        ]);

        $plan = $this->entitlements->entitledPlan($company);

        $this->assertTrue($plan->is($growthPlan));
        $this->assertTrue($this->entitlements->allows($company, Feature::AuditLog));
        $this->assertTrue($this->entitlements->allows($company, Feature::ApiAccess));
        $this->assertFalse($this->entitlements->allows($company, Feature::Analytics));
    }
}
