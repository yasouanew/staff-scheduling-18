<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Minimal additive enrichment for plan-switch (upgrade / downgrade)
     * invoices.
     *
     * Everything else the plan-change flow needs already exists on
     * `subscription_payments` and is reused as-is:
     *
     *  - `provider_reference`  → Stripe invoice id (idempotency key shared
     *                            with the `invoice.paid` webhook upsert);
     *  - `stripe_payment_intent_id` → the PaymentIntent a refund is issued
     *                            against;
     *  - `amount_refunded` / `refunded_at` → refund bookkeeping;
     *  - `status`              → pending / succeeded / failed / refunded.
     *
     * Only two genuinely new columns are required:
     *
     *  - `type`       : distinguishes a regular renewal charge
     *                   (`subscription`) from a prorated plan-change charge
     *                   (`proration`) and from a downgrade cash refund
     *                   (`refund`), so the Invoices tab can label rows.
     *  - `description`: human-readable label ("Plan change: Growth → Pro").
     *                   The previous plan is captured here as text instead of
     *                   an FK because `subscriptions.plan_id` is mutated in
     *                   place on a switch, so a relation could never recover
     *                   the historical plan.
     *
     * No changes are needed on `subscriptions` or `stripe_webhook_events`:
     * the plan switch keeps the same subscription row (renewal date
     * preserved) and the webhook events table already stores the raw payload
     * (which carries Stripe's `billing_reason`).
     */
    public function up(): void
    {
        Schema::table('subscription_payments', function (Blueprint $table) {
            if (! Schema::hasColumn('subscription_payments', 'type')) {
                $table->string('type')->default('subscription')
                    ->comment('subscription | proration | refund');
            }

            if (! Schema::hasColumn('subscription_payments', 'description')) {
                $table->string('description')->nullable()
                    ->comment('Human-readable label, e.g. "Plan change: Starter → Pro".');
            }
        });
    }

    public function down(): void
    {
        Schema::table('subscription_payments', function (Blueprint $table) {
            if (Schema::hasColumn('subscription_payments', 'description')) {
                $table->dropColumn('description');
            }

            if (Schema::hasColumn('subscription_payments', 'type')) {
                $table->dropColumn('type');
            }
        });
    }
};
