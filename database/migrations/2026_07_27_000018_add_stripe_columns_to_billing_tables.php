<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Bridges the custom billing schema with Stripe by storing the relevant
     * Stripe identifiers alongside the existing application data.
     */
    public function up(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            // Stripe Price IDs for each billing cycle (price_xxx).
            $table->string('stripe_monthly_price_id')->nullable()->after('price_yearly');
            $table->string('stripe_yearly_price_id')->nullable()->after('stripe_monthly_price_id');
            $table->string('stripe_product_id')->nullable()->after('stripe_yearly_price_id');
        });

        Schema::table('subscriptions', function (Blueprint $table) {
            // Links this record to a Cashier/Stripe subscription (sub_xxx).
            $table->foreignId('user_id')->nullable()->after('company_id')->constrained()->nullOnDelete();
            $table->string('stripe_id')->nullable()->index()->after('plan_id');
            $table->string('stripe_status')->nullable()->after('stripe_id');
            $table->string('stripe_price')->nullable()->after('stripe_status');
            $table->integer('quantity')->nullable()->after('stripe_price');
        });

        Schema::table('subscription_payments', function (Blueprint $table) {
            // Stripe PaymentIntent / Charge identifiers to support later refunds.
            $table->string('stripe_payment_intent_id')->nullable()->after('provider_reference');
            $table->decimal('amount_refunded', 10, 2)->default(0)->after('status');
            $table->timestamp('refunded_at')->nullable()->after('paid_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->dropColumn(['stripe_monthly_price_id', 'stripe_yearly_price_id', 'stripe_product_id']);
        });

        Schema::table('subscriptions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('user_id');
            $table->dropColumn(['stripe_id', 'stripe_status', 'stripe_price', 'quantity']);
        });

        Schema::table('subscription_payments', function (Blueprint $table) {
            $table->dropColumn(['stripe_payment_intent_id', 'amount_refunded', 'refunded_at']);
        });
    }
};
