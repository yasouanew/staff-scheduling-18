<?php

namespace App\Services;

use App\Exceptions\InvitationPendingException;
use App\Models\Employee;
use App\Models\User;
use App\Notifications\EmployeeInvitationNotification;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class EmployeeService
{
    public function __construct(
        private BranchSubscriptionService $branchSubscriptions,
        private SeatCapacityService $seats,
    ) {}

    /**
     * Get a paginated, filterable list of employees.
     *
     * @param  array<string, mixed>  $filters
     */
    public function paginate(array $filters = []): LengthAwarePaginator
    {
        $perPage = (int) ($filters['per_page'] ?? 15);

        return Employee::query()
            ->with(['company', 'user', 'department', 'position', 'branch', 'invitation'])

            ->when(! empty($filters['company_id']), fn ($query) => $query->where('company_id', $filters['company_id']))
            ->when(! empty($filters['department_id']), fn ($query) => $query->where('department_id', $filters['department_id']))
            ->when(! empty($filters['position_id']), fn ($query) => $query->where('position_id', $filters['position_id']))
            ->when(! empty($filters['branch_id']), fn ($query) => $query->where('branch_id', $filters['branch_id']))
            ->when(! empty($filters['employment_type']), fn ($query) => $query->where('employment_type', $filters['employment_type']))
            ->when(! empty($filters['status']), fn ($query) => $query->where('status', $filters['status']))
            ->when(! empty($filters['search']), function ($query) use ($filters) {
                $search = $filters['search'];
                $query->where(function ($q) use ($search) {
                    $q->where('first_name', 'like', "%{$search}%")
                        ->orWhere('last_name', 'like', "%{$search}%")
                        ->orWhere('employee_number', 'like', "%{$search}%");
                });
            })
            ->latest()
            ->paginate($perPage)
            ->withQueryString();
    }

    /**
     * Create a new employee record.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Employee
    {
        return DB::transaction(function () use ($data) {
            if (isset($data['photo']) && $data['photo'] instanceof UploadedFile) {
                $data['photo'] = $this->storePhoto($data['photo']);
            }

            // Assigning to a branch consumes that branch's employee capacity.
            $this->assertCapacityForAssignment($data['company_id'] ?? null, $data['branch_id'] ?? null);

            return Employee::create($data)->load(['company', 'department', 'position', 'branch']);
        });
    }

    /**
     * Update an existing employee record.
     *
     * A status change is not merely a label: an employee who is no longer
     * `active` must lose access straight away, so the linked login account is
     * synchronised in the same transaction as the profile edit. A role change is
     * applied to the linked `users` row in the same transaction, because the
     * role lives on the login account, not the employee profile.
     *
     * Setting a member `active` is refused while their linked account is still
     * `invited` (InvitationPendingException): only accepting the invitation
     * activates the account, and with it the held `pending` row. Re-saving a
     * `pending` member (the edit dialog always re-submits the current status)
     * leaves their account and outstanding invitation untouched.
     *
     * @param  array<string, mixed>  $data
     *
     * @throws \App\Exceptions\InvitationPendingException when an invited
     *         account's row is set to `active`
     */
    public function update(Employee $employee, array $data): Employee
    {
        return DB::transaction(function () use ($employee, $data) {
            // The employment status of a member who is still awaiting
            // acceptance (`pending`) is locked: from this state the only way
            // forward is the invitee accepting their invitation (which flips
            // both the account and the row to `active`). An administrator
            // changing it by hand — even to `inactive` — would either bypass
            // the acceptance-only activation rule or strand the outstanding
            // invitation, so every status change away from `pending` is
            // refused. Re-submitting `pending` (profile edits) stays a no-op,
            // handled by syncAccountAccess() below.
            $wasPending = $employee->status === 'pending';

            $requestedStatus = $data['status'] ?? null;

            if ($wasPending && $requestedStatus !== null && $requestedStatus !== 'pending') {
                throw new InvitationPendingException(
                    $requestedStatus === 'active'
                        ? "This member hasn't accepted their invitation yet. They become Active automatically once they accept."
                        : "This member is still awaiting their invitation, so their employment status can't be changed yet. Wait for them to accept, or revoke their invitation."
                );
            }

            if (isset($data['photo']) && $data['photo'] instanceof UploadedFile) {
                $data['photo'] = $this->storePhoto($data['photo']);
            }

            // Moving an active employee to a (different) branch consumes that
            // branch's capacity. The employee's company is the authoritative
            // business scope, never a client-supplied company id.
            $movesBranch = array_key_exists('branch_id', $data)
                && (int) $data['branch_id'] !== (int) $employee->branch_id;

            if ($movesBranch) {
                $this->assertCapacityForAssignment($employee->company_id, $data['branch_id']);
            }

            // The role is not a column on the employee row — it belongs to the
            // linked user account — so pull it out before the fillable update
            // (which would otherwise silently ignore it) and apply it there.
            $role = array_key_exists('role', $data) ? $data['role'] : null;
            unset($data['role']);

            $employee->update($data);

            if ($role !== null && $employee->user !== null) {
                $this->applyRoleToUser($employee->user, $role);
            }

            if (array_key_exists('status', $data)) {
                $this->syncAccountAccess($employee->refresh());
            }

            return $employee->refresh()->load([
                'company', 'user', 'department', 'position', 'branch', 'invitation',
            ]);
        });
    }

    /**
     * Bring the linked login account in line with the employee's status.
     *
     * Deactivating someone has to take effect immediately, not at the end of
     * their session, so this revokes every credential they hold rather than only
     * flipping a flag:
     *
     *  - `status = 'inactive'` makes `LoginAction` refuse future sign-ins, and
     *    `EnsureActiveAccount` reject the API tokens they already have.
     *  - API tokens are deleted, so any phone or browser still holding one is
     *    logged out on its next request.
     *  - Pending password-reset tokens are dropped, closing the loophole where a
     *    "forgot password" email sent moments earlier could still be redeemed.
     *  - Any outstanding invitation is revoked, so an emailed link or code cannot
     *    be used to walk back in and set a password.
     *  - Push tokens are deactivated, so a locked-out device stops receiving
     *    roster notifications.
     *
     * Activating means *reactivating a real login*: the linked user must already
     * be `active` (a no-op re-save) or have chosen a password before (an
     * `inactive` account flipped back to `active` re-takes a seat, so it passes
     * the seat guard). A still-`invited` account has never chosen a password —
     * it consumes no seat and must stay out of the active counts — so an admin
     * cannot hand-flip its directory row to `active` ahead of acceptance. Only
     * acceptance (web set-password link / mobile code / reset-password) promotes
     * the account and the held `pending` row to `active`, and the seat guard
     * runs there.
     */
    public function syncAccountAccess(Employee $employee): void
    {
        $user = $employee->user;

        if ($user === null) {
            return;
        }

        if ($employee->status === 'active') {
            // A seat is an *active user account*, so being an `active` member
            // requires a real accepted login. An `invited` account is exactly
            // the directory-vs-seat mismatch this model eliminates (shows as
            // Active while consuming no seat), so refuse the hand-flip rather
            // than running the capacity guard: there is no seat to take yet,
            // and acceptance is the only legitimate activation path.
            if ($user->status === 'invited') {
                throw new InvitationPendingException();
            }

            // Reactivating a deactivated member who already chose a password
            // re-takes a seat, so it must pass the guard (excluding the user
            // being activated, so the same account never self-blocks). Re-saving
            // someone who is already active is a no-op and never consumes one.
            if ($user->status !== 'active') {
                $this->seats->assertCanActivateUser($employee->company, $user);
            }

            $user->forceFill(['status' => 'active'])->save();

            return;
        }

        // A member still awaiting acceptance (`pending` row linked to an
        // `invited` account) has an outstanding invitation that must stay alive
        // so they can accept it. Re-saving a pending member's profile — the edit
        // dialog always re-submits the current `pending` status — is therefore a
        // no-op for account access: never deactivate the account or revoke the
        // invitation. (Moving the row to `inactive`/`terminated` is a real
        // deactivation and falls through to the revocation below.)
        if ($employee->status === 'pending' && $user->status === 'invited') {
            return;
        }

        $user->forceFill(['status' => 'inactive'])->save();

        // Kill everything the person could still authenticate with.
        $user->tokens()->delete();

        DB::table('password_reset_tokens')->where('email', $user->email)->delete();

        $user->deviceTokens()->update(['is_active' => false]);

        if ($employee->invitation !== null) {
            app(InvitationService::class)->revoke($employee->invitation);
        }
    }


    /**
     * Delete an employee record and free its seat.
     *
     * Deleting a directory member must not leave an orphaned active login
     * behind — that would keep consuming a seat while the person is gone. If a
     * linked user exists it is deactivated (status inactive, all credentials
     * revoked) in the same transaction so the seat is freed immediately.
     */
    public function delete(Employee $employee): bool
    {
        return DB::transaction(function () use ($employee) {
            if ($employee->photo) {
                Storage::disk('public')->delete($employee->photo);
            }

            $user = $employee->user;

            if ($user !== null) {
                $user->forceFill(['status' => 'inactive'])->save();

                // Kill every way the person could still authenticate, mirroring
                // syncAccountAccess()'s deactivation branch so the seat is freed
                // and the account is not left half-open.
                $user->tokens()->delete();

                DB::table('password_reset_tokens')->where('email', $user->email)->delete();

                $user->deviceTokens()->update(['is_active' => false]);
            }

            return (bool) $employee->delete();
        });
    }

    /**
     * Invite a new employee: create a linked user account, assign a role,
     * create the employee profile, and email an invitation to set a password.
     *
     * The invitee is always emailed and their login account is created
     * `invited` (no seat consumed). To keep the directory aligned with seats,
     * the employee row always starts `pending` too — it is not schedulable and
     * is not counted as an active member until the invitee actually accepts
     * (sets their password), at which point acceptance flips both the login
     * account and the employee row to `active` (the seat guard runs there).
     * Only a real active login therefore shows as Active and consumes a seat.
     *
     * @param  array<string, mixed>  $data
     */
    public function invite(array $data): Employee
    {
        return DB::transaction(function () use ($data) {
            // Assigning to a branch consumes that branch's employee capacity.
            $this->assertCapacityForAssignment($data['company_id'] ?? null, $data['branch_id'] ?? null);

            // Refuse sending an invitation email while the plan is already at
            // its seat limit: the invitee could not activate until a seat
            // frees up, so guide the admin to upgrade or deactivate another
            // member before an un-actionable email goes out. The invitation
            // itself consumes no seat — this gate exists so we never email a
            // person who is guaranteed to be stuck at acceptance.
            $company = \App\Models\Company::find($data['company_id']);
            if ($company !== null) {
                $this->seats->assertCanSendInvitation($company);
            }

            $user = User::create([
                'company_id' => $data['company_id'],
                'branch_id' => $data['branch_id'] ?? null,
                'name' => trim($data['first_name'].' '.$data['last_name']),
                'email' => $data['email'],
                'phone' => $data['phone'] ?? null,
                'password' => bcrypt(Str::random(32)),
                'role' => $data['role'],
                'status' => 'invited',
            ]);

            $user->assignRole($data['role']);

            // The invitation has not been accepted yet, so the employee is
            // always held `pending` (not schedulable, not an active member).
            // Accepting the invitation promotes both the login account and
            // this row to `active` — at which point the seat guard applies.

            $employee = Employee::create([
                'company_id' => $data['company_id'],
                'user_id' => $user->id,
                'department_id' => $data['department_id'] ?? null,
                'position_id' => $data['position_id'] ?? null,
                'branch_id' => $data['branch_id'] ?? null,
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'employment_type' => $data['employment_type'] ?? 'full_time',
                'hourly_rate' => $data['hourly_rate'] ?? null,
                'status' => 'pending',
            ]);

            $this->sendInvitation($user, $data['company_name'] ?? null);

            return $employee->load(['company', 'user', 'department', 'position', 'branch']);
        });
    }

    /**
     * Send (or resend) the invitation email to an employee's user account.
     */
    public function sendInvitation(User $user, ?string $companyName = null): void
    {
        $token = Password::broker()->createToken($user);

        $user->notify(new EmployeeInvitationNotification($token, $companyName));
    }

    /**
     * Assign a role to the employee's linked user account.
     *
     * Kept as a dedicated endpoint so callers that only change the role (the
     * row menu's "change role" flow) do not need to submit the whole profile.
     */
    public function assignRole(Employee $employee, string $role): Employee
    {
        return DB::transaction(function () use ($employee, $role) {
            if ($employee->user) {
                $this->applyRoleToUser($employee->user, $role);
            }

            return $employee->load('user');
        });
    }

    /**
     * Persist a role on a linked user account.
     *
     * The Spatie role (gate/permission checks) and the `users.role` column
     * (used for lightweight navigation decisions and the directory's badge)
     * must never drift, so both are written together.
     */
    protected function applyRoleToUser(User $user, string $role): void
    {
        $user->syncRoles([$role]);
        $user->update(['role' => $role]);
    }

    /**
     * Assign a department to the employee.
     */
    public function assignDepartment(Employee $employee, ?int $departmentId): Employee
    {
        return DB::transaction(function () use ($employee, $departmentId) {
            $employee->update(['department_id' => $departmentId]);

            return $employee->refresh()->load('department');
        });
    }

    /**
     * Assign a position to the employee.
     */
    public function assignPosition(Employee $employee, ?int $positionId): Employee
    {
        return DB::transaction(function () use ($employee, $positionId) {
            $employee->update(['position_id' => $positionId]);

            return $employee->refresh()->load('position');
        });
    }

    /**
     * Upload (and replace) the employee's profile photo.
     */
    public function uploadPhoto(Employee $employee, UploadedFile $photo): Employee
    {
        return DB::transaction(function () use ($employee, $photo) {
            if ($employee->photo) {
                Storage::disk('public')->delete($employee->photo);
            }

            $employee->update(['photo' => $this->storePhoto($photo)]);

            return $employee->refresh();
        });
    }

    /**
     * Persist an uploaded photo to the public disk and return its path.
     */
    protected function storePhoto(UploadedFile $photo): string
    {
        return $photo->store('employees/photos', 'public');
    }

    /**
     * Enforce branch employee capacity when assigning an employee to a branch.
     *
     * Capacity rules only apply once an employee is actually assigned to a
     * branch, so employees without a branch (and updates that keep the branch
     * unchanged) are left untouched. The company id is resolved from the
     * validated payload (controllers pin it to the authenticated user's company
     * for non-super-admins) and the branch is re-scoped server-side by the
     * BranchSubscriptionService before any capacity check runs.
     *
     * @throws \App\Exceptions\BranchCapacityException when the branch is full,
     *         not entitled, or belongs to another business.
     */
    protected function assertCapacityForAssignment(mixed $companyId, mixed $branchId): void
    {
        if ($branchId === null || $branchId === '' || $branchId === 0) {
            return;
        }

        $company = \App\Models\Company::find((int) $companyId);
        $branch = \App\Models\Branch::find((int) $branchId);

        if ($company === null || $branch === null) {
            return;
        }

        $this->branchSubscriptions->assertCanAddEmployee($company, $branch, 1);
    }
}
