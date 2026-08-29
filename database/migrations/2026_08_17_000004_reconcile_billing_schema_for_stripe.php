<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Most of the Stripe bridging columns were already introduced by the
     * earlier "add_stripe_columns_to_billing_tables" migration, so every
     * change here is guarded to keep this migration idempotent. Only the
     * genuinely new pieces (the checkout session reference plus the tighter
     * unique/index constraints) are applied.
     */
    public function up(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            if (! Schema::hasColumn('plans', 'stripe_product_id')) {
                $table->string('stripe_product_id')->nullable();
            }

            if (! Schema::hasColumn('plans', 'stripe_monthly_price_id')) {
                $table->string('stripe_monthly_price_id')->nullable();
            }

            if (! Schema::hasColumn('plans', 'stripe_yearly_price_id')) {
                $table->string('stripe_yearly_price_id')->nullable();
            }
        });

        Schema::table('subscriptions', function (Blueprint $table) {
            if (! Schema::hasColumn('subscriptions', 'user_id')) {
                $table->foreignId('user_id')->nullable()->after('company_id')->constrained('users')->nullOnDelete();
            }

            if (! Schema::hasColumn('subscriptions', 'stripe_id')) {
                $table->string('stripe_id')->nullable();
            }

            if (! Schema::hasColumn('subscriptions', 'stripe_status')) {
                $table->string('stripe_status')->nullable();
            }

            if (! Schema::hasColumn('subscriptions', 'stripe_price')) {
                $table->string('stripe_price')->nullable();
            }

            if (! Schema::hasColumn('subscriptions', 'checkout_session_id')) {
                $table->string('checkout_session_id')->nullable();
            }

            if (! Schema::hasColumn('subscriptions', 'quantity')) {
                $table->unsignedInteger('quantity')->default(1);
            }
        });

        // Stripe identifiers must be unique so webhooks can never map a single
        // Stripe object onto multiple local subscription records.
        Schema::table('subscriptions', function (Blueprint $table) {
            if (! Schema::hasIndex('subscriptions', ['stripe_id'], 'unique')) {
                $table->unique('stripe_id');
            }

            if (! Schema::hasIndex('subscriptions', ['checkout_session_id'], 'unique')) {
                $table->unique('checkout_session_id');
            }
        });

        Schema::table('subscription_payments', function (Blueprint $table) {
            if (! Schema::hasColumn('subscription_payments', 'stripe_payment_intent_id')) {
                $table->string('stripe_payment_intent_id')->nullable();
            }

            if (! Schema::hasColumn('subscription_payments', 'amount_refunded')) {
                $table->decimal('amount_refunded', 10, 2)->default(0);
            }

            if (! Schema::hasColumn('subscription_payments', 'refunded_at')) {
                $table->timestamp('refunded_at')->nullable();
            }
        });

        Schema::table('subscription_payments', function (Blueprint $table) {
            if (! Schema::hasIndex('subscription_payments', ['stripe_payment_intent_id'])) {
                $table->index('stripe_payment_intent_id');
            }
        });
    }

    /**
     * Reverse the migrations.
     *
     * Only the constraints owned by this migration are rolled back; the
     * columns themselves belong to the earlier billing migration.
     */
    public function down(): void
    {
        Schema::table('subscription_payments', function (Blueprint $table) {
            if (Schema::hasIndex('subscription_payments', ['stripe_payment_intent_id'])) {
                $table->dropIndex(['stripe_payment_intent_id']);
            }
        });

        Schema::table('subscriptions', function (Blueprint $table) {
            if (Schema::hasIndex('subscriptions', ['checkout_session_id'], 'unique')) {
                $table->dropUnique(['checkout_session_id']);
            }

            if (Schema::hasIndex('subscriptions', ['stripe_id'], 'unique')) {
                $table->dropUnique(['stripe_id']);
            }
        });

        Schema::table('subscriptions', function (Blueprint $table) {
            if (Schema::hasColumn('subscriptions', 'checkout_session_id')) {
                $table->dropColumn('checkout_session_id');
            }
        });
    }
};
