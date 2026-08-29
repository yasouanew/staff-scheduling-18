<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A processed payment-provider webhook event.
 *
 * This table is the global idempotency guard for incoming provider webhooks.
 * Each event is keyed by its provider-supplied event id so a duplicate delivery
 * (retry, replay, out-of-order fan-out) is recognised and skipped before any
 * record or state transition is applied.
 */
class WebhookEvent extends Model
{
    /**
     * The database table that stores processed webhook events.
     *
     * @var string
     */
    protected $table = 'stripe_webhook_events';

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'event_id',
        'type',
        'status',
        'payload',
        'processed_at',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'processed_at' => 'datetime',
        ];
    }
}
