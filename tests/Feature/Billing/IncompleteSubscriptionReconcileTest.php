<?php

namespace Tests\Feature\Billing;

use App\Models\Company;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

/**
 * Covers the reconciliation of subscription rows stuck in `incomplete`.
 *
 * Task 7 — when a business starts a Stripe Checkout but the completion webhook
 * never lands, the local subscription stays `incomplete` forever, cluttering
 * the super-admin subscription list even though Stripe may have charged the
 * customer. `billing:reconcile-incomplete` expires abandoned rows and activates
 * paid ones (via the same lifecycle as the `checkout/confirm` endpoint).
 *
 * The Stripe SDK call is only exercised when an `incomplete` row actually
 * carries a `checkout_session_id`; these tests therefore exercise the code
 * paths that need no network: abandoned rows (no session), non-stale rows,
 * non-incomplete rows, and the `checkout/confirm` 404 guard that runs before
 * any Stripe call.
 */
class IncompleteSubscriptionReconcileTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        foreach ([
            'subscription.view', 'subscription.manage', 'subscription.refund',
            'branch.view', 'branch.create', 'branch.edit', 'branch.delete',
            'employee.view', 'employee.create', 'employee.edit', 'employee.delete',
        ] as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        $superAdmin = Role::findOrCreate('super_admin', 'web');
        $superAdmin->syncPermissions(Permission::all());

        $companyAdmin = Role::findOrCreate('company_admin', 'web');
        $companyAdmin->syncPermissions([
            'subscription.view', 'subscription.manage', 'subscription.refund',
            'branch.view', 'branch.create', 'branch.edit', 'branch.delete',
            'employee.view', 'employee.create', 'employee.edit', 'employee.delete',
        ]);

        Role::findOrCreate('scheduler', 'web');
        Role::findOrCreate('employee', 'web');
    }

    protected function actingAsCompanyAdmin(Company $company): User
    {
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_command_expires_stale_incomplete_subscription_without_checkout_session(): void
    {
        Carbon::setTestNow(Carbon::now());

        $company = Company::factory()->create();
        $plan = Plan::factory()->create();

        $subscription = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'incomplete',
            'checkout_session_id' => null,
            'created_at' => now()->subHours(48),
            'updated_at' => now()->subHours(48),
        ]);

        $this->artisan('billing:reconcile-incomplete')
            ->expectsOutputToContain('Found 1 incomplete subscription(s)')
            ->assertExitCode(0);

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'status' => 'expired',
            'stripe_status' => null,
        ]);

        Carbon::setTestNow();
    }

    public function test_command_leaves_fresh_incomplete_subscription_untouched(): void
    {
        Carbon::setTestNow(Carbon::now());

        $company = Company::factory()->create();
        $plan = Plan::factory()->create();

        $fresh = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'incomplete',
            'checkout_session_id' => null,
            'created_at' => now()->subMinutes(30),
        ]);

        $this->artisan('billing:reconcile-incomplete')
            ->expectsOutputToContain('No stale incomplete subscriptions found')
            ->assertExitCode(0);

        // A checkout that began moments ago is still in-flight — it must not be
        // expired while the customer could still be completing payment.
        $this->assertDatabaseHas('subscriptions', [
            'id' => $fresh->id,
            'status' => 'incomplete',
        ]);

        Carbon::setTestNow();
    }

    public function test_command_does_not_touch_non_incomplete_subscriptions(): void
    {
        Carbon::setTestNow(Carbon::now());

        $company = Company::factory()->create();
        $plan = Plan::factory()->create();

        $active = Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'created_at' => now()->subDays(10),
        ]);

        $this->artisan('billing:reconcile-incomplete')
            ->assertExitCode(0);

        $this->assertDatabaseHas('subscriptions', [
            'id' => $active->id,
            'status' => 'active',
        ]);
    }

    public function test_confirm_checkout_returns_404_for_unknown_session_before_hitting_stripe(): void
    {
        $company = Company::factory()->create();
        $this->actingAsCompanyAdmin($company);

        // No local incomplete subscription matches this session id, so the
        // endpoint aborts with 404 before it ever contacts the Stripe SDK.
        $this->postJson('/api/v1/subscription/checkout/confirm', [
            'session_id' => 'cs_test_does_not_exist',
        ])->assertNotFound();
    }

    public function test_confirm_checkout_requires_an_authenticated_company_admin(): void
    {
        $company = Company::factory()->create();

        // A plain employee cannot confirm a checkout (subscription.manage).
        $employee = User::factory()->create(['company_id' => $company->id]);
        $employee->assignRole('employee');
        Sanctum::actingAs($employee);

        $plan = Plan::factory()->create();
        Subscription::factory()->create([
            'company_id' => $company->id,
            'plan_id' => $plan->id,
            'status' => 'incomplete',
            'checkout_session_id' => 'cs_test_local_row',
        ]);

        $this->postJson('/api/v1/subscription/checkout/confirm', [
            'session_id' => 'cs_test_local_row',
        ])->assertForbidden();
    }
}
