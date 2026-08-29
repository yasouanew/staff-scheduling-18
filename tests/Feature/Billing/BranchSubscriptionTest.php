<?php

namespace Tests\Feature\Billing;

use App\Enums\SubscriptionStatus;
use App\Models\Branch;
use App\Models\BranchSubscription;
use App\Models\Company;
use App\Models\Plan;
use App\Models\Subscription;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BranchSubscriptionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
    }

    /**
     * Create a branch subscription whose company, branch and subscription all
     * belong to the same company (tenant-scoped consistency).
     *
     * @param  array<string, mixed>  $attributes
     */
    private function makeBranchSubscription(array $attributes = []): BranchSubscription
    {
        $company = Company::factory()->create();
        $subscription = Subscription::factory()->create(['company_id' => $company->id]);
        $branch = Branch::factory()->create(['company_id' => $company->id]);

        return BranchSubscription::factory()->create(array_merge([
            'company_id' => $company->id,
            'subscription_id' => $subscription->id,
            'branch_id' => $branch->id,
        ], $attributes));
    }

    public function test_branch_subscription_belongs_to_company(): void
    {
        $company = Company::factory()->create();
        $subscription = Subscription::factory()->create(['company_id' => $company->id]);
        $branch = Branch::factory()->create(['company_id' => $company->id]);

        $branchSubscription = BranchSubscription::factory()->create([
            'company_id' => $company->id,
            'subscription_id' => $subscription->id,
            'branch_id' => $branch->id,
        ]);

        $this->assertTrue($branchSubscription->company->is($company));
        $this->assertInstanceOf(Company::class, $branchSubscription->company);
    }

    public function test_branch_subscription_belongs_to_branch(): void
    {
        $branchSubscription = $this->makeBranchSubscription();

        $this->assertTrue($branchSubscription->branch->is($branchSubscription->branch));
        $this->assertInstanceOf(Branch::class, $branchSubscription->branch);
    }

    public function test_branch_subscription_belongs_to_subscription(): void
    {
        $branchSubscription = $this->makeBranchSubscription();

        $this->assertTrue($branchSubscription->subscription->is($branchSubscription->subscription));
        $this->assertInstanceOf(Subscription::class, $branchSubscription->subscription);
    }

    public function test_subscription_belongs_to_company(): void
    {
        $company = Company::factory()->create();
        $subscription = Subscription::factory()->create(['company_id' => $company->id]);

        $this->assertTrue($subscription->company->is($company));
    }

    public function test_subscription_belongs_to_plan(): void
    {
        $plan = Plan::factory()->create();
        $subscription = Subscription::factory()->create(['plan_id' => $plan->id]);

        $this->assertTrue($subscription->plan->is($plan));
    }

    public function test_company_has_many_branch_subscriptions(): void
    {
        $company = Company::factory()->create();
        $subscription = Subscription::factory()->create(['company_id' => $company->id]);

        for ($i = 0; $i < 3; $i++) {
            $branch = Branch::factory()->create(['company_id' => $company->id]);

            BranchSubscription::factory()->create([
                'company_id' => $company->id,
                'subscription_id' => $subscription->id,
                'branch_id' => $branch->id,
            ]);
        }

        $this->assertCount(3, $company->branchSubscriptions);
    }

    public function test_subscription_has_many_branch_subscriptions(): void
    {
        $company = Company::factory()->create();
        $subscription = Subscription::factory()->create(['company_id' => $company->id]);
        $branchA = Branch::factory()->create(['company_id' => $company->id]);
        $branchB = Branch::factory()->create(['company_id' => $company->id]);

        BranchSubscription::factory()->create([
            'company_id' => $company->id,
            'subscription_id' => $subscription->id,
            'branch_id' => $branchA->id,
        ]);
        BranchSubscription::factory()->create([
            'company_id' => $company->id,
            'subscription_id' => $subscription->id,
            'branch_id' => $branchB->id,
        ]);

        $this->assertCount(2, $subscription->branchSubscriptions);
    }

    public function test_branch_has_many_branch_subscriptions(): void
    {
        $branch = Branch::factory()->create();
        $company = $branch->company;
        $subscriptionA = Subscription::factory()->create(['company_id' => $company->id]);
        $subscriptionB = Subscription::factory()->create(['company_id' => $company->id]);

        BranchSubscription::factory()->create([
            'company_id' => $company->id,
            'subscription_id' => $subscriptionA->id,
            'branch_id' => $branch->id,
        ]);
        BranchSubscription::factory()->create([
            'company_id' => $company->id,
            'subscription_id' => $subscriptionB->id,
            'branch_id' => $branch->id,
        ]);

        $this->assertCount(2, $branch->branchSubscriptions);
    }

    public function test_branch_subscription_requires_valid_foreign_keys(): void
    {
        $company = Company::factory()->create();
        $subscription = Subscription::factory()->create(['company_id' => $company->id]);
        $branch = Branch::factory()->create(['company_id' => $company->id]);

        $this->expectException(QueryException::class);

        BranchSubscription::factory()->create([
            'company_id' => $company->id,
            'subscription_id' => $subscription->id,
            'branch_id' => 999_999,
        ]);
    }

    public function test_branch_subscription_cannot_duplicate_branch_for_same_subscription(): void
    {
        $branchSubscription = $this->makeBranchSubscription();

        $this->expectException(QueryException::class);

        BranchSubscription::factory()->create([
            'company_id' => $branchSubscription->company_id,
            'subscription_id' => $branchSubscription->subscription_id,
            'branch_id' => $branchSubscription->branch_id,
        ]);
    }

    public function test_branch_subscription_status_defaults_to_active(): void
    {
        $branchSubscription = $this->makeBranchSubscription();

        $this->assertSame('active', $branchSubscription->status);
        $this->assertTrue($branchSubscription->grantsAccess());
    }

    public function test_branch_subscription_status_is_validated_against_enum(): void
    {
        $branchSubscription = $this->makeBranchSubscription([
            'status' => SubscriptionStatus::Expired->value,
        ]);

        $this->assertSame(SubscriptionStatus::Expired->value, $branchSubscription->status);
        $this->assertFalse($branchSubscription->grantsAccess());
    }

    public function test_branch_subscription_supports_trial_dates(): void
    {
        // startOfSecond() keeps the timestamp aligned with what SQLite can store.
        $trialEndsAt = now()->startOfSecond()->addDays(14);

        $branchSubscription = $this->makeBranchSubscription([
            'status' => SubscriptionStatus::Trial->value,
        ]);

        $subscription = $branchSubscription->subscription;
        $subscription->forceFill([
            'status' => SubscriptionStatus::Trial->value,
            'trial_ends_at' => $trialEndsAt,
        ])->save();
        $subscription->refresh();

        $this->assertTrue($subscription->trial_ends_at->equalTo($trialEndsAt));
        $this->assertTrue($subscription->onTrial());
    }

    public function test_employee_capacity_is_stored_as_integer_without_enum(): void
    {
        foreach ([10, 25, 50, 100] as $capacity) {
            $branchSubscription = $this->makeBranchSubscription(['employee_capacity' => $capacity]);

            $this->assertSame($capacity, $branchSubscription->employee_capacity);
        }
    }

    public function test_active_scope_returns_only_active_rows(): void
    {
        $this->makeBranchSubscription(['status' => 'active']);
        $this->makeBranchSubscription(['status' => 'active']);
        $this->makeBranchSubscription(['status' => 'trialing']);
        $this->makeBranchSubscription(['status' => 'expired']);

        $this->assertSame(2, BranchSubscription::active()->count());
    }

    public function test_entitled_scope_returns_trial_and_active_rows(): void
    {
        $this->makeBranchSubscription(['status' => 'active']);
        $this->makeBranchSubscription(['status' => 'trialing']);
        $this->makeBranchSubscription(['status' => 'cancelled']);

        $this->assertSame(2, BranchSubscription::entitled()->count());
    }

    public function test_cross_company_branch_and_subscription_is_rejected(): void
    {
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();

        $subscriptionB = Subscription::factory()->create(['company_id' => $companyB->id]);
        $branchA = Branch::factory()->create(['company_id' => $companyA->id]);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Subscription does not belong to the same company');

        BranchSubscription::factory()->create([
            'company_id' => $companyA->id,
            'branch_id' => $branchA->id,
            'subscription_id' => $subscriptionB->id,
        ]);
    }

    public function test_cross_company_branch_and_company_is_rejected(): void
    {
        $companyA = Company::factory()->create();
        $companyB = Company::factory()->create();

        $subscriptionA = Subscription::factory()->create(['company_id' => $companyA->id]);
        $branchB = Branch::factory()->create(['company_id' => $companyB->id]);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Branch does not belong to the same company');

        BranchSubscription::factory()->create([
            'company_id' => $companyA->id,
            'branch_id' => $branchB->id,
            'subscription_id' => $subscriptionA->id,
        ]);
    }

    public function test_branch_and_subscription_from_same_company_are_accepted(): void
    {
        $company = Company::factory()->create();
        $subscription = Subscription::factory()->create(['company_id' => $company->id]);
        $branch = Branch::factory()->create(['company_id' => $company->id]);

        $branchSubscription = BranchSubscription::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'subscription_id' => $subscription->id,
        ]);

        $this->assertDatabaseHas('branch_subscriptions', [
            'id' => $branchSubscription->id,
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'subscription_id' => $subscription->id,
        ]);
    }

    public function test_active_branch_subscription_helper_returns_entitled_row(): void
    {
        $branch = Branch::factory()->create();
        $company = $branch->company;
        // Each branch_subscription row pairs the branch with a distinct subscription,
        // modelling the same branch being covered by different subscriptions over time.
        $expiredSubscription = Subscription::factory()->create(['company_id' => $company->id]);
        $activeSubscription = Subscription::factory()->create(['company_id' => $company->id]);

        BranchSubscription::factory()->create([
            'company_id' => $company->id,
            'subscription_id' => $expiredSubscription->id,
            'branch_id' => $branch->id,
            'status' => 'expired',
            'started_at' => now()->subDays(30),
        ]);

        $active = BranchSubscription::factory()->create([
            'company_id' => $company->id,
            'subscription_id' => $activeSubscription->id,
            'branch_id' => $branch->id,
            'status' => 'active',
            'started_at' => now()->subDays(1),
        ]);

        $this->assertTrue($branch->activeBranchSubscription()->is($active));
    }

    public function test_active_branch_subscription_helper_returns_null_when_none_entitled(): void
    {
        $branch = Branch::factory()->create();
        $company = $branch->company;
        $subscription = Subscription::factory()->create(['company_id' => $company->id]);

        BranchSubscription::factory()->create([
            'company_id' => $company->id,
            'subscription_id' => $subscription->id,
            'branch_id' => $branch->id,
            'status' => 'cancelled',
        ]);

        $this->assertNull($branch->activeBranchSubscription());
    }
}
