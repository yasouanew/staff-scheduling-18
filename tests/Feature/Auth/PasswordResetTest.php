<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Notifications\ResetPasswordNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * Password reset is driven entirely by the SPA against the JSON API
 * (`/api/v1/auth/...`); the Breeze web routes in `routes/auth.php` are not
 * registered in bootstrap/app.php, so they must not be exercised here.
 */
class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    public function test_reset_password_link_can_be_requested(): void
    {
        Notification::fake();

        $user = User::factory()->create();

        $this->postJson('/api/v1/auth/forgot-password', ['email' => $user->email])
            ->assertOk();

        // The app overrides sendPasswordResetNotification with its own class.
        Notification::assertSentTo($user, ResetPasswordNotification::class);
    }

    public function test_password_can_be_reset_with_valid_token(): void
    {
        Notification::fake();

        $user = User::factory()->create();

        $this->postJson('/api/v1/auth/forgot-password', ['email' => $user->email]);

        Notification::assertSentTo($user, ResetPasswordNotification::class, function ($notification) use ($user) {
            $this->postJson('/api/v1/auth/reset-password', [
                'token' => $notification->token,
                'email' => $user->email,
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ])->assertOk();

            return true;
        });

        $this->assertTrue(Hash::check('new-password', $user->refresh()->password));
    }

    /**
     * Invited employees are created with `status = 'invited'` and a random
     * password, then emailed a link to choose their own. Setting that password
     * is what accepts the invitation, so it must also activate the account —
     * otherwise login rejects them as inactive and the invite is a dead end.
     */
    public function test_setting_password_activates_an_invited_account(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'status' => 'invited',
            'email_verified_at' => null,
        ]);

        $this->postJson('/api/v1/auth/forgot-password', ['email' => $user->email]);

        Notification::assertSentTo($user, ResetPasswordNotification::class, function ($notification) use ($user) {
            $this->postJson('/api/v1/auth/reset-password', [
                'token' => $notification->token,
                'email' => $user->email,
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ])->assertOk();

            return true;
        });

        $user->refresh();

        $this->assertSame('active', $user->status);
        $this->assertNotNull($user->email_verified_at);

        // The freshly activated credentials must now pass the login gate.
        $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'new-password',
        ])->assertOk();
    }

    /**
     * A deactivated account must not be silently re-enabled by a password
     * reset — only pending invitations are activated.
     */
    public function test_resetting_password_does_not_reactivate_an_inactive_account(): void
    {
        Notification::fake();

        $user = User::factory()->create(['status' => 'inactive']);

        $this->postJson('/api/v1/auth/forgot-password', ['email' => $user->email]);

        Notification::assertSentTo($user, ResetPasswordNotification::class, function ($notification) use ($user) {
            $this->postJson('/api/v1/auth/reset-password', [
                'token' => $notification->token,
                'email' => $user->email,
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ])->assertOk();

            return true;
        });

        $this->assertSame('inactive', $user->refresh()->status);
    }
}
