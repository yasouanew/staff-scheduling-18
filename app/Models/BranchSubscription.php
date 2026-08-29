<?php

namespace App\Models;

use App\Enums\SubscriptionStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BranchSubscription extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'company_id',
        'branch_id',
        'subscription_id',
        'status',
        'employee_capacity',
        'started_at',
        'ended_at',
        'cancelled_at',
        'metadata',
    ];

    /**
     * Boot the model.
     *
     * Enforces tenant/business scoping at the application layer: a branch
     * subscription must never link a branch and a subscription that belong to
     * different companies, even though no single foreign key can express that
     * invariant.
     */
    protected static function booted(): void
    {
        static::creating(function (BranchSubscription $branchSubscription) {
            $branchSubscription->assertConsistentCompanyScope();
        });

        static::updating(function (BranchSubscription $branchSubscription) {
            $branchSubscription->assertConsistentCompanyScope();
        });
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'company_id' => 'integer',
            'branch_id' => 'integer',
            'subscription_id' => 'integer',
            'employee_capacity' => 'integer',
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'metadata' => 'array',
        ];
    }

    /**
     * Scope a query to only include active branch subscriptions.
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', SubscriptionStatus::Active->value);
    }

    /**
     * Scope a query to only include branch subscriptions that currently grant
     * access (trial or active).
     */
    public function scopeEntitled(Builder $query): Builder
    {
        return $query->whereIn('status', [
            SubscriptionStatus::Trial->value,
            SubscriptionStatus::Active->value,
        ]);
    }

    /**
     * The company (tenant/business) that owns this branch subscription.
     */
    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    /**
     * The branch that is covered by the subscription.
     */
    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    /**
     * The subscription that covers the branch.
     */
    public function subscription(): BelongsTo
    {
        return $this->belongsTo(Subscription::class);
    }

    /**
     * Whether this branch subscription is currently entitled to the service.
     */
    public function grantsAccess(): bool
    {
        return in_array($this->status, [
            SubscriptionStatus::Trial->value,
            SubscriptionStatus::Active->value,
        ], true);
    }

    /**
     * Guard that the linked branch and subscription belong to the same company
     * as this branch subscription.
     *
     * @throws \RuntimeException when the tenant scope is inconsistent.
     */
    public function assertConsistentCompanyScope(): void
    {
        $branch = $this->branch()->first();
        $subscription = $this->subscription()->first();

        if ($branch && $branch->company_id !== (int) $this->company_id) {
            throw new \RuntimeException(
                'Branch does not belong to the same company as the branch subscription.'
            );
        }

        if ($subscription && $subscription->company_id !== (int) $this->company_id) {
            throw new \RuntimeException(
                'Subscription does not belong to the same company as the branch subscription.'
            );
        }
    }
}
