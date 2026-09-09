<?php

namespace App\Services;

use App\Exceptions\UserSeatLimitExceededException;
use App\Models\Company;
use App\Models\EmployeeInvitation;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Notifications\SeatLimitReachedNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

/**
 * Seat-capacity enforcement for the per-seat (user-account) billing model.
 *
 * A "seat" is one active user account — any user belonging to the company whose
 * role is not the platform-wide `super_admin` and whose status is `active`, with
 * or without an employee profile (the founding company admin counts as one seat).
 *
 * This service is the single guard every account-activation path funnels through
 * (setting an employee Active in the directory, accepting an invitation,
 * completing a password setup that promotes an invited account, etc.). Creating
 * a pending/invited account never consumes a seat; only the transition to
 * `status = 'active'` does.
 *
 * Concurrency: activations are serialized on the entitled subscription's plan row
 * (`lockForUpdate` inside a transaction) so two simultaneous sign-ups cannot both
 * read "one seat left" and overshoot the allowance.
 */
class SeatCapacityService
{
    public function __construct(
        private UsageService $usage,
        private EntitlementService $entitlements,
    ) {}

    /**
     * Assert that activating one more account would fit within the company's
     * entitled plan seat allowance.
     *
     * Accounts that are not switching into an active state (invited, inactive,
     * suspended) are not seats yet, so they never trigger this guard. The
     * founding company admin — created active at registration time — consumes a
     * seat, which is why registration itself is exempt but every later
     * activation is not.
     *
     * @throws UserSeatLimitExceededException when the company is already at (or
     *         over) its entitled plan's seat limit and the optional $exclude
     *         account does not make room.
     */
    public function assertCanActivateUser(Company $company, ?User $exclude = null): void
    {
        DB::transaction(function () use ($company, $exclude): void {
            $subscription = $this->lockEntitledPlan($company);
            $plan = $subscription?->plan;

            if ($plan === null || $plan->hasUnlimitedSeats()) {
                return;
            }

            $limit = $plan->maxSeats();
            $used = $this->usage->activeSeats($company, $exclude);

            if ($used >= $limit) {
                throw new UserSeatLimitExceededException(
                    'Your plan only allows '.$limit.' active members. Upgrade your plan to add more.',
                    'EMPLOYEE_CAPACITY_REACHED',
                    [
                        'used' => $used,
                        'limit' => $limit,
                        'remaining' => max(0, $limit - $used),
                    ],
                    422,
                );
            }
        });
    }

    /**
     * Assert that sending an invitation is permitted under the seat allowance.
     *
     * While the plan is at (or over) its seat limit **every** invitation send is
     * refused — including re-sends of an existing pending member. The invitee
     * could not accept (activate) until a seat frees up, so an emailed link or
     * code would be un-actionable; keeping it alive would only mislead the
     * invitee. At the same moment every outstanding invitation for the company
     * is force-expired (its secrets are cleared, so any emailed link or code
     * stops working immediately) and every `company_admin` is notified in-app
     * and by email that the plan is out of seats.
     *
     * @throws UserSeatLimitExceededException when the company is already at (or
     *         over) its entitled plan's seat limit and there is no room for a
     *         new invitee.
     */
    public function assertCanSendInvitation(Company $company, ?User $existingUser = null): void
    {
        // The check runs inside a transaction so the plan row is read under a
        // lock, but only a verdict is returned — nothing is persisted here.
        $full = DB::transaction(function () use ($company): ?array {
            $subscription = $this->lockEntitledPlan($company);
            $plan = $subscription?->plan;

            if ($plan === null || $plan->hasUnlimitedSeats()) {
                return null;
            }

            $limit = $plan->maxSeats();
            $used = $this->usage->activeSeats($company);

            // There is room for the future acceptance — the invite may go out.
            if ($used < $limit) {
                return null;
            }

            return ['used' => $used, 'limit' => $limit];
        });

        if ($full === null) {
            return;
        }

        [$used, $limit] = [$full['used'], $full['limit']];

        // Deliberately OUTSIDE the transaction: the exception below must not
        // roll back the force-expiration, or the outstanding invitations would
        // stay live while the send is refused.
        $this->expireOutstandingInvitations($company);
        $this->notifyAdminsOfSeatLimit($company, $used, $limit);

        throw new UserSeatLimitExceededException(
            'Your plan only allows '.$limit.' active members. Upgrade your plan to add more, or deactivate another member to free a seat.',
            'EMPLOYEE_CAPACITY_REACHED',
            [
                'used' => $used,
                'limit' => $limit,
                'remaining' => max(0, $limit - $used),
            ],
            422,
        );
    }

    /**
     * Force-expire every outstanding (pending, unaccepted) invitation of the
     * company.
     *
     * The secrets (web token, mobile code, setup token) are cleared — making
     * any previously emailed link or code unusable immediately — and the expiry
     * timestamps are stamped to now, so `isPending()` flips to false and the
     * directory shows the row as "expired" instead of "pending". The ledger row
     * itself is kept for the audit trail.
     *
     * @return int The number of invitations that were expired.
     */
    public function expireOutstandingInvitations(Company $company): int
    {
        return EmployeeInvitation::query()
            ->where('company_id', $company->id)
            ->whereNull('accepted_at')
            ->where(function ($query): void {
                // Still-live invitations only: a web token that has not expired,
                // or a mobile code/setup token that is still redeemable.
                $query->whereNotNull('token_hash')
                    ->orWhereNotNull('code_hash')
                    ->orWhereNotNull('setup_token_hash');
            })
            ->update([
                'token_hash' => null,
                'expires_at' => now(),
                'code_hash' => null,
                'code_expires_at' => now(),
                'code_attempts' => 0,
                'setup_token_hash' => null,
                'setup_token_expires_at' => now(),
            ]);
    }

    /**
     * Notify every `company_admin` of the company that the seat allowance is
     * exhausted — in-app (database + broadcast) and by email.
     *
     * Mirrors the admin-notification pattern used by the billing webhook
     * controller and the trial/renewal reminder commands.
     */
    public function notifyAdminsOfSeatLimit(Company $company, int $used, int $limit): void
    {
        $notification = new SeatLimitReachedNotification($company, $used, $limit);

        $company->users()
            // Admins are identified by the `role` column or the Spatie role —
            // both exist in the wild (the founding admin is created with the
            // column set; directory-invited admins get the Spatie role).
            ->where(function ($query): void {
                $query->where('role', 'company_admin')
                    ->orWhereHas('roles', fn ($roles) => $roles->where('name', 'company_admin'));
            })
            ->each(function (User $user) use ($notification): void {
                $user->notify($notification);
            });
    }

    /**
     * Lock the row that defines the company's current seat allowance for the
     * duration of the caller's transaction.
     *
     * Returns the entitled subscription (with its plan loaded) so the guard can
     * read a stable `max_employees` while concurrent activations are serialized
     * on the same row.
     */
    protected function lockEntitledPlan(Company $company): ?Subscription
    {
        $subscription = $this->entitlements
            ->entitledSubscription($company);

        if ($subscription === null) {
            return null;
        }

        $locked = Subscription::query()
            ->whereKey($subscription->getKey())
            ->lockForUpdate()
            ->with('plan')
            ->first();

        return $locked;
    }
}
