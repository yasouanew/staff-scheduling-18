<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Builder;

class SubscriptionPayment extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'subscription_id',
        'amount',
        'currency',
        'payment_provider',
        'provider_reference',
        'stripe_payment_intent_id',
        'status',
        'amount_refunded',
        'paid_at',
        'refunded_at',
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
            'amount' => 'decimal:2',
            'amount_refunded' => 'decimal:2',
            'paid_at' => 'datetime',
            'refunded_at' => 'datetime',
        ];
    }

    /**
     * Scope a query to only include succeeded payments.
     */
    public function scopeSucceeded(Builder $query): Builder
    {
        return $query->where('status', 'succeeded');
    }

    /**
     * Scope a query to only include failed payments.
     */
    public function scopeFailed(Builder $query): Builder
    {
        return $query->where('status', 'failed');
    }

    /**
     * Scope a query to only include refunded payments.
     */
    public function scopeRefunded(Builder $query): Builder
    {
        return $query->where('status', 'refunded');
    }

    /**
     * Check if the payment was successful.
     */
    public function isSuccessful(): bool
    {
        return $this->status === 'succeeded';
    }

    /**
     * Check if the payment has been refunded (fully or partially).
     */
    public function isRefunded(): bool
    {
        return $this->status === 'refunded' || (float) $this->amount_refunded > 0;
    }

    /**
     * Check whether the payment can still be refunded.
     */
    public function isRefundable(): bool
    {
        return $this->isSuccessful()
            && ! is_null($this->stripe_payment_intent_id)
            && (float) $this->amount_refunded < (float) $this->amount;
    }

    /**
     * Get the subscription that this payment belongs to.
     */
    public function subscription(): BelongsTo
    {
        return $this->belongsTo(Subscription::class);
    }
}
