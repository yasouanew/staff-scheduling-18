<?php

namespace Tests\Feature\Billing;

use App\Http\Middleware\CheckCompanyAccess;
use App\Models\Company;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Services\AccessStateService;
use App\Services\EntitlementService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

/**
 * Proves every trial/subscription access decision is made from the SERVER clock
 * (Carbon::now(), UTC) — never from a client-supplied timestamp or the device's
 * clock.
 *
 * These tests "move the device clock" by simply not sending any timestamp, and
 * "move the server clock" with Carbon::setTestNow(). The key invariant: a client
 * that changes its device clock has no way to influence the server's answer,
 * because none of these code paths reads anything the client sent.
 */
class ServerAuthoritativeAccessTest extends TestCase
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

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    protected function actingAsCompanyAdmin(Company $company): User
    {
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        return $user;
    }

    protected function makeActiveSubscription(Company $company, array $overrides = []): Subscription
    {
        return Subscription::factory()->create(array_merge([
            'company_id' => $company->id,
            'plan_id' => Plan::factory()->create()->id,
            'status' => 'active',
            'ends_at' => Carbon::now()->addMonth(),
        ], $overrides));
    }

    // ─────────────────────────────────────────────────────────────────────
    // SERVER AUTHORITATIVE TRIAL
    // ─────────────────────────────────────────────────────────────────────

    public function test_client_supplied_timestamp_does_not_extend_trial(): void
    {
        // A "spoofed" future timestamp arriving from the client must be ignored.
        $clientClaimsNow = Carbon::now()->addMonths(6)->toISOString();

        $company = Company::factory()->create([
            'trial_ends_at' => Carbon::now()->addDays(2),
        ]);

        $service = app(AccessStateService::class);

        // Pass the forged client time in as a header/request input — it is never
        // read by the resolver, so the trial remains active until the SERVER
        // clock passes the boundary.
        $this->withHeaders(['X-Device-Time' => $clientClaimsNow]);
        $this->assertTrue($service->hasAccess($company));

        // Advance the server clock past the trial boundary.
        Carbon::setTestNow(Carbon::now()->addDays(3));

        // Same company, same "client clock" claim, but access is gone because the
        // server clock decided the trial lapsed.
        $this->withHeaders(['X-Device-Time' => $clientClaimsNow]);
        $this->assertFalse($service->hasAccess($company));
        $this->assertTrue($service->isLocked($company));
    }

    public function test_trial_expiry_is_measured_on_server_clock(): void
    {
        $company = Company::factory()->create([
            'trial_ends_at' => Carbon::now()->addDays(10),
        ]);

        $this->assertFalse($company->isAccessLocked());

        // Simulate the server clock advancing 10+ days (the only clock that
        // decides expiry). A client moving its own clock is irrelevant.
        Carbon::setTestNow(Carbon::now()->addDays(11));

        $this->assertTrue($company->isAccessLocked());
        $this->assertFalse($company->isTrialActive());
    }

    // ─────────────────────────────────────────────────────────────────────
    // SERVER AUTHORITATIVE SUBSCRIPTION
    // ─────────────────────────────────────────────────────────────────────

    public function test_expired_subscription_cannot_be_reopened_by_client_clock_claim(): void
    {
        $company = Company::factory()->trialExpired()->create();
        $this->makeActiveSubscription($company, ['ends_at' => Carbon::now()->addDay()]);

        $entitlements = app(EntitlementService::class);
        $service = app(AccessStateService::class);

        // Subscription is currently live.
        $this->assertNotNull($entitlements->entitledSubscription($company));

        // The client "goes back in time" and claims it is a month earlier.
        $clientClaimsPast = Carbon::now()->subMonth()->toISOString();

        // Advance the server clock past the subscription period end.
        Carbon::setTestNow(Carbon::now()->addDays(2));

        // Even though the client's device says it is a month in the past, the
        // server clock has passed `ends_at`, so no subscription grants access.
        $this->withHeaders(['X-Device-Time' => $clientClaimsPast]);
        $this->assertNull($entitlements->entitledSubscription($company));
        $this->assertFalse($entitlements->hasEntitledSubscription($company));
        $this->assertTrue($service->isLocked($company));
    }

    public function test_grace_period_expiry_is_server_authoritative(): void
    {
        $company = Company::factory()->trialExpired()->create();

        Subscription::factory()->gracePeriod()->create([
            'company_id' => $company->id,
            'plan_id' => Plan::factory()->create()->id,
            'grace_ends_at' => Carbon::now()->addDay(),
        ]);

        $this->assertFalse($company->isAccessLocked());

        Carbon::setTestNow(Carbon::now()->addDays(2));

        // A client claiming an earlier time cannot resurrect the grace window.
        $this->assertTrue($company->isAccessLocked());
        $this->assertNull($company->activeSubscription());
    }

    // ─────────────────────────────────────────────────────────────────────
    // ACCESS CHECKS (middleware + resource) IGNORE CLIENT CLOCK
    // ─────────────────────────────────────────────────────────────────────

    public function test_check_company_access_uses_server_clock_not_client_claims(): void
    {
        $company = Company::factory()->create([
            'trial_ends_at' => Carbon::now()->addDay(),
        ]);
        $user = $this->actingAsCompanyAdmin($company);

        // The client forwards a forged future "device time" header on every
        // request. It must never influence the middleware's decision.
        $this->withHeaders(['X-Device-Time' => Carbon::now()->addYears(1)->toISOString()]);
        $this->getJson('/api/v1/dashboard/overview')->assertOk();

        // Server clock passes the trial boundary.
        Carbon::setTestNow(Carbon::now()->addDays(2));

        // Same forged client header — the server now locks the company because
        // the SERVER clock decided the trial ended.
        $this->withHeaders(['X-Device-Time' => Carbon::now()->addYears(1)->toISOString()]);
        $this->getJson('/api/v1/dashboard/overview')->assertStatus(423);
    }

    public function test_me_resource_lock_flag_is_server_authoritative(): void
    {
        $company = Company::factory()->create([
            'trial_ends_at' => Carbon::now()->addDay(),
        ]);
        $this->actingAsCompanyAdmin($company);

        // Client forwards a forged timestamp; resource must reflect server state.
        $this->withHeaders(['X-Device-Time' => Carbon::now()->subYears(1)->toISOString()]);
        $this->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.company_access.is_locked', false);

        Carbon::setTestNow(Carbon::now()->addDays(2));

        // Even though the client claims it is a year in the past, the server
        // clock has lapsed the trial, so the resource reports locked.
        $this->withHeaders(['X-Device-Time' => Carbon::now()->subYears(1)->toISOString()]);
        $this->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.company_access.is_locked', true);
    }

    public function test_ensure_active_subscription_middleware_is_server_authoritative(): void
    {
        $company = Company::factory()->trialExpired()->create();
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');

        $middleware = app(\App\Http\Middleware\EnsureActiveSubscription::class);
        $request = Request::create('/api/v1/__clock-probe', 'GET');
        $request->headers->set('X-Device-Time', Carbon::now()->subMonths(3)->toISOString());
        $request->setUserResolver(fn () => $user);

        // No subscription at all → 402 regardless of the client's clock claim.
        $response = $middleware->handle($request, fn ($req) => response()->json(['success' => true]));
        $this->assertSame(402, $response->getStatusCode());

        // Add an active subscription (server clock based).
        $this->makeActiveSubscription($company, ['ends_at' => Carbon::now()->addMonth()]);

        $response = $middleware->handle($request, fn ($req) => response()->json(['success' => true]));
        $this->assertSame(200, $response->getStatusCode());
    }

    // ─────────────────────────────────────────────────────────────────────
    // ALL DECISION PATHS AGREE (single source of truth)
    // ─────────────────────────────────────────────────────────────────────

    public function test_all_access_paths_agree_after_server_clock_advances(): void
    {
        $company = Company::factory()->create([
            'trial_ends_at' => Carbon::now()->addDays(5),
        ]);
        $this->makeActiveSubscription($company, ['ends_at' => Carbon::now()->addDays(2)]);

        $service = app(AccessStateService::class);
        $entitlements = app(EntitlementService::class);

        $this->assertTrue($service->hasAccess($company));
        $this->assertTrue($entitlements->hasEntitledSubscription($company));
        $this->assertFalse($company->isAccessLocked());

        // Server clock passes the subscription `ends_at` (trial is still open).
        Carbon::setTestNow(Carbon::now()->addDays(3));

        $this->assertTrue($service->isTrialActive($company));
        $this->assertFalse($entitlements->hasEntitledSubscription($company));
        $this->assertFalse($company->isAccessLocked());

        // Server clock passes the trial boundary too → locked everywhere.
        Carbon::setTestNow(Carbon::now()->addDays(6));

        $this->assertFalse($service->hasAccess($company));
        $this->assertTrue($service->isLocked($company));
        $this->assertTrue($company->isAccessLocked());
        $this->assertFalse($entitlements->hasEntitledSubscription($company));
    }
}
