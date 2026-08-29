<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Additive, non-destructive enrichment of the existing `plans` table so it
     * fully covers the subscription plan model (description, currency, sort
     * order, arbitrary metadata). Existing Phase 1 pricing columns
     * (price_monthly / price_six_monthly / price_yearly) are preserved.
     */
    public function up(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->text('description')->nullable();
            $table->string('currency', 3)->default('AUD');
            $table->integer('sort_order')->default(0);
            $table->jsonb('metadata')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('plans', function (Blueprint $table) {
            $table->dropColumn(['description', 'currency', 'sort_order', 'metadata']);
        });
    }
};
