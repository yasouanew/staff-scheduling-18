<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The SPA updates the authenticated user's password via the JSON API
 * (`PUT /api/v1/auth/password`). The password update no longer requires the
 * current password — only the new password and its confirmation.
 */
class ApiPasswordUpdateTest extends TestCase
{
    use RefreshDatabase;

    public function test_password_can_be_updated_without_current_password(): void
    {
        $user = User::factory()->create(['password' => Hash::make('old-password')]);
        Sanctum::actingAs($user);

        $this->putJson('/api/v1/auth/password', [
            'password' => 'new-password',
            'password_confirmation' => 'new-password',
        ])
            ->assertOk()
            ->assertJson([
                'success' => true,
                'message' => 'Password updated successfully.',
            ]);

        $this->assertTrue(Hash::check('new-password', $user->refresh()->password));
    }

    public function test_password_update_requires_matching_confirmation(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->putJson('/api/v1/auth/password', [
            'password' => 'new-password',
            'password_confirmation' => 'different-password',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('password');

        $this->assertTrue(Hash::check('password', $user->refresh()->password));
    }

    public function test_password_update_requires_a_strong_password(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->putJson('/api/v1/auth/password', [
            'password' => 'weak',
            'password_confirmation' => 'weak',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('password');
    }

    public function test_unauthenticated_user_cannot_update_password(): void
    {
        $this->putJson('/api/v1/auth/password', [
            'password' => 'new-password',
            'password_confirmation' => 'new-password',
        ])->assertUnauthorized();
    }
}
