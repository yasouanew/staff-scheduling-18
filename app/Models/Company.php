<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

class Company extends Model
{
    use HasFactory, LogsActivity;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'abn',
        'email',
        'phone',
        'logo',
        'timezone',
        'country',
        'state',
        'business_type',
        'status',
        'trial_ends_at',
        'locked_at',
        'trial_ending_reminded_at',
        'trial_reminders_sent',
        'subscription_id',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'subscription_id' => 'integer',
            'trial_ends_at' => 'datetime',
            'locked_at' => 'datetime',
            'trial_ending_reminded_at' => 'datetime',
            'trial_reminders_sent' => 'array',
        ];
    }

    /**
     * Get the activity log options for the model.
     */
    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['name', 'email', 'phone', 'business_type', 'status'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs();
    }

    /**
     * Scope a query to only include active companies.
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    /**
     * Check if the company is active.
     */
    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    /**
     * The application's authoritative access resolver.
     *
     * Every access decision delegates to {@see \App\Services\AccessStateService}
     * so there is a single source of truth (and a single clock — the server's)
     * for trial / subscription / grace entitlements across the whole app.
     */
    protected function accessState(): \App\Services\AccessStateService
    {
        return app(\App\Services\AccessStateService::class);
    }

    /**
     * Determine whether the company still has an active registration trial,
     * evaluated against the server clock (never a client-supplied timestamp).
     */
    public function isTrialActive(): bool
    {
        return $this->accessState()->isTrialActive($this);
    }

    /**
     * Get the company subscription that currently grants access, if any.
     *
     * Access is granted by an active subscription and, during a payment-failure
     * grace period, by a grace_period subscription still within its
     * `grace_ends_at` window. Delegated to the authoritative access service so
     * every caller shares the same entitlement rule.
     */
    public function activeSubscription(): ?Subscription
    {
        return $this->accessState()->entitledSubscription($this);
    }

    /**
     * Determine whether the company is locked because it has no valid trial or subscription.
     */
    public function isAccessLocked(): bool
    {
        return $this->accessState()->isLocked($this);
    }

    /**
     * Get the settings associated with the company.
     */
    public function settings(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(CompanySetting::class);
    }

    /**
     * Get the branches belonging to the company.
     */
    public function branches(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Branch::class);
    }

    /**
     * Get the departments belonging to the company.
     */
    public function departments(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Department::class);
    }

    /**
     * Get the positions belonging to the company.
     */
    public function positions(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Position::class);
    }

    /**
     * Get the employees belonging to the company.
     */
    public function employees(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Employee::class);
    }

    /**
     * Get the shift templates belonging to the company.
     */
    public function shiftTemplates(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(ShiftTemplate::class);
    }

    /**
     * Get the rosters belonging to the company.
     */
    public function rosters(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Roster::class);
    }

    /**
     * Get the leave types configured for the company.
     */
    public function leaveTypes(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(LeaveType::class);
    }

    /**
     * Get the leave requests submitted within the company.
     */
    public function leaveRequests(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(LeaveRequest::class);
    }

    /**
     * Get the device tokens belonging to the company.
     */
    public function deviceTokens(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(DeviceToken::class);
    }

    /**
     * Get the subscriptions belonging to the company.
     */
    public function subscriptions(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Subscription::class);
    }

    /**
     * Get the branch subscriptions belonging to the company.
     *
     * Each row links a specific branch to a subscription and records the seat
     * capacity allocated to that branch.
     */
    public function branchSubscriptions(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(BranchSubscription::class);
    }

    /**
     * Get the users belonging to the company.
     */
    public function users(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(User::class);
    }
}
