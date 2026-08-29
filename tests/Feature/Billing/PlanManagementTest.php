<?php

namespace Tests\Feature\Billing;

use App\Models\Plan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class PlanManagementTest extends TestCase
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
        $companyAdmin->syncPermissions(['subscription.view']);

        Role::findOrCreate('employee', 'web');
    }

    protected function actingAsSuperAdmin(): User
    {
        $user = User::factory()->create();
        $user->assignRole('super_admin');
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_guest_cannot_access_plans(): void
    {
        $this->getJson('/api/v1/plans')->assertUnauthorized();
    }

    public function test_super_admin_can_list_plans(): void
    {
        $this->actingAsSuperAdmin();
        Plan::factory()->count(3)->create();

        $this->getJson('/api/v1/plans')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(3, 'data.data');
    }

    public function test_super_admin_can_create_a_plan(): void
    {
        $this->actingAsSuperAdmin();

        $payload = [
            'name' => 'Growth',
            'slug' => 'growth',
            'price_monthly' => 49.00,
            'price_yearly' => 490.00,
            'max_employees' => 50,
        ];

        $this->postJson('/api/v1/plans', $payload)
            ->assertCreated()
            ->assertJsonPath('data.name', 'Growth');

        $this->assertDatabaseHas('plans', ['slug' => 'growth']);
    }

    public function test_creating_a_plan_requires_a_name(): void
    {
        $this->actingAsSuperAdmin();

        $this->postJson('/api/v1/plans', ['slug' => 'no-name'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('name');
    }

    public function test_slug_must_be_unique(): void
    {
        $this->actingAsSuperAdmin();
        Plan::factory()->create(['slug' => 'starter']);

        $this->postJson('/api/v1/plans', [
            'name' => 'Starter Two',
            'slug' => 'starter',
            'price_monthly' => 10,
            'price_yearly' => 100,
        ])->assertUnprocessable()->assertJsonValidationErrors('slug');
    }

    public function test_super_admin_can_update_a_plan(): void
    {
        $this->actingAsSuperAdmin();
        $plan = Plan::factory()->create(['name' => 'Old']);

        $this->putJson("/api/v1/plans/{$plan->id}", ['name' => 'New'])
            ->assertOk()
            ->assertJsonPath('data.name', 'New');

        $this->assertDatabaseHas('plans', ['id' => $plan->id, 'name' => 'New']);
    }

    public function test_super_admin_can_delete_a_plan(): void
    {
        $this->actingAsSuperAdmin();
        $plan = Plan::factory()->create();

        $this->deleteJson("/api/v1/plans/{$plan->id}")->assertOk();
        $this->assertDatabaseMissing('plans', ['id' => $plan->id]);
    }

    public function test_company_admin_can_view_but_not_manage_plans(): void
    {
        $user = User::factory()->create();
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        Plan::factory()->count(2)->create();

        $this->getJson('/api/v1/plans')->assertOk()->assertJsonCount(2, 'data.data');

        $this->postJson('/api/v1/plans', [
            'name' => 'Nope',
            'slug' => 'nope',
            'price_monthly' => 1,
            'price_yearly' => 10,
        ])->assertForbidden();
    }

    public function test_employee_cannot_view_plans(): void
    {
        $user = User::factory()->create();
        $user->assignRole('employee');
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/plans')->assertForbidden();
    }
}
