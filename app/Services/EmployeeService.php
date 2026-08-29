<?php

namespace App\Services;

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
     * synchronised in the same transaction as the profile edit.
     *
     * @param  array<string, mixed>  $data
     */
    public function update(Employee $employee, array $data): Employee
    {
        return DB::transaction(function () use ($employee, $data) {
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

            $employee->update($data);

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
     * Re-activating restores sign-in for anyone who has already chosen a
     * password. Accounts still awaiting their first password stay `invited`,
     * because activating them here would leave an account whose password is the
     * random placeholder from the invitation.
     */
    public function syncAccountAccess(Employee $employee): void
    {
        $user = $employee->user;

        if ($user === null) {
            return;
        }

        if ($employee->status === 'active') {
            // Never resurrect an account that has not set a password yet.
            if ($user->status !== 'invited') {
                $user->forceFill(['status' => 'active'])->save();
            }

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
     * Delete an employee record.
     */
    public function delete(Employee $employee): bool
    {
        return DB::transaction(function () use ($employee) {
            if ($employee->photo) {
                Storage::disk('public')->delete($employee->photo);
            }

            return (bool) $employee->delete();
        });
    }

    /**
     * Invite a new employee: create a linked user account, assign a role,
     * create the employee profile, and email an invitation to set a password.
     *
     * @param  array<string, mixed>  $data
     */
    public function invite(array $data): Employee
    {
        return DB::transaction(function () use ($data) {
            // Assigning to a branch consumes that branch's employee capacity.
            $this->assertCapacityForAssignment($data['company_id'] ?? null, $data['branch_id'] ?? null);

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
                'status' => 'active',
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
     */
    public function assignRole(Employee $employee, string $role): Employee
    {
        return DB::transaction(function () use ($employee, $role) {
            if ($employee->user) {
                $employee->user->syncRoles([$role]);
                $employee->user->update(['role' => $role]);
            }

            return $employee->load('user');
        });
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
