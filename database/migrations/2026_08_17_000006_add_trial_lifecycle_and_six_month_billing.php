<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('platform_settings', function (Blueprint $table): void {
            $table->id();
            $table->unsignedSmallInteger('trial_period_days')->default(14);
            $table->timestamps();
        });

        Schema::table('companies', function (Blueprint $table): void {
            $table->timestamp('trial_ends_at')->nullable()->after('status');
            $table->timestamp('locked_at')->nullable()->after('trial_ends_at');
            $table->timestamp('trial_ending_reminded_at')->nullable()->after('locked_at');
        });

        DB::table('companies')
            ->whereNull('trial_ends_at')
            ->update(['trial_ends_at' => now()->addDays(14)]);

        Schema::table('plans', function (Blueprint $table): void {
            $table->decimal('price_six_monthly', 10, 2)->nullable()->after('price_monthly');
            $table->string('stripe_six_monthly_price_id')->nullable()->after('stripe_monthly_price_id');
        });

        Schema::table('subscriptions', function (Blueprint $table): void {
            $table->timestamp('renewal_reminded_at')->nullable()->after('ends_at');
            $table->timestamp('activation_notified_at')->nullable()->after('renewal_reminded_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('subscriptions', function (Blueprint $table): void {
            $table->dropColumn(['renewal_reminded_at', 'activation_notified_at']);
        });

        Schema::table('plans', function (Blueprint $table): void {
            $table->dropColumn(['price_six_monthly', 'stripe_six_monthly_price_id']);
        });

        Schema::table('companies', function (Blueprint $table): void {
            $table->dropColumn(['trial_ends_at', 'locked_at', 'trial_ending_reminded_at']);
        });

        Schema::dropIfExists('platform_settings');
    }
};
