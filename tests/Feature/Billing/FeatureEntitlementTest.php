<?php

namespace Tests\Feature\Billing;

use App\Enums\Feature;
use App\Models\BranchSubscription;
use App\Models\Company;
use App\Models\Feature as FeatureModel;
use App\Models\Plan;
use App\Models\PlanFeature;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class FeatureEntitlementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        $superAdmin = Role::findOrCreate('super_admin', 'web');
        $superAdmin->syncPermissions(Permission::all());

        Role::findOrCreate('company_admin', 'web');
        Role::findOrCreate('employee', 'web');
    }

    private function actingAsCompanyAdmin(Company $company): User
    {
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        return $user;
    }

    private function planWithFeatures(Plan $plan, array $features): Plan
    {
        foreach ($features as $feature) {
            $featureModel = FeatureModel::create([
                'key' => $feature->value,
                'label' => $feature->label(),
                'is_active' => true,
            ]);

            PlanFeature::create([
                'plan_id' => $plan->id,
                'feature_id' => $featureModel->id,
                'is_enabled' => true,
            ]);
        }

        return $plan;
    }

    public function test_guest_cannot_access_entitlements(): void
    {
        $this->getJson('/api/v1/entitlements')->assertUnauthorized();
    }

    public function test_entitlements_endpoint_returns_plan_and_features(): void
    {
        $company = Company::factory()->create();
        $plan = $this->planWithFeatures(Plan::factory()->create(), [Feature::Roster, Feature::Analytics]);

        Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'ends_at' => now()->addMonth(),
        ]);

        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/entitlements')
            ->assertOk()
            ->assertJsonPath('data.entitled', true)
            ->assertJsonPath('data.plan.slug', $plan->slug)
            ->assertJsonPath('data.features.0.key', 'roster');
    }

    public function test_entitlements_endpoint_reports_no_plan_when_unsubscribed(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/entitlements')
            ->assertOk()
            ->assertJsonPath('data.entitled', false)
            ->assertJsonPath('data.plan', null);
    }

    public function test_feature_middleware_blocks_disabled_feature(): void
    {
        $company = Company::factory()->create();
        $plan = $this->planWithFeatures(Plan::factory()->create(), [Feature::Roster]);

        Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'ends_at' => now()->addMonth(),
        ]);

        $this->actingAsCompanyAdmin($company);

        // Advanced reporting is not enabled on this plan.
        $this->getJson('/api/v1/entitlements/reporting')
            ->assertForbidden()
            ->assertJsonPath('code', 'feature_not_available');
    }

    public function test_feature_middleware_allows_enabled_feature(): void
    {
        $company = Company::factory()->create();
        $plan = $this->planWithFeatures(Plan::factory()->create(), [Feature::AdvancedReporting]);

        Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'ends_at' => now()->addMonth(),
        ]);

        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/entitlements/reporting')
            ->assertOk()
            ->assertJsonPath('data.available', true);
    }

    public function test_feature_middleware_blocks_without_subscription(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/entitlements/reporting')
            ->assertForbidden()
            ->assertJsonPath('code', 'feature_not_available');
    }

    public function test_super_admin_bypasses_feature_middleware(): void
    {
        $user = User::factory()->create();
        $user->assignRole('super_admin');
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/entitlements/reporting')->assertOk();
    }

    public function test_unknown_feature_middleware_is_rejected(): void
    {
        $company = Company::factory()->create();
        $user = $this->actingAsCompanyAdmin($company);

        $request = \Illuminate\Http\Request::create('/api/v1/anything', 'GET');
        $request->setUserResolver(fn () => $user);

        $middleware = new \App\Http\Middleware\EnsureFeatureAccess(
            app(\App\Services\EntitlementService::class)
        );

        $response = $middleware->handle($request, fn () => response()->json(['ok' => true]), 'not_a_real_feature');

        $this->assertSame(422, $response->getStatusCode());
    }

    public function test_branch_aware_feature_requires_active_branch_subscription(): void
    {
        $company = Company::factory()->create();
        $plan = $this->planWithFeatures(Plan::factory()->create(), [Feature::Roster]);
        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'ends_at' => now()->addMonth(),
        ]);

        $branch = \App\Models\Branch::factory()->create(['company_id' => $company->id]);

        $this->actingAsCompanyAdmin($company);

        // Branch has no active branch subscription yet.
        $this->assertFalse($branch->branchSubscriptions()->entitled()->exists());

        BranchSubscription::factory()->create([
            'company_id' => $company->id,
            'branch_id' => $branch->id,
            'subscription_id' => $subscription->id,
            'status' => 'active',
        ]);

        $this->assertTrue($branch->branchSubscriptions()->entitled()->exists());
    }
}
