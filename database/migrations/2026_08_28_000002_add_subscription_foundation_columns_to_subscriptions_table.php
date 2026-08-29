<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Additive, non-destructive enrichment of the existing `subscriptions`
     * table: `cancel_at_period_end` follows the Stripe convention for a
     * subscription that ends at the current period boundary, and `metadata`
     * stores provider/arbitrary reference data. Existing Phase 1 billing
     * columns (stripe_id, stripe_status, starts_at, ends_at, trial_ends_at,
     * cancelled_at) are preserved.
     */
    public function up(): void
    {
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->boolean('cancel_at_period_end')->default(false);
            $table->jsonb('metadata')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('subscriptions', function (Blueprint $table) {
            $table->dropColumn(['cancel_at_period_end', 'metadata']);
        });
    }
};
