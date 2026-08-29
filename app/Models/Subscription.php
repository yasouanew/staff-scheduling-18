<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Builder;

class Subscription extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'company_id',
        'user_id',
        'plan_id',
        'stripe_id',
        'stripe_status',
        'stripe_price',
        'checkout_session_id',
        'quantity',
        'status',
        'billing_cycle',
        'starts_at',
        'ends_at',
        'renewal_reminded_at',
        'activation_notified_at',
        'trial_ends_at',
        'cancelled_at',
        'cancel_at_period_end',
        'metadata',
        'past_due_since',
        'grace_ends_at',
        'suspended_at',
        'webhook_event_ids',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'company_id' => 'integer',
            'user_id' => 'integer',
            'plan_id' => 'integer',
            'quantity' => 'integer',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'renewal_reminded_at' => 'datetime',
            'activation_notified_at' => 'datetime',
            'trial_ends_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'cancel_at_period_end' => 'boolean',
            'metadata' => 'array',
            'past_due_since' => 'datetime',
            'grace_ends_at' => 'datetime',
            'suspended_at' => 'datetime',
            'webhook_event_ids' => 'array',
        ];
    }

    /**
     * Scope a query to only include active subscriptions.
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    /**
     * Scope a query to only include trialing subscriptions.
     */
    public function scopeTrialing(Builder $query): Builder
    {
        return $query->where('status', 'trialing');
    }

    /**
     * Check if the subscription is active.
     */
    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    /**
     * Check if the subscription is on trial.
     */
    public function onTrial(): bool
    {
        return $this->status === 'trialing' && $this->trial_ends_at?->isFuture();
    }

    /**
     * Check if the subscription has been cancelled.
     */
    public function isCancelled(): bool
    {
        return ! is_null($this->cancelled_at);
    }

    /**
     * Get the company that owns the subscription.
     */
    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    /**
     * Get the user (Stripe customer) that manages the subscription.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the plan associated with the subscription.
     */
    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    /**
     * Get the payments for this subscription.
     */
    public function payments(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(SubscriptionPayment::class);
    }

    /**
     * Get the branch subscriptions covered by this subscription.
     */
    public function branchSubscriptions(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(BranchSubscription::class);
    }
}
