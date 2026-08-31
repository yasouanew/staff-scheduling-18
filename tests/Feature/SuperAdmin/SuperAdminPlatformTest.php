<?php

namespace Tests\Feature\SuperAdmin;

use App\Models\Company;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class SuperAdminPlatformTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        foreach (['subscription.view', 'subscription.manage', 'subscription.refund'] as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        $superAdmin = Role::findOrCreate('super_admin', 'web');
        $superAdmin->syncPermissions(Permission::all());

        $companyAdmin = Role::findOrCreate('company_admin', 'web');
        $companyAdmin->syncPermissions(['subscription.view', 'subscription.manage', 'subscription.refund']);

        Role::findOrCreate('employee', 'web');
    }

    /**
     * Create a super admin user authenticated via Sanctum.
     */
    protected function actingAsSuperAdmin(): User
    {
        $user = User::factory()->create();
        $user->assignRole('super_admin');
        Sanctum::actingAs($user);

        return $user;
    }

    /**
     * Create a company admin bound to a company, authenticated via Sanctum.
     */
    protected function actingAsCompanyAdmin(Company $company): User
    {
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_guest_cannot_access_platform_subscriptions(): void
    {
        $this->getJson('/api/v1/super-admin/subscriptions')
            ->assertUnauthorized();
    }

    public function test_non_super_admin_cannot_access_platform_subscriptions(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        $this->getJson('/api/v1/super-admin/subscriptions')
            ->assertForbidden();
    }

    public function test_super_admin_can_list_global_subscriptions(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create(['name' => 'Acme Pty Ltd']);
        $plan = Plan::factory()->create(['name' => 'Business']);
        Subscription::factory()->count(2)->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
        ]);

        $response = $this->getJson('/api/v1/super-admin/subscriptions');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(2, 'data.data')
            ->assertJsonPath('data.data.0.company.name', 'Acme Pty Ltd')
            ->assertJsonPath('data.data.0.plan_name', 'Business')
            ->assertJsonStructure([
                'data' => [
                    'data' => [[
                        'id', 'company_id', 'plan_id', 'status', 'billing_cycle',
                        'company' => ['id', 'name', 'status'],
                        'plan_name', 'active_branches_count',
                    ]],
                ],
            ]);
    }

    public function test_super_admin_can_filter_global_subscriptions_by_status(): void
    {
        $this->actingAsSuperAdmin();
        Subscription::factory()->count(2)->create(['status' => 'active']);
        Subscription::factory()->create(['status' => 'cancelled']);

        $response = $this->getJson('/api/v1/super-admin/subscriptions?status=cancelled');

        $response->assertOk()->assertJsonCount(1, 'data.data');
    }

    public function test_super_admin_can_list_global_payments(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create(['name' => 'Globex']);
        $plan = Plan::factory()->create(['name' => 'Starter']);
        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
        ]);
        SubscriptionPayment::factory()->count(2)->create([
            'subscription_id' => $subscription->id,
            'status' => 'succeeded',
        ]);

        $response = $this->getJson('/api/v1/super-admin/payments');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(2, 'data.data')
            ->assertJsonPath('data.data.0.company.name', 'Globex')
            ->assertJsonPath('data.data.0.plan.name', 'Starter')
            ->assertJsonStructure([
                'data' => [
                    'data' => [[
                        'id', 'subscription_id', 'amount', 'currency', 'status',
                        'is_refundable', 'company' => ['id', 'name', 'status'],
                        'plan' => ['id', 'name'],
                    ]],
                ],
            ]);
    }

    public function test_super_admin_can_list_platform_audit_log(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();
        $plan = Plan::factory()->create();
        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
        ]);

        activity('subscription')
            ->performedOn($subscription)
            ->causedBy($this->actingAsSuperAdmin())
            ->withProperties(['event' => 'PLAN_CHANGED', 'new_plan_id' => $plan->id])
            ->event('plan_changed')
            ->log('Subscription plan changed.');

        $response = $this->getJson('/api/v1/super-admin/audit');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'data' => [
                    'data' => [[
                        'id', 'log_name', 'event', 'description', 'causer', 'created_at',
                    ]],
                ],
            ]);
    }

    public function test_audit_log_only_returns_platform_events(): void
    {
        $this->actingAsSuperAdmin();
        $company = Company::factory()->create();
        $subscription = Subscription::factory()->create(['company_id' => $company->id]);

        activity('subscription')->performedOn($subscription)
            ->event('plan_changed')->log('Plan changed.');

        // A non-platform event should be excluded from the platform audit view.
        activity('branch')->performedOn($subscription)
            ->event('branch_activated')->log('Branch activated.');

        $response = $this->getJson('/api/v1/super-admin/audit');

        $response->assertOk();
        $this->assertCount(1, $response->json('data.data'));
        $this->assertSame('plan_changed', $response->json('data.data.0.event'));
    }

    public function test_super_admin_can_read_platform_metrics(): void
    {
        $this->actingAsSuperAdmin();
        $plan = Plan::factory()->create([
            'price_monthly' => 100.00,
            'price_yearly' => 1000.00,
            'price_six_monthly' => 540.00,
        ]);
        $company = Company::factory()->create();
        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'billing_cycle' => 'monthly',
        ]);
        SubscriptionPayment::factory()->create([
            'subscription_id' => $subscription->id,
            'amount' => 100.00,
            'status' => 'succeeded',
        ]);

        $response = $this->getJson('/api/v1/super-admin/metrics');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'data' => [
                    'metrics' => ['mrr', 'arr', 'revenue', 'churn' => ['churned_count', 'active_base', 'rate']],
                ],
            ]);

        $this->assertEquals(100.0, $response->json('data.metrics.mrr'));
        $this->assertEquals(1200.0, $response->json('data.metrics.arr'));
        $this->assertEquals(100.0, $response->json('data.metrics.revenue'));
    }

    public function test_platform_dashboard_includes_metrics(): void
    {
        $this->actingAsSuperAdmin();
        $plan = Plan::factory()->create(['price_monthly' => 50.00, 'price_yearly' => 500.00]);
        $company = Company::factory()->create();
        Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'billing_cycle' => 'monthly',
        ]);

        $response = $this->getJson('/api/v1/dashboard/overview');

        $response->assertOk()
            ->assertJsonPath('data.scope', 'platform')
            ->assertJsonStructure([
                'data' => [
                    'metrics' => ['mrr', 'arr', 'revenue', 'churn'],
                ],
            ]);

        $this->assertEquals(50.0, $response->json('data.metrics.mrr'));
    }
}
