<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Additive, non-destructive enrichment that supports the billing-provider
     * integration requirements:
     *
     *  - `stripe_webhook_events` records every processed Stripe webhook event
     *    keyed by its Stripe event id, so duplicate provider deliveries can
     *    never create duplicate records or duplicate state transitions
     *    (global webhook idempotency).
     *
     *  - `subscriptions` gains lifecycle columns that drive the payment-failure
     *    state machine (ACTIVE -> PAST DUE -> GRACE PERIOD -> SUSPENDED).
     *    `past_due_since` records when the subscription first became past due,
     *    `grace_ends_at` marks the end of the access-granting grace window and
     *    `suspended_at` records when access was revoked. `webhook_event_ids`
     *    is a lightweight per-subscription index of the provider event ids that
     *    have already been applied (in addition to the global table).
     */
    public function up(): void
    {
        Schema::create('stripe_webhook_events', function (Blueprint $table) {
            $table->id();
            $table->string('event_id')->unique();
            $table->string('type');
            $table->string('status')->default('processed');
            $table->jsonb('payload')->nullable();
            $table->timestamp('processed_at')->useCurrent();
            $table->timestamps();
        });

        Schema::table('subscriptions', function (Blueprint $table) {
            $table->timestamp('past_due_since')->nullable()->after('activation_notified_at');
            $table->timestamp('grace_ends_at')->nullable()->after('past_due_since');
            $table->timestamp('suspended_at')->nullable()->after('grace_ends_at');
            $table->jsonb('webhook_event_ids')->nullable()->after('suspended_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->dropColumn([
                'past_due_since',
                'grace_ends_at',
                'suspended_at',
                'webhook_event_ids',
            ]);
        });

        Schema::dropIfExists('stripe_webhook_events');
    }
};
